// Pure text transforms for cards. Every function re-locates the card by its ^card-id
// in the CURRENT text (never by stored line numbers) and returns the text unchanged
// when the requested state already holds — so all mutations are idempotent.

import { HeadingSegment } from "../types";
import { bodyRange, classifyLines, locateCard, makeHierarchy } from "./cardParser";
import {
	findBlockId,
	findTags,
	fenceMarker,
	isHeading,
	listPrefix,
	normalizeTag,
	slugify,
} from "./syntax";

export class CardNotFoundError extends Error {
	constructor(id: string) {
		super(`Card ^${id} not found`);
	}
}

const OPEN_TO_CLOSED: Record<string, string> = { "#open-card": "#closed-card", "#open-ticket": "#closed-ticket" };
const CLOSED_TO_OPEN: Record<string, string> = { "#closed-card": "#open-card", "#closed-ticket": "#open-ticket" };

function eolOf(text: string): string {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

// ---------- line-level ----------

export function setLifecycleOnLine(line: string, status: "open" | "closed"): string {
	const map = status === "closed" ? OPEN_TO_CLOSED : CLOSED_TO_OPEN;
	let out = line;
	for (const t of findTags(line).reverse()) {
		const repl = map[t.tag];
		if (repl) out = out.slice(0, t.start) + repl + out.slice(t.end);
	}
	return out;
}

export function addTagToLine(line: string, tag: string): string {
	const t = normalizeTag(tag);
	if (findTags(line).some(m => m.tag === t)) return line;
	const m = line.match(/(\s)\^(card-[A-Za-z0-9][A-Za-z0-9-]*)\s*$/);
	if (m && m.index !== undefined) {
		return line.slice(0, m.index).replace(/\s+$/, "") + " " + t + " ^" + m[2];
	}
	return line.replace(/\s+$/, "") + " " + t;
}

export function removeTagFromLine(line: string, tag: string): string {
	const t = normalizeTag(tag);
	let out = line;
	for (const m of findTags(line).reverse()) {
		if (m.tag !== t) continue;
		let start = m.start;
		while (start > 0 && /[ \t]/.test(out[start - 1])) start--;
		out = out.slice(0, start) + (start > 0 && m.end < out.length ? " " : "") + out.slice(m.end).replace(/^[ \t]+/, "");
	}
	return out;
}

export function appendIdToLine(line: string, id: string): string {
	if (findBlockId(line)) return line;
	return line.replace(/\s+$/, "") + " ^" + id;
}

/** Rewrite the title while preserving list prefix, every tag (in order) and the block id. */
export function setTitleOnLine(line: string, title: string): string {
	const prefix = listPrefix(line);
	const tags = findTags(line).map(t => t.raw);
	const id = findBlockId(line);
	const clean = title.replace(/[\r\n]+/g, " ").trim();
	return [prefix + clean, ...tags, ...(id ? ["^" + id] : [])].join(" ").replace(/\s+$/, "");
}

/** True when `line` would be swallowed into the title's paragraph (so the ^id would stop being a block id). */
export function needsSeparator(line: string | undefined): boolean {
	if (line === undefined || line.trim() === "") return false;
	if (listPrefix(line)) return false;
	if (/^\s{0,3}>/.test(line)) return false;
	if (fenceMarker(line) || isHeading(line)) return false;
	return true;
}

// ---------- text-level ----------

function withCard(text: string, id: string, fn: (lines: string[], card: NonNullable<ReturnType<typeof locateCard>>) => void): string {
	const card = locateCard(text, id);
	if (!card) throw new CardNotFoundError(id);
	const eol = eolOf(text);
	const lines = text.split(/\r?\n/);
	fn(lines, card);
	return lines.join(eol);
}

function onTitleLine(text: string, id: string, fn: (line: string) => string): string {
	return withCard(text, id, (lines, card) => {
		lines[card.titleLine] = fn(lines[card.titleLine]);
	});
}

export function setStatus(text: string, id: string, status: "open" | "closed"): string {
	return onTitleLine(text, id, l => setLifecycleOnLine(l, status));
}

export function addTag(text: string, id: string, tag: string): string {
	return onTitleLine(text, id, l => addTagToLine(l, tag));
}

export function removeTag(text: string, id: string, tag: string): string {
	return onTitleLine(text, id, l => removeTagFromLine(l, tag));
}

export function setTitle(text: string, id: string, title: string): string {
	return onTitleLine(text, id, l => setTitleOnLine(l, title));
}

export function setDescription(text: string, id: string, description: string): string {
	return withCard(text, id, (lines, card) => {
		const body = description.replace(/\r\n/g, "\n").replace(/\s+$/, "");
		const newLines = body === "" ? [] : body.split("\n");
		if (needsSeparator(newLines[0])) newLines.unshift("");
		const removeCount = card.endLine - card.titleLine;
		lines.splice(card.titleLine + 1, removeCount, ...newLines);
	});
}

/** Insert a blank line after the title line if the next line is plain prose (spec review fix #1). */
export function ensureBlankAfterTitle(text: string, id: string): string {
	return withCard(text, id, (lines, card) => {
		if (needsSeparator(lines[card.titleLine + 1])) lines.splice(card.titleLine + 1, 0, "");
	});
}

// ---------- header moves ----------

interface Section {
	headingLine: number;
	level: number;
	end: number; // last line of the section (exclusive of the next same-or-higher heading)
}

/** Last section whose heading path (levels 1–3) equals `segments` by slug. */
function findSection(lines: string[], segments: HeadingSegment[]): Section | null {
	const info = classifyLines(lines);
	const want = makeHierarchy(segments).slug;
	const stack: HeadingSegment[] = [];
	let found: Section | null = null;
	for (let i = 0; i < lines.length; i++) {
		const h = info[i].kind === "heading" ? info[i].heading : undefined;
		if (!h || h.level > 3) continue;
		if (found && found.end === -1 && h.level <= found.level) found.end = i - 1;
		while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
		stack.push({ level: h.level, text: h.text });
		if (makeHierarchy(stack).slug === want) found = { headingLine: i, level: h.level, end: -1 };
	}
	if (found && found.end === -1) found.end = lines.length - 1;
	return found;
}

function insertAtSectionEnd(lines: string[], end: number, block: string[]): void {
	let at = end;
	while (at >= 0 && lines[at].trim() === "") at--;
	const insert = [...block];
	if (at >= 0 && !isHeading(lines[at])) insert.unshift("");
	if (at + 1 < lines.length && lines[at + 1].trim() !== "") insert.push("");
	lines.splice(at + 1, 0, ...insert);
}

function headingLine(seg: HeadingSegment): string {
	return "#".repeat(seg.level) + " " + seg.text;
}

/**
 * Move a card (and its dedicated sub-heading, if any) under the heading path `target`
 * inside the same file. Missing target headings are created under the deepest existing ancestor.
 */
export function moveCardToHeading(text: string, id: string, target: HeadingSegment[]): string {
	if (target.length === 0) return text;
	const card = locateCard(text, id);
	if (!card) throw new CardNotFoundError(id);
	const targetSlug = makeHierarchy(target).slug;
	const own = card.hierarchy.slug;
	if (own === targetSlug || own.startsWith(targetSlug + "/")) return text;

	const eol = eolOf(text);
	const lines = text.split(/\r?\n/);
	const info = classifyLines(lines);
	const { boundary } = bodyRange(info, card.titleLine);
	const next = info[boundary];
	const dedicated =
		boundary >= lines.length ||
		(next.kind === "heading" && !!next.heading && next.heading.level <= card.headingLevel);
	const targetLevel = target[target.length - 1].level;
	const keepOwnHeading = card.headingLevel > targetLevel;

	const cardLines = lines.slice(card.titleLine, card.endLine + 1);
	const block = keepOwnHeading ? [lines[card.headingLine], ...cardLines] : cardLines;

	// cut
	const cutStart = dedicated ? card.headingLine : card.titleLine;
	const cutEnd = dedicated ? boundary - 1 : card.endLine;
	lines.splice(cutStart, cutEnd - cutStart + 1);
	// collapse a double blank left at the junction
	if (cutStart > 0 && cutStart < lines.length && lines[cutStart - 1].trim() === "" && lines[cutStart].trim() === "") {
		lines.splice(cutStart, 1);
	}

	// find the deepest existing ancestor of the target
	let depth = target.length;
	let section: Section | null = null;
	while (depth > 0 && !(section = findSection(lines, target.slice(0, depth)))) depth--;

	const missing = target.slice(depth).map(headingLine);
	let prefix: string[];
	if (depth === target.length) {
		// target exists: repeat its heading unless the card brings its own deeper sub-heading
		prefix = keepOwnHeading ? [] : [headingLine(target[target.length - 1])];
	} else {
		prefix = missing;
	}
	const full = [...prefix, ...block];
	if (section) insertAtSectionEnd(lines, section.end, full);
	else insertAtSectionEnd(lines, lines.length - 1, full);

	return lines.join(eol);
}

/** Heading segments for a slug, using known segments where available. */
export function segmentsForSlug(slug: string, known: HeadingSegment[][], lastTitle?: string): HeadingSegment[] {
	const parts = slug.split("/").filter(Boolean);
	for (const segs of known) {
		if (segs.length >= parts.length && segs.slice(0, parts.length).every((s, i) => slugify(s.text) === parts[i])) {
			return segs.slice(0, parts.length).map(s => ({ ...s }));
		}
	}
	// fallback: levels 1..n, text from the slug (last one from the column title)
	return parts.map((p, i) => ({
		level: i + 1,
		text: i === parts.length - 1 && lastTitle ? lastTitle : p.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
	}));
}

