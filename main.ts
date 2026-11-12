import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, ItemView, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { MarkdownParser, DEFAULT_PRIORITY_BEFORE_CITIES, DEFAULT_PRIORITY_AFTER_CITIES, DEFAULT_CITIES } from './DataMeenutes/App';
import { MeetingComposerV2 } from './src/MeetingComposerV2';
import { renderCardHelp } from './src/views/help';
import { TopicIndex } from './src/topics/TopicIndex';
import { TopicsHost, VIEW_TYPE_RESULTS, VIEW_TYPE_TOPICS } from './src/topics/host';
import { TopicsSidebarView } from './src/topics/TopicsSidebarView';
import { TopicResultsView } from './src/topics/TopicResultsView';
import { TopicParser, TopicQuery } from './src/topics/types';

const MDParser = new MarkdownParser();

/** View ids used before the Topics sidebar existed; kept registered so old workspace layouts migrate. */
const LEGACY_VIEW_SEARCH = "example-view";
const LEGACY_VIEW_TREE = "file-view";

interface MyPluginSettings {
	MeenutesDir: string;
	/** Unused since results are shown in memory; kept so old settings files load unchanged. */
	OutputFileName: string;
	/** Old output folder. No longer written to, but still excluded from card indexing (it may hold an old output.md). */
	OutputDir: string;
	priorityBeforeCities: string[];
	cities: string[];
	priorityAfterCities: string[];
	autoComplete: boolean;
	autoReload: boolean;
	autoCardIds: boolean;
	processedRecallCloses: string[];
	recallClosedBy: string[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	MeenutesDir: 'Atas',
	OutputFileName: 'output.md',
	OutputDir: 'Meeting_Composer_Search/',
	priorityBeforeCities: [...DEFAULT_PRIORITY_BEFORE_CITIES],
	cities: [...DEFAULT_CITIES],
	priorityAfterCities: [...DEFAULT_PRIORITY_AFTER_CITIES],
	autoComplete: true,
	autoReload: true,
	autoCardIds: true,
	processedRecallCloses: [],
	recallClosedBy: [],
}

export default class MyPlugin extends Plugin implements TopicsHost {
	settings: MyPluginSettings;
	index: TopicIndex;
	private reindexDebounce: ReturnType<typeof setTimeout> | null = null;
	v2: MeetingComposerV2;

