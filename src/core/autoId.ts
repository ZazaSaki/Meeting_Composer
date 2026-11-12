// Pure logic behind AutoIdListener: give every trigger line an id and keep
// the title line its own Markdown block (so [[note#^card-x]] resolves).

import { parseFile } from "./cardParser";
import { newCardId } from "./ids";
import { needsSeparator } from "./mutations";

export interface LineEdit {
	line: number;
	fromCh: number;
	toCh: number;
	insert: string;
}

export interface AutoIdResult {
	text: string;
	assigned: string[];
	edits: LineEdit[]; // positions refer to the ORIGINAL text; apply all at once
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

	const out = [...lines];
	for (const e of edits) {
		const l = out[e.line];
		out[e.line] = l.slice(0, e.fromCh) + e.insert + l.slice(e.toCh);
	}
	return { text: out.join(eol), assigned, edits };
}
