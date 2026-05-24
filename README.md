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

## Settings

| Setting | Default | Description |
|---|---|---|
| Minutes directory | `Atas` | Vault-relative path to the folder containing your `.md` meeting files |
| Output file name | `output.md` | Name of the file where search results are written |
| Output directory | `Meeting_Composer_Search/` | Vault-relative path where the output file is stored |

## Installation

### From the community plugin list
Search for **Meeting Composer** in Settings → Community plugins.

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Copy them to `<vault>/.obsidian/plugins/meeting-composer/`.
3. Reload Obsidian and enable the plugin in Settings → Community plugins.

## Requirements

- Obsidian **0.15.0** or later
- Desktop only (uses filesystem access to write output files)

## Development

```bash
git clone https://github.com/ZazaSaki/Meeting_Composer
cd Meeting_Composer
git submodule update --init --recursive
npm install
npm run dev       # watch mode
npm run build     # production build
```
