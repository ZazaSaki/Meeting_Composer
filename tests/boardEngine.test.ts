import { describe, expect, it } from "vitest";
import { assignColumn, cardsForPreset, CardLike, normalizeColumn, planDrop } from "../src/core/boardEngine";
import { DEFAULT_BOARD, parseBoardFile } from "../src/core/boardFile";
import { BoardViewPreset } from "../src/types";

const preset = (id: string) => DEFAULT_BOARD.presets.find(p => p.id === id)!;
const card = (tags: string[], status: "open" | "closed" = "open", slug = "aveiro/ua"): CardLike => ({
	tags,
	status,
	hierarchy: { slug },
});

describe("assignColumn — one column per card", () => {
	const wf = preset("view-workflow");
	it("open + #calling goes to Calling, not Open", () => {
		expect(assignColumn(card(["#calling"]), wf)).toBe("col-calling");
	});
	it("plain open card goes to Open", () => expect(assignColumn(card([]), wf)).toBe("col-open"));
	it("closed beats tags", () => expect(assignColumn(card(["#calling"], "closed"), wf)).toBe("col-closed"));
	it("rightmost matching tag column wins (pipeline progress)", () => {
		expect(assignColumn(card(["#calling", "#waiting"]), wf)).toBe("col-waiting");
	});
	it("Eisenhower: composite rule is most specific", () => {
		const m = preset("view-eisenhower");
		expect(assignColumn(card(["#urgent", "#important"]), m)).toBe("q-do");
		expect(assignColumn(card(["#important"]), m)).toBe("q-schedule");
		expect(assignColumn(card(["#urgent"]), m)).toBe("q-delegate");
		expect(assignColumn(card([]), m)).toBe("q-backlog");
		expect(assignColumn(card(["#urgent"], "closed"), m)).toBeNull();
	});
});

describe("planDrop — spec §7.1 drop matrix", () => {
	const wf = preset("view-workflow");
	it("Open → Calling adds #calling", () => {
		expect(planDrop(card([]), "col-open", "col-calling", wf)).toEqual([{ kind: "addTag", tag: "#calling" }]);
	});
	it("Calling → Open removes #calling", () => {
		expect(planDrop(card(["#calling", "#budget"]), "col-calling", "col-open", wf)).toEqual([{ kind: "removeTag", tag: "#calling" }]);
	});
	it("Calling → Waiting swaps tags", () => {
		expect(planDrop(card(["#calling"]), "col-calling", "col-waiting", wf)).toEqual([
			{ kind: "removeTag", tag: "#calling" },
			{ kind: "addTag", tag: "#waiting" },
		]);
	});
	it("Any → Closed only flips status", () => {
		expect(planDrop(card(["#calling"]), "col-calling", "col-closed", wf)).toEqual([{ kind: "setStatus", status: "closed" }]);
	});
	it("Closed → Open re-opens", () => {
		expect(planDrop(card([], "closed"), "col-closed", "col-open", wf)).toEqual([{ kind: "setStatus", status: "open" }]);
	});
	it("dropping into Open strips tags of columns that would still capture the card", () => {
		const ops = planDrop(card(["#calling", "#waiting"]), "col-waiting", "col-open", wf);
		expect(ops).toEqual([
			{ kind: "removeTag", tag: "#waiting" },
			{ kind: "removeTag", tag: "#calling" },
		]);
	});
	it("matrix Do First → Delegate removes only #important", () => {
		const m = preset("view-eisenhower");
		expect(planDrop(card(["#urgent", "#important"]), "q-do", "q-delegate", m)).toEqual([{ kind: "removeTag", tag: "#important" }]);
	});
	it("header mode moves the card", () => {
		const h: BoardViewPreset = {
			id: "h",
			name: "Orgs",
			layout: "kanban",
			dropMode: "header",
			scopeFilter: { hierarchyPrefix: "Aveiro" },
			columns: [
				{ id: "a", title: "University of Aveiro", ruleType: "header", ruleValue: "## University of Aveiro" },
				{ id: "b", title: "City Council", ruleType: "header", ruleValue: "aveiro/city-council" },
			],
		};
		expect(normalizeColumn(h.columns[0], "Aveiro").ruleValue).toBe("aveiro/university-of-aveiro");
		expect(assignColumn(card([], "open", "aveiro/university-of-aveiro/prof-silva"), h)).toBe("a");
		expect(planDrop(card([], "open", "aveiro/university-of-aveiro"), "a", "b", h)).toEqual([
			{ kind: "move", slug: "aveiro/city-council", title: "City Council" },
		]);
	});
});

describe("cardsForPreset — sample board fixes (§8.2)", () => {
	const q = preset("view-calling-global");
	it("a card moved to Follow-Up (no #calling) stays on the board", () => {
		expect(cardsForPreset([card(["#followup"])], q)).toHaveLength(1);
	});
	it("closed cards reach the Completed column even with showClosed:false", () => {
		const closed = card(["#calling"], "closed");
		expect(cardsForPreset([closed], q)).toHaveLength(1);
		expect(assignColumn(closed, q)).toBe("col-call-done");
	});
	it("unrelated cards are filtered out", () => {
		expect(cardsForPreset([card(["#budget"])], q)).toHaveLength(0);
	});
	it("hierarchyPrefix and showClosed", () => {
		const p: BoardViewPreset = { ...preset("view-eisenhower"), scopeFilter: { hierarchyPrefix: "Porto", showClosed: false } };
		expect(cardsForPreset([card([]), card([], "open", "porto/x"), card([], "closed", "porto/x")], p)).toHaveLength(1);
	});
});

describe("parseBoardFile", () => {
	it("empty file gives the default board", () => {
		const r = parseBoardFile("");
		expect(r.ok && r.board.presets.length).toBe(3);
	});
	it("reports invalid JSON instead of throwing", () => {
		const r = parseBoardFile("{ nope");
		expect(r.ok).toBe(false);
	});
	it("repairs an unknown activePresetId", () => {
		const r = parseBoardFile(JSON.stringify({ ...DEFAULT_BOARD, activePresetId: "gone" }));
		expect(r.ok && r.board.activePresetId).toBe("view-workflow");
	});
});
