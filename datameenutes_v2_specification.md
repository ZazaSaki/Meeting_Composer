# DataMeenutes v2 — Product & Technical Specification (Proposal for Review)

> **Document Purpose & AI Handoff Context:** This document outlines the proposed architecture and feature specification for **DataMeenutes v2**, an evolution of an existing custom Obsidian plugin. It is intended to be used as a **structured technical proposal** for an AI coding assistant—both to provide full context on the project's goals and to invite critical review, edge-case detection, and architectural improvements before or during implementation.

---

## 0. Project Background, Current Baseline & AI Execution Directive

### 0.1 What is DataMeenutes?

**DataMeenutes** ("Data Minutes") is a custom Obsidian plugin built to organize and track operational work captured during organizational meetings.

The user's organization operates across nested geographic and institutional tiers, which are mirrored directly in Markdown meeting notes using structural headings:

* `# Heading 1` → **City** (e.g., `# Aveiro`)
* `## Heading 2` → **Organization** (e.g., `## University of Aveiro`)
* `### Heading 3` → **Sub-topic / Sector / Person** (e.g., `### Prof. Silva`)

Originally, external project management tools (such as **Trello** and **Super Productivity** via local REST API / MCP) were evaluated to manage tasks, Kanban boards, Eisenhower matrices, and cross-organization tag views. However, synchronizing hierarchical meeting notes with external apps introduces network/API overhead, tag clutter, and state drift. **DataMeenutes v2** solves this by keeping the entire workflow **100% native inside Obsidian**—turning standard Markdown meeting notes into the single source of truth for a multi-view board system.

### 0.2 What is Already Implemented (Existing Codebase Baseline)

*Note to Reviewing AI: Inspect the existing files in the `DataMeenutes` repository before scaffolding new modules so that new features extend and refactor existing classes cleanly rather than duplicating logic.*

The existing plugin already implements the foundational hierarchy engine:

1. **Header Hierarchy Parser:** Scans Markdown meeting notes to parse `#` (City), `##` (Organization), and `###` (Sub-topic) headings, resolving parent-child relationships and filtering which meeting content belongs to which organizational branch.
2. **Sidebar Hierarchy Tree View:** Renders an interactive, expandable/collapsible tree of cities, organizations, and sub-topics inside Obsidian's sidebar based on the parsed header structure.

### 0.3 How to Use This Plan — Proposal & AI Review Guidelines

Please treat the specification below as an **engineering proposal and architectural suggestion**, not an inflexible contract:

