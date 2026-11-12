// Smallest single replacement turning `a` into `b` (common prefix/suffix trim).
// Lets editor-side writes be one undo step that leaves the rest of the document (and cursor) alone.

export interface Change {
	start: number; // offset in a
	end: number; // offset in a (exclusive)
	insert: string;
}

export function minimalChange(a: string, b: string): Change | null {
	if (a === b) return null;
	let start = 0;
	const max = Math.min(a.length, b.length);
	while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
		endA--;
		endB--;
	}
	return { start, end: endA, insert: b.slice(start, endB) };
}
