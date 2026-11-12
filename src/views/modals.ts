import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import { TreeNode } from "../core/tree";
import { CardNode } from "../types";

/** Single text prompt. */
export class PromptModal extends Modal {
	private value = "";
	constructor(app: App, private title: string, private placeholder: string, private onSubmit: (v: string) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		const submit = () => {
			if (this.value.trim()) this.onSubmit(this.value.trim());
			this.close();
		};
		new Setting(this.contentEl).addText(t => {
			t.setPlaceholder(this.placeholder).onChange(v => (this.value = v));
			t.inputEl.addEventListener("keydown", e => {
				if (e.key === "Enter") submit();
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton(b => b.setButtonText("Add").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Raw JSON editor for an .orgboard file. */
export class JsonEditModal extends Modal {
	constructor(app: App, private initial: string, private onSave: (text: string) => string | null) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Edit board JSON");
		const ta = this.contentEl.createEl("textarea", { cls: "mc2-json-editor" });
		ta.value = this.initial;
		ta.rows = 24;
		const err = this.contentEl.createDiv({ cls: "mc2-error" });
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(b =>
				b.setButtonText("Save").setCta().onClick(() => {
					const problem = this.onSave(ta.value);
					if (problem) err.setText(problem);
					else this.close();
				}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Pick a heading path from the organization tree. */
export class HeadingSuggestModal extends FuzzySuggestModal<TreeNode> {
	constructor(app: App, private nodes: TreeNode[], private onPick: (n: TreeNode) => void) {
		super(app);
		this.setPlaceholder("Pick a heading for the new column…");
	}

	getItems(): TreeNode[] {
		return this.nodes;
	}

	getItemText(n: TreeNode): string {
		return n.segments.map(s => s.text).join(" → ");
	}

	onChooseItem(n: TreeNode): void {
		this.onPick(n);
	}
}

/** Pick a card (keyboard recall insertion). */
export class CardSuggestModal extends FuzzySuggestModal<CardNode> {
	constructor(app: App, private cards: CardNode[], private onPick: (c: CardNode) => void) {
		super(app);
		this.setPlaceholder("Insert recall for card…");
	}

	getItems(): CardNode[] {
		return this.cards;
	}

	getItemText(c: CardNode): string {
		return [c.title, ...c.tags].join(" ") + " — " + c.hierarchy.segments.map(s => s.text).join(" → ");
	}

	onChooseItem(c: CardNode): void {
		this.onPick(c);
	}
}

export function flattenTree(root: TreeNode): TreeNode[] {
	const out: TreeNode[] = [];
	const walk = (n: TreeNode) => {
		if (n.slug) out.push(n);
		n.children.forEach(walk);
	};
	walk(root);
	return out;
}
