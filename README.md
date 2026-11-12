# Meeting Composer

An Obsidian plugin that scans your meeting minutes and lets you navigate all topics across every file from a sidebar topic tree.

## How it works

1. Write your meeting minutes as markdown files in a configured folder (default: `Atas/`). Use headings (`#`, `##`, etc.) to structure topics — the plugin parses the heading hierarchy to build a topic index.
2. Open the **Topics** sidebar from the ribbon icon (or the command *Open topics sidebar*). It has a search box at the top and every topic and sub-topic from all your minutes below it, grouped into **Organizations**, **Sectors** and **Important topics** — shown as three columns side by side, each scrolling on its own (click a column's heading to fold it into a thin strip) — and sorted by priority, then alphabetically.
3. Click a topic's name to open its full history in the **Topic results** tab: every entry from every meeting file, newest first, each linking back to its heading in the source note. Nothing is written to your vault — results live in memory and update as you edit your minutes.

## Features

- **Topics sidebar** — a native, collapsible tree (Obsidian's own tree styling, indent guides and hover). The arrow (▸) only expands/collapses a topic; clicking the name loads its results. Keyboard: Tab/↑/↓ to move, ←/→ to collapse/expand, Enter to open, Space to toggle. Expanded topics are remembered.
- **Search box** — typing filters the tree to matching topics (with their parents opened and the match highlighted). Press **Enter** (or pick a suggestion) to open the results for that topic, or type `#tag` + Enter to see everything tagged with it. **Esc** clears the box.
- **Topic results tab** — one tab, reused for every search and restored after restarting Obsidian. Shows the path, the number of entries, and each entry's meeting date (a link to the exact heading, with hover preview), tags and rendered notes. Clicking a `#tag` inside the results searches for it. **Ctrl/Cmd-click** a topic or link to open it in a new tab instead.
- **Copy as Markdown** — the copy button in the results header puts the whole compiled history on the clipboard, in the same Markdown format the old `output.md` used.
- **Sector-scoped search** — the 🌐/📍 button in the sidebar header switches between Global (all minutes) and Scoped (clicking a topic under a sector only searches inside that sector).
- **Live refresh** — the tree and the open results rebuild when you write a heading in a minutes file, or when files are added, renamed or removed; the ⟳ button (or *Reload minutes*) re-scans on demand.

### Commands

- Open topics sidebar
- Search topics… (focuses the sidebar's search box)
- Reload minutes (rebuild topic tree)

## v2: cards, recalls and boards

Everything below lives in your meeting notes — no external database. The Topics sidebar and results keep working alongside it.

### Cards

A card opens when the **first non-empty line under a `#`, `##` or `###` heading** carries a lifecycle tag:

```markdown
# Aveiro
## University of Aveiro
### Prof. Silva
Confirm lab equipment budget #open-card #calling ^card-k3x9f2

Initial scope: verify optical sensor quote from vendor.
- Target ceiling: €4,500
```

- Lifecycle tags: `#open-card` / `#open-ticket` (open), `#closed-card` / `#closed-ticket` (closed). A bare `#closed` is ignored.
- The line (without tags and id) is the **title**; other tags (`#calling`, `#urgent`, …) are operational tags.
- When the cursor leaves that line, a random id (`^card-xxxxxx`) is appended. If prose follows directly, a blank line is inserted so the id stays a real Obsidian block (otherwise `[[note#^card-…]]` links don't resolve). The id insertion is not in the undo history.
- Erasing the lifecycle tag undoes the card: once the cursor leaves the line the `^card-…` id is removed too (kept when recalls in other notes link to it, so re-adding `#open-card` restores the card and its history).
- The **description** runs until the next heading, `---`, or recall line.
- Headings are a generic path (H1 › H2 › H3): they can be cities, organizations, people — whatever you use.

### Recalls

From the **Meeting cards** sidebar, *Insert recall* writes this at the cursor:

```markdown
[[2026-11-04 Meeting#^card-k3x9f2|Confirm lab equipment budget]] %%recall:2026-11-11 23:32%%
- Vendor sent revised quote at €4,150.
```

The recall is always written under the card's own heading path: missing headings above the cursor are added first (card under `# Aveiro › ## University of Aveiro`, cursor only under `# Aveiro` → `## University of Aveiro` is inserted before the recall). The timestamp is fixed at insertion; the lines below are collected into the card's history. Adding `#closed-card` at the end of a recall line closes the origin card (once — re-opening it by hand is respected). Erasing that `#closed-card` again re-opens the card, unless another recall that closed it still carries the tag.

### Meeting cards sidebar

Ribbon icon **Open meeting cards**. One panel, top to bottom:

- **Search box** — filters the organization tree by branch name (matches highlighted, parents opened) and the card list by title, text, tag or heading; `#tag` filters the cards only. **Enter** selects the first matching branch, **Esc** clears. Buttons: re-index, collapse all, card syntax help.
- **Organization tree** — native collapsible tree with open-card counts. The arrow only expands/collapses; clicking a branch name shows its cards below. The heading under your editor cursor is marked with a dot. Keyboard: ↑/↓ to move, ←/→ to collapse/expand, Enter to select, Space to toggle.
- **Divider** — drag it (or focus it and use ↑/↓) to resize the tree; double-click resets.
- **Cards** — the cards for the selected branch, or for the heading under your cursor while **Follow cursor** (◎) is on, with Open/Closed/All and *Insert recall*. × goes back to all minutes.

Expanded branches, the selected branch, the status filter, follow mode and the tree height are remembered.

### `.orgboard` boards

Command **Create new org board**, the **＋ Board** button on a board, or right-click a folder → *New org board* (asks for a name; start from one simple view or the example views). A board is a JSON file with several views (presets):

- `kanban` or `matrix` layout; columns match `status` (`open`/`closed`), a `tag` (optionally with `requiredTags`), or a `header` path (`aveiro/city-council`).
- Each card appears in exactly one column: closed → closed column; else the most specific tag column (rightmost on ties); else the matching header column; else the open column.
- Dragging a card rewrites its Markdown: tag columns swap tags, status columns swap `#open-card`/`#closed-card`, header columns move the card (and its own sub-heading) under that heading in the same note, creating the heading if needed.
- Click a card to edit title, description and tags, and to read its recall history.
- **Columns ("boxes")**: **＋ Column** opens a form: name, what it shows (a tag, open/closed status, or a heading), extra required tags and a color. Click a column's name or ✎ to edit or delete it; ‹ › move it.
- **Views (tabs)**: **＋ View** adds one (Open/Closed columns, empty, or a copy of the current view). **⚙** or double-clicking the tab edits it: name, layout, drag behaviour, **followed tags** (only cards with at least one of them show; cards matching a column's tag always show), hidden tags, heading scope, show closed cards, tab order, delete.
- **{ } JSON** is still there for raw edits.

### Commands

- Open meeting cards sidebar
- Create new org board
- Insert recall for a card…
- Assign missing card ids & fix card blocks in minutes folder
- Re-index meeting cards
- Show card syntax help (the same guide is at the top of the plugin settings and behind the **?** button in the Meeting cards sidebar)

## Settings

| Setting | Default | Description |
|---|---|---|
| Minutes directory | `Atas` | Vault-relative path to the folder containing your `.md` meeting files |
| Search autocomplete | on | Suggest topic names in the Topics search box and in heading lines |
| Auto-reload tree on new heading | on | Rebuild the topic tree when a heading is written in a minutes file |
| Auto-assign card ids | on | Append `^card-…` to new card lines when the cursor leaves them |

## Installation

### From the community plugin list
Search for **Meeting Composer** in Settings → Community plugins.

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Copy them to `<vault>/.obsidian/plugins/meeting-composer/`.
3. Reload Obsidian and enable the plugin in Settings → Community plugins.

## Requirements

- Obsidian **1.4.10** or later
- Desktop only (the bundled parser module imports Node's `fs`)

> **Upgrading from 1.x/early 2.0:** search results are no longer written to `Meeting_Composer_Search/output.md`. An old `output.md` is left untouched (you can delete it); that folder is still skipped when indexing cards. Old *Topic Tree* panels in a saved layout turn into the new Topics sidebar automatically.

## Development

```bash
git clone https://github.com/ZazaSaki/Meeting_Composer
cd Meeting_Composer
git submodule update --init --recursive
npm install
npm run dev       # watch mode
npm run build     # type-check v2 code + production build
npm test          # unit tests (vitest)
```
