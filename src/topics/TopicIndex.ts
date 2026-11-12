// Owns the parsed topic data in memory and the UI state shared by the Topics views.
// Replaces the old loadTree/reloadTree/printSearch code and its module globals; nothing is written to the vault.

import { App, Events, EventRef, MarkdownView, TFile, TFolder } from "obsidian";
import { ResultEntry, TopicNode, TopicParser, TopicQuery } from "./types";
import { runQuery } from "./topicModel";

export class TopicIndex extends Events {
	roots: TopicNode[] = [];
	ready = false;
	/** Global (false) or sector-scoped (true) search for tree clicks. */
	scoped = false;
	private generation = 0;
	private timer: number | null = null;

	constructor(private app: App, readonly parser: TopicParser, private minutesDir: () => string) {
		super();
	}

	on(name: "changed" | "scope-changed", cb: () => void): EventRef {
		return super.on(name, cb);
	}

	/** Re-read every minutes file and rebuild the tree. Overlapping calls: only the latest one wins. */
	async rebuild(): Promise<void> {
		const gen = ++this.generation;
		const dir = this.minutesDir().replace(/\/+$/, "");
		const texts: { name: string; path: string; text: string }[] = [];

		let folder = this.app.vault.getAbstractFileByPath(dir);
		if (!folder && dir) {
			try {
				await this.app.vault.createFolder(dir);
			} catch {
				/* created concurrently, or not creatable: treat as empty */
			}
			folder = this.app.vault.getAbstractFileByPath(dir);
		}
		if (folder instanceof TFolder) {
			// Files open in an editor: use the live text (the rebuild can run before the ~2 s autosave).
			const live = new Map<string, string>();
			this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
				const v = leaf.view;
				if (v instanceof MarkdownView && v.file) live.set(v.file.path, v.editor.getValue());
			});
			for (const child of folder.children) {
				if (!(child instanceof TFile) || child.extension !== "md") continue;
				const text = live.get(child.path) ?? (await this.app.vault.cachedRead(child));
				texts.push({ name: child.basename.trim(), path: child.path.replace(/\.md$/, ""), text });
			}
		}
		if (gen !== this.generation) return; // a newer rebuild started while we were reading

		this.parser.resetTree();
		for (const t of texts) this.parser.AppendToExistingTree(t.text, t.name, t.path);
		this.roots = this.parser.GenerateTopicTree(false).children ?? [];
		this.ready = true;
		this.trigger("changed");
	}

	scheduleRebuild(delay = 1000): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.rebuild();
		}, delay);
	}

	cancelScheduled(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
	}

	setScoped(scoped: boolean): void {
		this.scoped = scoped;
		this.trigger("scope-changed");
	}

	query(q: TopicQuery): ResultEntry[] {
		return runQuery(this.parser, q);
	}

	toMarkdown(entries: ResultEntry[]): string {
		return this.parser.convertOrganizedTopicToMD(entries);
	}

	topicNames(): string[] {
		return this.parser.getAllTopicNames();
	}
}
