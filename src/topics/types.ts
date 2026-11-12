// Types shared by the Topics sidebar / Results view.
// The v1 parser (DataMeenutes/App.ts) is not strict-mode clean, so nothing under src/ imports it:
// main.ts hands its MarkdownParser instance in through the TopicParser interface below.

/** The subset of DataMeenutes' MarkdownParser that the topic views use. */
export interface TopicParser {
	priorityBeforeCities: string[];
	cities: string[];
	priorityAfterCities: string[];
	resetTree(): void;
	getTree(): any;
	AppendToExistingTree(markdownText: string, id?: string, filePath?: string): void;
	GenerateTopicTree(preset?: boolean, toggle?: Function): { children: TopicNode[] };
	getOrganizedTopics(topic: string, full?: boolean): ResultEntry[];
	getOrganizedTopicsFromTree(topic: string, tree: any, full?: boolean): ResultEntry[];
	getOrganizedTags(tag: string): ResultEntry[];
	convertOrganizedTopicToMD(entries: ResultEntry[]): string;
	getAllTopicNames(): string[];
}

/** One node of the topic tree, as produced by MarkdownParser.GenerateTopicTree. */
export interface TopicNode {
	name: string;
	children: TopicNode[];
	/** Ancestor headings, not including the node itself. */
	path: string[];
}

/** One aggregated result, as produced by MarkdownParser.getOrganized*. */
export interface ResultEntry {
	content: string[];
	/** Heading path above `name` (for tag results: the full heading path holding the tagged content). */
	parent: string[];
	tags: string[];
	/** Meeting file name (usually its date). */
	id: string;
	/** Vault path of the minutes file, without ".md". */
	path?: string;
	/** The topic searched for (for tag results: the tag). */
	name: string;
}

export interface TopicQuery {
	/** A topic name, or "#tag". */
	text: string;
	/** Ancestors of the clicked node (empty for typed searches). */
	parentPath: string[];
	scoped: boolean;
}

export type TopicGroup = "org" | "sector" | "important";

export interface PriorityLists {
	priorityBeforeCities: string[];
	cities: string[];
	priorityAfterCities: string[];
}
