// Low-level Markdown syntax helpers shared by the parser and the mutations.
// Pure functions only: no Obsidian imports, so they are unit-testable.

export const OPEN_TAGS = ["#open-card", "#open-ticket"];
export const CLOSED_TAGS = ["#closed-card", "#closed-ticket"];
export const LIFECYCLE_TAGS = [...OPEN_TAGS, ...CLOSED_TAGS];

export const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const HR_RE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const BLOCK_ID_RE = /(^|\s)\^(card-[A-Za-z0-9][A-Za-z0-9-]*)(?=\s|$)/;
const LIST_PREFIX_RE = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[^\]]\]\s+)?)/;
const RECALL_LINK_RE = /\[\[([^\]|#]*)#\^(card-[A-Za-z0-9][A-Za-z0-9-]*)(?:\|[^\]]*)?\]\]/;
const RECALL_STAMP_RE = /%%\s*recall:\s*([^%]*?)\s*%%/;
const STAMP_VALUE_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/;
// Obsidian tag charset: letters (any script), digits, _, -, /
const TAG_RE = /(^|\s)(#[\p{L}\p{N}_/-]+)/gu;

export interface TagMatch {
	tag: string; // lowercased, with "#"
	raw: string;
	start: number; // index of "#"
	end: number;
}

/** Replace spans where "#" is not a tag (links, comments, code, urls) with spaces, keeping positions. */
export function maskNonTagSpans(line: string): string {
	const blank = (m: string) => " ".repeat(m.length);
	return line
		.replace(/`[^`]*`/g, blank)
		.replace(/%%.*?%%/g, blank)
		.replace(/\[\[[^\]]*\]\]/g, blank)
		.replace(/\[[^\]]*\]\([^)]*\)/g, blank)
		.replace(/\bhttps?:\/\/\S+/g, blank);
}

export function findTags(line: string): TagMatch[] {
	const masked = maskNonTagSpans(line);
	const out: TagMatch[] = [];
	TAG_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = TAG_RE.exec(masked)) !== null) {
		const raw = m[2];
		// Obsidian requires at least one non-numeric character
		if (!/[^\d#]/.test(raw)) continue;
		const start = m.index + m[1].length;
		out.push({ tag: raw.toLowerCase(), raw, start, end: start + raw.length });
	}
	return out;
}

export function normalizeTag(tag: string): string {
	const t = tag.trim().toLowerCase();
	return t.startsWith("#") ? t : "#" + t;
}

export function isHeading(line: string): boolean {
	return HEADING_RE.test(line);
}

export function parseHeading(line: string): { level: number; text: string } | null {
	const m = line.match(HEADING_RE);
	if (!m) return null;
	let text = m[2].replace(/[ \t]+#+[ \t]*$/, ""); // closing #'s
	for (const t of findTags(text).reverse()) {
		text = text.slice(0, t.start) + text.slice(t.end);
	}
	text = text.replace(/\s+/g, " ").trim();
	if (!text) return null;
	return { level: m[1].length, text };
}

export function isHr(line: string): boolean {
	return HR_RE.test(line);
}

export function fenceMarker(line: string): string | null {
	const m = line.match(FENCE_RE);
	return m ? m[1] : null;
}

export function findBlockId(line: string): string | null {
	const m = line.match(BLOCK_ID_RE);
	return m ? m[2] : null;
}

export function listPrefix(line: string): string {
	const m = line.match(LIST_PREFIX_RE);
	return m ? m[1] : "";
}

export interface RecallMatch {
	linkPath: string;
	cardId: string;
	timestamp: string | null;
}

export function matchRecall(line: string): RecallMatch | null {
	const link = line.match(RECALL_LINK_RE);
	if (!link) return null;
	const stamp = line.match(RECALL_STAMP_RE);
	if (!stamp) return null;
	const sm = stamp[1].match(STAMP_VALUE_RE);
	return {
		linkPath: link[1],
		cardId: link[2],
		timestamp: sm ? `${sm[1]} ${sm[2]}` : null,
	};
}

export function isRecallLine(line: string): boolean {
	return matchRecall(line) !== null;
}

export function lifecycleOf(tags: string[]): "open" | "closed" | null {
	if (tags.some(t => CLOSED_TAGS.includes(t))) return "closed";
	if (tags.some(t => OPEN_TAGS.includes(t))) return "open";
	return null;
}

/** A line opens a card if it carries a lifecycle tag, is not a heading and is not a recall line. */
export function isCardTriggerLine(line: string): boolean {
	if (isHeading(line) || isRecallLine(line)) return false;
	return lifecycleOf(findTags(line).map(t => t.tag)) !== null;
}

/** Title = line without list prefix, tags and block id. */
export function extractTitle(line: string): string {
	let body = line.slice(listPrefix(line).length);
	const id = body.match(BLOCK_ID_RE);
	if (id && id.index !== undefined) {
		const s = id.index + id[1].length;
		body = body.slice(0, s) + body.slice(s + 1 + id[2].length);
	}
	for (const t of findTags(body).reverse()) {
		body = body.slice(0, t.start) + body.slice(t.end);
	}
	return body.replace(/\s+/g, " ").trim();
}

export function slugify(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

/** Extract YYYY-MM-DD (or DD-MM-YYYY / DD.MM.YYYY / DD_MM_YYYY) from a file name. */
export function dateFromFileName(name: string): string | null {
	const iso = name.match(/(\d{4})[-_.](\d{2})[-_.](\d{2})/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const eu = name.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
	if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
	return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTimestamp(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
