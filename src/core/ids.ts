// Random, collision-checked card ids: "card-" + 6 base36 chars (~2.2 billion combinations).

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newCardId(existing: Set<string>, rand: () => number = Math.random): string {
	for (let attempt = 0; attempt < 1000; attempt++) {
		let s = "card-";
		for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
		if (!existing.has(s)) return s;
	}
	throw new Error("Could not generate a unique card id");
}
