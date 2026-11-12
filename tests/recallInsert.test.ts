import { describe, expect, it } from "vitest";
import { missingHeadings, planRecallInsert } from "../src/core/recallInsert";
import { makeHierarchy, parseFile } from "../src/core/cardParser";

const AB = makeHierarchy([
	{ level: 1, text: "a" },
	{ level: 2, text: "b" },
]);
const R = "[[m#^card-x|T]] %%recall:2026-11-12 10:00%%";

function apply(doc: string, line: number, path = AB) {
	const p = planRecallInsert(doc, line, path, R);
	const lines = doc.split("\n");
	const before = lines.slice(0, p.from.line).join("\n") + (p.from.line > 0 ? "\n" : "") + lines[p.from.line].slice(0, p.from.ch);
	const after = lines[p.to.line].slice(p.to.ch) + (p.to.line < lines.length - 1 ? "\n" + lines.slice(p.to.line + 1).join("\n") : "");
	return { out: before + p.text + after, plan: p };
}

describe("insert recall: heading structure", () => {
	it("adds the missing ## b when the cursor is only under # a (user's example)", () => {
		const { out, plan } = apply("# a\n", 1);
		expect(out).toBe("# a\n## b\n" + R + "\n");
		expect(plan.addedHeadings).toEqual(["## b"]);
		expect(out.split("\n")[plan.cursor.line]).toBe("");
	});

	it("adds nothing when the cursor is already under # a › ## b", () => {
		const { out, plan } = apply("# a\n## b\nnotes\n", 3);
		expect(out).toBe("# a\n## b\nnotes\n" + R + "\n");
		expect(plan.addedHeadings).toEqual([]);
	});

	it("adds nothing when the cursor is deeper inside the card's branch", () => {
		const { plan } = apply("# a\n## b\n### person\n", 3);
		expect(plan.addedHeadings).toEqual([]);
	});

	it("adds the whole path when the note has no headings", () => {
		const { out } = apply("intro\n", 1);
		expect(out).toBe("intro\n# a\n## b\n" + R + "\n");
	});

	it("starts a new # a branch when the cursor is under a different H1", () => {
		const { plan } = apply("# c\n", 1);
		expect(plan.addedHeadings).toEqual(["# a", "## b"]);
	});

	it("closes a sibling ## x and opens ## b", () => {
		const { plan } = apply("# a\n## x\n### y\n", 3);
		expect(plan.addedHeadings).toEqual(["## b"]);
	});

	it("never nests the new heading inside a diverging branch, even if the card skipped a level", () => {
		const skip = makeHierarchy([
			{ level: 1, text: "a" },
			{ level: 3, text: "b" },
		]);
		expect(missingHeadings([{ level: 1, text: "a" }, { level: 2, text: "x" }], skip.segments)).toEqual([{ level: 2, text: "b" }]);
		expect(missingHeadings([{ level: 1, text: "a" }], skip.segments)).toEqual([{ level: 3, text: "b" }]);
	});

	it("matches headings ignoring case, accents and extra spaces", () => {
		const path = makeHierarchy([
			{ level: 1, text: "Castelo Branco" },
			{ level: 2, text: "Quórum de Elders" },
		]);
		expect(missingHeadings([{ level: 1, text: "castelo branco" }, { level: 2, text: "Quorum  de elders" }], path.segments)).toEqual([]);
	});

	it("writes below a non-empty cursor line", () => {
		const { out, plan } = apply("# a\nsome text", 1);
		expect(out).toBe("# a\nsome text\n## b\n" + R + "\n");
		expect(plan.cursor).toEqual({ line: 4, ch: 0 });
	});

	it("the recall ends up indexed under the card's path, and is not mistaken for a card", () => {
		const { out } = apply("# a\n", 1);
		const f = parseFile(out, "m.md");
		expect(f.cards).toHaveLength(0);
		expect(f.recalls).toHaveLength(1);
		expect(f.recalls[0].hierarchy.slug).toBe("a/b");
	});
});
