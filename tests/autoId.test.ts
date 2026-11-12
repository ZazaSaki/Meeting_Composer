import { describe, expect, it } from "vitest";
import { assignMissingIds } from "../src/core/autoId";
import { planRemoteCloses, planRemoteReopens } from "../src/core/remoteClose";
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

describe("erasing the lifecycle tag undoes the card (stripOrphans)", () => {
	const strip = { stripOrphans: { keepId: () => false } };

	it("removes the id when #open-card was erased", () => {
		const r = assignMissingIds("## Org\nCall mayor #calling ^card-abc123\n\nprose", null, new Set(), undefined, strip);
		expect(r.removed).toEqual(["card-abc123"]);
		expect(r.text).toBe("## Org\nCall mayor #calling\n\nprose");
		expect(parseFile(r.text, "x").cards).toHaveLength(0);
	});

	it("also when #closed-card was erased, and when only the id is left", () => {
		expect(assignMissingIds("## A\nDone ^card-x1", null, new Set(), undefined, strip).text).toBe("## A\nDone");
		expect(assignMissingIds("## A\n^card-x1", null, new Set(), undefined, strip).text).toBe("## A\n");
	});

	it("keeps ids of lines that still have a lifecycle tag (open or closed)", () => {
		const text = "## A\nX #open-card ^card-a1\n\n## B\nY #closed-ticket ^card-b2";
		const r = assignMissingIds(text, null, new Set(), undefined, strip);
		expect(r.text).toBe(text);
		expect(r.removed).toEqual([]);
	});

	it("waits until the cursor leaves the line (no edits while retyping the tag)", () => {
		const text = "## A\nX #closed-c ^card-a1";
		expect(assignMissingIds(text, 1, new Set(), undefined, strip).text).toBe(text);
	});

	it("keeps the id when recalls link to it, so re-adding #open-card brings the card back", () => {
		const elsewhere = assignMissingIds("## A\nX ^card-a1", null, new Set(), undefined, { stripOrphans: { keepId: id => id === "card-a1" } });
		expect(elsewhere.removed).toEqual([]);
		const sameNote = "## A\nX ^card-a1\n\n## B\n[[n#^card-a1|X]] %%recall:2026-11-12 10:00%%";
		expect(assignMissingIds(sameNote, null, new Set(), undefined, strip).text).toBe(sameNote);
	});

	it("never touches recalls, headings or code blocks", () => {
		const text = "## A ^card-h1\n[[n#^card-a1|X]] %%recall:2026-11-12 10:00%%\n```\nsnippet ^card-c1\n```";
		expect(assignMissingIds(text, null, new Set(), undefined, strip).text).toBe(text);
	});

	it("is off by default (bulk command keeps its old behaviour)", () => {
		const text = "## A\nX ^card-a1";
		expect(assignMissingIds(text, null, new Set()).text).toBe(text);
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

describe("erasing #closed-card from a recall re-opens the card (planRemoteReopens)", () => {
	const origin = parseFile("## UA\nBudget #closed-card ^card-1", "a.md");
	const index = (recallLine: string) =>
		[
			...buildCardIndex([
				{ parsed: origin, openedAt: "2026-11-04" },
				{ parsed: parseFile("## UA\n" + recallLine + "\n- done", "b.md"), openedAt: "2026-11-18" },
			]).cards.values(),
		];
	const closing = "[[a#^card-1|Budget]] %%recall:2026-11-18 10:15%% #closed-card";
	const erased = "[[a#^card-1|Budget]] %%recall:2026-11-18 10:15%%";

	it("re-opens the card and releases the key once the tag is gone", () => {
		const first = planRemoteCloses(index(closing).map(c => ({ ...c, status: "open" as const })), new Set());
		expect(first.closingKeys).toHaveLength(1);
		const plan = planRemoteReopens(index(erased), new Set(), new Set(first.closingKeys));
		expect(plan.toReopen.map(c => c.id)).toEqual(["card-1"]);
		expect(plan.releasedKeys).toEqual(first.closingKeys);
		// after release, adding the tag back closes again
		const again = planRemoteCloses(index(closing).map(c => ({ ...c, status: "open" as const })), new Set());
		expect(again.toClose.map(c => c.id)).toEqual(["card-1"]);
	});

	it("does nothing while the tag is still there", () => {
		const keys = planRemoteCloses(index(closing).map(c => ({ ...c, status: "open" as const })), new Set()).closingKeys;
		expect(planRemoteReopens(index(closing), new Set(), new Set(keys)).releasedKeys).toEqual([]);
	});

	it("does not re-open a card the recall didn't close (it was already closed by hand)", () => {
		const plan = planRemoteCloses(index(closing), new Set()); // origin already closed
		expect(plan.toClose).toHaveLength(0);
		expect(plan.closingKeys).toEqual([]);
		expect(planRemoteReopens(index(erased), new Set(), new Set(plan.closingKeys)).toReopen).toHaveLength(0);
	});

	it("keeps the card closed only when another recall that closed it still has the tag", () => {
		const other = parseFile("## UA\n[[a#^card-1|Budget]] %%recall:2026-11-25 09:00%% #closed-card", "c.md");
		const cards = [
			...buildCardIndex([
				{ parsed: origin, openedAt: "2026-11-04" },
				{ parsed: parseFile("## UA\n" + erased, "b.md"), openedAt: "2026-11-18" },
				{ parsed: other, openedAt: "2026-11-25" },
			]).cards.values(),
		];
		const key = "card-1|b.md|2026-11-18 10:15";
		const otherKey = "card-1|c.md|2026-11-25 09:00";
		const plan = planRemoteReopens(cards, new Set(), new Set([key, otherKey]));
		expect(plan.releasedKeys).toEqual([key]);
		expect(plan.toReopen).toHaveLength(0);
		// an older #closed-card that did not close it (card was re-opened by hand since) doesn't block
		expect(planRemoteReopens(cards, new Set(), new Set([key])).toReopen.map(c => c.id)).toEqual(["card-1"]);
	});

	it("erasing the tag frees a recall that was already handled, so re-adding it closes again", () => {
		// the recall was handled but the card is open now (e.g. re-opened by hand / an older version)
		const key = "card-1|b.md|2026-11-18 10:15";
		const openCards = index(erased).map(c => ({ ...c, status: "open" as const }));
		const plan = planRemoteReopens(openCards, new Set([key]), new Set());
		expect(plan.releasedKeys).toEqual([key]);
		expect(plan.toReopen).toHaveLength(0);
		const again = planRemoteCloses(index(closing).map(c => ({ ...c, status: "open" as const })), new Set());
		expect(again.toClose.map(c => c.id)).toEqual(["card-1"]);
	});
});
