import { describe, expect, it } from "vitest";
import { assignMissingIds } from "../src/core/autoId";
import { planRemoteCloses } from "../src/core/remoteClose";
import { buildCardIndex } from "../src/core/cardIndex";
import { parseFile } from "../src/core/cardParser";

const fixed = () => 0.5; // -> card-iiiiii, then collision-avoided variants

describe("assignMissingIds", () => {
	it("assigns ids to trigger lines that lack one and separates prose", () => {
		const text = "## Org\nCall mayor #open-card #calling\nProse right below";
		const r = assignMissingIds(text, null, new Set(), fixed);
		expect(r.assigned).toEqual(["card-iiiiii"]);
		expect(r.text).toBe("## Org\nCall mayor #open-card #calling ^card-iiiiii\n\nProse right below");
	});

	it("skips the line under the cursor and the line just below a title", () => {
		const text = "## Org\nCall mayor #open-card\nPro";
		expect(assignMissingIds(text, 1, new Set()).text).toBe(text);
		const r = assignMissingIds(text, 2, new Set(), fixed);
		expect(r.text).toBe("## Org\nCall mayor #open-card ^card-iiiiii\nPro");
	});

	it("is idempotent", () => {
		const text = "## A\nX #open-card\nprose\n## B\nY #open-ticket\n- list";
		const once = assignMissingIds(text, null, new Set()).text;
		expect(assignMissingIds(once, null, new Set()).text).toBe(once);
		expect(parseFile(once, "x").cards.every(c => c.id)).toBe(true);
	});

	it("avoids ids used elsewhere in the vault", () => {
		const r = assignMissingIds("## A\nX #open-card", null, new Set(["card-iiiiii"]), (() => {
			let n = 0;
			return () => (n++ < 6 ? 0.5 : 0);
		})());
		expect(r.assigned[0]).not.toBe("card-iiiiii");
	});
});

describe("planRemoteCloses", () => {
	const origin = parseFile("## UA\nBudget #open-card ^card-1", "a.md");
	const recall = parseFile("## UA\n[[a#^card-1|Budget]] %%recall:2026-11-18 10:15%% #closed-card\n- done", "b.md");
	const idx = buildCardIndex([
		{ parsed: origin, openedAt: "2026-11-04" },
		{ parsed: recall, openedAt: "2026-11-18" },
	]);

	it("closes an open card once", () => {
		const plan = planRemoteCloses([...idx.cards.values()], new Set());
		expect(plan.toClose.map(c => c.id)).toEqual(["card-1"]);
		expect(plan.newKeys).toHaveLength(1);
		const again = planRemoteCloses([...idx.cards.values()], new Set(plan.newKeys));
		expect(again.toClose).toHaveLength(0);
		expect(again.newKeys).toHaveLength(0);
	});
});
