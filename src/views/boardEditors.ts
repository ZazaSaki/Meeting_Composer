// Forms for editing .orgboard files without touching JSON: columns ("boxes"), views (tabs) and
// new boards. Pure board edits live in core/boardOps.ts; these modals only collect input.

import { App, Modal, Setting } from "obsidian";
import { BoardColumnRule, BoardScopeFilter, BoardViewPreset } from "../types";
import { formatTagList, parseTagList, ViewStart } from "../core/boardOps";
import { TreeNode } from "../core/tree";
import { HeadingSuggestModal } from "./modals";

type RuleType = BoardColumnRule["ruleType"];

function errorLine(el: HTMLElement): (msg: string) => void {
	const err = el.createDiv({ cls: "mc2-error mc2-form-error" });
	return msg => err.setText(msg);
}

/** Two-step delete button: first click arms it, second click confirms. */
function addDeleteButton(setting: Setting, label: string, onConfirm: () => void): void {
	setting.addButton(b => {
		let armed = false;
		b.setButtonText(label).setWarning().onClick(() => {
			if (armed) return onConfirm();
			armed = true;
			b.setButtonText("Click again to delete");
		});
	});
}

// ---------------------------------------------------------------- column

export interface ColumnDraft {
	id?: string;
	title: string;
	ruleType: RuleType;
	ruleValue: string;
	requiredTags?: string[];
	color?: string;
}

export interface ColumnEditOptions {
	column?: BoardColumnRule; // undefined → new column
	defaultType: RuleType;
	headings: TreeNode[];
	onSave: (draft: ColumnDraft) => void;
	onDelete?: () => void;
}

export class ColumnEditModal extends Modal {
	private title: string;
	private ruleType: RuleType;
	private tagText: string;
	private status: "open" | "closed";
	private headingSlug: string;
	private requiredText: string;
	private color: string | undefined;

	constructor(app: App, private opts: ColumnEditOptions) {
		super(app);
		const c = opts.column;
		this.title = c?.title ?? "";
		this.ruleType = c?.ruleType ?? opts.defaultType;
		this.tagText = c?.ruleType === "tag" ? c.ruleValue : "";
		this.status = c?.ruleType === "status" && c.ruleValue === "closed" ? "closed" : "open";
		this.headingSlug = c?.ruleType === "header" ? c.ruleValue : "";
		this.requiredText = formatTagList(c?.requiredTags);
		this.color = c?.color;
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.column ? `Edit column “${this.opts.column.title}”` : "New column");
		this.modalEl.addClass("mc2-form-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const el = this.contentEl;
		el.empty();

		new Setting(el)
			.setName("Name")
			.setDesc("Shown at the top of the column. Leave empty to use the tag or heading.")
			.addText(t => t.setValue(this.title).setPlaceholder("e.g. Calling queue").onChange(v => (this.title = v)));

		new Setting(el)
			.setName("Shows cards that…")
			.addDropdown(d =>
				d
					.addOption("tag", "have a tag")
					.addOption("status", "are open / closed")
					.addOption("header", "are under a heading")
					.setValue(this.ruleType)
					.onChange(v => {
						this.ruleType = v as RuleType;
						this.render();
					}),
			);

		if (this.ruleType === "tag") {
			new Setting(el)
				.setName("Tag")
				.setDesc("Dragging a card here adds this tag (and removes the tag of the column it came from).")
				.addText(t => t.setValue(this.tagText).setPlaceholder("#calling").onChange(v => (this.tagText = v)));
		} else if (this.ruleType === "status") {
			new Setting(el)
				.setName("Status")
				.setDesc("Dragging a card here switches it to #open-card / #closed-card.")
				.addDropdown(d =>
					d
						.addOption("open", "Open (#open-card)")
						.addOption("closed", "Closed (#closed-card)")
						.setValue(this.status)
						.onChange(v => (this.status = v as "open" | "closed")),
				);
		} else {
			const label = this.headingLabel();
			new Setting(el)
				.setName("Heading")
				.setDesc(label ? `Selected: ${label}. Dragging a card here moves it under this heading in its note.` : "Dragging a card here moves it under this heading in its note.")
				.addText(t => t.setValue(this.headingSlug).setPlaceholder("aveiro/city-council").onChange(v => (this.headingSlug = v)))
				.addButton(b =>
					b.setButtonText("Pick…").onClick(() =>
						new HeadingSuggestModal(this.app, this.opts.headings, n => {
							this.headingSlug = n.slug;
							if (!this.title.trim()) this.title = n.name;
							this.render();
						}).open(),
					),
				);
		}

		new Setting(el)
			.setName("Also require tags")
			.setDesc("Optional. The card must also have all of these (e.g. #urgent #important for a matrix box). Dropping a card here adds them.")
			.addText(t => t.setValue(this.requiredText).setPlaceholder("#urgent #important").onChange(v => (this.requiredText = v)));

		new Setting(el)
			.setName("Color")
			.setDesc(this.color ? "Top border of the column." : "No color.")
			.addColorPicker(c => c.setValue(this.color ?? "#7f7f7f").onChange(v => (this.color = v)))
			.addExtraButton(b =>
				b.setIcon("rotate-ccw").setTooltip("No color").onClick(() => {
					this.color = undefined;
					this.render();
				}),
			);

		const showError = errorLine(el);
		const buttons = new Setting(el);
		if (this.opts.onDelete) addDeleteButton(buttons, "Delete column", () => {
			this.opts.onDelete?.();
			this.close();
		});
		buttons
			.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(b =>
				b.setButtonText(this.opts.column ? "Save" : "Add column").setCta().onClick(() => {
					const problem = this.save();
					if (problem) showError(problem);
					else this.close();
				}),
			);
	}

