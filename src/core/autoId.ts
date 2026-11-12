// Pure logic behind AutoIdListener: give every trigger line an id and keep
// the title line its own Markdown block (so [[note#^card-x]] resolves).

import { classifyLines, parseFile } from "./cardParser";
import { newCardId } from "./ids";
import { findTags, lifecycleOf, matchRecall } from "./syntax";
import { needsSeparator } from "./mutations";

// whitespace before the id (group 1) is removed with it; the id must end the line
const ORPHAN_ID_RE = /(^|[ \t]+)\^(card-[A-Za-z0-9][A-Za-z0-9-]*)[ \t]*$/;

export interface LineEdit {
	line: number;
	fromCh: number;
	toCh: number;
	insert: string;
}

export interface AutoIdResult {
	text: string;
	assigned: string[];
	/** ids taken off lines whose #open-card / #closed-card was erased */
	removed: string[];
	edits: LineEdit[]; // positions refer to the ORIGINAL text; apply all at once
}

export interface AutoIdOptions {
	/**
	 * Undo card creation: when a line still carries a ^card-id but its lifecycle tag was erased,
	 * remove the id. `keepId(id)` returning true keeps it (e.g. recalls elsewhere link to it, so
	 * re-adding #open-card brings the card back with its history). Recalls in this same text are
	 * always respected.
	 */
	stripOrphans?: { keepId: (id: string) => boolean };
}

/**
 * @param cursorLine line the user is typing on (or null). That line, and the line right after a
 *        title, are left alone so we never edit under the user's cursor.
 */
export function assignMissingIds(
	text: string,
	cursorLine: number | null,
	existing: Set<string>,
	rand?: () => number,
	opts: AutoIdOptions = {},
): AutoIdResult {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lines = text.split(/\r?\n/);
	const taken = new Set(existing);
	const assigned: string[] = [];
	const edits: LineEdit[] = [];
	const cards = parseFile(text, "").cards;
	for (const c of cards) if (c.id) taken.add(c.id);

	for (const c of cards) {
		if (c.titleLine === cursorLine) continue;
		const line = lines[c.titleLine];
		let insert = "";
		let fromCh = line.length;
		if (!c.id) {
			const id = newCardId(taken, rand);
			taken.add(id);
			assigned.push(id);
			fromCh = line.replace(/\s+$/, "").length;
			insert = " ^" + id;
		}
		if (cursorLine !== c.titleLine + 1 && needsSeparator(lines[c.titleLine + 1])) insert += eol;
		if (insert) edits.push({ line: c.titleLine, fromCh, toCh: line.length, insert });
	}

	const removed: string[] = [];
	if (opts.stripOrphans) {
		const info = classifyLines(lines);
		const linkedHere = new Set<string>();
		for (const l of lines) {
			const r = matchRecall(l);
			if (r) linkedHere.add(r.cardId);
		}
		for (let i = 0; i < lines.length; i++) {
			if (i === cursorLine || info[i].kind !== "text") continue;
			const m = lines[i].match(ORPHAN_ID_RE);
			if (!m || m.index === undefined) continue;
			const id = m[2];
			if (lifecycleOf(findTags(lines[i]).map(t => t.tag)) !== null) continue;
			if (linkedHere.has(id) || opts.stripOrphans.keepId(id)) continue;
			removed.push(id);
			edits.push({ line: i, fromCh: m.index, toCh: m.index + m[0].length, insert: "" });
		}
	}

	edits.sort((a, b) => a.line - b.line);
	const out = [...lines];
	for (const e of edits) {
		const l = out[e.line];
		out[e.line] = l.slice(0, e.fromCh) + e.insert + l.slice(e.toCh);
	}
	return { text: out.join(eol), assigned, removed, edits };
}
