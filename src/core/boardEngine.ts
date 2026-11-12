// Board logic for .orgboard presets (spec §6–§7, review fixes #9–#12).
//
// Column precedence (each card lands in exactly ONE column):
//   1. closed cards -> the status:"closed" column (or hidden if the preset has none)
//   2. tag columns that match (ruleValue + requiredTags all present):
//        most required tags first, then the RIGHTMOST column (pipeline progress)
//   3. header columns: the most specific matching heading slug
//   4. open cards -> the status:"open" column
//   otherwise the card is not on this board.

import { BoardColumnRule, BoardViewPreset, CardNode, CardStatus } from "../types";
import { CLOSED_TAGS, OPEN_TAGS, normalizeTag, slugify } from "./syntax";
import { inScope } from "./tree";

export interface CardLike {
	status: CardStatus;
	tags: string[];
	hierarchy: { slug: string };
}

/** "Aveiro/City Council" or "aveiro/city-council" -> "aveiro/city-council" */
export function slugPath(v: string): string {
	return v.split("/").map(slugify).filter(Boolean).join("/");
}

/**
 * Lifecycle tags used as tag rules are treated as status rules.
 * Header values are slug paths; legacy "## Org" values are resolved under the preset's hierarchyPrefix.
 */
export function normalizeColumn(col: BoardColumnRule, prefix?: string): BoardColumnRule {
	if (col.ruleType === "tag") {
		const v = normalizeTag(col.ruleValue);
		if (OPEN_TAGS.includes(v)) return { ...col, ruleType: "status", ruleValue: "open" };
		if (CLOSED_TAGS.includes(v)) return { ...col, ruleType: "status", ruleValue: "closed" };
		return { ...col, ruleValue: v, requiredTags: col.requiredTags?.map(normalizeTag) };
	}
	if (col.ruleType === "status") return { ...col, ruleValue: col.ruleValue.toLowerCase() };
	if (col.ruleType === "header") {
		const raw = col.ruleValue.trim();
		if (raw.startsWith("#")) {
			const name = slugify(raw.replace(/^#+\s*/, ""));
			const p = prefix ? slugPath(prefix) : "";
			return { ...col, ruleValue: p ? `${p}/${name}` : name };
		}
		return { ...col, ruleValue: slugPath(raw) };
	}
	return col;
}

export function columnTags(col: BoardColumnRule): string[] {
	const c = normalizeColumn(col);
	const req = (c.requiredTags ?? []).map(normalizeTag);
	return c.ruleType === "tag" ? Array.from(new Set([c.ruleValue, ...req])) : req;
}

function hasAll(card: CardLike, tags: string[]): boolean {
	return tags.every(t => card.tags.includes(t));
}

export function cardsForPreset<T extends CardLike>(cards: T[], preset: BoardViewPreset): T[] {
	const f = preset.scopeFilter ?? {};
	const cols = preset.columns.map(c => normalizeColumn(c, preset.scopeFilter?.hierarchyPrefix));
	const hasClosedCol = cols.some(c => c.ruleType === "status" && c.ruleValue === "closed");
	const include = (f.includeTags ?? []).map(normalizeTag);
	const exclude = (f.excludeTags ?? []).map(normalizeTag);
	const columnTagSet = new Set(cols.flatMap(columnTags));
	return cards.filter(c => {
		if (f.hierarchyPrefix && !inScope(c.hierarchy.slug, slugPath(f.hierarchyPrefix))) return false;
		if (exclude.some(t => c.tags.includes(t))) return false;
		// include filter also admits cards matching any tag column (so a drag never makes a card vanish)
		if (include.length && !include.some(t => c.tags.includes(t)) && !c.tags.some(t => columnTagSet.has(t))) {
			if (!(c.status === "closed" && hasClosedCol)) return false;
		}
		if (c.status === "closed" && f.showClosed === false && !hasClosedCol) return false;
		return true;
	});
}

export function assignColumn(card: CardLike, preset: BoardViewPreset): string | null {
	const cols = preset.columns.map(c => normalizeColumn(c, preset.scopeFilter?.hierarchyPrefix));
	const statusCol = (s: string) => cols.find(c => c.ruleType === "status" && c.ruleValue === s && hasAll(card, (c.requiredTags ?? []).map(normalizeTag)));

	if (card.status === "closed") return statusCol("closed")?.id ?? null;

	let best: { id: string; score: number; index: number } | null = null;
	cols.forEach((c, index) => {
		if (c.ruleType !== "tag") return;
		const tags = columnTags(c);
		if (!hasAll(card, tags)) return;
		const score = tags.length;
		if (!best || score > best.score || (score === best.score && index > best.index)) best = { id: c.id, score, index };
	});
	if (best) return (best as { id: string }).id;

	let header: { id: string; len: number } | null = null;
	for (const c of cols) {
		if (c.ruleType !== "header") continue;
		if (inScope(card.hierarchy.slug, c.ruleValue) && (!header || c.ruleValue.length > header.len)) {
			header = { id: c.id, len: c.ruleValue.length };
		}
	}
	if (header) return (header as { id: string }).id;

	return statusCol("open")?.id ?? null;
}

export type DropOp =
	| { kind: "addTag"; tag: string }
	| { kind: "removeTag"; tag: string }
	| { kind: "setStatus"; status: CardStatus }
	| { kind: "move"; slug: string; title: string };

function applyOps(card: CardLike, ops: DropOp[]): CardLike {
	let tags = [...card.tags];
	let status = card.status;
	for (const op of ops) {
		if (op.kind === "addTag" && !tags.includes(op.tag)) tags.push(op.tag);
		if (op.kind === "removeTag") tags = tags.filter(t => t !== op.tag);
		if (op.kind === "setStatus") status = op.status;
	}
	return { status, tags, hierarchy: card.hierarchy };
}

/** Markdown operations that make `card` land in column `toId`. */
export function planDrop(card: CardLike, fromId: string | null, toId: string, preset: BoardViewPreset): DropOp[] {
	if (fromId === toId) return [];
	const cols = preset.columns.map(c => normalizeColumn(c, preset.scopeFilter?.hierarchyPrefix));
	const to = cols.find(c => c.id === toId);
	if (!to) return [];
	const from = cols.find(c => c.id === fromId) ?? null;

	if (to.ruleType === "header") {
		const ops: DropOp[] = [{ kind: "move", slug: to.ruleValue, title: to.title }];
		if (card.status === "closed" && preset.scopeFilter?.showClosed === false) ops.push({ kind: "setStatus", status: "open" });
		return ops;
	}

	if (to.ruleType === "status" && to.ruleValue === "closed") {
		return [{ kind: "setStatus", status: "closed" }];
	}

	const ops: DropOp[] = [];
	if (card.status === "closed") ops.push({ kind: "setStatus", status: "open" });
	const toTags = columnTags(to);
	if (from && from.ruleType === "tag") {
		for (const t of columnTags(from)) if (!toTags.includes(t)) ops.push({ kind: "removeTag", tag: t });
	}
	for (const t of toTags) if (!card.tags.includes(t)) ops.push({ kind: "addTag", tag: t });

	// post-condition: strip tags of higher-precedence columns that would still capture the card
	for (let guard = 0; guard < cols.length; guard++) {
		const now = assignColumn(applyOps(card, ops), preset);
		if (now === toId || now === null) break;
		const blocking = cols.find(c => c.id === now);
		if (!blocking || blocking.ruleType !== "tag") break;
		const strip = columnTags(blocking).filter(t => !toTags.includes(t));
		if (strip.length === 0) break;
		for (const t of strip) ops.push({ kind: "removeTag", tag: t });
	}
	return ops;
}

export function groupByColumn<T extends CardNode>(cards: T[], preset: BoardViewPreset): Map<string, T[]> {
	const out = new Map<string, T[]>(preset.columns.map(c => [c.id, []]));
	for (const c of cardsForPreset(cards, preset)) {
		const col = assignColumn(c, preset);
		if (col) out.get(col)?.push(c);
	}
	return out;
}
