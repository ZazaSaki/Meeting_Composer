import { describe, expect, it } from "vitest";
import { parseFile } from "../src/core/cardParser";
import { buildCardIndex } from "../src/core/cardIndex";

const origin = parseFile("## UA\nBudget #open-card #calling ^card-104\nscope", "Atas/2026-11-04 Meeting.md");
const later = parseFile(
	"## UA\n[[2026-11-04 Meeting#^card-104|Budget]] %%recall:2026-11-18 10:15%%\n- PO sent\n" +
		"[[2026-11-04 Meeting#^card-104|Budget]] %%recall:2026-11-11 23:32%%\n- quote 4150",
	"Atas/2026-11-18 Meeting.md",
);
const copy = parseFile("## UA\nBudget copy #open-card ^card-104\n## X\nNew #open-card", "Atas/2026-11-20 Meeting.md");

describe("buildCardIndex", () => {
	const idx = buildCardIndex(
		[
			{ parsed: copy, openedAt: "2026-11-20" },
			{ parsed: later, openedAt: "2026-11-18" },
			{ parsed: origin, openedAt: "2026-11-04" },
		],
		p => (p === "2026-11-04 Meeting" ? "Atas/2026-11-04 Meeting.md" : null),
	);

	it("earliest meeting owns a duplicated id; the copy is flagged", () => {
		expect(idx.cards.get("card-104")?.filePath).toBe("Atas/2026-11-04 Meeting.md");
		expect(idx.duplicates).toHaveLength(1);
		expect(idx.duplicates[0].duplicateOf).toBe("Atas/2026-11-04 Meeting.md");
	});

	it("assembles recalls chronologically and sets lastUpdated", () => {
		const c = idx.cards.get("card-104")!;
		expect(c.recalls.map(r => r.timestamp)).toEqual(["2026-11-11 23:32", "2026-11-18 10:15"]);
		expect(c.recalls[0].content).toBe("- quote 4150");
		expect(c.lastUpdated).toBe("2026-11-18 10:15");
		expect(c.openedAt).toBe("2026-11-04");
	});

	it("reports trigger lines that still lack an id", () => {
		expect(idx.unassigned).toEqual([{ filePath: "Atas/2026-11-20 Meeting.md", titleLine: 3, title: "New" }]);
	});
});
