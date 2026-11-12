// .orgboard file format: parse/validate + the default board (spec §8.2, with its bugs fixed).

import { BoardViewPreset, OrgBoardFileSchema } from "../types";

export const DEFAULT_BOARD: OrgBoardFileSchema = {
	version: 1,
	activePresetId: "view-workflow",
	presets: [
		{
			id: "view-workflow",
			name: "Action Workflow",
			layout: "kanban",
			dropMode: "tag",
			scopeFilter: { showClosed: true },
			columns: [
				{ id: "col-open", title: "Open", ruleType: "status", ruleValue: "open" },
				{ id: "col-calling", title: "Calling Queue", ruleType: "tag", ruleValue: "#calling" },
				{ id: "col-waiting", title: "Waiting / Follow-Up", ruleType: "tag", ruleValue: "#waiting" },
				{ id: "col-closed", title: "Closed", ruleType: "status", ruleValue: "closed" },
			],
		},
		{
			id: "view-calling-global",
			name: "Global Calling Queue",
			layout: "kanban",
			dropMode: "tag",
			// "#followup" cards stay visible: tag columns are always admitted by the scope filter
			scopeFilter: { includeTags: ["#calling"], showClosed: false },
			columns: [
				{ id: "col-call-todo", title: "To Call", ruleType: "tag", ruleValue: "#calling" },
				{ id: "col-call-followup", title: "Follow-Up Sent", ruleType: "tag", ruleValue: "#followup" },
				{ id: "col-call-done", title: "Completed", ruleType: "status", ruleValue: "closed" },
			],
		},
		{
			id: "view-eisenhower",
			name: "Priority Matrix",
			layout: "matrix",
			dropMode: "tag",
			scopeFilter: { showClosed: false },
			columns: [
				{ id: "q-do", title: "Do First", ruleType: "tag", ruleValue: "#urgent", requiredTags: ["#important"] },
				{ id: "q-schedule", title: "Schedule", ruleType: "tag", ruleValue: "#important" },
				{ id: "q-delegate", title: "Delegate", ruleType: "tag", ruleValue: "#urgent" },
				{ id: "q-backlog", title: "Backlog", ruleType: "status", ruleValue: "open" },
			],
		},
	],
};

export type BoardParseResult = { ok: true; board: OrgBoardFileSchema } | { ok: false; error: string };

function isPreset(p: unknown): p is BoardViewPreset {
	if (!p || typeof p !== "object") return false;
	const o = p as Record<string, unknown>;
	return typeof o.id === "string" && typeof o.name === "string" && Array.isArray(o.columns);
}

export function parseBoardFile(text: string): BoardParseResult {
	if (text.trim() === "") return { ok: true, board: structuredCloneSafe(DEFAULT_BOARD) };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (e) {
		return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
	}
	if (!data || typeof data !== "object") return { ok: false, error: "Board file must be a JSON object" };
	const o = data as Record<string, unknown>;
	if (!Array.isArray(o.presets) || o.presets.length === 0) return { ok: false, error: '"presets" must be a non-empty array' };
	const bad = o.presets.findIndex(p => !isPreset(p));
	if (bad >= 0) return { ok: false, error: `Preset #${bad + 1} needs "id", "name" and "columns"` };
	const presets = (o.presets as BoardViewPreset[]).map(p => ({
		...p,
		layout: p.layout === "matrix" ? "matrix" : "kanban",
		dropMode: p.dropMode === "header" ? "header" : "tag",
		columns: p.columns.filter(c => c && typeof c.id === "string" && typeof c.ruleValue === "string"),
	})) as BoardViewPreset[];
	const active = typeof o.activePresetId === "string" && presets.some(p => p.id === o.activePresetId)
		? (o.activePresetId as string)
		: presets[0].id;
	return { ok: true, board: { version: typeof o.version === "number" ? o.version : 1, activePresetId: active, presets } };
}

export function serializeBoard(board: OrgBoardFileSchema): string {
	return JSON.stringify(board, null, "\t") + "\n";
}

function structuredCloneSafe<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
