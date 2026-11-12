// Pure index builder: parsed files -> CardNodes with assembled, chronologically sorted recalls.

import { CardNode, CardRecallEntry, ParsedFile } from "../types";

export interface IndexedFile {
	parsed: ParsedFile;
	openedAt: string | null;
}

export interface CardIndex {
	cards: Map<string, CardNode>; // canonical card per id
	duplicates: CardNode[]; // cards whose id already belongs to an earlier card
	unassigned: { filePath: string; titleLine: number; title: string }[]; // trigger lines still without ^id
	allIds: Set<string>;
}

/**
 * @param resolveLink maps a recall's link path (relative to the note containing it) to a vault path,
 *        or null if it does not resolve. Used to attach a recall to the right card when ids are duplicated.
 */
export function buildCardIndex(
	files: IndexedFile[],
	resolveLink: (linkPath: string, sourcePath: string) => string | null = () => null,
): CardIndex {
	// Earliest meeting wins an id; ties by path for determinism.
	const ordered = [...files].sort((a, b) => {
		const da = a.openedAt ?? "9999";
		const db = b.openedAt ?? "9999";
		return da !== db ? (da < db ? -1 : 1) : a.parsed.path.localeCompare(b.parsed.path);
	});

	const cards = new Map<string, CardNode>();
	const duplicates: CardNode[] = [];
	const unassigned: CardIndex["unassigned"] = [];
	const allIds = new Set<string>();
	const byFileAndId = new Map<string, CardNode>();

	for (const f of ordered) {
		for (const c of f.parsed.cards) {
			if (!c.id) {
				unassigned.push({ filePath: f.parsed.path, titleLine: c.titleLine, title: c.title });
				continue;
			}
			const node: CardNode = {
				...c,
				id: c.id,
				filePath: f.parsed.path,
				openedAt: f.openedAt,
				recalls: [],
				lastUpdated: f.openedAt,
			};
			allIds.add(c.id);
			byFileAndId.set(f.parsed.path + "\u0000" + c.id, node);
			const existing = cards.get(c.id);
			if (existing) {
				node.duplicateOf = existing.filePath;
				duplicates.push(node);
			} else {
				cards.set(c.id, node);
			}
		}
	}

	for (const f of files) {
		for (const r of f.parsed.recalls) {
			const target = resolveLink(r.linkPath, f.parsed.path);
			const node = (target && byFileAndId.get(target + "\u0000" + r.cardId)) || cards.get(r.cardId);
			if (!node) continue;
			const entry: CardRecallEntry = {
				timestamp: r.timestamp,
				sourceFilePath: f.parsed.path,
				anchorLine: r.line,
				endLine: r.endLine,
				content: r.content,
				closes: r.closes,
			};
			node.recalls.push(entry);
		}
	}

	const all = [...cards.values(), ...duplicates];
	for (const node of all) {
		node.recalls.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.anchorLine - b.anchorLine);
		const last = node.recalls.map(r => r.timestamp).filter((t): t is string => !!t).pop();
		node.lastUpdated = last ?? node.openedAt;
	}

	return { cards, duplicates, unassigned, allIds };
}
