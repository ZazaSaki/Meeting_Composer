// Default boards built from the topic lists in settings:
// one board per group (Sectors, Organizations, Important topics), one view per list entry.
// Re-running only adds the views that are missing; views you edited or added are kept.

import { BoardViewPreset, OrgBoardFileSchema } from "../types";
import { slugify } from "./syntax";

export type TopicGroupKind = "sectors" | "organizations" | "important";

export const TOPIC_BOARDS: { kind: TopicGroupKind; fileName: string }[] = [
	{ kind: "sectors", fileName: "Sectors" },
	{ kind: "organizations", fileName: "Organizations" },
	{ kind: "important", fileName: "Important topics" },
];

/**
 * True when one of the card's headings is the topic, or starts with it as whole words:
 * "Coimbra" matches "# Coimbra 1" and "# Coimbra 2"; "Quorum" matches "## Quorum de Elders" under any city.
 */
export function topicMatches(cardSlug: string, topic: string): boolean {
	const t = slugify(topic);
	if (!t) return true;
	return cardSlug.split("/").some(seg => seg === t || seg.startsWith(t + "-"));
}

export function topicPresetId(name: string): string {
	return `view-topic-${slugify(name)}`;
}

export function topicPreset(name: string): BoardViewPreset {
	const id = topicPresetId(name);
	return {
		id,
		name,
		layout: "kanban",
		dropMode: "tag",
		scopeFilter: { topic: name, showClosed: true },
		columns: [
			{ id: `${id}-open`, title: "Open", ruleType: "status", ruleValue: "open" },
			{ id: `${id}-closed`, title: "Closed", ruleType: "status", ruleValue: "closed" },
		],
	};
}

export interface TopicBoardSync {
	board: OrgBoardFileSchema | null; // null: nothing to create (empty list, no existing board)
	added: string[];
}

/** Adds a view for each list entry that the board doesn't have yet (matched by topic). */
export function syncTopicBoard(existing: OrgBoardFileSchema | null, names: string[]): TopicBoardSync {
	const presets = existing ? [...existing.presets] : [];
	const have = new Set(
		presets.flatMap(p => [p.id, p.scopeFilter?.topic ? topicPresetId(p.scopeFilter.topic) : ""]).filter(Boolean),
	);
	const added: string[] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (!slugify(name)) continue;
		const id = topicPresetId(name);
		if (have.has(id)) continue;
		have.add(id);
		presets.push(topicPreset(name));
		added.push(name);
	}
	if (presets.length === 0) return { board: null, added };
	if (existing) return { board: { ...existing, presets }, added };
	return { board: { version: 1, activePresetId: presets[0].id, presets }, added };
}
