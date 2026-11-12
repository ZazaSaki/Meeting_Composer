// Pure edits on an .orgboard document: columns ("boxes") and views (presets).
// Every function returns a new board; the input is never mutated.

import { BoardColumnRule, BoardScopeFilter, BoardViewPreset, OrgBoardFileSchema } from "../types";
import { normalizeTag } from "./syntax";

const TAG_OK = /^#[\p{L}\p{N}_/-]+$/u;

/** "calling, #urgent  waiting" → ["#calling", "#urgent", "#waiting"]; reports entries that aren't valid tags. */
export function parseTagList(text: string): { tags: string[]; invalid: string[] } {
	const tags: string[] = [];
	const invalid: string[] = [];
	for (const raw of text.split(/[\s,;]+/)) {
		if (!raw) continue;
		const t = normalizeTag(raw);
		if (!TAG_OK.test(t) || t === "#") invalid.push(raw);
		else if (!tags.includes(t)) tags.push(t);
	}
	return { tags, invalid };
}

export function formatTagList(tags: string[] | undefined): string {
	return (tags ?? []).join(" ");
}

export function uniqueId(prefix: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	for (let i = 0; ; i++) {
		const id = `${prefix}-${Date.now().toString(36)}${i ? "-" + i : ""}`;
		if (!used.has(id)) return id;
	}
}

function mapPreset(board: OrgBoardFileSchema, presetId: string, fn: (p: BoardViewPreset) => BoardViewPreset): OrgBoardFileSchema {
	return { ...board, presets: board.presets.map(p => (p.id === presetId ? fn(p) : p)) };
}

// ---------- columns ----------

export function addColumn(board: OrgBoardFileSchema, presetId: string, col: Omit<BoardColumnRule, "id"> & { id?: string }): OrgBoardFileSchema {
	return mapPreset(board, presetId, p => {
		const id = col.id && !p.columns.some(c => c.id === col.id) ? col.id : uniqueId("col", p.columns.map(c => c.id));
		return { ...p, columns: [...p.columns, cleanColumn({ ...col, id })] };
	});
}

export function updateColumn(board: OrgBoardFileSchema, presetId: string, col: BoardColumnRule): OrgBoardFileSchema {
	return mapPreset(board, presetId, p => ({ ...p, columns: p.columns.map(c => (c.id === col.id ? cleanColumn(col) : c)) }));
}

export function removeColumn(board: OrgBoardFileSchema, presetId: string, colId: string): OrgBoardFileSchema {
	return mapPreset(board, presetId, p => ({ ...p, columns: p.columns.filter(c => c.id !== colId) }));
}

/** Move a column left (-1) or right (+1); no-op at the edges. */
export function moveColumn(board: OrgBoardFileSchema, presetId: string, colId: string, delta: number): OrgBoardFileSchema {
	return mapPreset(board, presetId, p => {
		const i = p.columns.findIndex(c => c.id === colId);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= p.columns.length) return p;
		const cols = [...p.columns];
		[cols[i], cols[j]] = [cols[j], cols[i]];
		return { ...p, columns: cols };
	});
}

function cleanColumn(c: BoardColumnRule): BoardColumnRule {
	const out: BoardColumnRule = { id: c.id, title: c.title.trim() || c.ruleValue, ruleType: c.ruleType, ruleValue: c.ruleValue };
	if (c.ruleType === "tag") out.ruleValue = normalizeTag(c.ruleValue);
	const req = (c.requiredTags ?? []).map(normalizeTag).filter(t => t !== out.ruleValue);
	if (req.length) out.requiredTags = Array.from(new Set(req));
	if (c.color) out.color = c.color;
	return out;
}

// ---------- views (presets) ----------

export type ViewStart = "open-closed" | "empty" | "copy";

export function blankPreset(
	id: string,
	name: string,
	layout: BoardViewPreset["layout"],
	dropMode: BoardViewPreset["dropMode"],
	start: ViewStart,
	copyFrom?: BoardViewPreset,
): BoardViewPreset {
	if (start === "copy" && copyFrom) {
		return { ...JSON.parse(JSON.stringify(copyFrom)), id, name, layout, dropMode };
	}
	const columns: BoardColumnRule[] =
		start === "open-closed" && dropMode === "tag"
			? [
					{ id: `${id}-open`, title: "Open", ruleType: "status", ruleValue: "open" },
					{ id: `${id}-closed`, title: "Closed", ruleType: "status", ruleValue: "closed" },
			  ]
			: [];
	return { id, name, layout, dropMode, scopeFilter: { showClosed: true }, columns };
}

/** Adds the view and makes it the active tab. */
export function addPreset(board: OrgBoardFileSchema, preset: BoardViewPreset): OrgBoardFileSchema {
	const id = board.presets.some(p => p.id === preset.id) ? uniqueId("view", board.presets.map(p => p.id)) : preset.id;
	return { ...board, presets: [...board.presets, { ...preset, id }], activePresetId: id };
}

export function updatePreset(board: OrgBoardFileSchema, preset: BoardViewPreset): OrgBoardFileSchema {
	return mapPreset(board, preset.id, () => ({ ...preset, scopeFilter: cleanScope(preset.scopeFilter) }));
}

/** The last view can't be removed (a board needs at least one). */
export function removePreset(board: OrgBoardFileSchema, presetId: string): OrgBoardFileSchema {
	if (board.presets.length <= 1) return board;
	const i = board.presets.findIndex(p => p.id === presetId);
	if (i < 0) return board;
	const presets = board.presets.filter(p => p.id !== presetId);
	const active = board.activePresetId === presetId ? presets[Math.max(0, i - 1)].id : board.activePresetId;
	return { ...board, presets, activePresetId: active };
}

export function movePreset(board: OrgBoardFileSchema, presetId: string, delta: number): OrgBoardFileSchema {
	const i = board.presets.findIndex(p => p.id === presetId);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= board.presets.length) return board;
	const presets = [...board.presets];
	[presets[i], presets[j]] = [presets[j], presets[i]];
	return { ...board, presets };
}

function cleanScope(f: BoardScopeFilter | undefined): BoardScopeFilter | undefined {
	if (!f) return undefined;
	const out: BoardScopeFilter = {};
	if (f.hierarchyPrefix?.trim()) out.hierarchyPrefix = f.hierarchyPrefix.trim();
	if (f.includeTags?.length) out.includeTags = Array.from(new Set(f.includeTags.map(normalizeTag)));
	if (f.excludeTags?.length) out.excludeTags = Array.from(new Set(f.excludeTags.map(normalizeTag)));
	if (f.showClosed !== undefined) out.showClosed = f.showClosed;
	return out;
}
