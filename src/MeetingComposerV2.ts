// Meeting Composer v2: cards, recalls, companion sidebar and .orgboard boards.
// Purely additive — main.ts creates one instance; the v1 Topic Tree / search keep working as before.

import { Events, MarkdownView, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, normalizePath, editorInfoField } from "obsidian";
import { EditorView } from "@codemirror/view";
import { VaultCardStore } from "./store/VaultCardStore";
import { MarkdownMutator } from "./sync/MarkdownMutator";
import { AutoIdListener } from "./sync/AutoIdListener";
import { RemoteCloser } from "./sync/RemoteCloser";
import { CardsSidebarView, VIEW_TYPE_CARDS } from "./views/CardsSidebarView";
import { OrgBoardView, ORGBOARD_EXT, VIEW_TYPE_ORG_BOARD } from "./views/OrgBoardView";
import { CardSuggestModal } from "./views/modals";
import { CardHelpModal } from "./views/help";
import { V2Host } from "./views/host";
import { CardNode } from "./types";
import { hierarchyAt } from "./core/cardParser";
import { assignMissingIds } from "./core/autoId";
import { planRecallInsert } from "./core/recallInsert";
import { newCardId } from "./core/ids";
import { formatTimestamp } from "./core/syntax";
import { DEFAULT_BOARD, serializeBoard } from "./core/boardFile";

export interface V2Settings {
	minutesDir: string;
	outputDir: string;
	autoCardIds: boolean;
	processedRecallCloses: string[];
	recallClosedBy: string[];
	priorityBefore: string[];
	cities: string[];
	priorityAfter: string[];
}

export class MeetingComposerV2 implements V2Host {
	store: VaultCardStore;
	mutator: MarkdownMutator;
	private autoId: AutoIdListener;
	private closer: RemoteCloser;
	private cursorEvents = new Events();
	private cursorSlug = "";
	private cursorTimer: number | null = null;
	private lastMarkdown: MarkdownView | null = null;

	constructor(
		private plugin: Plugin,
		private settings: () => V2Settings,
		private saveRecallCloseState: (state: { processed: string[]; closedBy: string[] }) => Promise<void>,
	) {
		const app = plugin.app;
		this.store = new VaultCardStore(app, () => ({
			minutesDir: this.settings().minutesDir,
			outputDir: this.settings().outputDir,
		}));
		this.mutator = new MarkdownMutator(app, this.store);
		this.autoId = new AutoIdListener(plugin, this.store, () => this.settings().autoCardIds);
		this.closer = new RemoteCloser(this.store, this.mutator, {
			get: () => new Set(this.settings().processedRecallCloses),
			closedBy: () => new Set(this.settings().recallClosedBy),
			add: async (keys, closingKeys) => {
				const st = this.settings();
				await this.saveRecallCloseState({
					processed: Array.from(new Set([...st.processedRecallCloses, ...keys])),
					closedBy: Array.from(new Set([...st.recallClosedBy, ...closingKeys])),
				});
			},
			release: async keys => {
				const st = this.settings();
				const drop = new Set(keys);
				await this.saveRecallCloseState({
					processed: st.processedRecallCloses.filter(k => !drop.has(k)),
					closedBy: st.recallClosedBy.filter(k => !drop.has(k)),
				});
			},
		});
	}

	get app() {
		return this.plugin.app;
	}

