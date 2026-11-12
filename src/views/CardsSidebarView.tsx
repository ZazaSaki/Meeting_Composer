// Dual-tab companion sidebar (spec §5): Tab 1 organization tree with open-card badges,
// Tab 2 context-aware card feed with one-click recall insertion.

import React, { useEffect, useMemo, useState } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { buildTree, inScope, TreeNode } from "../core/tree";
import { CardNode } from "../types";
import { V2Host, ViewProps } from "./host";
import { CardFace, CardHistory, DuplicateBanner, plural, useStoreVersion } from "./components";

export const VIEW_TYPE_CARDS = "meeting-composer-cards";

export class CardsSidebarView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, private host: V2Host) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CARDS;
	}

	getDisplayText(): string {
		return "Meeting cards";
	}

	getIcon(): string {
		return "kanban-square";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mc2-sidebar");
		this.root = createRoot(container);
		this.root.render(<SidebarApp host={this.host} component={this} />);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}

type StatusFilter = "open" | "closed" | "all";

function SidebarApp({ host, component }: ViewProps) {
	const version = useStoreVersion(host.store);
	const [tab, setTab] = useState<"tree" | "cards">("tree");
	const [manualScope, setManualScope] = useState("");
	const [follow, setFollow] = useState(true);
	const [cursorSlug, setCursorSlug] = useState(host.currentCursorScope());
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [status, setStatus] = useState<StatusFilter>("open");
	const [query, setQuery] = useState("");
	const [openCard, setOpenCard] = useState<string | null>(null);

	useEffect(() => host.onCursorScope(setCursorSlug), [host]);

	// auto-expand the path to the heading under the cursor
	useEffect(() => {
		if (!cursorSlug) return;
		setExpanded(prev => {
			const next = new Set(prev);
			const parts = cursorSlug.split("/");
			for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
			return next;
		});
	}, [cursorSlug]);

	const scope = follow ? cursorSlug : manualScope;
	const tree = useMemo(
		() => buildTree(host.store.getAllPaths(), host.store.getCards(), (a, b) => host.compareTopics(a, b)),
		[version],
	);

	const scopeNode = useMemo(() => findNode(tree, scope), [tree, scope]);
	const cards = useMemo(() => {
		const q = query.trim().toLowerCase();
		return host.store
			.getCards()
			.filter(c => inScope(c.hierarchy.slug, scope))
			.filter(c => status === "all" || c.status === status)
			.filter(c => !q || matches(c, q))
			.sort((a, b) => (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? ""));
	}, [version, scope, status, query]);

	const pick = (n: TreeNode) => {
		setManualScope(n.slug);
		setFollow(false);
		setTab("cards");
	};

	const toggle = (slug: string) =>
		setExpanded(prev => {
			const next = new Set(prev);
			if (next.has(slug)) next.delete(slug);
			else next.add(slug);
			return next;
		});

	const openInScope = cards.filter(c => c.status === "open").length;

	return (
		<div className="mc2-sidebar-app">
			<div className="mc2-tabs" role="tablist">
				<button role="tab" aria-selected={tab === "tree"} className={tab === "tree" ? "is-active" : ""} onClick={() => setTab("tree")}>
					Organization tree
				</button>
				<button role="tab" aria-selected={tab === "cards"} className={tab === "cards" ? "is-active" : ""} onClick={() => setTab("cards")}>
					Context cards ({openInScope})
				</button>
			</div>

			<DuplicateBanner host={host} />

			{tab === "tree" ? (
				<div className="mc2-tree">
					{tree.children.length === 0 && (
						<div className="mc2-muted mc2-empty">No headings found in the minutes folder yet.</div>
					)}
					{tree.children.map(n => (
						<TreeRow key={n.slug} node={n} depth={0} expanded={expanded} toggle={toggle} pick={pick} cursorSlug={cursorSlug} />
					))}
				</div>
			) : (
				<div className="mc2-feed">
					<div className="mc2-scope">
						<span className="mc2-muted">Scope:</span>{" "}
						{scopeNode && scopeNode.slug ? scopeNode.segments.map(s => s.text).join(" → ") : "All minutes"}
						<span className="mc2-scope-actions">
							<button
								className={follow ? "is-active" : ""}
								onClick={() => setFollow(!follow)}
								title="Follow the heading under the editor cursor"
							>
								📍 Follow cursor
							</button>
							{!follow && manualScope && <button onClick={() => setManualScope("")}>All</button>}
						</span>
					</div>
					<div className="mc2-filters">
						<div className="mc2-segmented">
							{(["open", "closed", "all"] as StatusFilter[]).map(s => (
								<button key={s} className={status === s ? "is-active" : ""} onClick={() => setStatus(s)}>
									{s[0].toUpperCase() + s.slice(1)}
								</button>
							))}
						</div>
						<input
							type="search"
							placeholder="Search title, #tag, text…"
							value={query}
							onChange={e => setQuery(e.target.value)}
						/>
					</div>
					{cards.length === 0 && <div className="mc2-muted mc2-empty">No cards in this scope.</div>}
					{cards.map(c => (
						<div key={c.id} className={`mc2-card ${openCard === c.id ? "is-expanded" : ""}`}>
							<div className="mc2-card-click" onClick={() => setOpenCard(openCard === c.id ? null : c.id)}>
								<CardFace card={c} />
							</div>
							<div className="mc2-card-actions">
								<button className="mod-cta" onClick={() => host.insertRecall(c)}>
									Insert recall
								</button>
								<button onClick={() => host.openCard(c)}>Open</button>
							</div>
							{openCard === c.id && <CardHistory host={host} component={component} card={c} />}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function TreeRow(props: {
	node: TreeNode;
	depth: number;
	expanded: Set<string>;
	toggle: (slug: string) => void;
	pick: (n: TreeNode) => void;
	cursorSlug: string;
}) {
	const { node, depth, expanded, toggle, pick, cursorSlug } = props;
	const isOpen = expanded.has(node.slug);
	const hasChildren = node.children.length > 0;
	const active = cursorSlug === node.slug;
	const onPath = !active && cursorSlug.startsWith(node.slug + "/");
	return (
		<div className="mc2-tree-node">
			<div
				className={`mc2-tree-row ${active ? "is-active" : ""} ${onPath ? "is-on-path" : ""}`}
				style={{ paddingLeft: 4 + depth * 14 }}
			>
				<span
					className="mc2-tree-chevron"
					onClick={() => hasChildren && toggle(node.slug)}
					aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined}
				>
					{hasChildren ? (isOpen ? "▼" : "▶") : "•"}
				</span>
				<span className="mc2-tree-name" onClick={() => pick(node)} title="Show cards for this branch">
					{node.name}
				</span>
				<span className={`mc2-badge ${node.openCount ? "" : "is-zero"}`} title={`${plural(node.openCount, "open card")}`}>
					{node.openCount}
				</span>
			</div>
			{isOpen &&
				node.children.map(c => (
					<TreeRow key={c.slug} {...props} node={c} depth={depth + 1} />
				))}
		</div>
	);
}

function findNode(root: TreeNode, slug: string): TreeNode | null {
	if (root.slug === slug) return root;
	for (const c of root.children) {
		if (slug === c.slug || slug.startsWith(c.slug + "/")) {
			const f = findNode(c, slug);
			if (f) return f;
		}
	}
	return null;
}

export function matches(c: CardNode, q: string): boolean {
	if (q.startsWith("#")) return c.tags.some(t => t.startsWith(q)) || (q.length > 1 && `#${c.status}`.startsWith(q));
	return (
		c.title.toLowerCase().includes(q) ||
		c.description.toLowerCase().includes(q) ||
		c.tags.some(t => t.includes(q)) ||
		c.hierarchy.segments.some(s => s.text.toLowerCase().includes(q))
	);
}
