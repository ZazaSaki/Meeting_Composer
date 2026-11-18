import { describe, expect, it } from "vitest";
import { parseFile } from "../src/core/cardParser";
import { buildCardIndex, IndexedFile } from "../src/core/cardIndex";
import { latestFile, pendingTopicsPreset, splitPending } from "../src/core/pendingTopics";
import { blankPreset } from "../src/core/boardOps";
import { DEFAULT_BOARD, parseBoardFile, serializeBoard } from "../src/core/boardFile";

const f = (path: string, openedAt: string, text: string): IndexedFile => ({ parsed: parseFile(text, path), openedAt });

const oct = f(
	"Atas/2026-10-01.md",
	"2026-10-01",
	"## A\nOld topic #open-card ^card-old\n## B\nDone topic #closed-card ^card-closed\n## C\nMid topic #open-card ^card-mid",
);
const nov = f("Atas/2026-11-01.md", "2026-11-01", "## C\n[[2026-10-01#^card-mid|Mid topic]] %%recall:2026-11-01 10:00%%\n- note");
// latest meeting: recall stamped the day before the file date, plus a new card opened here
const latest = f(
	"Atas/2026-11-13.md",
	"2026-11-13",
	"## X\nFresh topic #open-card ^card-fresh\n## Y\n[[2026-10-01#^card-recalled|Recalled]] %%recall:2026-11-12 13:03%%\n- spoke",
);
const sep = f("Atas/2026-09-01.md", "2026-09-01", "## R\nRecalled #open-card ^card-recalled");

const files = [sep, oct, nov, latest];
const resolve = (p: string) => `Atas/${p}.md`;
const dates = new Map(files.map(x => [x.parsed.path, x.openedAt]));
const fileDate = (p: string) => dates.get(p) ?? null;
const cards = () => [...buildCardIndex(files, resolve).cards.values()];

describe("latestFile", () => {
	it("picks the newest date, ties by path", () => {
		expect(latestFile([{ path: "a", date: "2026-11-01" }, { path: "b", date: "2026-11-13" }, { path: "c", date: null }])).toBe("b");
		expect(latestFile([{ path: "b", date: "2026-11-13" }, { path: "c", date: "2026-11-13" }])).toBe("c");
		expect(latestFile([])).toBeNull();
	});
});

describe("splitPending", () => {
	const s = splitPending(cards(), "Atas/2026-11-13.md", fileDate);

	it("discussed = recalled in, or opened in, the latest meeting", () => {
		expect(s.discussed.map(c => c.id)).toEqual(["card-fresh", "card-recalled"]);
	});

	it("pending = open cards not mentioned there, oldest last mention first; closed excluded", () => {
		expect(s.pending.map(c => c.id)).toEqual(["card-old", "card-mid"]);
		expect(s.lastMention.get("card-old")).toBe("2026-10-01");
		expect(s.lastMention.get("card-mid")).toBe("2026-11-01");
		expect(s.lastMention.has("card-closed")).toBe(false);
	});

	it("last mention ignores the latest meeting itself", () => {
		expect(s.lastMention.get("card-recalled")).toBe("2026-09-01");
	});

	it("a newer meeting file resets everything to pending", () => {
		const r = splitPending(cards(), "Atas/2026-11-20.md", fileDate);
		expect(r.discussed).toEqual([]);
		// both 2026-11-13 mentions tie on date → by title
		expect(r.pending.map(c => c.id)).toEqual(["card-old", "card-mid", "card-fresh", "card-recalled"]);
	});
});

describe("pending-topics preset", () => {
	it("is in the default board and survives a save/load round-trip", () => {
		expect(DEFAULT_BOARD.presets.some(p => p.smart === "pending-topics")).toBe(true);
		const r = parseBoardFile(serializeBoard(DEFAULT_BOARD));
		expect(r.ok && r.board.presets.find(p => p.id === "view-pending")?.smart).toBe("pending-topics");
	});

	it("can be added to an existing board from the new-view template", () => {
		expect(blankPreset("view-x", "Agenda", "kanban", "tag", "pending-topics")).toEqual(pendingTopicsPreset("view-x", "Agenda"));
	});
});