	load(): void {
		const p = this.plugin;
		const reg = (ref: ReturnType<Events["on"]>) => p.registerEvent(ref);

		this.store.attach(reg);
		this.autoId.register();
		this.closer.attach(reg);

		p.registerView(VIEW_TYPE_CARDS, leaf => new CardsSidebarView(leaf, this));
		p.registerView(VIEW_TYPE_ORG_BOARD, leaf => new OrgBoardView(leaf, this));
		try {
			p.registerExtensions([ORGBOARD_EXT], VIEW_TYPE_ORG_BOARD);
		} catch (e) {
			console.error("Meeting Composer: could not register .orgboard", e);
		}

		p.addRibbonIcon("kanban-square", "Open meeting cards", () => this.activateSidebar());

		p.addCommand({ id: "open-cards-sidebar", name: "Open meeting cards sidebar", callback: () => this.activateSidebar() });
		p.addCommand({ id: "new-org-board", name: "Create new org board", callback: () => this.createBoard() });
		p.addCommand({
			id: "insert-recall",
			name: "Insert recall for a card…",
			callback: () => {
				const cards = this.store.getCards().filter(c => c.status === "open");
				new CardSuggestModal(this.app, cards, c => this.insertRecall(c)).open();
			},
		});
		p.addCommand({ id: "assign-missing-ids", name: "Assign missing card ids & fix card blocks in minutes folder", callback: () => this.assignAllMissingIds() });
		p.addCommand({ id: "reindex-cards", name: "Re-index meeting cards", callback: () => this.store.reindexAll() });
		p.addCommand({ id: "card-syntax-help", name: "Show card syntax help", callback: () => this.showHelp() });

		reg(this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
			const folder = file instanceof TFolder ? file : file.parent;
			if (!folder) return;
			menu.addItem(item =>
				item.setTitle("New org board").setIcon("layout-dashboard").onClick(() => this.createBoard(folder.path)),
			);
		}));

		// cursor -> heading path (sidebar highlight / context feed)
		p.registerEditorExtension(EditorView.updateListener.of(update => {
			if (!update.selectionSet && !update.docChanged) return;
			const info = update.state.field(editorInfoField, false);
			const editor = info?.editor;
			if (!editor || !info.file) return;
			const file = info.file;
			this.scheduleCursor(() => editor.getValue(), () => editor.getCursor().line, file);
			if (update.docChanged) this.store.scheduleFromEditor(file, () => editor.getValue());
		}));
		reg(this.app.workspace.on("active-leaf-change", leaf => {
			const v = leaf?.view;
			if (v instanceof MarkdownView) {
				this.lastMarkdown = v;
				if (v.file) this.scheduleCursor(() => v.editor.getValue(), () => v.editor.getCursor().line, v.file);
			}
		}));

		this.app.workspace.onLayoutReady(() => void this.store.reindexAll());
	}

	unload(): void {
		this.store.destroy();
		this.autoId.destroy();
		if (this.cursorTimer) window.clearTimeout(this.cursorTimer);
	}

	// ---------- cursor scope ----------

	private scheduleCursor(text: () => string, line: () => number, file: TFile): void {
		if (this.cursorTimer) window.clearTimeout(this.cursorTimer);
		this.cursorTimer = window.setTimeout(() => {
			this.cursorTimer = null;
			const slug = this.store.inScope(file.path) ? hierarchyAt(text(), line()).slug : "";
			if (slug !== this.cursorSlug) {
				this.cursorSlug = slug;
				this.cursorEvents.trigger("scope", slug);
			}
		}, 200);
	}

	onCursorScope(cb: (slug: string) => void): () => void {
		const ref = this.cursorEvents.on("scope", cb as (...data: unknown[]) => unknown);
		return () => this.cursorEvents.offref(ref);
	}

	currentCursorScope(): string {
		return this.cursorSlug;
	}

	// ---------- topic ordering (same rules as the v1 tree) ----------

	compareTopics(a: string, b: string): number {
		const pa = this.priority(a);
		const pb = this.priority(b);
		return pa !== pb ? pa - pb : a.localeCompare(b);
	}

	private priority(name: string): number {
		const s = this.settings();
		const lower = name.toLowerCase();
		const before = s.priorityBefore.findIndex(t => t.toLowerCase() === lower);
		if (before !== -1) return before;
		if (s.cities.some(c => lower.includes(c.toLowerCase()))) return s.priorityBefore.length;
		const after = s.priorityAfter.findIndex(t => t.toLowerCase() === lower);
		if (after !== -1) return s.priorityBefore.length + 1 + after;
		return Number.MAX_SAFE_INTEGER;
	}

	// ---------- actions ----------

	async activateSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CARDS);
		if (existing.length) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_CARDS, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	private targetEditorView(): MarkdownView | null {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) return active;
		if (this.lastMarkdown && this.lastMarkdown.file && this.app.workspace.getLeavesOfType("markdown").some(l => l.view === this.lastMarkdown)) {
			return this.lastMarkdown;
		}
		return null;
	}

	showHelp(): void {
		new CardHelpModal(this.app, this.settings().minutesDir).open();
	}

	insertRecall(card: CardNode): void {
		const view = this.targetEditorView();
		const origin = this.app.vault.getAbstractFileByPath(card.filePath);
		if (!view || !view.file) {
			new Notice("Open a meeting note first, then insert the recall.");
			return;
		}
		if (!(origin instanceof TFile)) return;
		const linktext = this.app.metadataCache.fileToLinktext(origin, view.file.path, true);
		const alias = card.title.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
		const recall = `[[${linktext}#^${card.id}|${alias}]] %%recall:${formatTimestamp(new Date())}%%`;

		// Write the recall under the card's own heading path, adding missing headings (e.g. "## b").
		const editor = view.editor;
		const plan = planRecallInsert(editor.getValue(), editor.getCursor().line, card.hierarchy, recall);
		editor.replaceRange(plan.text, plan.from, plan.to);
		editor.setCursor(plan.cursor);
		if (plan.addedHeadings.length) new Notice(`Added missing heading${plan.addedHeadings.length > 1 ? "s" : ""}: ${plan.addedHeadings.join(" › ")}`);
		this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		editor.focus();
	}

	async openCard(card: CardNode): Promise<void> {
		await this.openLocation(card.filePath, card.titleLine);
	}

	async openLocation(path: string, line: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType("markdown").find(l => (l.view as MarkdownView).file?.path === path);
		if (!leaf) {
			const recent = workspace.getMostRecentLeaf();
			leaf = recent && recent.view instanceof MarkdownView ? recent : workspace.getLeaf("tab");
			await leaf.openFile(file);
		}
		workspace.setActiveLeaf(leaf, { focus: true });
		const v = leaf.view;
		if (v instanceof MarkdownView) {
			const pos = { line, ch: 0 };
			v.editor.setCursor(pos);
			v.editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}

	async reissueId(card: CardNode): Promise<void> {
		const newId = newCardId(this.store.allIds());
		await this.mutator.apply(card.filePath, text => {
			const eol = text.includes("\r\n") ? "\r\n" : "\n";
			const lines = text.split(/\r?\n/);
			const re = new RegExp(`(^|\\s)\\^${card.id}(?=\\s|$)`);
			// prefer the recorded line, else the last occurrence in the file
			let idx = re.test(lines[card.titleLine] ?? "") ? card.titleLine : -1;
			if (idx === -1) for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) { idx = i; break; }
			if (idx === -1) return text;
			lines[idx] = lines[idx].replace(re, `$1^${newId}`);
			return lines.join(eol);
		});
		new Notice(`Card re-issued as ^${newId}`);
	}

	/** Assign missing ids AND separate prose from title lines (so ^ids are real blocks) in every minutes file. */
	async assignAllMissingIds(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles().filter(f => this.store.inScope(f.path));
		let ids = 0;
		let touched = 0;
		for (const f of files) {
			const parsed = this.store.getParsed(f.path)?.parsed;
			if (parsed && parsed.cards.length === 0) continue;
			const changed = await this.mutator.apply(f.path, text => {
				const r = assignMissingIds(text, null, this.store.allIds());
				ids += r.assigned.length;
				return r.text;
			});
			if (changed) touched++;
		}
		new Notice(touched ? `Assigned ${ids} card id(s), updated ${touched} note(s)` : "All cards already have ids and valid blocks");
	}

	async createBoard(folderPath?: string): Promise<void> {
		const folder = folderPath ?? this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? "").path;
		const base = folder && folder !== "/" ? folder + "/" : "";
		let name = "Operations";
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(normalizePath(`${base}${name}.${ORGBOARD_EXT}`))) name = `Operations ${i++}`;
		const file = await this.app.vault.create(normalizePath(`${base}${name}.${ORGBOARD_EXT}`), serializeBoard(DEFAULT_BOARD));
		await this.app.workspace.getLeaf("tab").openFile(file);
	}
}
