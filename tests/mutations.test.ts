import { describe, expect, it } from "vitest";
import {
	addTag,
	appendIdToLine,
	ensureBlankAfterTitle,
	moveCardToHeading,
	removeTag,
	segmentsForSlug,
	setDescription,
	setStatus,
	setTitle,
	CardNotFoundError,
} from "../src/core/mutations";
import { parseFile, locateCard } from "../src/core/cardParser";

const BASE = `# Aveiro
## University of Aveiro
### Prof. Silva
Confirm lab equipment budget #open-card #calling ^card-104
- Target ceiling: €4,500

### Prof. Costa
Prose only.

## City Council
Some council prose.

# Porto
## Câmara
Other #open-card ^card-200`;

describe("tag & status mutations (spec §7.1)", () => {
	it("Open → Calling appends the tag before ^id", () => {
		const t = addTag(BASE.replace(" #calling", ""), "card-104", "#calling");
		expect(t.split("\n")[3]).toBe("Confirm lab equipment budget #open-card #calling ^card-104");
	});

	it("Calling → Open removes only #calling", () => {
		const t = removeTag(BASE, "card-104", "#calling");
		expect(t.split("\n")[3]).toBe("Confirm lab equipment budget #open-card ^card-104");
	});

	it("Any → Closed and back swaps the lifecycle tag, keeping the family", () => {
		const closed = setStatus(BASE, "card-104", "closed");
		expect(closed.split("\n")[3]).toBe("Confirm lab equipment budget #closed-card #calling ^card-104");
		expect(setStatus(closed, "card-104", "open")).toBe(BASE);
		const ticket = "## X\nT #open-ticket ^card-t";
		expect(setStatus(ticket, "card-t", "closed")).toBe("## X\nT #closed-ticket ^card-t");
	});

	it("mutations are idempotent", () => {
		const once = addTag(BASE, "card-104", "#urgent");
		expect(addTag(once, "card-104", "#urgent")).toBe(once);
		expect(setStatus(BASE, "card-104", "open")).toBe(BASE);
		expect(removeTag(BASE, "card-104", "#nope")).toBe(BASE);
	});

	it("throws when the card is gone", () => {
		expect(() => setStatus(BASE, "card-xxx", "closed")).toThrow(CardNotFoundError);
	});
});

describe("title & description", () => {
	it("rename preserves tags and id", () => {
		const t = setTitle(BASE, "card-104", "Approve lab budget");
		expect(t.split("\n")[3]).toBe("Approve lab budget #open-card #calling ^card-104");
		expect(locateCard(t, "card-104")?.title).toBe("Approve lab budget");
	});

	it("rename keeps list prefixes", () => {
		const t = setTitle("## X\n- [ ] Old #open-card ^card-a", "card-a", "New");
		expect(t).toBe("## X\n- [ ] New #open-card ^card-a");
	});

	it("description is replaced, separated from the title when it starts with prose", () => {
		const t = setDescription(BASE, "card-104", "Vendor confirmed.\n- ok");
		const c = locateCard(t, "card-104")!;
		expect(c.description).toBe("Vendor confirmed.\n- ok");
		expect(t.split("\n")[4]).toBe("");
		expect(t).toContain("### Prof. Costa");
	});

	it("empty description removes the body", () => {
		const t = setDescription(BASE, "card-104", "");
		expect(locateCard(t, "card-104")!.description).toBe("");
	});

	it("ensureBlankAfterTitle only inserts for prose", () => {
		const prose = "## X\nT #open-card ^card-a\nprose line";
		expect(ensureBlankAfterTitle(prose, "card-a")).toBe("## X\nT #open-card ^card-a\n\nprose line");
		const list = "## X\nT #open-card ^card-a\n- item";
		expect(ensureBlankAfterTitle(list, "card-a")).toBe(list);
	});

	it("appendIdToLine does not duplicate ids", () => {
		expect(appendIdToLine("T #open-card  ", "card-a")).toBe("T #open-card ^card-a");
		expect(appendIdToLine("T #open-card ^card-b", "card-a")).toBe("T #open-card ^card-b");
	});

	it("preserves CRLF line endings", () => {
		const crlf = "## X\r\nT #open-card ^card-a\r\nbody";
		expect(addTag(crlf, "card-a", "#x")).toBe("## X\r\nT #open-card #x ^card-a\r\nbody");
	});
});

describe("moveCardToHeading (spec §7.1 Org-A → Org-B)", () => {
	const cityCouncil = [
		{ level: 1, text: "Aveiro" },
		{ level: 2, text: "City Council" },
	];

	it("moves a dedicated sub-heading card under an existing org", () => {
		const t = moveCardToHeading(BASE, "card-104", cityCouncil);
		const f = parseFile(t, "x.md");
		const c = f.cards.find(x => x.id === "card-104")!;
		expect(c.hierarchy.slug).toBe("aveiro/city-council/prof-silva");
		expect(c.description).toBe("- Target ceiling: €4,500");
		expect(t.match(/### Prof\. Silva/g)).toHaveLength(1);
		expect(t).toContain("### Prof. Costa\nProse only.");
		// Porto card untouched
		expect(f.cards.find(x => x.id === "card-200")!.hierarchy.slug).toBe("porto/camara");
	});

	it("creates a missing org heading under the right H1", () => {
		const t = moveCardToHeading(BASE, "card-200", [
			{ level: 1, text: "Porto" },
			{ level: 2, text: "Universidade do Porto" },
		]);
		const c = locateCard(t, "card-200")!;
		expect(c.hierarchy.slug).toBe("porto/universidade-do-porto");
		expect(t).not.toContain("## Câmara");
	});

	it("non-dedicated card is wrapped in a repeated target heading and prose stays", () => {
		const text = "# A\n## Org-A\nT #open-card ^card-a\nbody\n---\nmeeting prose\n## Org-B\nb prose";
		const t = moveCardToHeading(text, "card-a", [
			{ level: 1, text: "A" },
			{ level: 2, text: "Org-B" },
		]);
		expect(t).toContain("## Org-A\n---\nmeeting prose");
		expect(locateCard(t, "card-a")!.hierarchy.slug).toBe("a/org-b");
		expect(parseFile(t, "x").cards).toHaveLength(1);
	});

	it("does nothing when already inside the target", () => {
		expect(moveCardToHeading(BASE, "card-104", [{ level: 1, text: "Aveiro" }])).toBe(BASE);
	});

	it("segmentsForSlug prefers known heading texts", () => {
		const known = parseFile(BASE, "x").cards.map(c => c.hierarchy.segments);
		expect(segmentsForSlug("porto/camara", known)).toEqual([
			{ level: 1, text: "Porto" },
			{ level: 2, text: "Câmara" },
		]);
		expect(segmentsForSlug("lisboa/hq", [], "HQ")).toEqual([
			{ level: 1, text: "Lisboa" },
			{ level: 2, text: "HQ" },
		]);
	});
});
