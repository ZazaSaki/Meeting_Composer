import { describe, expect, it } from "vitest";
import { minimalChange } from "../src/core/diff";

describe("minimalChange", () => {
	it("returns null for equal strings", () => expect(minimalChange("a", "a")).toBeNull());
	it("finds an insertion", () => expect(minimalChange("ab cd", "ab #x cd")).toEqual({ start: 3, end: 3, insert: "#x " }));
	it("finds a deletion", () => expect(minimalChange("ab #x cd", "ab cd")).toEqual({ start: 3, end: 6, insert: "" }));
	it("applying the change reproduces b", () => {
		const a = "line1\nT #open-card ^card-a\nline3";
		const b = "line1\nT #closed-card ^card-a\nline3";
		const c = minimalChange(a, b)!;
		expect(a.slice(0, c.start) + c.insert + a.slice(c.end)).toBe(b);
	});
});