	async onload() {
		await this.loadSettings();
		this.applyPriorityLists();

		this.index = new TopicIndex(this.app, MDParser as unknown as TopicParser, () => this.settings.MeenutesDir);
		this.app.workspace.onLayoutReady(() => void this.index.rebuild());

		this.registerView(VIEW_TYPE_TOPICS, (leaf) => new TopicsSidebarView(leaf, this));
		this.registerView(VIEW_TYPE_RESULTS, (leaf) => new TopicResultsView(leaf, this));
		this.registerView(LEGACY_VIEW_TREE, (leaf) => new LegacyView(leaf, LEGACY_VIEW_TREE, () => leaf.setViewState({ type: VIEW_TYPE_TOPICS, active: false })));
		this.registerView(LEGACY_VIEW_SEARCH, (leaf) => new LegacyView(leaf, LEGACY_VIEW_SEARCH, () => leaf.detach()));
		this.registerHoverLinkSource(VIEW_TYPE_RESULTS, { display: 'Meeting Composer results', defaultMod: true });

		this.addRibbonIcon("scroll-text", "Open Meeting Composer topics", () => void this.activateTopicsView());
		this.addCommand({ id: 'open-topics-sidebar', name: 'Open topics sidebar', callback: () => void this.activateTopicsView() });
		this.addCommand({
			id: 'search-topics',
			name: 'Search topics…',
			callback: async () => {
				const view = await this.activateTopicsView();
				view?.focusSearch();
			},
		});
		this.addCommand({ id: 'reload-topics', name: 'Reload minutes (rebuild topic tree)', callback: () => void this.index.rebuild() });

		this.addSettingTab(new MeetingComposerSettingTab(this.app, this));
		this.registerEditorSuggest(new TopicEditorSuggest(this.app, this));

		this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
			if (!this.settings.autoReload) return;
			const file = info.file;
			if (!file || !this.inMinutes(file)) return;
			const line = editor.getLine(editor.getCursor().line);
			if (!/^#{1,6} .+/.test(line)) return;
			this.index.scheduleRebuild(1000);
		}));
		// files added / removed / renamed in the minutes folder change the tree too
		const onFileSetChange = (file: TAbstractFile, oldPath?: string) => {
			if (this.inMinutes(file) || (oldPath && oldPath.startsWith(this.minutesPrefix()))) this.index.scheduleRebuild(500);
		};
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on('create', f => onFileSetChange(f)));
			this.registerEvent(this.app.vault.on('delete', f => onFileSetChange(f)));
			this.registerEvent(this.app.vault.on('rename', (f, old) => onFileSetChange(f, old)));
		});

		// v2: cards, recalls, companion sidebar and .orgboard boards (additive)
		this.v2 = new MeetingComposerV2(this, () => ({
			minutesDir: this.settings.MeenutesDir,
			outputDir: this.settings.OutputDir,
			autoCardIds: this.settings.autoCardIds,
			processedRecallCloses: this.settings.processedRecallCloses,
			recallClosedBy: this.settings.recallClosedBy,
			priorityBefore: this.settings.priorityBeforeCities,
			cities: this.settings.cities,
			priorityAfter: this.settings.priorityAfterCities,
		}), async ({ processed, closedBy }) => {
			this.settings.processedRecallCloses = processed;
			this.settings.recallClosedBy = closedBy;
			await this.saveSettings();
		});
		this.v2.load();
	}

	private minutesPrefix(): string {
		return this.settings.MeenutesDir.replace(/\/+$/, '') + '/';
	}

	private inMinutes(file: TAbstractFile): boolean {
		return file instanceof TFile && file.extension === 'md' && file.path.startsWith(this.minutesPrefix());
	}

	applyPriorityLists() {
		MDParser.setPriorityLists(this.settings.priorityBeforeCities, this.settings.cities, this.settings.priorityAfterCities);
	}

	// ---------- TopicsHost ----------

	autoCompleteEnabled(): boolean {
		return this.settings.autoComplete;
	}

	minutesDir(): string {
		return this.settings.MeenutesDir;
	}

	/** Show a query in the Results tab: reuse the open one (updated in place) or open one tab for it. */
	async showResults(q: TopicQuery, newTab = false): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_RESULTS)[0] ?? null;
		if (existing && !newTab) await loadIfDeferred(existing);
		if (existing && !newTab && existing.view instanceof TopicResultsView) {
			(existing.view as TopicResultsView).setQuery(q);
			workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_RESULTS, state: q, active: true });
		workspace.revealLeaf(leaf);
	}

	async activateTopicsView(): Promise<TopicsSidebarView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_TOPICS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: VIEW_TYPE_TOPICS, active: true });
		}
		workspace.revealLeaf(leaf);
		await loadIfDeferred(leaf);
		return leaf.view instanceof TopicsSidebarView ? leaf.view : null;
	}

	/** Re-index v2 cards after the minutes/output folder setting changes. */
	scheduleCardReindex() {
		if (this.reindexDebounce) clearTimeout(this.reindexDebounce);
		this.reindexDebounce = setTimeout(() => this.v2?.store.reindexAll(), 800);
	}

	onunload() {
		this.index?.cancelScheduled();
		this.v2?.unload();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// One-time migration: data saved before recallClosedBy existed can hold "handled" recalls whose
		// close was lost (e.g. reverted with Ctrl+Z), leaving a #closed-card recall that never acts again.
		// Forget them so every #closed-card recall gets evaluated once more.
		if (data && Array.isArray(data.processedRecallCloses) && !Array.isArray(data.recallClosedBy)) {
			this.settings.processedRecallCloses = [];
			this.settings.recallClosedBy = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/** Obsidian 1.7+ keeps background tabs as placeholders until shown; load the real view first. */
async function loadIfDeferred(leaf: WorkspaceLeaf): Promise<void> {
	const l = leaf as WorkspaceLeaf & { isDeferred?: boolean; loadIfDeferred?: () => Promise<void> };
	if (l.isDeferred && l.loadIfDeferred) await l.loadIfDeferred();
}

/**
 * Placeholder for the old "Topic Tree" / "Meeting Composer" view ids found in saved workspace layouts:
 * it immediately swaps itself for the Topics sidebar (old tree) or closes (old search panel).
 */
class LegacyView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private type: string, private migrate: () => unknown) {
		super(leaf);
	}

	getViewType(): string {
		return this.type;
	}

	getDisplayText(): string {
		return "Meeting Composer";
	}

	async onOpen() {
		window.setTimeout(() => void this.migrate(), 0);
	}
}

