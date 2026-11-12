# Meeting Composer

An Obsidian plugin that scans your meeting minutes and lets you navigate all topics across every file from a sidebar topic tree.

## How it works

1. Write your meeting minutes as markdown files in a configured folder (default: `Atas/`). Use headings (`#`, `##`, etc.) to structure topics — the plugin parses the heading hierarchy to build a topic index.
2. Open the **Topic Tree** panel from the ribbon icon. The sidebar shows every topic and sub-topic found across all your minutes files, sorted by priority and then alphabetically.
3. Click any topic in the tree to compile all content related to that topic into an output note (`Meeting_Composer_Search/output.md`). Each entry links back to its source file via Obsidian wiki-links.

## Features

- **Topic tree sidebar** — hierarchical view of all topics found across all meeting files, with expand/collapse navigation
- **Cross-file search** — clicking a topic aggregates matching content from every meeting file, sorted chronologically
- **City-scoped search** — toggle between 🌐 Global (all files) and 📍 Scoped (only results within the selected city's context) using the button in the tree panel
- **Source links** — each result includes a wiki-link to the original heading in the source file
- **Manual search** — the Meeting Composer panel also accepts free-text topic or `#tag` searches
- **Refresh** — re-scan the minutes folder at any time with the ⟳ button or the Reload button in settings

## v2: cards, recalls and boards

Everything below lives in your meeting notes — no external database. The v1 Topic Tree and search keep working unchanged.

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

Ribbon icon **Open meeting cards**. Tab 1 is the organization tree with open-card counts (the heading under your cursor is highlighted). Tab 2 lists the cards for the selected branch or the heading under your cursor, with Open/Closed/All, search and *Insert recall*.

### `.orgboard` boards

Command **Create new org board** (or right-click a folder → *New org board*). A board is a JSON file with several views (presets):

- `kanban` or `matrix` layout; columns match `status` (`open`/`closed`), a `tag` (optionally with `requiredTags`), or a `header` path (`aveiro/city-council`).
- Each card appears in exactly one column: closed → closed column; else the most specific tag column (rightmost on ties); else the matching header column; else the open column.
- Dragging a card rewrites its Markdown: tag columns swap tags, status columns swap `#open-card`/`#closed-card`, header columns move the card (and its own sub-heading) under that heading in the same note, creating the heading if needed.
- Click a card to edit title, description and tags, and to read its recall history.
- Use **＋ Column** or **{ } JSON** in the toolbar to change views.

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
| Output file name | `output.md` | Name of the file where search results are written |
| Output directory | `Meeting_Composer_Search/` | Vault-relative path where the output file is stored (never indexed for cards) |
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
- Desktop only (uses filesystem access to write output files)

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
