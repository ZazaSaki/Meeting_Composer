// Auto-appends ^card-xxxxxx to trigger lines once the cursor leaves them (spec §2.2, review fix #17)
// and keeps the title line its own Markdown block (review fix #1).
//
// The change is dispatched to CodeMirror with addToHistory=false so Ctrl+Z goes straight to the
// user's own edits instead of fighting the listener (undo would otherwise remove the id, the
// listener would add it back, and so on).

import { Editor, MarkdownView, Plugin, TFile, editorInfoField } from "obsidian";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { assignMissingIds } from "../core/autoId";
import { VaultCardStore } from "../store/VaultCardStore";

const DELAY_MS = 400;

export class AutoIdListener {
	private timer: number | null = null;

	constructor(private plugin: Plugin, private store: VaultCardStore, private enabled: () => boolean) {}

	register(): void {
		const { app } = this.plugin;
		this.plugin.registerEvent(app.workspace.on("editor-change", (editor, info) => {
			if (info.file) this.schedule(editor, info.file);
		}));
		this.plugin.registerEditorExtension(EditorView.updateListener.of(update => {
			if (!update.selectionSet || update.docChanged) return;
			const info = update.state.field(editorInfoField, false);
			if (info?.editor && info.file) this.schedule(info.editor, info.file);
		}));
		this.plugin.registerEvent(app.workspace.on("active-leaf-change", () => {
			// leaving a note: no cursor to protect any more
			for (const leaf of app.workspace.getLeavesOfType("markdown")) {
				const v = leaf.view;
				if (v instanceof MarkdownView && v.file && leaf !== app.workspace.getMostRecentLeaf()) {
					this.run(v.editor, v.file, null);
				}
			}
		}));
	}

	private schedule(editor: Editor, file: TFile): void {
		if (this.timer) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.run(editor, file, editor.getCursor().line);
		}, DELAY_MS);
	}

	run(editor: Editor, file: TFile, cursorLine: number | null): void {
		if (!this.enabled() || !this.store.inScope(file.path)) return;
		const before = editor.getValue();
		const result = assignMissingIds(before, cursorLine, this.store.allIds());
		if (result.edits.length === 0) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const cm = (editor as any).cm as EditorView | undefined;
		if (cm && typeof cm.dispatch === "function") {
			const doc = cm.state.doc;
			cm.dispatch({
				changes: result.edits.map(e => {
					const line = doc.line(e.line + 1);
					return { from: line.from + e.fromCh, to: line.from + e.toCh, insert: e.insert };
				}),
				annotations: Transaction.addToHistory.of(false),
			});
		} else {
			editor.transaction({
				changes: result.edits.map(e => ({
					from: { line: e.line, ch: e.fromCh },
					to: { line: e.line, ch: e.toCh },
					text: e.insert,
				})),
			});
		}
		this.store.indexNow(file, result.text);
	}

	destroy(): void {
		if (this.timer) window.clearTimeout(this.timer);
	}
}
