// Meeting cards companion sidebar (spec §5), one panel:
//   header  — search (filters the organization tree and the cards), reindex, collapse all, help
//   tree    — native collapsible organization tree with open-card counts; the chevron only
//             expands/collapses, the name scopes the card list below
//   divider — drag (or ↑/↓) to resize the tree
//   cards   — context-aware card feed (selected branch, or the heading under the cursor) with
//             one-click recall insertion

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ItemView, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { buildTree, inScope, TreeNode } from "../core/tree";
import { filterByName } from "../core/treeFilter";
import { CardNode } from "../types";
import { V2Host, ViewProps } from "./host";
import { CardFace, CardHistory, DuplicateBanner, plural, useStoreVersion } from "./components";

export const VIEW_TYPE_CARDS = "meeting-composer-cards";

type StatusFilter = "open" | "closed" | "all";

/** Sidebar UI state saved in the workspace layout. */
interface CardsSidebarState {
	expanded?: string[];
	treeHeight?: number;
	status?: StatusFilter;
	follow?: boolean;
	scope?: string;
}

const DEFAULT_TREE_HEIGHT = 260;
const MIN_TREE_HEIGHT = 60;

export class CardsSidebarView extends ItemView {
	private root: Root | null = null;
	private ui: CardsSidebarState = {};
	private mountKey = 0;

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

	getState(): any {
		return { ...super.getState(), ...this.ui };
	}

	async setState(state: CardsSidebarState, result: ViewStateResult): Promise<void> {
		const next: CardsSidebarState = { ...this.ui };
		if (Array.isArray(state?.expanded)) next.expanded = state.expanded.filter(s => typeof s === "string");
		if (typeof state?.treeHeight === "number" && state.treeHeight > 0) next.treeHeight = state.treeHeight;
		if (state?.status === "open" || state?.status === "closed" || state?.status === "all") next.status = state.status;
		if (typeof state?.follow === "boolean") next.follow = state.follow;
		if (typeof state?.scope === "string") next.scope = state.scope;
		this.ui = next;
		this.mountKey++;
		this.renderApp(); // remount with the restored state
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("mc2-sidebar");
		this.root = createRoot(container);
		this.renderApp();
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}

	private renderApp(): void {
		this.root?.render(
			<SidebarApp
				key={this.mountKey}
				host={this.host}
				component={this}
				initial={this.ui}
				persist={patch => {
					this.ui = { ...this.ui, ...patch };
					this.app.workspace.requestSaveLayout();
				}}
			/>,
		);
	}
}

