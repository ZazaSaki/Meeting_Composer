// Applies pure text mutations to vault files.
//  * File open in an editor  -> one minimal editor change (cursor-safe). User actions (board, drawer)
//                               are undoable; automatic ones (remote close/re-open) pass
//                               { undoable: false } so Ctrl+Z can't silently revert them.
//  * Otherwise               -> app.vault.process (atomic read-modify-write).
// No "pendingWrites" echo suppression: every mutation is idempotent and the store re-index is too.

import { App, MarkdownView, Notice, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { minimalChange } from "../core/diff";
import * as M from "../core/mutations";
import { CardNode, HeadingSegment } from "../types";
import { VaultCardStore } from "../store/VaultCardStore";

export class MarkdownMutator {
	constructor(private app: App, private store: VaultCardStore) {}

	private openView(path: string): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const v = leaf.view;
			if (v instanceof MarkdownView && v.file?.path === path) return v;
		}
		return null;
	}

	/** Returns true when the file changed. */
	async apply(filePath: string, fn: (text: string) => string, opts: { undoable?: boolean } = {}): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice(`Meeting Composer: file not found: ${filePath}`);
			return false;
		}
		try {
			const view = this.openView(filePath);
			if (view) {
				const editor = view.editor;
				const before = editor.getValue();
				const after = fn(before);
				const change = minimalChange(before, after);
				if (!change) return false;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cm = (editor as any).cm as EditorView | undefined;
				if (opts.undoable === false && cm && typeof cm.dispatch === "function") {
					cm.dispatch({
						changes: { from: change.start, to: change.end, insert: change.insert },
						annotations: Transaction.addToHistory.of(false),
					});
				} else {
					editor.replaceRange(change.insert, editor.offsetToPos(change.start), editor.offsetToPos(change.end));
				}
				this.store.indexNow(file, after);
				return true;
			}
			let changed = false;
			const result = await this.app.vault.process(file, data => {
				const next = fn(data);
				changed = next !== data;
				return next;
			});
			if (changed) this.store.indexNow(file, result);
			return changed;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Meeting Composer: ${msg}`);
			console.error("Meeting Composer mutation failed", e);
			return false;
		}
	}

	setStatus(card: CardNode, status: "open" | "closed", opts: { undoable?: boolean } = {}) {
		return this.apply(card.filePath, t => M.setStatus(t, card.id, status), opts);
	}

	addTag(card: CardNode, tag: string) {
		return this.apply(card.filePath, t => M.addTag(t, card.id, tag));
	}

	removeTag(card: CardNode, tag: string) {
		return this.apply(card.filePath, t => M.removeTag(t, card.id, tag));
	}

	setTitle(card: CardNode, title: string) {
		return this.apply(card.filePath, t => M.setTitle(t, card.id, title));
	}

	setDescription(card: CardNode, description: string) {
		return this.apply(card.filePath, t => M.setDescription(t, card.id, description));
	}

	moveToHeading(card: CardNode, target: HeadingSegment[]) {
		return this.apply(card.filePath, t => M.moveCardToHeading(t, card.id, target));
	}

	/** Several transforms on one file in a single write. */
	applyAll(card: CardNode, fns: ((text: string) => string)[]) {
		return this.apply(card.filePath, t => fns.reduce((acc, f) => f(acc), t));
	}
}
