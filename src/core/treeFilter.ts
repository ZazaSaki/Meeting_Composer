// Generic "filter a tree by name" used by the Topics sidebar and the Meeting cards organization tree.

export interface NamedNode<T> {
	name: string;
	children: T[];
}

export interface FilterResult<T> {
	nodes: T[];
	/** Keys of ancestors that must be shown open so the matches are visible. */
	open: Set<string>;
	matches: number;
}

/**
 * Keep the nodes whose name contains `query` (case-insensitive) plus their ancestors.
 * A matching node keeps all of its children (collapsed); ancestors of matches are listed in `open`.
 * Nodes are shallow-copied when their children change; the input tree is never mutated.
 */
export function filterByName<T extends NamedNode<T>>(nodes: T[], query: string, key: (n: T) => string): FilterResult<T> {
	const q = query.trim().toLowerCase();
	const open = new Set<string>();
	let matches = 0;
	if (!q) return { nodes, open, matches: 0 };

	const walk = (list: T[]): T[] => {
		const out: T[] = [];
		for (const node of list) {
			const self = node.name.toLowerCase().includes(q);
			const kids = walk(node.children);
			if (self) matches++;
			if (kids.length > 0) open.add(key(node));
			if (self) out.push(kids.length > 0 ? { ...node, children: mergeChildren(node.children, kids, key) } : node);
			else if (kids.length > 0) out.push({ ...node, children: kids });
		}
		return out;
	};
	return { nodes: walk(nodes), open, matches };
}

/** A matching node shows all its children, but filtered descendants replace their originals. */
function mergeChildren<T>(all: T[], filtered: T[], key: (n: T) => string): T[] {
	const byKey = new Map(filtered.map(n => [key(n), n]));
	return all.map(n => byKey.get(key(n)) ?? n);
}
