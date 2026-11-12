import { describe, expect, it } from "vitest";
import { parseFile, locateCard } from "../src/core/cardParser";
import { dateFromFileName, extractTitle, findTags, slugify } from "../src/core/syntax";
import { newCardId } from "../src/core/ids";

const SPEC_EXAMPLE = `# Aveiro
## University of Aveiro
### Prof. Silva
Confirm lab equipment budget #open-card #calling ^card-104
Initial scope: verify optical sensor quote from vendor.
- Target ceiling: €4,500
- Must be signed off before Friday.

### Prof. Costa
Discussed general semester timeline and lab access keys.
- No action items opened here (Line 1 has no trigger tag, so ignored by boards).

# Aveiro
## University of Aveiro
Schedule joint Q2 workshop dates #open-card #scheduling ^card-105
- Check main auditorium availability.
- Coordinate catering estimates with administration.`;

describe("parseFile — spec §2.4 example", () => {
	const f = parseFile(SPEC_EXAMPLE, "2026-11-04 Meeting.md");

	it("finds exactly the two opted-in cards", () => {
		expect(f.cards.map(c => c.id)).toEqual(["card-104", "card-105"]);
	});

	it("extracts title, tags, status and hierarchy", () => {
		const [a, b] = f.cards;
		expect(a.title).toBe("Confirm lab equipment budget");
		expect(a.tags).toEqual(["#calling"]);
		expect(a.status).toBe("open");
		expect(a.hierarchy.slug).toBe("aveiro/university-of-aveiro/prof-silva");
		expect(b.hierarchy.slug).toBe("aveiro/university-of-aveiro");
		expect(b.tags).toEqual(["#scheduling"]);
	});

	it("captures the base description up to the next heading, trimming blanks", () => {
		const a = f.cards[0];
		expect(a.description).toBe(
			"Initial scope: verify optical sensor quote from vendor.\n- Target ceiling: €4,500\n- Must be signed off before Friday.",
		);
		expect(a.endLine).toBe(6);
		expect(f.cards[1].description.split("\n")).toHaveLength(2);
	});
});

describe("parseFile — trigger rule", () => {
	it("only the first non-empty line can open a card", () => {
		const f = parseFile("## Org\n\nSome prose\nLater thing #open-card ^card-a1", "x.md");
		expect(f.cards).toHaveLength(0);
	});

	it("does not treat bare #closed or #open as a trigger", () => {
		const f = parseFile("## Org\nDoor was #closed today", "x.md");
		expect(f.cards).toHaveLength(0);
	});

	it("closed wins and #closed-ticket is accepted", () => {
		const f = parseFile("## Org\nDone thing #closed-ticket ^card-zz", "x.md");
		expect(f.cards[0].status).toBe("closed");
	});

	it("cards without an id are reported with id null", () => {
		const f = parseFile("## Org\nNew thing #open-card", "x.md");
		expect(f.cards[0].id).toBeNull();
	});

	it("heading level 4 does not open cards but does end descriptions", () => {
		const f = parseFile("## Org\nA #open-card ^card-a\nbody\n#### Detail\nX #open-card", "x.md");
		expect(f.cards).toHaveLength(1);
		expect(f.cards[0].description).toBe("body");
		expect(f.cards[0].hierarchy.slug).toBe("org");
	});

	it("supports a card directly under H1 and a missing H2", () => {
		const f = parseFile("# Aveiro\n### Sub\nT #open-card ^card-a", "x.md");
		expect(f.cards[0].hierarchy.segments.map(s => s.level)).toEqual([1, 3]);
		expect(f.cards[0].hierarchy.slug).toBe("aveiro/sub");
	});

	it("ignores headings and triggers inside code fences and front-matter", () => {
		const text = "---\ntags: x\n---\n```\n# Fake\nX #open-card\n```\n## Real\nY #open-card ^card-y";
		const f = parseFile(text, "x.md");
		expect(f.cards.map(c => c.id)).toEqual(["card-y"]);
		expect(f.cards[0].hierarchy.slug).toBe("real");
	});

	it("description stops at a horizontal rule", () => {
		const f = parseFile("## Org\nA #open-card ^card-a\nbody\n\n---\nafter", "x.md");
		expect(f.cards[0].description).toBe("body");
	});

	it("strips list prefixes from the title", () => {
		expect(extractTitle("- [ ] Call the mayor #open-card #calling ^card-a")).toBe("Call the mayor");
	});
});

describe("parseFile — recalls (spec §4)", () => {
	const text = `# Aveiro
## University of Aveiro
[[2026-11-04 Meeting#^card-104|Confirm lab equipment budget]] %%recall:2026-11-11 23:32%%
- Vendor sent revised quote at €4,150.
- Prof. Silva approved moving forward next week.

[[2026-11-04 Meeting#^card-104|Confirm lab equipment budget]] %%recall:2026-11-11 23:50%% #closed-card
- Signed.
---
Unrelated prose`;
	const f = parseFile(text, "2026-11-11 Meeting.md");

	it("never treats a recall line as a new card (even with #closed-card)", () => {
		expect(f.cards).toHaveLength(0);
	});

	it("captures both recalls with locked timestamps and bodies", () => {
		expect(f.recalls).toHaveLength(2);
		expect(f.recalls[0]).toMatchObject({
			cardId: "card-104",
			linkPath: "2026-11-04 Meeting",
			timestamp: "2026-11-11 23:32",
			closes: false,
		});
		expect(f.recalls[0].content).toBe(
			"- Vendor sent revised quote at €4,150.\n- Prof. Silva approved moving forward next week.",
		);
		expect(f.recalls[1].closes).toBe(true);
		expect(f.recalls[1].content).toBe("- Signed.");
	});

	it("a plain block link without %%recall%% is not a recall", () => {
		expect(parseFile("See [[a#^card-1]] here", "x.md").recalls).toHaveLength(0);
	});

	it("a recall inside a card description ends that description", () => {
		const g = parseFile("## Org\nA #open-card ^card-a\nbody\n[[b#^card-b|B]] %%recall:2026-01-01 10:00%%\nnote", "x.md");
		expect(g.cards[0].description).toBe("body");
		expect(g.recalls[0].content).toBe("note");
	});
});

describe("syntax helpers", () => {
	it("tags: unicode, hyphens, ignores links, comments, code and numeric", () => {
		const tags = findTags("x #reunião #open-card [[a#b]] %%#hidden%% `#code` #123 #a/b").map(t => t.tag);
		expect(tags).toEqual(["#reunião", "#open-card", "#a/b"]);
	});

	it("slugify strips accents", () => {
		expect(slugify("Primária — Sala 2")).toBe("primaria-sala-2");
	});

	it("dates from file names", () => {
		expect(dateFromFileName("2026-11-04 Meeting")).toBe("2026-11-04");
		expect(dateFromFileName("04-11-2026")).toBe("2026-11-04");
		expect(dateFromFileName("Meeting")).toBeNull();
	});

	it("locateCard re-finds a card by id", () => {
		expect(locateCard(SPEC_EXAMPLE, "card-105")?.titleLine).toBe(14);
	});

	it("newCardId avoids collisions", () => {
		let n = 0;
		const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
		const id = newCardId(new Set(["card-000000"]), () => seq[n++ % seq.length]);
		expect(id).toBe("card-iiiiii");
		expect(newCardId(new Set())).toMatch(/^card-[0-9a-z]{6}$/);
	});
});
