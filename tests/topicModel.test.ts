import { describe, expect, it } from "vitest";
import { MarkdownParser } from "../DataMeenutes/App";
import {
	categorize,
	entryLinkText,
	filterTree,
	groupRoots,
	pathKey,
	resolveTopicName,
	runQuery,
} from "../src/topics/topicModel";
import { TopicNode, TopicParser } from "../src/topics/types";

const NOV4 = `# Aveiro
## Budget #urgent
Quote at 4500.
## Lab
Check sensors.
# Coimbra
## Budget
Coimbra budget notes.
# Jovens
Youth activity planning.
`;
const NOV11 = `# Aveiro
## Budget
Revised quote 4150.
`;

function load(): TopicParser {
	const p = new MarkdownParser();
	p.setPriorityLists(["Jovens"], ["Aveiro", "Coimbra"], ["Atividade"]);
	p.AppendToExistingTree(NOV4, "2026-11-04", "Atas/2026-11-04");
	p.AppendToExistingTree(NOV11, "2026-11-11", "Atas/2026-11-11");
	return p as unknown as TopicParser;
}

const roots = (p: TopicParser): TopicNode[] => p.GenerateTopicTree(false).children;

describe("topic tree grouping", () => {
	it("categorizes top-level topics like the old three columns", () => {
		const lists = { priorityBeforeCities: ["Jovens"], cities: ["Aveiro"], priorityAfterCities: ["Atividade"] };
		expect(categorize("jovens", lists)).toBe("org");
		expect(categorize("Aveiro Norte", lists)).toBe("sector");
		expect(categorize("Atividade", lists)).toBe("important");
		expect(categorize("Anything else", lists)).toBe("important");
	});

	it("groups the parser's roots", () => {
		const p = load();
		const g = groupRoots(roots(p), p);
		expect(g.org.map(n => n.name)).toEqual(["Jovens"]);
		expect(g.sector.map(n => n.name).sort()).toEqual(["Aveiro", "Coimbra"]);
	});
});

describe("filterTree", () => {
	it("keeps matches and their ancestors, opening the ancestors", () => {
		const p = load();
		const f = filterTree(roots(p), "bud");
		expect(f.nodes.map(n => n.name).sort()).toEqual(["Aveiro", "Coimbra"]);
		const aveiro = f.nodes.find(n => n.name === "Aveiro")!;
		expect(aveiro.children.map(c => c.name)).toEqual(["Budget"]);
		expect(f.open.has(pathKey([], "Aveiro"))).toBe(true);
		expect(f.matches).toBe(2);
	});

	it("a matching parent keeps all of its children", () => {
		const f = filterTree(roots(load()), "aveiro");
		expect(f.nodes[0].children.map(c => c.name).sort()).toEqual(["Budget", "Lab"]);
		expect(f.open.size).toBe(0);
	});

	it("empty query returns the tree unchanged", () => {
		const r = roots(load());
		expect(filterTree(r, "  ").nodes).toBe(r);
	});
});

describe("runQuery", () => {
	it("global topic search spans every file and sector", () => {
		const entries = runQuery(load(), { text: "Budget", parentPath: ["Aveiro"], scoped: false });
		const lines = entries.flatMap(e => e.content).join("\n");
		expect(lines).toContain("Quote at 4500.");
		expect(lines).toContain("Revised quote 4150.");
		expect(lines).toContain("Coimbra budget notes.");
	});

	it("scoped search under a sector stays inside it", () => {
		const entries = runQuery(load(), { text: "Budget", parentPath: ["Aveiro"], scoped: true });
		const lines = entries.flatMap(e => e.content).join("\n");
		expect(lines).toContain("Revised quote 4150.");
		expect(lines).not.toContain("Coimbra budget notes.");
	});

	it("#tag search returns tagged content", () => {
		const entries = runQuery(load(), { text: "#urgent", parentPath: [], scoped: false });
		expect(entries.length).toBe(1);
		expect(entries[0].content.join("\n")).toContain("Quote at 4500.");
		expect(entryLinkText(entries[0], true)).toBe("Atas/2026-11-04#Aveiro#Budget");
	});

	it("results are newest first and link to their heading", () => {
		const entries = runQuery(load(), { text: "Budget", parentPath: [], scoped: false });
		expect(entries[0].id).toBe("2026-11-11");
		expect(entryLinkText(entries[0], false)).toBe("Atas/2026-11-11#Aveiro#Budget");
	});

	it("blank query returns nothing", () => {
		expect(runQuery(load(), { text: " ", parentPath: [], scoped: false })).toEqual([]);
	});
});

describe("resolveTopicName", () => {
	it("matches typed text case-insensitively", () => {
		expect(resolveTopicName("budget", ["Aveiro", "Budget"])).toBe("Budget");
		expect(resolveTopicName("Nope", ["Budget"])).toBe("Nope");
	});
});
