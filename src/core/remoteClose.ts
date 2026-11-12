// Spec §4.2 "remote closing": a recall line carrying #closed-card closes the origin card.
// One-shot: each closing recall is acted on once (keys persisted), so re-opening the card
// by hand later is respected. Erasing #closed-card from a recall that actually closed its
// card undoes that close (planRemoteReopens).

import { CardNode } from "../types";

export function recallKey(cardId: string, sourcePath: string, timestamp: string | null, line: number): string {
	return `${cardId}|${sourcePath}|${timestamp ?? "line:" + line}`;
}

export interface RemoteClosePlan {
	toClose: CardNode[];
	newKeys: string[]; // every closing recall seen for the first time (closed or not)
	closingKeys: string[]; // subset of newKeys whose recall actually closed an open card
}

export function planRemoteCloses(cards: CardNode[], processed: Set<string>): RemoteClosePlan {
	const toClose: CardNode[] = [];
	const newKeys: string[] = [];
	const closingKeys: string[] = [];
	for (const card of cards) {
		const fresh: string[] = [];
		for (const r of card.recalls) {
			if (!r.closes) continue;
			const key = recallKey(card.id, r.sourceFilePath, r.timestamp, r.anchorLine);
			if (processed.has(key)) continue;
			fresh.push(key);
		}
		newKeys.push(...fresh);
		if (fresh.length && card.status === "open") {
			toClose.push(card);
			closingKeys.push(...fresh);
		}
	}
	return { toClose, newKeys, closingKeys };
}

export interface RemoteReopenPlan {
	toReopen: CardNode[];
	/** keys whose recall lost its #closed-card: forget them so adding the tag again closes again */
	releasedKeys: string[];
}

/**
 * Erasing #closed-card from a recall:
 *  - forgets the recall (its key leaves `processed` and `closedBy`), so adding the tag back closes
 *    the card again; this applies to every recall already acted on, not only ones that closed;
 *  - re-opens the card when that recall is the one that closed it (in `closedBy`), the card is
 *    still closed, and no other recall in `closedBy` still carries #closed-card.
 * A recall line that disappears entirely (deleted, or its file renamed) is ignored, so renames
 * never re-open anything.
 */
export function planRemoteReopens(cards: CardNode[], processed: Set<string>, closedBy: Set<string>): RemoteReopenPlan {
	const toReopen: CardNode[] = [];
	const releasedKeys: string[] = [];
	if (processed.size === 0 && closedBy.size === 0) return { toReopen, releasedKeys };
	for (const card of cards) {
		const released = card.recalls
			.filter(r => !r.closes)
			.map(r => recallKey(card.id, r.sourceFilePath, r.timestamp, r.anchorLine))
			.filter(k => processed.has(k) || closedBy.has(k));
		if (released.length === 0) continue;
		releasedKeys.push(...released);
		if (!released.some(k => closedBy.has(k))) continue;
		// another recall that itself closed this card (and still says so) keeps it closed; older
		// #closed-card recalls that were already overridden by a manual re-open don't count
		const stillClosedByOther = card.recalls.some(
			r => r.closes && closedBy.has(recallKey(card.id, r.sourceFilePath, r.timestamp, r.anchorLine)),
		);
		if (card.status === "closed" && !stillClosedByOther) toReopen.push(card);
	}
	return { toReopen, releasedKeys };
}