	private headingLabel(): string {
		const n = this.opts.headings.find(h => h.slug === this.headingSlug.trim());
		return n ? n.segments.map(s => s.text).join(" › ") : "";
	}

	/** Returns an error message, or null after calling onSave. */
	private save(): string | null {
		const req = parseTagList(this.requiredText);
		if (req.invalid.length) return `Not a valid tag: ${req.invalid.join(", ")}`;
		let ruleValue: string;
		let fallbackTitle: string;
		if (this.ruleType === "tag") {
			const t = parseTagList(this.tagText);
			if (t.invalid.length) return `Not a valid tag: ${t.invalid.join(", ")}`;
			if (t.tags.length !== 1) return t.tags.length ? "Use one tag here; put the others in “Also require tags”." : "Enter a tag, e.g. #calling";
			ruleValue = t.tags[0];
			fallbackTitle = ruleValue;
		} else if (this.ruleType === "status") {
			ruleValue = this.status;
			fallbackTitle = this.status === "open" ? "Open" : "Closed";
		} else {
			ruleValue = this.headingSlug.trim();
			if (!ruleValue) return "Pick a heading.";
			fallbackTitle = this.opts.headings.find(h => h.slug === ruleValue)?.name ?? ruleValue.split("/").pop() ?? ruleValue;
		}
		this.opts.onSave({
			id: this.opts.column?.id,
			title: this.title.trim() || fallbackTitle,
			ruleType: this.ruleType,
			ruleValue,
			requiredTags: req.tags.length ? req.tags : undefined,
			color: this.color,
		});
		return null;
	}
}

// ---------------------------------------------------------------- view

export interface ViewDraft {
	name: string;
	layout: BoardViewPreset["layout"];
	dropMode: BoardViewPreset["dropMode"];
	scopeFilter: BoardScopeFilter;
	start?: ViewStart;
}

export interface ViewEditOptions {
	preset?: BoardViewPreset; // undefined → new view
	currentName?: string; // for "copy of current view"
	headings: TreeNode[];
	onSave: (draft: ViewDraft) => void;
	onDelete?: () => void;
	onMove?: (delta: number) => void;
}

export class ViewEditModal extends Modal {
	private d: ViewDraft;
	private followText: string;
	private hideText: string;

