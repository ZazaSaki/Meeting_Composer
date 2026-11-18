// "Pending topics" smart view: which open cards were already discussed in the
// latest meeting file, and which are still to discuss (oldest mention first).
// Stateless: a newer meeting file becomes the latest one and everything resets.

import { BoardViewPreset, CardNode } from "../types";

export const PENDING_TOPICS = "pending-topics";

export interface FileDate {
	path: string;
	date: string | null; // YYYY-MM-DD (file name, else ctime)
}

export interface PendingSplit {
	latestPath: string | null;
	pending: CardNode[];
	discussed: CardNode[];
	/** card id → last mention date before the latest file */
	lastMention: Map<string, string | null>;
}

/** The meeting file with the newest date; ties by path (same order as buildCardIndex). */
export function latestFile(files: FileDate[]): string | null {
	let best: FileDate | null = null;
	for (const f of files) {
		if (!best) {
			best = f;
			continue;
		}
		const a = f.date ?? "";
		const b = best.date ?? "";
		if (a > b || (a === b && f.path > best.path)) best = f;
	}
	return best?.path ?? null;
}

function mentionPaths(card: CardNode): string[] {
	return [card.filePath, ...card.recalls.map(r => r.sourceFilePath)];
}

export function isMentionedIn(card: CardNode, path: string): boolean {
	return mentionPaths(card).includes(path);
}

/** Latest date over the card's origin and recall files, ignoring `excludePath`. */
export function lastMention(card: CardNode, fileDate: (path: string) => string | null, excludePath?: string | null): string | null {
	let best: string | null = null;
	for (const p of mentionPaths(card)) {
		if (p === excludePath) continue;
		const d = fileDate(p);
		if (d && (!best || d > best)) best = d;
	}
	return best;
}

/** First line where the card shows up in `path` (origin title or a recall). */
function lineIn(card: CardNode, path: string): number {
	const lines = card.recalls.filter(r => r.sourceFilePath === path).map(r => r.anchorLine);
	if (card.filePath === path) lines.push(card.titleLine);
	return lines.length ? Math.min(...lines) : Number.MAX_SAFE_INTEGER;
}

export function splitPending(cards: CardNode[], latestPath: string | null, fileDate: (path: string) => string | null): PendingSplit {
	const pending: CardNode[] = [];
	const discussed: CardNode[] = [];
	const last = new Map<string, string | null>();
	for (const c of cards) {
		if (c.status !== "open" || c.duplicateOf) continue;
		last.set(c.id, lastMention(c, fileDate, latestPath));
		if (latestPath && isMentionedIn(c, latestPath)) discussed.push(c);
		else pending.push(c);
	}
	pending.sort((a, b) => {
		const da = last.get(a.id) ?? "";
		const db = last.get(b.id) ?? "";
		return da.localeCompare(db) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
	});
	if (latestPath) discussed.sort((a, b) => lineIn(a, latestPath) - lineIn(b, latestPath));
	return { latestPath, pending, discussed, lastMention: last };
}

/** The ready-made "Pending topics" view. Its two columns are filled by splitPending. */
export function pendingTopicsPreset(id = "view-pending", name = "Pending topics"): BoardViewPreset {
	return {
		id,
		name,
		layout: "kanban",
		dropMode: "tag",
		smart: PENDING_TOPICS,
		scopeFilter: { showClosed: false },
		columns: [
			{ id: `${id}-todo`, title: "Still to discuss", ruleType: "status", ruleValue: "open" },
			{ id: `${id}-done`, title: "Discussed this meeting", ruleType: "status", ruleValue: "open" },
		],
	};
}
