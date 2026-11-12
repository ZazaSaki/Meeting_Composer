// In-app guide to the v2 text syntax (cards, recalls, boards). Shown in the settings tab,
// in a modal (command + "?" button in the cards sidebar). Kept in sync with core/syntax.ts.

import { App, Component, MarkdownRenderer, Modal } from "obsidian";

const FENCE = "```";

export function cardHelpMarkdown(minutesDir: string): string {
	const dir = minutesDir.trim() || "Atas";
	return [
		"## 1. Open a card",
		`In a note inside the **\`${dir}/\`** folder, write a heading (\`#\`, \`##\` or \`###\`). On the **first line under it**, write the card title followed by **\`#open-card\`**:`,
		"",
		FENCE + "markdown",
		"# Aveiro",
		"## University of Aveiro",
		"Confirm lab equipment budget #open-card #calling",
		"",
		"Vendor quote is €4,500. Ask for a discount.",
		"- Contact: Prof. Silva",
		FENCE,
		"",
		"- The card **title** is that line without the tags.",
		"- Everything below it (until the next heading, a `---` line or a recall line) is the card's **description**.",
		"- Other tags on the title line (`#calling`, `#urgent`, `#waiting`…) are **operational tags**. Boards use them for their columns.",
		"- The headings above the card (`Aveiro › University of Aveiro`) are its **place** in the organization tree.",
		"- `#open-ticket` works the same as `#open-card`.",
		"",
		"## 2. The card id (added for you)",
		"When your cursor **leaves the title line**, the plugin adds an id at the end of the line:",
		"",
		FENCE + "markdown",
		"Confirm lab equipment budget #open-card #calling ^card-k3x9f2",
		FENCE,
		"",
		"Don't edit or delete the `^card-…` part: it's how recalls and boards find the card. Ctrl+Z won't remove it. Notes written before you installed v2 have no ids yet: run the command **Assign missing card ids & fix card blocks in minutes folder** once.",
		"",
		"## 3. Close a card",
		"Change `#open-card` to **`#closed-card`** on the title line (or `#closed-ticket`):",
		"",
		FENCE + "markdown",
		"Confirm lab equipment budget #closed-card #calling ^card-k3x9f2",
		FENCE,
		"",
		"To re-open it, change it back to `#open-card`. A plain `#closed` does **not** count.",
		"",
		"## 4. Follow up in a later meeting (recall)",
		"In the new meeting note, put your cursor where you want the follow-up. Open the **Meeting cards** sidebar (ribbon icon), go to **Context cards** and click **Insert recall** on the card. Or use the command **Insert recall for a card…**. This inserts:",
		"",
		FENCE + "markdown",
		"[[2026-11-04 Meeting#^card-k3x9f2|Confirm lab equipment budget]] %%recall:2026-11-11 14:30%%",
		"Vendor sent a new quote: €4,150.",
		FENCE,
		"",
		"- Write your follow-up notes on the lines **below** it. They become part of the card's history.",
		"- The `%%recall:…%%` part is hidden in reading view. Keep it: it marks the line as a recall.",
		"- To **close the card from here**, add `#closed-card` at the end of the recall line. The original card is closed once. If you re-open it by hand later, it stays open.",
		"",
		"## 5. See your cards",
		"- **Meeting cards sidebar** (ribbon icon or command *Open meeting cards sidebar*):",
		"  - **Organization tree** shows each heading with its number of open cards.",
		"  - **Context cards** lists the cards for the heading your cursor is under, or for the branch you click in the tree.",
		"- **Boards**: command *Create new org board*, or right-click a folder › *New org board*. Drag cards between columns and the plugin rewrites the tags in your note. Click a card to edit it or read its history. Use **＋ Column** to add a column.",
		"",
		"## Cheat sheet",
		"| You want to… | Write / do |",
		"|---|---|",
		"| Open a card | First line under a heading: `Title #open-card` |",
		"| Tag a card | Add tags on the title line: `#calling #urgent` |",
		"| Close a card | `#open-card` → `#closed-card` |",
		"| Follow up later | Sidebar › Context cards › **Insert recall**, then write below the link |",
		"| Close from a follow-up | Add `#closed-card` at the end of the recall line |",
		"| Fix old notes | Command *Assign missing card ids & fix card blocks in minutes folder* |",
		"| Not seeing a card? | It must be in the minutes folder, on the first non-empty line under a `#`/`##`/`###` heading, with `#open-card` exactly |",
	].join("\n");
}

export async function renderCardHelp(app: App, el: HTMLElement, component: Component, minutesDir: string): Promise<void> {
	el.addClass("mc2-help");
	await MarkdownRenderer.render(app, cardHelpMarkdown(minutesDir), el, "", component);
}

export class CardHelpModal extends Modal {
	private component = new Component();

	constructor(app: App, private minutesDir: string) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Meeting Composer: how to write cards");
		this.modalEl.addClass("mc2-help-modal");
		this.component.load();
		void renderCardHelp(this.app, this.contentEl.createDiv(), this.component, this.minutesDir);
	}

	onClose(): void {
		this.component.unload();
		this.contentEl.empty();
	}
}
