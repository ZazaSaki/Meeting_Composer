// Spec §4.2 "remote closing": a recall line carrying #closed-card closes the origin card.
// One-shot: each closing recall is acted on once (keys persisted), so re-opening the card
// by hand later is respected and removing the tag never re-opens anything.

import { CardNode } from "../types";

export function recallKey(cardId: string, sourcePath: string, timestamp: string | null, line: number): string {
	return `${cardId}|${sourcePath}|${timestamp ?? "line:" + line}`;
}

export interface RemoteClosePlan {
	toClose: CardNode[];
	newKeys: string[]; // every closing recall seen for the first time (closed or not)
}

export function planRemoteCloses(cards: CardNode[], processed: Set<string>): RemoteClosePlan {
	const toClose: CardNode[] = [];
	const newKeys: string[] = [];
	for (const card of cards) {
		let close = false;
		for (const r of card.recalls) {
			if (!r.closes) continue;
			const key = recallKey(card.id, r.sourceFilePath, r.timestamp, r.anchorLine);
			if (processed.has(key)) continue;
			newKeys.push(key);
			if (card.status === "open") close = true;
		}
		if (close) toClose.push(card);
	}
	return { toClose, newKeys };
}