function SidebarApp({
	host,
	component,
	initial,
	persist,
}: ViewProps & { initial: CardsSidebarState; persist: (patch: CardsSidebarState) => void }) {
	const version = useStoreVersion(host.store);
	const [manualScope, setManualScope] = useState(initial.scope ?? "");
	const [follow, setFollow] = useState(initial.follow ?? true);
	const [cursorSlug, setCursorSlug] = useState(host.currentCursorScope());
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.expanded ?? []));
	const [status, setStatus] = useState<StatusFilter>(initial.status ?? "open");
	const [query, setQuery] = useState("");
	const [openCard, setOpenCard] = useState<string | null>(null);
	const [treeHeight, setTreeHeight] = useState(initial.treeHeight ?? DEFAULT_TREE_HEIGHT);
	// branches the user closed while a search had forced them open
	const [closedInSearch, setClosedInSearch] = useState<Set<string>>(new Set());
	const treeRef = useRef<HTMLDivElement>(null);
	const cardsRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => host.onCursorScope(setCursorSlug), [host]);
	useEffect(() => setClosedInSearch(new Set()), [query]);

	// auto-expand the path to the heading under the cursor
	useEffect(() => {
		if (!cursorSlug) return;
		setExpanded(prev => {
			const next = new Set(prev);
			const parts = cursorSlug.split("/");
			for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
			return next.size === prev.size ? prev : next;
		});
	}, [cursorSlug]);

	useEffect(() => persist({ expanded: [...expanded], status, follow, scope: manualScope, treeHeight }), [
		expanded,
		status,
		follow,
		manualScope,
		treeHeight,
	]);

	const scope = follow ? cursorSlug : manualScope;
	const q = query.trim().toLowerCase();
	const tagSearch = q.startsWith("#");

	const tree = useMemo(
		() => buildTree(host.store.getAllPaths(), host.store.getCards(), (a, b) => host.compareTopics(a, b)),
		[version],
	);
	const filtered = useMemo(() => (q && !tagSearch ? filterByName(tree.children, q, n => n.slug) : null), [tree, q, tagSearch]);
	const roots = filtered ? filtered.nodes : tree.children;
	const isOpen = (slug: string) =>
		expanded.has(slug) || (!!filtered && filtered.open.has(slug) && !closedInSearch.has(slug));

	const scopeNode = useMemo(() => findNode(tree, scope), [tree, scope]);
	const cards = useMemo(
		() =>
			host.store
				.getCards()
				.filter(c => inScope(c.hierarchy.slug, scope))
				.filter(c => status === "all" || c.status === status)
				.filter(c => !q || matches(c, q))
				.sort((a, b) => (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "")),
		[version, scope, status, q],
	);

	// keep the selected / cursor row visible
	useEffect(() => {
		if (!scope) return;
		const el = treeRef.current?.querySelector<HTMLElement>(`.mc2-org-row[data-slug="${cssEscape(scope)}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [scope, version]);

	const pick = (n: TreeNode) => {
		setManualScope(n.slug);
		setFollow(false);
		setOpenCard(null);
		cardsRef.current?.scrollTo({ top: 0 });
	};

	const toggle = (slug: string, open?: boolean) => {
		const next = open ?? !isOpen(slug);
		setExpanded(prev => {
			const s = new Set(prev);
			if (next) s.add(slug);
			else s.delete(slug);
			return s;
		});
		setClosedInSearch(prev => {
			const s = new Set(prev);
			if (next) s.delete(slug);
			else s.add(slug);
			return s;
		});
	};

	const collapseAll = () => {
		setExpanded(new Set());
		if (filtered) setClosedInSearch(new Set(filtered.open));
	};

	const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape" && query) {
			e.preventDefault();
			setQuery("");
		} else if (e.key === "Enter" && filtered) {
			// pick the first branch whose name matches
			const first = firstMatch(filtered.nodes, q);
			if (first) pick(first);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			treeRef.current?.querySelector<HTMLElement>(".mc2-org-row")?.focus();
		}
	};

	const onTreeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const row = (e.target as HTMLElement).closest<HTMLElement>(".mc2-org-row");
		const slug = row?.dataset.slug;
		if (!row || slug === undefined) return;
		const node = findNode(tree, slug);
		if (!node) return;
		const hasKids = node.children.length > 0;
		const open = hasKids && isOpen(slug);
		switch (e.key) {
			case "Enter":
				pick(node);
				break;
			case " ":
				if (hasKids) toggle(slug);
				break;
			case "ArrowRight":
				if (hasKids && !open) toggle(slug, true);
				else if (open) focusRow(row.parentElement?.querySelector<HTMLElement>(":scope > .tree-item-children .mc2-org-row") ?? null);
				break;
			case "ArrowLeft":
				if (open) toggle(slug, false);
				else focusRow(row.parentElement?.parentElement?.closest(".tree-item")?.querySelector<HTMLElement>(":scope > .mc2-org-row") ?? null);
				break;
			case "ArrowDown":
			case "ArrowUp": {
				const rows = Array.from(treeRef.current?.querySelectorAll<HTMLElement>(".mc2-org-row") ?? []);
				const i = rows.indexOf(row);
				if (e.key === "ArrowUp" && i === 0) searchRef.current?.focus();
				else focusRow(rows[i + (e.key === "ArrowDown" ? 1 : -1)] ?? null);
				break;
			}
			default:
				return;
		}
		e.preventDefault();
	};

	const openInScope = cards.filter(c => c.status === "open").length;
	const scopeLabel = scopeNode && scopeNode.slug ? scopeNode.segments.map(s => s.text) : [];

	return (
		<div className="mc2-sidebar-app">
			<div className="mc2-side-header">
				<div className="search-input-container mc2-side-search">
					<input
						ref={searchRef}
						type="search"
						placeholder="Search branches, cards, #tags…"
						aria-label="Search branches, cards and #tags"
						spellCheck={false}
						value={query}
						onChange={e => setQuery(e.target.value)}
						onKeyDown={onSearchKey}
					/>
				</div>
				<IconButton icon="rotate-cw" label="Re-index meeting cards" onClick={() => void host.store.reindexAll()} />
				<IconButton icon="chevrons-down-up" label="Collapse all" onClick={collapseAll} />
				<IconButton icon="help-circle" label="How to write cards" onClick={() => host.showHelp()} />
			</div>

			<DuplicateBanner host={host} />

			<div className="mc2-org-tree" ref={treeRef} role="tree" style={{ height: treeHeight }} onKeyDown={onTreeKey}>
				{tree.children.length === 0 && (
					<div className="mc2-muted mc2-empty">
						No headings found in the minutes folder yet.{" "}
						<a href="#" onClick={e => { e.preventDefault(); host.showHelp(); }}>How to write cards</a>
					</div>
				)}
				{tagSearch && tree.children.length > 0 && (
					<div className="mc2-muted mc2-org-hint">Tag search filters the cards below.</div>
				)}
				{filtered && roots.length === 0 && <div className="mc2-muted mc2-empty">No branches match “{query.trim()}”.</div>}
				{roots.map(n => (
					<OrgRow
						key={n.slug}
						node={n}
						isOpen={isOpen}
						toggle={toggle}
						pick={pick}
						scope={scope}
						cursorSlug={cursorSlug}
						highlight={filtered ? q : ""}
					/>
				))}
			</div>

			<Divider height={treeHeight} setHeight={setTreeHeight} />

			<div className="mc2-feed" ref={cardsRef}>
				<div className="mc2-scope">
					<span className="mc2-scope-path" title={scopeLabel.join(" › ") || "All minutes"}>
						{scopeLabel.length === 0 ? (
							<span className="mc2-scope-current">All minutes</span>
						) : (
							scopeLabel.map((s, i) => (
								<React.Fragment key={i}>
									{i > 0 && <span className="mc2-scope-sep">›</span>}
									<span className={i === scopeLabel.length - 1 ? "mc2-scope-current" : "mc2-muted"}>{s}</span>
								</React.Fragment>
							))
						)}
					</span>
					<span className="mc2-scope-actions">
						<IconButton
							icon="locate-fixed"
							label={follow ? "Following the heading under the editor cursor (click to stop)" : "Follow the heading under the editor cursor"}
							active={follow}
							onClick={() => setFollow(!follow)}
						/>
						{!follow && manualScope && <IconButton icon="x" label="Show all minutes" onClick={() => setManualScope("")} />}
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
					<span className="mc2-muted mc2-feed-count">
						{plural(cards.length, "card")}
						{status !== "open" ? ` · ${openInScope} open` : ""}
					</span>
				</div>
				{cards.length === 0 && (
					<div className="mc2-muted mc2-empty">
						{q ? "No cards match the search in this scope." : "No cards in this scope."}{" "}
						<a href="#" onClick={e => { e.preventDefault(); host.showHelp(); }}>How to write cards</a>
					</div>
				)}
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
		</div>
	);
}

function OrgRow(props: {
	node: TreeNode;
	isOpen: (slug: string) => boolean;
	toggle: (slug: string) => void;
	pick: (n: TreeNode) => void;
	scope: string;
	cursorSlug: string;
	highlight: string;
}) {
	const { node, isOpen, toggle, pick, scope, cursorSlug, highlight } = props;
	const hasChildren = node.children.length > 0;
	const open = hasChildren && isOpen(node.slug);
	const active = scope !== "" && scope === node.slug;
	const onPath = !active && scope !== "" && scope.startsWith(node.slug + "/");
	const atCursor = cursorSlug === node.slug;
	const cls = [
		"tree-item-self is-clickable mc2-org-row",
		hasChildren ? "mod-collapsible" : "",
		active ? "is-active" : "",
		onPath ? "is-on-path" : "",
		atCursor ? "is-cursor" : "",
	].join(" ");
	return (
		<div className="tree-item mc2-org-item">
			<div
				className={cls}
				data-slug={node.slug}
				role="treeitem"
				tabIndex={0}
				aria-expanded={hasChildren ? open : undefined}
				aria-selected={active}
				onClick={() => pick(node)}
				title={atCursor ? "Heading under the editor cursor" : undefined}
			>
				{hasChildren ? (
					<Icon
						name="right-triangle"
						className={`tree-item-icon collapse-icon mc2-org-chevron ${open ? "" : "is-collapsed"}`}
						label={open ? "Collapse" : "Expand"}
						onClick={e => {
							e.stopPropagation(); // expand/collapse only, never changes the card scope
							toggle(node.slug);
						}}
					/>
				) : (
					<div className="tree-item-icon mc2-org-chevron is-leaf" />
				)}
				<div className="tree-item-inner mc2-org-label">
					<Highlighted text={node.name} query={highlight} />
				</div>
				<div className="tree-item-flair-outer">
					<span className={`tree-item-flair mc2-org-count ${node.openCount ? "" : "is-zero"}`} title={plural(node.openCount, "open card")}>
						{node.openCount}
					</span>
				</div>
			</div>
			{open && (
				<div className="tree-item-children mc2-org-children" role="group">
					{node.children.map(c => (
						<OrgRow key={c.slug} {...props} node={c} />
					))}
				</div>
			)}
		</div>
	);
}

/** Drag (or ↑/↓ when focused) to resize the tree; double-click resets. */
function Divider({ height, setHeight }: { height: number; setHeight: (h: number) => void }) {
	const drag = useRef<{ y: number; h: number; max: number } | null>(null);
	const maxFor = (el: HTMLElement) => {
		const app = el.closest(".mc2-sidebar-app") as HTMLElement | null;
		return Math.max(MIN_TREE_HEIGHT, (app?.clientHeight ?? 600) - 140);
	};
	const clamp = (h: number, max: number) => Math.round(Math.min(Math.max(h, MIN_TREE_HEIGHT), max));
	return (
		<div
			className="mc2-divider"
			role="separator"
			aria-orientation="horizontal"
			aria-label="Resize organization tree"
			tabIndex={0}
			onPointerDown={e => {
				const el = e.currentTarget;
				el.setPointerCapture(e.pointerId);
				drag.current = { y: e.clientY, h: height, max: maxFor(el) };
				el.addClass("is-dragging");
			}}
			onPointerMove={e => {
				const d = drag.current;
				if (d) setHeight(clamp(d.h + e.clientY - d.y, d.max));
			}}
			onPointerUp={e => {
				drag.current = null;
				e.currentTarget.releasePointerCapture(e.pointerId);
				e.currentTarget.removeClass("is-dragging");
			}}
			onDoubleClick={() => setHeight(DEFAULT_TREE_HEIGHT)}
			onKeyDown={e => {
				if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
				e.preventDefault();
				setHeight(clamp(height + (e.key === "ArrowDown" ? 24 : -24), maxFor(e.currentTarget)));
			}}
		/>
	);
}

function Icon({
	name,
	className,
	label,
	onClick,
}: {
	name: string;
	className?: string;
	label?: string;
	onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.empty();
		setIcon(el, name);
	}, [name]);
	return <div ref={ref} className={className} aria-label={label} onClick={onClick} />;
}

function IconButton({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
	return (
		<div
			className={`clickable-icon mc2-icon-btn ${active ? "is-active" : ""}`}
			role="button"
			tabIndex={0}
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			onKeyDown={e => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
		>
			<Icon name={icon} className="mc2-icon" />
		</div>
	);
}

function Highlighted({ text, query }: { text: string; query: string }) {
	const i = query ? text.toLowerCase().indexOf(query) : -1;
	if (i < 0) return <>{text}</>;
	return (
		<>
			{text.slice(0, i)}
			<span className="mc2-org-match">{text.slice(i, i + query.length)}</span>
			{text.slice(i + query.length)}
		</>
	);
}

function focusRow(el: HTMLElement | null): void {
	if (!el) return;
	el.focus();
	el.scrollIntoView({ block: "nearest" });
}

function firstMatch(nodes: TreeNode[], q: string): TreeNode | null {
	for (const n of nodes) {
		if (n.name.toLowerCase().includes(q)) return n;
		const f = firstMatch(n.children, q);
		if (f) return f;
	}
	return null;
}

function cssEscape(s: string): string {
	return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
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
