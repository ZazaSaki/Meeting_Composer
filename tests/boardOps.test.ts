import { describe, expect, it } from "vitest";
import {
	addColumn,
	addPreset,
	blankPreset,
	moveColumn,
	movePreset,
	parseTagList,
	removeColumn,
	removePreset,
	updateColumn,
	updatePreset,
} from "../src/core/boardOps";
import { DEFAULT_BOARD } from "../src/core/boardFile";
import { assignColumn, cardsForPreset } from "../src/core/boardEngine";
import { OrgBoardFileSchema } from "../src/types";

const board = (): OrgBoardFileSchema => JSON.parse(JSON.stringify(DEFAULT_BOARD));
const WF = "view-workflow";
const cols = (b: OrgBoardFileSchema, id = WF) => b.presets.find(p => p.id === id)!.columns;

describe("parseTagList", () => {
	it("accepts commas, spaces, with or without #", () => {
		expect(parseTagList("calling, #Urgent  waiting;calling")).toEqual({ tags: ["#calling", "#urgent", "#waiting"], invalid: [] });
	});
	it("keeps accents and reports bad entries", () => {
		expect(parseTagList("#reunião #a.b")).toEqual({ tags: ["#reunião"], invalid: ["#a.b"] });
		expect(parseTagList("   ")).toEqual({ tags: [], invalid: [] });
	});
});

describe("columns", () => {
	it("adds a tag column with extra required tags and a color", () => {
		const b = addColumn(board(), WF, { title: "Hot calls", ruleType: "tag", ruleValue: "Calling", requiredTags: ["#urgent", "#calling"], color: "#ff0000" });
		const c = cols(b).at(-1)!;
		expect(c).toMatchObject({ title: "Hot calls", ruleType: "tag", ruleValue: "#calling", requiredTags: ["#urgent"], color: "#ff0000" });
		expect(c.id).toMatch(/^col-/);
		// a card with both tags lands there (most specific tag column wins)
		const card = { tags: ["#calling", "#urgent"], status: "open" as const, hierarchy: { segments: [], slug: "a" } };
		expect(assignColumn(card, b.presets[0])).toBe(c.id);
	});

	it("edits a column's tag in place", () => {
		const b = updateColumn(board(), WF, { id: "col-waiting", title: "Follow-up", ruleType: "tag", ruleValue: "#followup" });
		expect(cols(b).find(c => c.id === "col-waiting")).toEqual({ id: "col-waiting", title: "Follow-up", ruleType: "tag", ruleValue: "#followup" });
	});

	it("moves and removes columns, and leaves the input untouched", () => {
		const start = board();
		const moved = moveColumn(start, WF, "col-calling", -1);
		expect(cols(moved).map(c => c.id).slice(0, 2)).toEqual(["col-calling", "col-open"]);
		expect(moveColumn(start, WF, "col-open", -1)).toEqual(start);
		expect(cols(removeColumn(start, WF, "col-calling")).map(c => c.id)).not.toContain("col-calling");
		expect(cols(start).map(c => c.id)[0]).toBe("col-open");
	});
});

describe("views", () => {
	it("adds a view with Open/Closed columns and makes it active", () => {
		const b = addPreset(board(), blankPreset("view-x", "Youth", "kanban", "tag", "open-closed"));
		expect(b.activePresetId).toBe("view-x");
		expect(cols(b, "view-x").map(c => c.ruleValue)).toEqual(["open", "closed"]);
	});

	it("copies a view (deep copy)", () => {
		const src = board().presets[0];
		const copy = blankPreset("view-y", "Copy", "matrix", "tag", "copy", src);
		expect(copy.columns).toEqual(src.columns);
		copy.columns[0].title = "changed";
		expect(src.columns[0].title).toBe("Open");
	});

	it("edits the followed tags: only cards with those tags (or a column's tag) show", () => {
		const b = updatePreset(board(), { ...board().presets[0], scopeFilter: { includeTags: ["Youth"], excludeTags: ["#private"], showClosed: true } });
		const p = b.presets[0];
		expect(p.scopeFilter).toEqual({ includeTags: ["#youth"], excludeTags: ["#private"], showClosed: true });
		const mk = (tags: string[]) => ({ tags, status: "open" as const, hierarchy: { segments: [], slug: "a" } });
		const shown = cardsForPreset([mk(["#youth"]), mk(["#other"]), mk(["#youth", "#private"]), mk(["#calling"])], p);
		expect(shown.map(c => c.tags.join(" "))).toEqual(["#youth", "#calling"]);
	});

	it("removes a view but never the last one; fixes the active tab", () => {
		let b = board();
		b = { ...b, activePresetId: "view-calling-global" };
		const r = removePreset(b, "view-calling-global");
		expect(r.presets.map(p => p.id)).not.toContain("view-calling-global");
		expect(r.activePresetId).toBe(WF);
		const single = { ...b, presets: [b.presets[0]], activePresetId: WF };
		expect(removePreset(single, WF)).toEqual(single);
	});

	it("reorders views", () => {
		const b = movePreset(board(), "view-calling-global", -1);
		expect(b.presets[0].id).toBe("view-calling-global");
	});
});
