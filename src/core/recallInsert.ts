// Plans where and how a recall line is written at the cursor, adding any headings that are
// missing so the recall sits under the same heading path as its card.
//
// Example: the card lives under "# a › ## b" and the cursor is only under "# a"
// → "## b" is inserted right before the recall line.

import { HeadingSegment, HierarchyPath } from "../types";
import { hierarchyAt } from "./cardParser";
import { slugify } from "./syntax";

export interface Pos {
	line: number;
	ch: number;
}

export interface RecallInsertPlan {
	from: Pos;
	to: Pos;
	text: string;
	/** Where the cursor goes afterwards: the empty line below the recall. */
	cursor: Pos;
	/** Heading lines that were added (e.g. ["## b"]); empty when the structure already matched. */
	addedHeadings: string[];
}

/**
 * Headings to insert before the recall so that the heading path at the insertion point equals
 * `target`. A cursor already inside the card's branch (same path or deeper) needs nothing.
 * Levels follow the card's own levels, adjusted so a new heading closes a diverging branch
 * (it is never deeper than the heading it replaces) and nests under the shared part.
 */
export function missingHeadings(here: HeadingSegment[], target: HeadingSegment[]): HeadingSegment[] {
	let k = 0;
	while (k < here.length && k < target.length && slugify(here[k].text) === slugify(target[k].text)) k++;
	if (k === target.length) return [];

	const out: HeadingSegment[] = [];
	const floor = k > 0 ? here[k - 1].level + 1 : 1;
	const ceil = k < here.length ? here[k].level : 6;
	let level = Math.min(Math.max(target[k].level, floor), ceil);
	out.push({ level, text: target[k].text });
	for (let j = k + 1; j < target.length; j++) {
		level = Math.min(Math.max(target[j].level, level + 1), 6);
		out.push({ level, text: target[j].text });
	}
	return out;
}

export function planRecallInsert(doc: string, cursorLine: number, cardPath: HierarchyPath, recallLine: string): RecallInsertPlan {
	const lines = doc.split(/\r?\n/);
	const line = Math.min(Math.max(cursorLine, 0), lines.length - 1);
	const lineText = lines[line];
	const here = hierarchyAt(doc, line).segments;
	const added = missingHeadings(here, cardPath.segments).map(h => "#".repeat(h.level) + " " + h.text);
	const block = [...added, recallLine];

	if (lineText.trim() === "") {
		// replace the empty line; the cursor lands on the fresh line below the recall
		return {
			from: { line, ch: 0 },
			to: { line, ch: lineText.length },
			text: block.join("\n") + "\n",
			cursor: { line: line + block.length, ch: 0 },
			addedHeadings: added,
		};
	}
	// non-empty line: write the block on the lines after it
	return {
		from: { line, ch: lineText.length },
		to: { line, ch: lineText.length },
		text: "\n" + block.join("\n") + "\n",
		cursor: { line: line + 1 + block.length, ch: 0 },
		addedHeadings: added,
	};
}