* **Audit & Reconcile First:** Compare the proposed interfaces and module layout against the existing `DataMeenutes` codebase and adapt naming, data structures, and entry points to fit naturally.
* **Identify Potential Bugs & Edge Cases:** Actively look for flaws in the proposed design—such as:
  * Concurrent write or infinite-loop risks between `MetadataCache` events and `Vault.process()`.
  * Edge cases in Markdown boundary detection (e.g., where a card's `baseDescription` or a `%%recall:...%%` block ends when encountering blank lines, horizontal rules, nested lists, or sub-headings).
  * Block ID (`^card-xxx`) collision prevention across files and undo/redo behavior in CodeMirror 6.
  * Performance scaling when indexing hundreds of meeting notes or rendering drag-and-drop boards.
* **Suggest Fixes & Improvements:** Propose cleaner Obsidian API idioms, UX refinements, or schema adjustments, and clearly note any recommended changes before or while implementing the phases in Section 9.

### 0.4 Task Planning & Progress Tracking via Super Productivity MCP

When starting in **Plan Mode** (and throughout implementation), use the **Super Productivity MCP** as your development task tracker so the user can accompany progress in real time:

1. **Create the Project:** Use the Super Productivity MCP tools to create a new project named **`Data Meenutes`** (or verify/reuse it if already present).
2. **Seed Ordered Implementation Tasks:** Break down the audited implementation plan (Phases 0–4 in Section 9, along with any architectural fixes or subtasks identified during your codebase review) into clearly ordered, sequential tasks inside the **`Data Meenutes`** project. Include brief implementation notes on each task so the execution order and dependencies are transparent.
3. **Sync Status as You Build:** Mark tasks as active/completed in the **`Data Meenutes`** project via Super Productivity MCP as you finish each step so the user can follow progress live from their Super Productivity workspace.

*(Note: While **DataMeenutes v2** itself runs 100% natively inside Obsidian with no external Super Productivity dependency at runtime, **you—the AI assistant—are using the Super Productivity MCP** during development strictly to manage and expose your engineering plan and progress to the user.)*

---

## 1. Core Architectural Principles

1. **Markdown as the Single Source of Truth:** Every card, title, operational tag, description, and recall entry lives natively inside `.md` meeting files. No external APIs, local REST bridges, MCP servers, or shadow databases can drift out of sync.
2. **Separation of Concerns Across Four Metadata Layers:**
   * **Organizational Hierarchy (`#`, `##`, `###`):** Non-unique contextual grouping (`City → Organization → Sub-topic`).
   * **Card Identity (`^card-xxx`):** Unique, immutable Obsidian block ID acting as the primary key for every individual ticket.
   * **Lifecycle & Operational Tags (`#open-card`, `#closed-card`, `#calling`):** Opt-in state triggers and cross-organization filter dimensions.
   * **Recall Anchors (`[[Note#^card-xxx|Title]] %%recall:YYYY-MM-DD HH:mm%%`):** Zero-tag-pollution block links with locked timestamps that assemble chronological history across meetings.
3. **Native Workspace Integration:** Introduces `.orgboard` as a first-class workspace object alongside Markdown notes, Graph View, and `.base` files—opening in full-pane main workspace tabs (`WorkspaceLeaf`).

---

## 2. Markdown Syntax & Card Anatomy Rules

### 2.1 Top-Down Header Hierarchy (Context Only)

As the parser scans any Markdown file from line `0` to the end, it maintains the active structural path:

* `# Heading 1` → **City** (e.g., `# Aveiro`)
* `## Heading 2` → **Organization** (e.g., `## University of Aveiro`)
* `### Heading 3` → **Sub-topic / Person / Sector** (e.g., `### Prof. Silva`)

**Crucial Rule:** Structural headings (`#`, `##`, `###`) define *where* subsequent content belongs, **never** a card on their own. General meeting notes written under headers without trigger tags are completely ignored by all boards and card lists.

### 2.2 The Opt-In First-Line Card Rule

Immediately following any `#`, `##`, or `###` heading, the parser inspects the **first non-empty line** before body text begins:

* **Trigger Check:** If that first line contains `#open-card`, `#open-ticket`, or `#closed-card` (or `#closed`), that section opens a card. Otherwise, the entire section is treated as standard meeting prose.
* **Card Title:** The text of that first line—with lifecycle tags, operational tags, and the `^card-xxx` block ID stripped out—becomes the **Card Title**. Editing this line in Markdown updates the card title everywhere in real time; renaming the card on a board rewrites this line while preserving all tags and its block ID.
* **Auto-Injected Block ID:** The moment `#open-card` or `#open-ticket` is typed on that first line, the editor listener automatically appends a unique block ID (`^card-104`) at the end of the line if one does not already exist.
* **Operational Tags:** Any additional tags placed on Line 1 (such as `#calling`, `#urgent`, `#scheduling`, `#budget`) attach to the card as cross-organization metadata without affecting its hierarchy path.

### 2.3 Base Description Boundary

Every line immediately following **Line 1** (the Card Title line)—up to the next Markdown heading of any level (`#`, `##`, `###`, `####`) or EOF—is captured as the card's **Base Description**, stamped with the initial opening date/time.

### 2.4 Complete Annotated Meeting Note Example

```markdown
# Aveiro
## University of Aveiro
### Prof. Silva
Confirm lab equipment budget #open-card #calling ^card-104
Initial scope: verify optical sensor quote from vendor.
- Target ceiling: €4,500
- Must be signed off before Friday.

### Prof. Costa
Discussed general semester timeline and lab access keys.
- No action items opened here (Line 1 has no trigger tag, so ignored by boards).

# Aveiro
## University of Aveiro
Schedule joint Q2 workshop dates #open-card #scheduling ^card-105
- Check main auditorium availability.
- Coordinate catering estimates with administration.
```

---

## 3. Multi-Card Disambiguation & Same-Organization Scaling

A single organization or sector frequently has multiple active tickets addressing completely unrelated problems. The system prevents collisions by decoupling **Hierarchy Scope** from **Card Primary Key**:

| Attribute | Card A (`^card-104`) | Card B (`^card-105`) |
| :--- | :--- | :--- |
| **Primary Key (`id`)** | `card-104` | `card-105` |
| **Title** | `Confirm lab equipment budget` | `Schedule joint Q2 workshop dates` |
| **Hierarchy Scope** | `aveiro/university-of-aveiro/prof-silva` | `aveiro/university-of-aveiro` |
| **Org Grouping Key** | `aveiro/university-of-aveiro` | `aveiro/university-of-aveiro` |
| **Operational Tags** | `#calling` | `#scheduling` |
| **Status** | `open` (`#open-card`) | `open` (`#open-card`) |

### Supported Same-Org Authoring Patterns

1. **Repeated Organization Blocks in One Meeting:** You can write `# Aveiro` → `## University of Aveiro` early in a meeting to open `^card-104`, discuss other cities/organizations later in the same file, and write `# Aveiro` → `## University of Aveiro` again further down to open `^card-105`. Because the parser tracks headers sequentially top-down, both cards inherit `aveiro/university-of-aveiro` while keeping distinct titles, bodies, and block IDs.
2. **Sub-Heading Breakdown:** You can also place multiple `### Sub-topic` headers under one `## Organization`, opening a separate first-line card under each `###` heading.
3. **Isolated Single-Card Closing:** Changing `#open-card` to `#closed-card` on `^card-104` (or dragging `^card-104` to `Closed` on a board) closes **only** `^card-104`. All other open cards under `University of Aveiro` (`^card-105`, etc.) remain active.

---

## 4. Zero-Tag-Pollution Recall System & Immutable Timestamps

### 4.1 Why Block Links + Comments Replace Per-Card Tags

Creating a dedicated tag per ticket (e.g., `#card-104`) floods Obsidian's Tag Pane, clutters `#` autocomplete popups during meetings, and pollutes Graph View. Instead, recalling an existing card uses a **native Obsidian block link** paired with a **hidden Obsidian comment timestamp**:

```markdown
# Aveiro
## University of Aveiro
[[2026-11-04 Meeting#^card-104|Confirm lab equipment budget]] %%recall:2026-11-11 23:32%%
- Vendor sent revised quote at €4,150.
- Prof. Silva approved moving forward next week.
```

* **Zero Tag Pollution:** No tag is created in Obsidian's tag index.
* **Clean Reading & Live Preview:** Obsidian natively hides `%%recall:2026-11-11 23:32%%` in Live Preview and Reading View while displaying a clean, hover-previewable link to the origin card.
* **Instant Indexing via `MetadataCache`:** Obsidian's `app.metadataCache.resolvedLinks` automatically tracks every note linking to `#^card-104`, allowing the plugin to collect all recalls across the vault without full-text file scans.

### 4.2 Chronological History Assembly & Immutability Guarantee

When a card is viewed in the sidebar or opened in the `.orgboard` inspection drawer, the plugin merges:

1. **Base Description** from the origin file (`openedAt` timestamp).
2. **All Recall Blocks** across the vault, sorted chronologically by their locked `%%recall:YYYY-MM-DD HH:mm%%` timestamp. Each recall block captures every line beneath the recall link up to the next Markdown heading, next recall link, or horizontal divider (`---`).

```text
+-----------------------------------------------------------------------+
| Confirm lab equipment budget                 [#open-card] [#calling]  |
| Aveiro → University of Aveiro → Prof. Silva               ^card-104   |
+-----------------------------------------------------------------------+
| DESCRIPTION (Opened 2026-11-04)                                       |
| Initial scope: verify optical sensor quote from vendor.               |
| - Target ceiling: €4,500                                              |
| - Must be signed off before Friday.                                   |
+-----------------------------------------------------------------------+
| RECALL HISTORY                                                        |
|                                                                       |
| [2026-11-11 23:32] — 2026-11-11 Meeting.md                            |
| - Vendor sent revised quote at €4,150.                                |
| - Prof. Silva approved moving forward next week.                      |
|                                                                       |
| [2026-11-18 10:15] — 2026-11-18 Meeting.md                            |
| - Purchase order submitted to finance department.                     |
+-----------------------------------------------------------------------+
```

* **Immutable Timestamp Rule:** The `%%recall:YYYY-MM-DD HH:mm%%` string is generated once at the exact moment you insert the recall from the sidebar. If you reopen `2026-11-11 Meeting.md` weeks later to correct `€4,150` to `€4,200`, the card history updates the text under `[2026-11-11 23:32]` live while **preserving `2026-11-11 23:32` unchanged**.
* **Remote Closing via Recall Line:** Adding `#closed-card` at the end of a recall link line (`[[2026-11-04 Meeting#^card-104|Confirm lab equipment budget]] %%recall:2026-11-18 10:15%% #closed-card`) automatically resolves `^card-104` and updates `#open-card` → `#closed-card` on Line 1 of the origin file.

---

## 5. Dual-Tab Companion Sidebar (`ItemView`)

Registered as a persistent workspace sidebar view with two switchable tabs optimized for live meeting workflows:

```text
+-------------------------------------------------------------------+
|  [ Tab 1: Organization Tree ]   [ Tab 2: Context Cards (2) ]      |
+-------------------------------------------------------------------+
|  TAB 1: TREE VIEW               |  TAB 2: CONTEXT CARDS FEED      |
|  ▼ Aveiro (2)                   |  Scope: Aveiro → Univ. Aveiro   |
|    ▼ University of Aveiro (2)   |  Filter: [Open v] [Search...]   |
|      • Prof. Silva (1)          |  -----------------------------  |
|      • Prof. Costa (0)          |  [Card] Confirm lab equipment   |
|  ▶ Porto (4)                    |         #calling • 1 recall     |
|  ▶ Lisbon (1)                   |         [Insert Recall] [Open]  |
|                                 |  -----------------------------  |
|                                 |  [Card] Schedule Q2 workshop    |
|                                 |         #scheduling • 0 recalls |
|                                 |         [Insert Recall] [Open]  |
+-------------------------------------------------------------------+
```

### Tab 1 — Collapsible Organization Tree

* Extends the existing hierarchy tree (`City → Organization → Sub-topic`) across all vault notes.
* Displays live count badges of active `#open-card` items at every level (aggregating child counts up to parent organizations and cities).
* Tracks cursor movement in the active Markdown editor (`editor-change` / `active-leaf-change`) to highlight the organization/sub-topic currently being discussed.
* Clicking any node switches focus to **Tab 2** filtered to that exact branch.

### Tab 2 — Context-Aware Cards Feed

* Automatically syncs to the node selected in **Tab 1** or the heading under your active editor cursor.
* Provides a quick toggle between **Open Cards**, **Closed Cards**, and **All**, plus instant keyword/tag filtering.
* **One-Click Recall Insertion:** Clicking a card (or its **Insert Recall** action) inserts `[[Origin#^card-xxx|Title]] %%recall:YYYY-MM-DD HH:mm%%` directly at the active cursor position in your meeting note, ready for you to type meeting updates immediately beneath it.

---

## 6. First-Class `.orgboard` Workspace Object (`TextFileView`)

Registered via `this.registerView(VIEW_TYPE_ORG_BOARD, ...)` and `this.registerExtensions(['orgboard'], VIEW_TYPE_ORG_BOARD)`, `.orgboard` files appear natively in Obsidian's File Explorer alongside `.md` notes, Graph View, and `.base` files, opening in main workspace tabs (`WorkspaceLeaf`).

### 6.1 Super Productivity–Style Multi-View Switcher

Each `.orgboard` file stores a JSON configuration containing multiple **View Presets**, switchable via a top toolbar bar—allowing you to slice the exact same vault cards across multiple perspectives without duplicating tasks:

1. **Workflow / Lifecycle Kanban (`mode: "tag"`):**
   * Columns driven by status and action tags: `Open (#open-card)` → `Calling Queue (#calling)` → `Waiting / Follow-Up (#waiting)` → `Closed (#closed-card)`.
2. **Organization / Sector Split View (`mode: "header"`):**
   * Columns mapped to specific organizations or sub-topics within a scope (e.g., side-by-side columns for `Org-A`, `Org-B`, and `Org-C` under `# Aveiro`).
3. **Cross-Organization Action Board (`mode: "tag"`, global scope):**
   * Pulls every open card tagged `#calling` (or `#urgent`) across *all* cities and organizations into a single triage board.
4. **Priority / Eisenhower Matrix (`mode: "tag"`, composite rule):**
   * Four quadrants matching tag combinations: `Do First (#urgent + #important)`, `Schedule (#important)`, `Delegate (#urgent)`, `Backlog (#open-card)`.

### 6.2 Card Display & Inspection Drawer

* **Card Face:** Displays Card Title, inherited hierarchy pill (`Aveiro → University of Aveiro → Prof. Silva`), operational tag chips (`#calling`), recall count badge (`2 recalls`), and last-updated date.
* **Card Inspection Drawer:** Clicking any card opens a side drawer inside the `.orgboard` tab where you can:
  * Edit the **Card Title** (syncs to Line 1 of origin `.md`).
  * Edit the **Base Description** (syncs to Lines `2..N` of origin `.md`).
  * Add or remove **Operational Tags** (`#calling`, `#urgent`).
  * Read the full **Chronological Recall History** with clickable links that jump directly to the exact line in each source meeting note.

---

## 7. Bidirectional Drag-and-Drop & Atomic Markdown Sync

All mutations from the `.orgboard` or Sidebar write back to Markdown files using `this.app.vault.process(file, (data) => ...)` to guarantee atomic, race-condition-free file updates.

### 7.1 Column Drop Matrix

| Drag Action | Active Column Mode | Automated Markdown Synchronization Behavior |
| :--- | :--- | :--- |
| **`Open` → `Calling`** | `mode: "tag"` | Edits Line 1 of the origin card in place: appends `#calling` before `^card-xxx`. Card stays under its original meeting header. |
| **`Calling` → `Open`** | `mode: "tag"` | Removes `#calling` from Line 1 of the origin card while preserving `#open-card`, other tags, and `^card-xxx`. |
| **Any Column → `Closed`** | `mode: "tag"` | Replaces `#open-card` / `#open-ticket` with `#closed-card` on Line 1 of the origin card. Archives card from active views. |
| **`Closed` → `Open`** | `mode: "tag"` | Replaces `#closed-card` with `#open-card` on Line 1 of the origin card, restoring it to active views. |
| **`Org-A` → `Org-B`** | `mode: "header"` | Cuts the entire card section (parent sub-heading if dedicated, Line 1 Title/Tags/ID, and Lines `2..N` Base Description) from under `## Org-A` and inserts it under `## Org-B` (creating `## Org-B` under the parent `# City` if it does not yet exist). |

### 7.2 Echo-Suppression & Live Indexing Loop

* **Markdown → UI:** Subscribing to `this.app.metadataCache.on('changed', file)` (debounced at `250ms`) re-indexes only the modified file, updates the in-memory `HierarchyIndex` and `CardStore`, and refreshes open `.orgboard` and `Sidebar` views without losing scroll position.
* **UI → Markdown:** Before calling `Vault.process()`, the mutator records the target file path in a short-lived `pendingWrites` set so the plugin distinguishes its own programmatic writes from manual user typing.

---

## 8. Suggested TypeScript Data Schemas & `.orgboard` File Format

### 8.1 Core TypeScript Interfaces (`src/types.ts`)

```typescript
export type CardStatus = "open" | "closed";

export interface HierarchyPath {
  city: string;              // H1 text (e.g., "Aveiro")
  org: string;               // H2 text (e.g., "University of Aveiro")
  subTopic?: string;         // H3 text (e.g., "Prof. Silva")
  orgSlug: string;           // Non-unique org scope: "aveiro/university-of-aveiro"
  fullSlug: string;          // Full path scope: "aveiro/university-of-aveiro/prof-silva"
}

export interface CardRecallEntry {
  timestamp: string;         // Immutable locked timestamp: "YYYY-MM-DD HH:mm"
  sourceFilePath: string;    // Vault path of the meeting note containing the recall
  anchorLine: number;        // Line number of [[Origin#^card-xxx|Title]] %%recall:...%%
  endLine: number;           // Last line belonging to this recall entry
  content: string;           // Live-synced text beneath the recall anchor
}

export interface CardNode {
  id: string;                // Unique primary key: "card-104"
  title: string;             // Line 1 text (stripped of tags and ^card-xxx)
  baseDescription: string;   // Origin lines 2..N until next heading
  openedAt: string;          // Origin date/timestamp (immutable)
  status: CardStatus;        // Derived from #open-card/#open-ticket vs #closed-card
  tags: string[];            // Operational tags (e.g., ["#calling", "#urgent"])
  hierarchy: HierarchyPath;
  recalls: CardRecallEntry[];
  source: {
    filePath: string;        // Origin .md file path
    headingLine: number;     // Line of the enclosing #, ##, or ### heading
    titleLine: number;       // Line 1 where title, tags, and ^card-xxx reside
    endLine: number;         // Last line of baseDescription before next heading
  };
}

export interface BoardColumnRule {
  id: string;
  title: string;
  ruleType: "tag" | "header" | "status";
  ruleValue: string;         // e.g., "#calling", "closed", or "## Org-B"
  requiredTags?: string[];   // Optional composite filter (e.g., ["#urgent", "#important"])
  color?: string;
}

export interface BoardViewPreset {
  id: string;
  name: string;              // e.g., "Workflow Pipeline", "Aveiro Orgs", "Calling Queue"
  layout: "kanban" | "matrix";
  dropMode: "tag" | "header";
  scopeFilter?: {
    hierarchyPrefix?: string; // e.g., "aveiro" or "aveiro/university-of-aveiro"
    includeTags?: string[];   // e.g., ["#calling"]
    excludeTags?: string[];
    showClosed?: boolean;
  };
  columns: BoardColumnRule[];
}

export interface OrgBoardFileSchema {
  version: number;
  activePresetId: string;
  presets: BoardViewPreset[];
}
```

### 8.2 Sample `.orgboard` File (`Operations.orgboard`)

```json
{
  "version": 1,
  "activePresetId": "view-workflow",
  "presets": [
    {
      "id": "view-workflow",
      "name": "Action Workflow",
      "layout": "kanban",
      "dropMode": "tag",
      "scopeFilter": {
        "showClosed": true
      },
      "columns": [
        { "id": "col-open", "title": "Open", "ruleType": "status", "ruleValue": "open" },
        { "id": "col-calling", "title": "Calling Queue", "ruleType": "tag", "ruleValue": "#calling" },
        { "id": "col-sched", "title": "Scheduling", "ruleType": "tag", "ruleValue": "#scheduling" },
        { "id": "col-closed", "title": "Closed", "ruleType": "status", "ruleValue": "closed" }
      ]
    },
    {
      "id": "view-aveiro-orgs",
      "name": "Aveiro — By Organization",
      "layout": "kanban",
      "dropMode": "header",
      "scopeFilter": {
        "hierarchyPrefix": "aveiro",
        "showClosed": false
      },
      "columns": [
        { "id": "col-ua", "title": "University of Aveiro", "ruleType": "header", "ruleValue": "## University of Aveiro" },
        { "id": "col-cm", "title": "City Council", "ruleType": "header", "ruleValue": "## City Council" },
        { "id": "col-pci", "title": "Creative Science Park", "ruleType": "header", "ruleValue": "## Creative Science Park" }
      ]
    },
    {
      "id": "view-calling-global",
      "name": "Global Calling Queue",
      "layout": "kanban",
      "dropMode": "tag",
      "scopeFilter": {
        "includeTags": ["#calling"],
        "showClosed": false
      },
      "columns": [
        { "id": "col-call-todo", "title": "To Call", "ruleType": "tag", "ruleValue": "#calling" },
        { "id": "col-call-followup", "title": "Follow-Up Sent", "ruleType": "tag", "ruleValue": "#followup" },
        { "id": "col-call-done", "title": "Completed", "ruleType": "status", "ruleValue": "closed" }
      ]
    }
  ]
}
```

---

## 9. Suggested Module Structure & Rollout Sequence

*(Note to Reviewing AI: Map these modules onto the existing `DataMeenutes` repository structure, reusing existing parser/tree code where possible, and log all planned tasks in order inside the **`Data Meenutes`** project via Super Productivity MCP.)*

```text
DataMeenutes/
├── manifest.json                     # Plugin ID, version, and minAppVersion
├── main.ts                           # Registers .orgboard extension, sidebar leaf, commands & listeners
├── src/
│   ├── types.ts                      # CardNode, CardRecallEntry, HierarchyPath & OrgBoardFileSchema
│   ├── parser/
│   │   ├── HierarchyParser.ts        # Top-down H1/H2/H3 parser + opt-in Line 1 card extractor
│   │   └── RecallAssembler.ts        # Uses MetadataCache.resolvedLinks to collect %%recall:...%% blocks
│   ├── store/
│   │   └── VaultCardStore.ts         # Reactive in-memory index + event emitter on file changes
│   ├── sync/
│   │   ├── AutoIdListener.ts         # Auto-appends ^card-xxx when #open-card is typed on Line 1
│   │   └── MarkdownMutator.ts        # Atomic Vault.process() handlers for tags, titles, bodies & headers
│   └── views/
│       ├── DualSidebarView.ts        # ItemView: Tab 1 (Org Tree) + Tab 2 (Context Cards & Recall Insert)
│       ├── OrgBoardFileView.ts       # TextFileView (.orgboard): Multi-View Switcher + Drag-and-Drop Board
│       └── CardDetailDrawer.ts       # Side drawer for editing Card Title/Body & viewing Recall History
└── styles.css                        # Tree badges, Kanban columns, drag states, hierarchy pills & drawer
```

### Recommended Implementation Phases (Sync to Super Productivity Project: `Data Meenutes`)

* [ ] **Phase 0 — Codebase Audit, Plan Setup & Architecture Review:** Inspect existing `DataMeenutes` parser/tree files, validate edge cases in the proposed spec (recall block termination rules, concurrent file writes, block ID uniqueness), create the **`Data Meenutes`** project via Super Productivity MCP, and populate the ordered implementation task backlog.
* [ ] **Phase 1 — Parser & Auto-ID Engine:** Extend the existing hierarchy parser with the first-line trigger rule (`#open-card`, `#open-ticket`, `#closed-card`), top-down repeated-header tracking, and `AutoIdListener.ts` for automatic `^card-xxx` block ID injection.
* [ ] **Phase 2 — Recall Assembler & Dual-Tab Sidebar:** Implement `RecallAssembler.ts` using `MetadataCache.resolvedLinks` and extend the existing sidebar tree view into `DualSidebarView.ts` (Tab 1: collapsible `City → Org → Sub-topic` tree; Tab 2: context cards feed with one-click locked-timestamp recall insertion).
* [ ] **Phase 3 — `.orgboard` Workspace View:** Register `.orgboard` via `TextFileView`, implement the JSON-backed Super Productivity View Switcher toolbar, and render filtered card columns with the `CardDetailDrawer`.
* [ ] **Phase 4 — Bidirectional Drag-and-Drop Sync:** Wire column drag-and-drop events to `MarkdownMutator.ts` (`Vault.process()`) for in-place tag/status transitions, remote recall-line closing, and cross-header card relocation.