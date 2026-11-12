// Pure topic logic (no Obsidian imports) so it can be unit-tested.

import { FilterResult, filterByName } from "../core/treeFilter";
import { PriorityLists, ResultEntry, TopicGroup, TopicNode, TopicParser, TopicQuery } from "./types";

/** Stable key for a node: its full heading path. */
export function pathKey(path: string[], name?: string): string {
	return (name === undefined ? path : [...path, name]).join("\u0000");
}

export function isTagQuery(text: string): boolean {
	return text.trim().startsWith("#");
}

/** Top-level grouping used by the sidebar (moved from the old FileTree.tsx). */
export function categorize(name: string, lists: PriorityLists): TopicGroup {
	const lower = name.toLowerCase();
	if (lists.priorityBeforeCities.some(t => t.toLowerCase() === lower)) return "org";
	if (lists.cities.some(c => lower.includes(c.toLowerCase()))) return "sector";
	return "important";
}

export function groupRoots(roots: TopicNode[], lists: PriorityLists): Record<TopicGroup, TopicNode[]> {
	const out: Record<TopicGroup, TopicNode[]> = { org: [], sector: [], important: [] };
	for (const node of roots) out[categorize(node.name, lists)].push(node);
	return out;
}

export type FilteredTree = FilterResult<TopicNode>;

/** Keep topics whose name contains `query` plus their ancestors (see filterByName). */
export function filterTree(nodes: TopicNode[], query: string): FilteredTree {
	return filterByName(nodes, query, n => pathKey(n.path, n.name));
}

/** Case-insensitive match of typed text to a known topic name (the parser matches names exactly). */
export function resolveTopicName(text: string, names: string[]): string {
	const t = text.trim();
	if (names.includes(t)) return t;
	const lower = t.toLowerCase();
	return names.find(n => n.toLowerCase() === lower) ?? t;
}

/** Run a query against the parser (logic moved from the old printSearch, minus the file writing). */
export function runQuery(parser: TopicParser, q: TopicQuery): ResultEntry[] {
	const text = q.text.trim();
	if (!text) return [];
	if (isTagQuery(text)) return parser.getOrganizedTags(text.replace(/^#+/, ""));

	const lowerCities = parser.cities.map(c => c.toLowerCase());
	const cityContext = q.scoped && q.parentPath.some(p => lowerCities.includes(p.toLowerCase()));
	if (cityContext) {
		let sub: any = parser.getTree();
		for (const parent of q.parentPath) {
			if (sub && sub[parent]) sub = sub[parent];
		}
		return parser.getOrganizedTopicsFromTree(text, sub, false);
	}
	return parser.getOrganizedTopics(text, true);
}

/** Heading path inside the source file that an entry came from. */
export function entryHeadingPath(entry: ResultEntry, tagQuery: boolean): string[] {
	return tagQuery ? entry.parent : [...entry.parent, entry.name];
}

/** Obsidian link text pointing at the entry's heading, e.g. "Atas/2026-11-04#Aveiro#Budget". */
export function entryLinkText(entry: ResultEntry, tagQuery: boolean): string {
	const file = entry.path || entry.id;
	const headings = entryHeadingPath(entry, tagQuery);
	return headings.length ? `${file}#${headings.join("#")}` : file;
}

export function queryLabel(q: TopicQuery): string {
	return isTagQuery(q.text) ? `#${q.text.trim().replace(/^#+/, "")}` : q.text.trim();
}
