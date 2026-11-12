// Reactive in-memory card index over the minutes folder.
// Re-indexes only the changed file (debounced per file) and emits "updated".

import { App, Events, TAbstractFile, TFile } from "obsidian";
import { parseFile } from "../core/cardParser";
import { buildCardIndex, CardIndex, IndexedFile } from "../core/cardIndex";
import { dateFromFileName, formatDate } from "../core/syntax";
import { CardNode, HierarchyPath } from "../types";

export interface StoreScope {
	minutesDir: string;
	outputDir: string;
}

const DEBOUNCE_MS = 250;

export class VaultCardStore extends Events {
	private files = new Map<string, IndexedFile>();
	private index: CardIndex = buildCardIndex([]);
	private timers = new Map<string, number>();
	private rebuildTimer: number | null = null;
	ready = false;

	constructor(private app: App, private getScope: () => StoreScope) {
		super();
	}

	inScope(path: string): boolean {
		if (!path.endsWith(".md")) return false;
		const { minutesDir, outputDir } = this.getScope();
		const dir = minutesDir.replace(/\/+$/, "");
		const out = outputDir.replace(/\/+$/, "");
		if (out && (path === out || path.startsWith(out + "/"))) return false;
		return dir === "" || path.startsWith(dir + "/");
	}

	/** Full scan. Call once on layout ready and whenever the minutes folder setting changes. */
	async reindexAll(): Promise<void> {
		this.files.clear();
		const mdFiles = this.app.vault.getMarkdownFiles().filter(f => this.inScope(f.path));
		await Promise.all(mdFiles.map(async f => this.indexText(f, await this.app.vault.cachedRead(f))));
		this.rebuild();
		this.ready = true;
	}

	/** Wire vault / metadata events. `register` is Plugin.registerEvent. */
	attach(register: (ref: ReturnType<Events["on"]>) => void): void {
		register(this.app.metadataCache.on("changed", (file, data) => {
			if (this.inScope(file.path)) this.schedule(file, data);
		}));
		register(this.app.vault.on("delete", (f: TAbstractFile) => {
			if (this.files.delete(f.path)) this.scheduleRebuild();
		}));
		register(this.app.vault.on("rename", (f: TAbstractFile, oldPath: string) => {
			const had = this.files.delete(oldPath);
			if (f instanceof TFile && this.inScope(f.path)) {
				this.app.vault.cachedRead(f).then(t => {
					this.indexText(f, t);
					this.scheduleRebuild();
				});
			} else if (had) this.scheduleRebuild();
		}));
		register(this.app.vault.on("create", (f: TAbstractFile) => {
			if (f instanceof TFile && this.inScope(f.path)) {
				this.app.vault.cachedRead(f).then(t => this.schedule(f, t));
			}
		}));
	}

	/** Live re-index from an open editor (before Obsidian saves the file). Text is read when the timer fires. */
	scheduleFromEditor(file: TFile, getText: () => string): void {
		if (this.inScope(file.path)) this.schedule(file, getText);
	}

	private schedule(file: TFile, data: string | (() => string)): void {
		const prev = this.timers.get(file.path);
		if (prev) window.clearTimeout(prev);
		this.timers.set(file.path, window.setTimeout(() => {
			this.timers.delete(file.path);
			this.indexText(file, typeof data === "string" ? data : data());
			this.rebuild();
		}, DEBOUNCE_MS));
	}

	private scheduleRebuild(): void {
		if (this.rebuildTimer) window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			this.rebuild();
		}, DEBOUNCE_MS);
	}

	/** Index a file immediately (used by mutators so the UI updates without waiting for the cache). */
	indexNow(file: TFile, text: string): void {
		this.indexText(file, text);
		this.rebuild();
	}

	private indexText(file: TFile, text: string): void {
		this.files.set(file.path, {
			parsed: parseFile(text, file.path),
			openedAt: dateFromFileName(file.basename) ?? formatDate(new Date(file.stat.ctime)),
		});
	}

	private rebuild(): void {
		const resolve = (linkPath: string, source: string) =>
			this.app.metadataCache.getFirstLinkpathDest(linkPath, source)?.path ?? null;
		this.index = buildCardIndex([...this.files.values()], resolve);
		this.trigger("updated");
	}

	destroy(): void {
		this.timers.forEach(t => window.clearTimeout(t));
		if (this.rebuildTimer) window.clearTimeout(this.rebuildTimer);
	}

	// ---------- queries ----------

	getCards(): CardNode[] {
		return [...this.index.cards.values()];
	}

	getCard(id: string): CardNode | undefined {
		return this.index.cards.get(id);
	}

	getDuplicates(): CardNode[] {
		return this.index.duplicates;
	}

	allIds(): Set<string> {
		return this.index.allIds;
	}

	getUnassigned(): CardIndex["unassigned"] {
		return this.index.unassigned;
	}

	getAllPaths(): HierarchyPath[] {
		const out: HierarchyPath[] = [];
		this.files.forEach(f => out.push(...f.parsed.paths));
		return out;
	}

	getParsed(path: string): IndexedFile | undefined {
		return this.files.get(path);
	}
}
