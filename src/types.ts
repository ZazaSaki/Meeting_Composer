// Meeting Composer v2 — shared types for cards, recalls and .orgboard files.

export type CardStatus = "open" | "closed";

export interface HeadingSegment {
	level: number; // 1..3
	text: string; // heading text with tags stripped
}

/**
 * Generic heading path. Headings are not forced to be City/Org/Sub-topic:
 * a card's scope is simply the H1 › H2 › H3 headings above it.
 */
export interface HierarchyPath {
	segments: HeadingSegment[];
	slug: string; // e.g. "aveiro/university-of-aveiro/prof-silva"
}

export interface ParsedCard {
	id: string | null; // "card-k3x9f2"; null until AutoIdListener assigns one
	title: string;
	status: CardStatus;
	tags: string[]; // operational tags, lowercase with "#", lifecycle tags excluded
	hierarchy: HierarchyPath;
	headingLine: number;
	headingLevel: number;
	titleLine: number;
	endLine: number; // last non-blank line of the base description (== titleLine when empty)
	description: string;
}

export interface ParsedRecall {
	cardId: string;
	linkPath: string; // the file part of [[file#^card-x]]
	timestamp: string | null; // "YYYY-MM-DD HH:mm" from %%recall:...%%
	closes: boolean; // line carries #closed-card / #closed-ticket
	line: number;
	endLine: number;
	content: string;
	hierarchy: HierarchyPath;
}

export interface ParsedFile {
	path: string;
	cards: ParsedCard[];
	recalls: ParsedRecall[];
	paths: HierarchyPath[]; // every H1–H3 heading path in the file (for the tree)
}

export interface CardRecallEntry {
	timestamp: string | null;
	sourceFilePath: string;
	anchorLine: number;
	endLine: number;
	content: string;
	closes: boolean;
}

/** A card as served by the store: parsed card + origin file + assembled recalls. */
export interface CardNode extends ParsedCard {
	id: string;
	filePath: string;
	openedAt: string | null; // from the meeting file name (YYYY-MM-DD), else file ctime
	recalls: CardRecallEntry[];
	lastUpdated: string | null; // latest recall timestamp, else openedAt
	duplicateOf?: string; // set when another file already owns this id
}

// ---------- .orgboard ----------

export interface BoardColumnRule {
	id: string;
	title: string;
	/**
	 * status: ruleValue "open" | "closed"
	 * tag:    ruleValue "#calling"
	 * header: ruleValue is a heading slug path ("aveiro/city-council")
	 */
	ruleType: "tag" | "header" | "status";
	ruleValue: string;
	requiredTags?: string[]; // composite rule: all must be present (e.g. ["#urgent", "#important"])
	color?: string;
}

export interface BoardScopeFilter {
	hierarchyPrefix?: string;
	includeTags?: string[]; // card must have at least one of these OR match a tag column
	excludeTags?: string[];
	showClosed?: boolean;
}

export interface BoardViewPreset {
	id: string;
	name: string;
	layout: "kanban" | "matrix";
	dropMode: "tag" | "header";
	scopeFilter?: BoardScopeFilter;
	columns: BoardColumnRule[];
}

export interface OrgBoardFileSchema {
	version: number;
	activePresetId: string;
	presets: BoardViewPreset[];
}
