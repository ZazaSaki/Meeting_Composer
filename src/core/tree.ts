// Organization tree for the sidebar: merges heading paths from all minutes and
// aggregates open-card counts up to every ancestor.

import { CardNode, HeadingSegment, HierarchyPath } from "../types";
import { slugify } from "./syntax";

export interface TreeNode {
	slug: string;
	name: string;
	level: number;
	segments: HeadingSegment[];
	children: TreeNode[];
	openCount: number;
	totalCount: number;
}

export function buildTree(
	paths: HierarchyPath[],
	cards: CardNode[],
	compare: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): TreeNode {
	const root: TreeNode = { slug: "", name: "", level: 0, segments: [], children: [], openCount: 0, totalCount: 0 };
	const bySlug = new Map<string, TreeNode>([["", root]]);

	const ensure = (h: HierarchyPath): TreeNode[] => {
		const chain: TreeNode[] = [root];
		let parent = root;
		let slug = "";
		h.segments.forEach((seg, i) => {
			slug = slug ? slug + "/" + slugify(seg.text) : slugify(seg.text);
			let node = bySlug.get(slug);
			if (!node) {
				node = {
					slug,
					name: seg.text,
					level: seg.level,
					segments: h.segments.slice(0, i + 1).map(s => ({ ...s })),
					children: [],
					openCount: 0,
					totalCount: 0,
				};
				bySlug.set(slug, node);
				parent.children.push(node);
			}
			chain.push(node);
			parent = node;
		});
		return chain;
	};

	for (const p of paths) ensure(p);
	for (const c of cards) {
		for (const n of ensure(c.hierarchy)) {
			n.totalCount++;
			if (c.status === "open") n.openCount++;
		}
	}

	const sort = (n: TreeNode) => {
		n.children.sort((a, b) => compare(a.name, b.name));
		n.children.forEach(sort);
	};
	sort(root);
	return root;
}

export function inScope(cardSlug: string, scopeSlug: string): boolean {
	return scopeSlug === "" || cardSlug === scopeSlug || cardSlug.startsWith(scopeSlug + "/");
}
