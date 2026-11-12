import { describe, expect, it } from "vitest";
import { buildTree } from "../src/core/tree";
import { filterByName } from "../src/core/treeFilter";
import { HierarchyPath } from "../src/types";

const path = (...names: string[]): HierarchyPath => ({
	segments: names.map((text, i) => ({ level: i + 1, text })),
	slug: names.map(n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("/"),
});

const tree = () =>
	buildTree([
		path("Aveiro", "University of Aveiro", "Prof. Silva"),
		path("Aveiro", "City Council"),
		path("Coimbra", "University of Coimbra"),
		path("Leiria"),
	], []);

describe("filterByName on the organization tree", () => {
	it("keeps matches and opens their ancestors", () => {
		const f = filterByName(tree().children, "silva", n => n.slug);
		expect(f.nodes.map(n => n.name)).toEqual(["Aveiro"]);
		expect(f.nodes[0].children.map(n => n.name)).toEqual(["University of Aveiro"]);
		expect([...f.open].sort()).toEqual(["aveiro", "aveiro/university-of-aveiro"]);
		expect(f.matches).toBe(1);
	});

	it("matches several branches case-insensitively", () => {
		const f = filterByName(tree().children, "UNIVERSITY", n => n.slug);
		expect(f.nodes.map(n => n.name)).toEqual(["Aveiro", "Coimbra"]);
		expect(f.matches).toBe(2);
	});

	it("a matching branch keeps all its children", () => {
		const f = filterByName(tree().children, "aveiro", n => n.slug);
		const aveiro = f.nodes.find(n => n.name === "Aveiro")!;
		expect(aveiro.children.map(n => n.name).sort()).toEqual(["City Council", "University of Aveiro"]);
	});

	it("does not mutate the input tree", () => {
		const t = tree();
		const before = JSON.stringify(t);
		filterByName(t.children, "silva", n => n.slug);
		expect(JSON.stringify(t)).toBe(before);
	});

	it("no match returns nothing; blank query returns the input", () => {
		const t = tree();
		expect(filterByName(t.children, "zzz", n => n.slug).nodes).toEqual([]);
		expect(filterByName(t.children, " ", n => n.slug).nodes).toBe(t.children);
	});
});
