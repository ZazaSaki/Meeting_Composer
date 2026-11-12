// Results tab: renders a topic's / tag's aggregated history in memory (no output file).
// One tab is reused for every query; its query is part of the view state so it survives restarts.

import { Component, ItemView, Keymap, MarkdownRenderer, Notice, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { TopicsHost, VIEW_TYPE_RESULTS } from "./host";
import { entryHeadingPath, entryLinkText, isTagQuery, queryLabel } from "./topicModel";
import { ResultEntry, TopicQuery } from "./types";

export class TopicResultsView extends ItemView {
	private q: TopicQuery | null = null;
	private entries: ResultEntry[] = [];
	private lastMarkdown: string | null = null;
	private renderChild: Component | null = null;
	private renderToken = 0;

	private headerEl!: HTMLElement;
	private listEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private host: TopicsHost) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RESULTS;
	}

	getDisplayText(): string {
		if (!this.q) return "Topic results";
		return isTagQuery(this.q.text) ? `Tag: ${queryLabel(this.q)}` : `Topic: ${queryLabel(this.q)}`;
	}

	getIcon(): string {
		return "file-search";
	}

	getState(): any {
		return { ...super.getState(), ...(this.q ?? {}) };
	}

	async setState(state: Partial<TopicQuery>, result: ViewStateResult): Promise<void> {
		if (state && typeof state.text === "string") {
			this.setQuery({
				text: state.text,
				parentPath: Array.isArray(state.parentPath) ? state.parentPath : [],
				scoped: !!state.scoped,
			});
		}
		await super.setState(state, result);
	}

	/** Show a new query (called by the plugin when a topic is clicked / searched). */
	setQuery(q: TopicQuery): void {
		this.q = q;
		this.lastMarkdown = null;
		this.refresh(true);
		// tab and view-header titles follow the query
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		(this as unknown as { titleEl?: HTMLElement }).titleEl?.setText(this.getDisplayText());
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("mc-results");
		this.headerEl = root.createDiv("mc-results-header");
		this.listEl = root.createDiv("mc-results-list");

		this.registerDomEvent(this.listEl, "click", e => this.onLinkClick(e));
		this.registerDomEvent(this.listEl, "auxclick", e => {
			if (e.button === 1) this.onLinkClick(e);
		});
		this.registerDomEvent(this.listEl, "mouseover", e => this.onLinkHover(e));
		this.registerEvent(this.host.index.on("changed", () => this.refresh(false)));
		this.refresh(true);
	}

	async onClose(): Promise<void> {
		this.clearRendered();
		this.contentEl.empty();
	}

	/** Re-run the query. With `force` false, skip re-rendering when nothing changed (avoids flicker on rebuilds). */
	private refresh(force: boolean): void {
		if (!this.listEl) return;
		const index = this.host.index;
		if (!this.q) {
			this.renderHeader();
			this.renderMessage("Click a topic in the Topics sidebar, or search for a topic or #tag.");
			return;
		}
		if (!index.ready) {
			this.renderHeader();
			this.renderMessage("Loading minutes…");
			return;
		}
		this.entries = index.query(this.q);
		const md = index.toMarkdown(this.entries);
		if (!force && md === this.lastMarkdown) return;
		this.lastMarkdown = md;
		this.renderHeader();
		void this.renderEntries();
	}

	private renderHeader(): void {
		const h = this.headerEl;
		h.empty();
		const title = h.createDiv("mc-results-title");
		if (!this.q) {
			title.setText("Topic results");
			return;
		}
		const tag = isTagQuery(this.q.text);
		const crumbs = title.createDiv("mc-results-crumbs");
		if (!tag) {
			for (const p of this.q.parentPath) {
				crumbs.createSpan({ cls: "mc-results-crumb", text: p });
				crumbs.createSpan({ cls: "mc-results-sep", text: "›" });
			}
		}
		crumbs.createSpan({ cls: "mc-results-query", text: queryLabel(this.q) });

		const meta = h.createDiv("mc-results-meta");
		const n = this.entries.length;
		const scope = tag ? "tag search" : this.q.scoped ? "scoped to sector" : "all minutes";
		meta.createSpan({ text: `${n} ${n === 1 ? "entry" : "entries"} · ${scope}` });

		const copy = meta.createDiv({ cls: "clickable-icon mc-results-copy", attr: { "aria-label": "Copy as Markdown", role: "button", tabindex: "0" } });
		setIcon(copy, "copy");
		const doCopy = async () => {
			try {
				await navigator.clipboard.writeText(this.host.index.toMarkdown(this.entries));
				new Notice("Results copied as Markdown");
			} catch (err) {
				console.error("Meeting Composer: copy failed", err);
				new Notice("Could not copy to the clipboard");
			}
		};
		copy.onclick = () => void doCopy();
		copy.onkeydown = e => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				void doCopy();
			}
		};
	}

	private renderMessage(text: string): void {
		this.clearRendered();
		this.listEl.empty();
		this.listEl.createDiv({ cls: "mc-results-empty", text });
	}

	private clearRendered(): void {
		if (this.renderChild) this.removeChild(this.renderChild);
		this.renderChild = null;
	}

	private async renderEntries(): Promise<void> {
		const token = ++this.renderToken;
		this.clearRendered();
		const child = (this.renderChild = this.addChild(new Component()));
		const list = this.listEl;
		const scrollTop = list.scrollTop;
		list.empty();

		const q = this.q!;
		if (this.entries.length === 0) {
			list.createDiv({
				cls: "mc-results-empty",
				text: isTagQuery(q.text) ? `Nothing is tagged ${queryLabel(q)}.` : `No entries found for “${queryLabel(q)}”.`,
			});
			return;
		}

		const tag = isTagQuery(q.text);
		for (const entry of this.entries) {
			const block = list.createDiv("mc-results-entry");
			const head = block.createDiv("mc-results-entry-head");

			const link = head.createEl("a", {
				cls: "internal-link mc-results-source",
				text: entry.id || entry.path || "source",
				attr: { "data-href": entryLinkText(entry, tag), href: entryLinkText(entry, tag) },
			});
			link.setAttr("aria-label", `Open ${entryLinkText(entry, tag)}`);

			const crumbs = head.createDiv("mc-results-entry-path");
			const parts = entryHeadingPath(entry, tag);
			parts.forEach((p, i) => {
				if (i > 0) crumbs.createSpan({ cls: "mc-results-sep", text: "›" });
				crumbs.createSpan({ cls: i === parts.length - 1 ? "mc-results-entry-topic" : "mc-results-crumb", text: p });
			});

			if (entry.tags.length) {
				const tags = head.createDiv("mc-results-tags");
				for (const t of entry.tags) tags.createEl("a", { cls: "tag", text: `#${t}`, attr: { href: `#${t}` } });
			}

			const body = block.createDiv("mc-results-entry-body markdown-rendered");
			const md = entry.content.join("\n").trim();
			if (md) {
				const sourcePath = entry.path ? `${entry.path}.md` : "";
				await MarkdownRenderer.render(this.app, md, body, sourcePath, child);
				if (token !== this.renderToken) return; // a newer render started
			} else {
				body.createDiv({ cls: "mc-results-no-body", text: "(no notes under this heading)" });
			}
		}
		list.scrollTop = scrollTop;
	}

	// ---------- links inside rendered results ----------

	private sourcePathFor(el: HTMLElement): string {
		const entry = el.closest(".mc-results-entry");
		const src = entry?.querySelector<HTMLElement>(".mc-results-source")?.getAttr("data-href") ?? "";
		const file = src.split("#")[0];
		return file ? `${file}.md` : "";
	}

	private onLinkClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const tagEl = target.closest<HTMLElement>("a.tag");
		if (tagEl) {
			e.preventDefault();
			const tag = (tagEl.getAttr("href") ?? tagEl.getText()).replace(/^#+/, "");
			if (tag) void this.host.showResults({ text: `#${tag}`, parentPath: [], scoped: false }, e.button === 1 || !!Keymap.isModEvent(e));
			return;
		}
		const link = target.closest<HTMLElement>("a.internal-link");
		if (link) {
			e.preventDefault();
			const href = link.getAttr("data-href") ?? link.getAttr("href") ?? "";
			if (href) void this.app.workspace.openLinkText(href, this.sourcePathFor(link), e.button === 1 || Keymap.isModEvent(e));
		}
	}

	private onLinkHover(e: MouseEvent): void {
		const link = (e.target as HTMLElement).closest<HTMLElement>("a.internal-link");
		if (!link) return;
		const href = link.getAttr("data-href") ?? link.getAttr("href") ?? "";
		if (!href) return;
		this.app.workspace.trigger("hover-link", {
			event: e,
			source: VIEW_TYPE_RESULTS,
			hoverParent: this,
			targetEl: link,
			linktext: href,
			sourcePath: this.sourcePathFor(link),
		});
	}
}
