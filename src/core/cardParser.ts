// Top-down card & recall parser (spec §2–§4, with the review fixes applied).
//
// Rules:
//  * A heading of level 1–3 opens a card only if the FIRST non-empty line after it
//    carries a lifecycle tag (#open-card, #open-ticket, #closed-card, #closed-ticket).
//  * Lines holding a recall (`[[file#^card-x|..]] %%recall:..%%`) are never card lines.
//  * A card description / recall body ends at the next heading (any level), a
//    horizontal rule, the next recall line, or EOF. Trailing blank lines are trimmed.
//  * Fenced code blocks and front-matter are opaque: nothing inside them is parsed.

import { HeadingSegment, HierarchyPath, ParsedCard, ParsedFile, ParsedRecall } from "../types";
import {
	extractTitle,
	fenceMarker,
	findBlockId,
	findTags,
	isCardTriggerLine,
	isHr,
	LIFECYCLE_TAGS,
	CLOSED_TAGS,
	lifecycleOf,
	matchRecall,
	parseHeading,
	slugify,
} from "./syntax";

type LineKind = "blank" | "text" | "heading" | "hr" | "recall" | "opaque";

export interface LineInfo {
	kind: LineKind;
	heading?: { level: number; text: string };
}

export function classifyLines(lines: string[]): LineInfo[] {
	const info: LineInfo[] = new Array(lines.length);
	let i = 0;

	// front-matter
	if (lines.length > 0 && lines[0].trim() === "---") {
		let j = 1;
		while (j < lines.length && lines[j].trim() !== "---" && lines[j].trim() !== "...") j++;
		if (j < lines.length) {
			for (let k = 0; k <= j; k++) info[k] = { kind: "opaque" };
			i = j + 1;
		}
	}

	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const marker = fenceMarker(line);
		if (fence) {
			info[i] = { kind: "opaque" };
			if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
			continue;
		}
		if (marker) {
			fence = marker;
			info[i] = { kind: "opaque" };
			continue;
		}
		if (line.trim() === "") {
			info[i] = { kind: "blank" };
			continue;
		}
		const h = parseHeading(line);
		if (h) {
			info[i] = { kind: "heading", heading: h };
			continue;
		}
		if (isHr(line)) {
			info[i] = { kind: "hr" };
			continue;
		}
		if (matchRecall(line)) {
			info[i] = { kind: "recall" };
			continue;
		}
		info[i] = { kind: "text" };
	}
	return info;
}

export function makeHierarchy(segments: HeadingSegment[]): HierarchyPath {
	return {
		segments: segments.map(s => ({ ...s })),
		slug: segments.map(s => slugify(s.text)).join("/"),
	};
}

function isBoundary(k: LineKind): boolean {
	return k === "heading" || k === "hr" || k === "recall";
}

/** Returns [firstBodyLine, lastNonBlankLine] for the body that starts after `from`. lastNonBlank = from when empty. */
export function bodyRange(info: LineInfo[], from: number): { end: number; boundary: number } {
	let k = from + 1;
	let last = from;
	while (k < info.length && !isBoundary(info[k].kind)) {
		if (info[k].kind !== "blank") last = k;
		k++;
	}
	return { end: last, boundary: k };
}

export function parseFile(text: string, path: string): ParsedFile {
	const lines = text.split(/\r?\n/);
	const info = classifyLines(lines);
	const cards: ParsedCard[] = [];
	const recalls: ParsedRecall[] = [];
	const paths: HierarchyPath[] = [];
	const stack: HeadingSegment[] = [];

	for (let i = 0; i < lines.length; i++) {
		const li = info[i];

		if (li.kind === "heading" && li.heading) {
			const { level, text: htext } = li.heading;
			if (level > 3) continue; // #### and deeper are boundaries, not context
			while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
			stack.push({ level, text: htext });
			paths.push(makeHierarchy(stack));

			// first non-empty line after the heading
			let j = i + 1;
			while (j < lines.length && info[j].kind === "blank") j++;
			if (j < lines.length && info[j].kind === "text" && isCardTriggerLine(lines[j])) {
				const tags = findTags(lines[j]).map(t => t.tag);
				const { end } = bodyRange(info, j);
				cards.push({
					id: findBlockId(lines[j]),
					title: extractTitle(lines[j]),
					status: lifecycleOf(tags) ?? "open",
					tags: unique(tags.filter(t => !LIFECYCLE_TAGS.includes(t))),
					hierarchy: makeHierarchy(stack),
					headingLine: i,
					headingLevel: level,
					titleLine: j,
					endLine: end,
					description: trimLeadingBlank(lines.slice(j + 1, end + 1)).join("\n"),
				});
			}
			continue;
		}

		if (li.kind === "recall") {
			const m = matchRecall(lines[i]);
			if (!m) continue;
			const { end } = bodyRange(info, i);
			const tags = findTags(lines[i]).map(t => t.tag);
			recalls.push({
				cardId: m.cardId,
				linkPath: m.linkPath,
				timestamp: m.timestamp,
				closes: tags.some(t => CLOSED_TAGS.includes(t)),
				line: i,
				endLine: end,
				content: trimLeadingBlank(lines.slice(i + 1, end + 1)).join("\n"),
				hierarchy: makeHierarchy(stack),
			});
		}
	}

	return { path, cards, recalls, paths };
}

/** Heading path (H1–H3) in effect at `line`. */
export function hierarchyAt(text: string, line: number): HierarchyPath {
	const lines = text.split(/\r?\n/);
	const info = classifyLines(lines.slice(0, line + 1));
	const stack: HeadingSegment[] = [];
	for (const li of info) {
		const h = li.kind === "heading" ? li.heading : undefined;
		if (!h || h.level > 3) continue;
		while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
		stack.push({ level: h.level, text: h.text });
	}
	return makeHierarchy(stack);
}

/** Find the card whose title line holds `^id`, re-parsing the current text (never trusts stored line numbers). */
export function locateCard(text: string, id: string): ParsedCard | null {
	return parseFile(text, "").cards.find(c => c.id === id) ?? null;
}

function trimLeadingBlank(xs: string[]): string[] {
	let k = 0;
	while (k < xs.length && xs[k].trim() === "") k++;
	return xs.slice(k);
}

function unique<T>(xs: T[]): T[] {
	return Array.from(new Set(xs));
}
