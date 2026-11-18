import { describe, expect, it } from "vitest";
import { syncTopicBoard, topicMatches, topicPreset } from "../src/core/topicBoards";
import { cardsForPreset } from "../src/core/boardEngine";
import { updatePreset } from "../src/core/boardOps";
import { parseBoardFile, serializeBoard } from "../src/core/boardFile";

describe("topicMatches", () => {
	it("matches a heading equal to the topic or starting with it, at any level", () => {
		expect(topicMatches("coimbra-1", "Coimbra")).toBe(true);
		expect(topicMatches("coimbra-2/primaria", "Coimbra")).toBe(true);
		expect(topicMatches("castelo-branco/quorum-de-elders", "Quorum")).toBe(true);
		expect(topicMatches("primaria", "Primária")).toBe(true); // accents ignored
		expect(topicMatches("quorumx", "Quorum")).toBe(false); // whole words only
		expect(topicMatches("viseu", "Coimbra")).toBe(false);
	});
});

describe("topic views", () => {
	const card = (slug: string, status: "open" | "closed" = "open") => ({ status, tags: [], hierarchy: { slug } });

	it("a view shows every card under that topic, in every city", () => {
		const cards = [card("quorum-de-elders"), card("castelo-branco/quorum-de-elders"), card("viseu/primaria"), card("quorum", "closed")];
		expect(cardsForPreset(cards, topicPreset("Quorum")).map(c => c.hierarchy.slug)).toEqual([
			"quorum-de-elders",
			"castelo-branco/quorum-de-elders",
			"quorum",
		]);
	});

	it("topic survives editing and save/load", () => {
		const b = syncTopicBoard(null, ["Coimbra"]).board!;
		const edited = updatePreset(b, { ...b.presets[0], name: "Coimbra (all)" });
		const r = parseBoardFile(serializeBoard(edited));
		expect(r.ok && r.board.presets[0].scopeFilter?.topic).toBe("Coimbra");
	});
});

describe("syncTopicBoard", () => {
	it("creates one view per entry, skipping blanks and duplicates", () => {
		const { board, added } = syncTopicBoard(null, ["Aveiro", " ", "Viseu", "aveiro"]);
		expect(added).toEqual(["Aveiro", "Viseu"]);
		expect(board?.presets.map(p => p.name)).toEqual(["Aveiro", "Viseu"]);
		expect(board?.activePresetId).toBe("view-topic-aveiro");
	});

	it("nothing to create from an empty list", () => {
		expect(syncTopicBoard(null, []).board).toBeNull();
	});

	it("re-running only adds missing views and keeps edits", () => {
		const first = syncTopicBoard(null, ["Aveiro"]).board!;
		const renamed = { ...first, presets: [{ ...first.presets[0], name: "Aveiro city", columns: [] }] };
		const { board, added } = syncTopicBoard(renamed, ["Aveiro", "Leiria"]);
		expect(added).toEqual(["Leiria"]);
		expect(board?.presets.map(p => p.name)).toEqual(["Aveiro city", "Leiria"]);
		expect(board?.presets[0].columns).toEqual([]);
	});

	it("a view you made by hand for the same topic counts as present", () => {
		const mine = { ...topicPreset("Leiria"), id: "view-mine" };
		const { added } = syncTopicBoard({ version: 1, activePresetId: "view-mine", presets: [mine] }, ["Leiria"]);
		expect(added).toEqual([]);
	});
});