class TopicEditorSuggest extends EditorSuggest<string> {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.autoComplete) return null;
		const line = editor.getLine(cursor.line);
		const match = line.match(/^(#{1,6} )(.*)/);
		if (!match) return null;
		return {
			start: { line: cursor.line, ch: match[1].length },
			end: cursor,
			query: match[2],
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		const lower = context.query.toLowerCase();
		return MDParser.getAllTopicNames().filter(t => t.toLowerCase().includes(lower));
	}

	renderSuggestion(topic: string, el: HTMLElement): void {
		el.createEl('div', { text: topic });
	}

	selectSuggestion(topic: string): void {
		if (!this.context) return;
		const { editor, start, end } = this.context;
		editor.replaceRange(topic, start, end);
	}
}

class MeetingComposerSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// v2 help: how to write cards, recalls and boards
		new Setting(containerEl)
			.setName('How to write cards')
			.setDesc('The text syntax for opening, closing and following up cards. Expand below, or open it in a window (also: command "Show card syntax help", or the ? button in the Meeting cards sidebar).')
			.addButton(b => b.setButtonText('Open guide').onClick(() => this.plugin.v2?.showHelp()));
		const helpDetails = containerEl.createEl('details', { cls: 'mc2-help-details' });
		helpDetails.createEl('summary', { text: 'Show the card syntax guide' });
		void renderCardHelp(this.app, helpDetails.createDiv(), this.plugin, this.plugin.settings.MeenutesDir);

		new Setting(containerEl).setName('Settings').setHeading();

		new Setting(containerEl)
			.setName('Minutes directory')
			.setDesc('Folder containing meeting minutes files, relative to the vault root')
			.addText(text => text
				.setPlaceholder('Atas')
				.setValue(this.plugin.settings.MeenutesDir)
				.onChange(async (value) => {
					this.plugin.settings.MeenutesDir = value;
					await this.plugin.saveSettings();
					this.plugin.scheduleCardReindex();
					this.plugin.index.scheduleRebuild(800);
				}));

		new Setting(containerEl)
			.setName('Search autocomplete')
			.setDesc('Suggest topic names while typing in the Topics search box and in heading lines (reopen the Topics sidebar to apply)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoComplete)
				.onChange(async (value) => {
					this.plugin.settings.autoComplete = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-reload tree on new heading')
			.setDesc('Refresh the topic tree whenever a heading is written in a minutes file')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoReload)
				.onChange(async (value) => {
					this.plugin.settings.autoReload = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-assign card ids')
			.setDesc('Append a ^card-id when a line with #open-card / #open-ticket is written right under a heading (applied when the cursor leaves the line)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCardIds)
				.onChange(async (value) => {
					this.plugin.settings.autoCardIds = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName('Topic ordering').setHeading();

		const listsEl = containerEl.createDiv('mc-priority-lists');

		const makeListSection = (
			title: string,
			desc: string,
			getValue: () => string[],
			setValue: (lines: string[]) => void,
		) => {
			const col = listsEl.createDiv('mc-priority-col');
			col.createEl('div', { text: title, cls: 'mc-priority-title' });
			col.createEl('div', { text: desc, cls: 'mc-priority-desc' });
			const ta = col.createEl('textarea', { cls: 'mc-priority-textarea' });
			ta.value = getValue().join('\n');
			ta.rows = 14;
			ta.addEventListener('change', () => {
				const lines = ta.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
				setValue(lines);
			});
		};

		makeListSection(
			'Organizations',
			'Sorted before sectors, top = highest priority',
			() => this.plugin.settings.priorityBeforeCities,
			async (lines) => {
				this.plugin.settings.priorityBeforeCities = lines;
				this.plugin.applyPriorityLists();
				await this.plugin.saveSettings();
				this.plugin.index.scheduleRebuild(300);
			},
		);

		makeListSection(
			'Sectors',
			'Used for grouping and scoped search',
			() => this.plugin.settings.cities,
			async (lines) => {
				this.plugin.settings.cities = lines;
				this.plugin.applyPriorityLists();
				await this.plugin.saveSettings();
				this.plugin.index.scheduleRebuild(300);
			},
		);

		makeListSection(
			'Important Topics',
			'Sorted after sectors, top = highest priority',
			() => this.plugin.settings.priorityAfterCities,
			async (lines) => {
				this.plugin.settings.priorityAfterCities = lines;
				this.plugin.applyPriorityLists();
				await this.plugin.saveSettings();
				this.plugin.index.scheduleRebuild(300);
			},
		);

		new Setting(containerEl)
			.setName('Reload minutes')
			.setDesc('Re-scan the minutes folder and rebuild the topic tree')
			.addButton(item => {
				item.setButtonText("Reload");
				item.onClick(async () => {
					await this.plugin.index.rebuild();
					await this.plugin.activateTopicsView();
				});
			});
	}
}
