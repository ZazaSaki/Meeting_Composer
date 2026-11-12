// Unified Topics sidebar: a search box at the top, a native collapsible topic tree below it.
// The chevron only expands/collapses; the label loads that topic into the Results tab.

import { AbstractInputSuggest, App, ItemView, Keymap, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { TopicsHost, VIEW_TYPE_TOPICS } from "./host";
import { filterTree, groupRoots, isTagQuery, pathKey, resolveTopicName } from "./topicModel";
import { TopicGroup, TopicNode } from "./types";

const GROUPS: { id: TopicGroup; label: string }[] = [
	{ id: "org", label: "Organizations" },
	{ id: "sector", label: "Sectors" },
	{ id: "important", label: "Important topics" },
];

interface RowState {
	node: TopicNode;
	key: string;
	item: HTMLElement;
	icon: HTMLElement;
	children: HTMLElement | null;
}

interface SidebarState {
	expanded?: string[];
	collapsedGroups?: TopicGroup[];
}

export class TopicsSidebarView extends ItemView {
	private expanded = new Set<string>();
	private collapsedGroups = new Set<TopicGroup>();
	/** Ancestors opened by the current filter (not saved). */
	private forcedOpen = new Set<string>();
	private activeKey: string | null = null;
	private filter = "";
	private filterTimer: number | null = null;
	private lastSuggestPick = 0;
	private rows = new WeakMap<HTMLElement, RowState>();

	private inputEl!: HTMLInputElement;
	private scopeBtn!: HTMLElement;
	private bodyEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private host: TopicsHost) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TOPICS;
	}

	getDisplayText(): string {
		return "Topics";
	}

	getIcon(): string {
		return "scroll-text";
	}

	getState(): any {
		const state: SidebarState = { expanded: [...this.expanded], collapsedGroups: [...this.collapsedGroups] };
		return { ...super.getState(), ...state };
	}

	async setState(state: SidebarState, result: ViewStateResult): Promise<void> {
		if (Array.isArray(state?.expanded)) this.expanded = new Set(state.expanded);
		if (Array.isArray(state?.collapsedGroups)) this.collapsedGroups = new Set(state.collapsedGroups);
		if (this.bodyEl) this.renderTree();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("mc-topics");

		// header: search + actions (stays put while the tree scrolls)
		const header = root.createDiv("mc-topics-header");
		const searchWrap = header.createDiv("search-input-container mc-topics-search");
		this.inputEl = searchWrap.createEl("input", {
			type: "search",
			attr: { placeholder: "Search topics or #tags…", spellcheck: "false", "aria-label": "Search topics or #tags" },
		});
		const actions = header.createDiv("mc-topics-actions");
		const iconButton = (icon: string, label: string, onClick: () => void) => {
			const b = actions.createDiv({ cls: "clickable-icon", attr: { "aria-label": label, role: "button", tabindex: "0" } });
			setIcon(b, icon);
			this.registerDomEvent(b, "click", onClick);
			this.registerDomEvent(b, "keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			});
			return b;
		};
		iconButton("rotate-cw", "Reload minutes", () => void this.host.index.rebuild());
		this.scopeBtn = iconButton("globe", "", () => this.host.index.setScoped(!this.host.index.scoped));
		iconButton("chevrons-down-up", "Collapse all", () => this.collapseAll());
		this.updateScopeButton();

		this.bodyEl = root.createDiv({ cls: "mc-topics-body", attr: { role: "tree" } });

		// search box
		if (this.host.autoCompleteEnabled()) {
			new TopicNameSuggest(this.app, this.inputEl, () => this.host.index.topicNames(), (value, evt) => {
				this.lastSuggestPick = Date.now();
				this.inputEl.value = value;
				this.setFilter(value, true);
				this.submit(value, !!Keymap.isModEvent(evt));
			});
		}
		this.registerDomEvent(this.inputEl, "input", () => this.setFilter(this.inputEl.value));
		this.registerDomEvent(this.inputEl, "keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				const newTab = !!Keymap.isModEvent(e);
				// Let a suggestion pick (same keypress) win over the raw typed text.
				window.setTimeout(() => {
					if (Date.now() - this.lastSuggestPick < 100) return;
					this.submit(this.inputEl.value, newTab);
				}, 0);
			} else if (e.key === "Escape" && this.inputEl.value) {
				e.preventDefault();
				this.inputEl.value = "";
				this.setFilter("", true);
			}
		});

		// tree: one delegated listener each (rows are rebuilt often)
		this.registerDomEvent(this.bodyEl, "click", e => this.onTreeClick(e));
		this.registerDomEvent(this.bodyEl, "auxclick", e => {
			if (e.button === 1) this.onTreeClick(e);
		});
		this.registerDomEvent(this.bodyEl, "keydown", e => this.onTreeKey(e));

		this.registerEvent(this.host.index.on("changed", () => this.renderTree()));
		this.registerEvent(this.host.index.on("scope-changed", () => this.updateScopeButton()));
		this.renderTree();
	}

	async onClose(): Promise<void> {
		if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
		this.contentEl.empty();
	}

	focusSearch(): void {
		this.inputEl?.focus();
		this.inputEl?.select();
	}

	// ---------- search ----------

	private setFilter(value: string, immediate = false): void {
		if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
		const apply = () => {
			this.filterTimer = null;
			if (value === this.filter) return;
			this.filter = value;
			this.renderTree();
		};
		if (immediate) apply();
		else this.filterTimer = window.setTimeout(apply, 150);
	}

	private submit(raw: string, newTab: boolean): void {
		const text = raw.trim();
		if (!text) return;
		if (isTagQuery(text)) {
			const tag = text.replace(/^#+/, "").trim();
			if (tag) void this.host.showResults({ text: `#${tag}`, parentPath: [], scoped: false }, newTab);
			return;
		}
		const name = resolveTopicName(text, this.host.index.topicNames());
		void this.host.showResults({ text: name, parentPath: [], scoped: false }, newTab);
	}

	private updateScopeButton(): void {
		if (!this.scopeBtn) return;
		const scoped = this.host.index.scoped;
		this.scopeBtn.empty();
		setIcon(this.scopeBtn, scoped ? "map-pin" : "globe");
		this.scopeBtn.toggleClass("is-active", scoped);
		this.scopeBtn.setAttr(
			"aria-label",
			scoped
				? "Scoped: clicks under a sector only search inside that sector. Click for global."
				: "Global: clicks search every minutes file. Click to scope to the sector.",
		);
	}

	// ---------- tree rendering ----------

	private renderTree(): void {
		const body = this.bodyEl;
		if (!body) return;
		body.empty();
		const index = this.host.index;

		if (!index.ready) {
			body.createDiv({ cls: "mc-topics-empty", text: "Loading topics…" });
			return;
		}
		if (index.roots.length === 0) {
			body.createDiv({
				cls: "mc-topics-empty",
				text: `No topics yet. Write headings (#, ##, …) in the notes in “${this.host.minutesDir()}” to build the tree.`,
			});
			return;
		}

		const tagMode = isTagQuery(this.filter);
		const filtered = !tagMode && this.filter.trim() ? filterTree(index.roots, this.filter) : null;
		this.forcedOpen = filtered ? filtered.open : new Set();
		const roots = filtered ? filtered.nodes : index.roots;

		if (tagMode) {
			const tag = this.filter.trim().replace(/^#+/, "");
			body.createDiv({ cls: "mc-topics-hint", text: tag ? `Press Enter to show everything tagged #${tag}.` : "Type a tag name, then press Enter." });
		}
		if (filtered && roots.length === 0) {
			body.createDiv({ cls: "mc-topics-empty", text: `No topics match “${this.filter.trim()}”.` });
			return;
		}

		// the three groups sit side by side, each column scrolling on its own;
		// a collapsed group shrinks to a thin vertical strip
		const groups = groupRoots(roots, index.parser);
		const shown = GROUPS.filter(g => groups[g.id].length > 0);
		const columns = body.createDiv("mc-topics-columns");
		const isCollapsed = (id: TopicGroup) => !filtered && this.collapsedGroups.has(id);
		columns.style.gridTemplateColumns = shown
			.map(g => (isCollapsed(g.id) ? "max-content" : "minmax(var(--mc-topics-col-min), 1fr)"))
			.join(" ");
		for (const g of shown) {
			const nodes = groups[g.id];
			const collapsed = isCollapsed(g.id);
			const section = columns.createDiv({ cls: "mc-topics-group", attr: { "data-group": g.id } });
			section.toggleClass("is-collapsed", collapsed);
			const head = section.createDiv({
				cls: "mc-topics-group-head",
				attr: { role: "button", tabindex: "0", "aria-expanded": String(!collapsed) },
			});
			const chev = head.createDiv("mc-topics-group-chevron collapse-icon");
			setIcon(chev, "right-triangle");
			chev.toggleClass("is-collapsed", collapsed);
			head.createSpan({ cls: "mc-topics-group-label", text: g.label });
			head.createSpan({ cls: "mc-topics-group-count", text: String(nodes.length) });
			const list = section.createDiv("mc-topics-group-items");
			list.toggle(!collapsed);
			for (const node of nodes) this.renderNode(list, node);
		}
	}

	private renderNode(parent: HTMLElement, node: TopicNode): void {
		const key = pathKey(node.path, node.name);
		const hasKids = node.children.length > 0;
		const item = parent.createDiv("tree-item mc-topics-item");
		const self = item.createDiv({
			cls: "tree-item-self is-clickable mc-topics-row",
			attr: { role: "treeitem", tabindex: "0", "aria-label": node.name },
		});
		if (key === this.activeKey) self.addClass("is-active");

		const icon = self.createDiv("tree-item-icon collapse-icon mc-topics-chevron");
		if (hasKids) {
			self.addClass("mod-collapsible");
			setIcon(icon, "right-triangle");
		} else {
			icon.addClass("is-leaf");
		}

		const inner = self.createDiv("tree-item-inner mc-topics-label");
		appendHighlighted(inner, node.name, isTagQuery(this.filter) ? "" : this.filter.trim());
		if (hasKids) self.createDiv("tree-item-flair-outer").createSpan({ cls: "tree-item-flair", text: String(node.children.length) });

		const state: RowState = { node, key, item, icon, children: null };
		this.rows.set(self, state);

		const open = hasKids && (this.forcedOpen.has(key) || this.expanded.has(key));
		this.applyOpen(self, state, open);
	}

	private applyOpen(self: HTMLElement, state: RowState, open: boolean): void {
		if (state.node.children.length === 0) return;
		state.icon.toggleClass("is-collapsed", !open);
		state.item.toggleClass("is-collapsed", !open);
		self.setAttr("aria-expanded", String(open));
		if (open && !state.children) {
			// children are built lazily, the first time a node opens
			state.children = state.item.createDiv({ cls: "tree-item-children mc-topics-children", attr: { role: "group" } });
			for (const child of state.node.children) this.renderNode(state.children, child);
		}
		state.children?.toggle(open);
	}

	private toggle(self: HTMLElement, state: RowState, open?: boolean): void {
		if (state.node.children.length === 0) return;
		const next = open ?? state.icon.hasClass("is-collapsed");
		if (next) this.expanded.add(state.key);
		else {
			this.expanded.delete(state.key);
			this.forcedOpen.delete(state.key);
		}
		this.applyOpen(self, state, next);
		this.app.workspace.requestSaveLayout();
	}

	private select(self: HTMLElement, state: RowState, newTab: boolean): void {
		this.activeKey = state.key;
		this.bodyEl.querySelectorAll(".mc-topics-row.is-active").forEach(el => el.removeClass("is-active"));
		self.addClass("is-active");
		void this.host.showResults({ text: state.node.name, parentPath: state.node.path, scoped: this.host.index.scoped }, newTab);
	}

	private collapseAll(): void {
		this.expanded.clear();
		this.forcedOpen.clear();
		this.renderTree();
		this.app.workspace.requestSaveLayout();
	}

	private toggleGroup(head: HTMLElement): void {
		const section = head.closest<HTMLElement>(".mc-topics-group");
		const id = section?.getAttr("data-group") as TopicGroup | null;
		if (!section || !id) return;
		if (this.collapsedGroups.has(id)) this.collapsedGroups.delete(id);
		else this.collapsedGroups.add(id);
		// re-render so the column widths follow; keep scroll positions and focus
		const scroll = new Map<string, number>();
		this.bodyEl.querySelectorAll<HTMLElement>(".mc-topics-group").forEach(s => {
			const items = s.querySelector<HTMLElement>(".mc-topics-group-items");
			if (items) scroll.set(s.getAttr("data-group") ?? "", items.scrollTop);
		});
		this.renderTree();
		this.bodyEl.querySelectorAll<HTMLElement>(".mc-topics-group").forEach(s => {
			const items = s.querySelector<HTMLElement>(".mc-topics-group-items");
			const top = scroll.get(s.getAttr("data-group") ?? "");
			if (items && top) items.scrollTop = top;
		});
		this.bodyEl.querySelector<HTMLElement>(`.mc-topics-group[data-group="${id}"] .mc-topics-group-head`)?.focus();
		this.app.workspace.requestSaveLayout();
	}

	// ---------- events ----------

	private onTreeClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const groupHead = target.closest<HTMLElement>(".mc-topics-group-head");
		if (groupHead) {
			this.toggleGroup(groupHead);
			return;
		}
		const self = target.closest<HTMLElement>(".mc-topics-row");
		const state = self && this.rows.get(self);
		if (!self || !state) return;
		self.focus({ preventScroll: true });
		if (target.closest(".mc-topics-chevron")) {
			// expand/collapse only: never loads results
			e.preventDefault();
			e.stopPropagation();
			this.toggle(self, state);
			return;
		}
		this.select(self, state, e.button === 1 || !!Keymap.isModEvent(e));
	}

	private onTreeKey(e: KeyboardEvent): void {
		const target = e.target as HTMLElement;
		if (target.hasClass("mc-topics-group-head")) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				this.toggleGroup(target);
			}
			return;
		}
		const state = this.rows.get(target);
		if (!state) return;
		const hasKids = state.node.children.length > 0;
		const open = hasKids && !state.icon.hasClass("is-collapsed");
		switch (e.key) {
			case "Enter":
				this.select(target, state, !!Keymap.isModEvent(e));
				break;
			case " ":
				this.toggle(target, state);
				break;
			case "ArrowRight":
				if (hasKids && !open) this.toggle(target, state, true);
				else if (open) this.focusRow(state.children?.querySelector<HTMLElement>(".mc-topics-row") ?? null);
				break;
			case "ArrowLeft":
				if (open) this.toggle(target, state, false);
				else this.focusRow(state.item.parentElement?.closest(".tree-item")?.querySelector<HTMLElement>(":scope > .mc-topics-row") ?? null);
				break;
			case "ArrowDown":
			case "ArrowUp": {
				const rows = this.visibleRows();
				const i = rows.indexOf(target);
				this.focusRow(rows[i + (e.key === "ArrowDown" ? 1 : -1)] ?? null);
				break;
			}
			default:
				return;
		}
		e.preventDefault();
	}

	private visibleRows(): HTMLElement[] {
		return Array.from(this.bodyEl.querySelectorAll<HTMLElement>(".mc-topics-row")).filter(el => el.offsetParent !== null);
	}

	private focusRow(el: HTMLElement | null): void {
		if (!el) return;
		el.focus();
		el.scrollIntoView({ block: "nearest" });
	}
}

function appendHighlighted(el: HTMLElement, text: string, query: string): void {
	const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (i < 0) {
		el.setText(text);
		return;
	}
	if (i > 0) el.appendText(text.slice(0, i));
	el.createSpan({ cls: "mc-topics-match", text: text.slice(i, i + query.length) });
	if (i + query.length < text.length) el.appendText(text.slice(i + query.length));
}

class TopicNameSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private names: () => string[],
		private pick: (value: string, evt: MouseEvent | KeyboardEvent) => void,
	) {
		super(app, inputEl);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		this.close();
		this.pick(value, evt);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.trim().toLowerCase();
		if (!q || isTagQuery(q)) return [];
		return this.names().filter(n => n.toLowerCase().includes(q)).slice(0, 50);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}
}