	constructor(app: App, private opts: ViewEditOptions) {
		super(app);
		const p = opts.preset;
		const f = p?.scopeFilter ?? {};
		this.d = {
			name: p?.name ?? "",
			layout: p?.layout ?? "kanban",
			dropMode: p?.dropMode ?? "tag",
			scopeFilter: { ...f, showClosed: f.showClosed ?? true },
			start: p ? undefined : "open-closed",
		};
		this.followText = formatTagList(f.includeTags);
		this.hideText = formatTagList(f.excludeTags);
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.preset ? `Edit view “${this.opts.preset.name}”` : "New view");
		this.modalEl.addClass("mc2-form-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const el = this.contentEl;
		el.empty();
		const d = this.d;

		new Setting(el).setName("Name").addText(t => t.setValue(d.name).setPlaceholder("e.g. Youth calls").onChange(v => (d.name = v)));

		new Setting(el)
			.setName("Layout")
			.addDropdown(x =>
				x
					.addOption("kanban", "Columns side by side")
					.addOption("matrix", "2 × 2 matrix")
					.setValue(d.layout)
					.onChange(v => (d.layout = v as ViewDraft["layout"])),
			);

		new Setting(el)
			.setName("Dragging a card between columns…")
			.addDropdown(x =>
				x
					.addOption("tag", "changes its tags / status")
					.addOption("header", "moves it under another heading")
					.setValue(d.dropMode)
					.onChange(v => (d.dropMode = v as ViewDraft["dropMode"])),
			);

		if (!this.opts.preset) {
			new Setting(el)
				.setName("Start with")
				.addDropdown(x => {
					x.addOption("open-closed", "Open and Closed columns").addOption("empty", "No columns");
					if (this.opts.currentName) x.addOption("copy", `A copy of “${this.opts.currentName}”`);
					x.setValue(d.start ?? "open-closed").onChange(v => (d.start = v as ViewStart));
				});
		}

		new Setting(el).setName("Which cards").setHeading();

		new Setting(el)
			.setName("Followed tags")
			.setDesc("Only show cards with at least one of these tags. Leave empty to show every card. Cards that match a column's tag always show.")
			.addText(t => t.setValue(this.followText).setPlaceholder("#calling #youth").onChange(v => (this.followText = v)));

		new Setting(el)
			.setName("Hidden tags")
			.setDesc("Never show cards with any of these tags.")
			.addText(t => t.setValue(this.hideText).setPlaceholder("#private").onChange(v => (this.hideText = v)));

		const scope = d.scopeFilter.hierarchyPrefix ?? "";
		const scopeNode = this.opts.headings.find(h => h.slug === scope.trim());
		new Setting(el)
			.setName("Only under heading")
			.setDesc(scopeNode ? `Selected: ${scopeNode.segments.map(s => s.text).join(" › ")}` : "Optional, e.g. only cards under # Aveiro.")
			.addText(t => t.setValue(scope).setPlaceholder("aveiro").onChange(v => (d.scopeFilter.hierarchyPrefix = v)))
			.addButton(b =>
				b.setButtonText("Pick…").onClick(() =>
					new HeadingSuggestModal(this.app, this.opts.headings, n => {
						d.scopeFilter.hierarchyPrefix = n.slug;
						this.render();
					}).open(),
				),
			)
			.addExtraButton(b =>
				b.setIcon("x").setTooltip("Any heading").onClick(() => {
					d.scopeFilter.hierarchyPrefix = undefined;
					this.render();
				}),
			);

		new Setting(el)
			.setName("Show closed cards")
			.setDesc("A “Closed” column always shows them.")
			.addToggle(t => t.setValue(d.scopeFilter.showClosed !== false).onChange(v => (d.scopeFilter.showClosed = v)));

		const showError = errorLine(el);
		const buttons = new Setting(el);
		if (this.opts.onMove) {
			buttons
				.addExtraButton(b => b.setIcon("arrow-left").setTooltip("Move tab left").onClick(() => this.opts.onMove?.(-1)))
				.addExtraButton(b => b.setIcon("arrow-right").setTooltip("Move tab right").onClick(() => this.opts.onMove?.(1)));
		}
		if (this.opts.onDelete) addDeleteButton(buttons, "Delete view", () => {
			this.opts.onDelete?.();
			this.close();
		});
		buttons
			.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(b =>
				b.setButtonText(this.opts.preset ? "Save" : "Add view").setCta().onClick(() => {
					const problem = this.save();
					if (problem) showError(problem);
					else this.close();
				}),
			);
	}

	private save(): string | null {
		const d = this.d;
		if (!d.name.trim()) return "Give the view a name.";
		const follow = parseTagList(this.followText);
		const hide = parseTagList(this.hideText);
		const bad = [...follow.invalid, ...hide.invalid];
		if (bad.length) return `Not a valid tag: ${bad.join(", ")}`;
		this.opts.onSave({
			...d,
			name: d.name.trim(),
			scopeFilter: {
				...d.scopeFilter,
				includeTags: follow.tags.length ? follow.tags : undefined,
				excludeTags: hide.tags.length ? hide.tags : undefined,
				hierarchyPrefix: d.scopeFilter.hierarchyPrefix?.trim() || undefined,
			},
		});
		return null;
	}
}

// ---------------------------------------------------------------- board

export type BoardTemplate = "examples" | "simple";

export class NewBoardModal extends Modal {
	private name = "";
	private template: BoardTemplate = "simple";

	constructor(app: App, private onCreate: (name: string, template: BoardTemplate) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("New board");
		this.modalEl.addClass("mc2-form-modal");
		const el = this.contentEl;
		const submit = () => {
			const name = this.name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
			if (!name) return showError("Give the board a name.");
			this.onCreate(name, this.template);
			this.close();
		};
		new Setting(el).setName("Name").addText(t => {
			t.setPlaceholder("e.g. Youth").onChange(v => (this.name = v));
			t.inputEl.addEventListener("keydown", e => {
				if (e.key === "Enter") submit();
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(el)
			.setName("Start with")
			.addDropdown(d =>
				d
					.addOption("simple", "One view with Open and Closed columns")
					.addOption("examples", "The example views (workflow, calling queue, matrix)")
					.setValue(this.template)
					.onChange(v => (this.template = v as BoardTemplate)),
			);
		const showError = errorLine(el);
		new Setting(el)
			.addButton(b => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(b => b.setButtonText("Create board").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
