import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf } from 'obsidian';
import { MarkdownParser, DEFAULT_PRIORITY_BEFORE_CITIES, DEFAULT_PRIORITY_AFTER_CITIES, DEFAULT_CITIES } from './DataMeenutes/App';
import { createRoot, Root } from 'react-dom/client';
import { FileTreeRoot } from './FileTree';
import { writeAnswer } from 'DataMeenutes/FileReader';

const MDParser = new MarkdownParser();
let OutputWindow: WorkspaceLeaf | null = null;

export const VIEW_TYPE_EXAMPLE = "example-view";
export const VIEW_TYPE_FILE = "file-view";

interface MyPluginSettings {
	MeenutesDir: string;
	OutputFileName: string;
	OutputDir: string;
	priorityBeforeCities: string[];
	cities: string[];
	priorityAfterCities: string[];
	autoComplete: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	MeenutesDir: 'Atas',
	OutputFileName: 'output.md',
	OutputDir: 'Meeting_Composer_Search/',
	priorityBeforeCities: [...DEFAULT_PRIORITY_BEFORE_CITIES],
	cities: [...DEFAULT_CITIES],
	priorityAfterCities: [...DEFAULT_PRIORITY_AFTER_CITIES],
	autoComplete: false,
}

interface Folder {
	name: string;
	children?: Folder[];
	toggleFolder: Function;
	isOpen: Boolean;
}

let TreeView: MyFolderItemView | null = null;
let currentToggle: Function = () => {};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	topicTree: any = null;
	scopedSearch: boolean = false;

	createTreeView(leaf: WorkspaceLeaf): ItemView {
		const view = new MyFolderItemView(leaf, this);
		TreeView = view;
		return view;
	}

	async loadTree() {
		const dir = this.settings.MeenutesDir;
		if (!this.app.vault.getFolderByPath(dir)) {
			await this.app.vault.createFolder(dir);
		}

		const folder = this.app.vault.getFolderByPath(dir);
		if (!folder) return;

		for (const child of folder.children) {
			if (!(child instanceof TFile) || !child.name.endsWith('.md')) continue;
			const content = await this.app.vault.read(child);
			const name = child.name.replace('.md', '').trim();
			const filePath = child.path.replace('.md', '');
			MDParser.AppendToExistingTree(content, name, filePath);
		}
	}

	async reloadTree() {
		this.topicTree = null;
		if (TreeView) TreeView.root = null as any;
		TreeView?.onOpen();
	}

	async onload() {
		await this.loadSettings();
		MDParser.setPriorityLists(
			this.settings.priorityBeforeCities,
			this.settings.cities,
			this.settings.priorityAfterCities,
		);
		this.app.workspace.onLayoutReady(() => this.loadTree());

		this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf, this));
		this.registerView(VIEW_TYPE_FILE, (leaf) => this.createTreeView(leaf));

		this.addRibbonIcon("scroll-text", "Open Meeting Composer", () => {
			this.activateView();
			this.activateFileView();
		});

		this.addSettingTab(new MeetingComposerSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);
		if (leaves.length > 0) {
			workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	async activateFileView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FILE);
		if (leaves.length > 0) {
			workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_FILE, active: true });
			workspace.revealLeaf(leaf);
		}
	}
}

class MyFolderItemView extends ItemView {
	plugin: MyPlugin;
	isOpen: boolean = false;
	root: Root;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_FILE;
	}

	getDisplayText(): string {
		return "Topic Tree";
	}

	async renderTreeContainer(TopicTree: any) {
		const container = this.containerEl.children[1];

		if (!this.root) {
			container.empty();
			this.root = createRoot(container);
		}

		this.root.render(FileTreeRoot(
			TopicTree,
			() => this.plugin.reloadTree(),
			this.plugin.scopedSearch,
			() => {
				this.plugin.scopedSearch = !this.plugin.scopedSearch;
				this.renderTreeContainer(TopicTree);
			},
			MDParser.priorityBeforeCities,
			MDParser.cities,
			MDParser.priorityAfterCities,
		));
	}

	async onOpen() {
		currentToggle = (data: Folder, root: Folder, self: any = true, name = '', parentPath: string[] = []) => {
			if (self && data !== root) {
				data.isOpen = !data.isOpen;
				this.renderTreeContainer(root);
			}
			if (root.name !== data.name) {
				if (!OutputWindow || OutputWindow.getViewState().type == 'empty') {
					OutputWindow = this.app.workspace.getLeaf("tab");
				}
				this.printSearch(data.name, OutputWindow, parentPath);
			}
		};

		if (!this.plugin.topicTree) {
			MDParser.resetTree();
			await this.plugin.loadTree();
			const toogleWrapper = (data: any, root: any, self: any, name: string, parentPath: string[]) =>
				currentToggle(data, root, self, name, parentPath);
			this.plugin.topicTree = MDParser.GenerateTopicTree(false, toogleWrapper);
			this.plugin.topicTree.isOpen = true;
		}

		this.renderTreeContainer(this.plugin.topicTree);
	}

	async printSearch(search: string, WindowRef: WorkspaceLeaf, parentPath: string[] = []) {
		const MainOutput = this.plugin.settings.OutputDir + this.plugin.settings.OutputFileName;
		const realMainDir = this.app.vault.adapter.basePath + '/' + this.plugin.settings.OutputDir;
		const file = await this.app.vault.getFileByPath(MainOutput);

		if (file) {
			WindowRef.openFile(file);
		}

		if (!search.includes('#')) {
			let display;
			const cityContext = this.plugin.scopedSearch &&
				parentPath.find(p => MDParser.cities.some(c => c.toLowerCase() === p.toLowerCase()));
			if (cityContext) {
				let subTree: any = MDParser.getTree();
				for (const parent of parentPath) {
					if (subTree && subTree[parent]) subTree = subTree[parent];
				}
				display = MDParser.getOrganizedTopicsFromTree(search, subTree, false);
			} else {
				display = MDParser.getOrganizedTopics(search, true);
			}
			const print = MDParser.convertOrganizedTopicToMD(display);
			writeAnswer(realMainDir, this.plugin.settings.OutputFileName, print);
		} else {
			const ss = search.replace('#', '');
			const display = MDParser.getOrganizedTags(ss);
			const print = MDParser.convertOrganizedTopicToMD(display);
			writeAnswer(realMainDir, this.plugin.settings.OutputFileName, print);
		}
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null as any;
	}
}

export class ExampleView extends ItemView {
	root: Root;
	plugin: MyPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		return "Meeting Composer";
	}

	async printSearch(search: string, WindowRef: WorkspaceLeaf) {
		const MainOutput = DEFAULT_SETTINGS.OutputDir + DEFAULT_SETTINGS.OutputFileName;
		const realMainDir = this.app.vault.adapter.basePath + '/' + DEFAULT_SETTINGS.OutputDir;
		const file = await this.app.vault.getFileByPath(MainOutput);

		if (file) {
			WindowRef.openFile(file);
		}

		if (!search.includes('#')) {
			const display = MDParser.getOrganizedTopics(search, true);
			const print = MDParser.convertOrganizedTopicToMD(display);
			writeAnswer(realMainDir, DEFAULT_SETTINGS.OutputFileName, print);
		} else {
			const ss = search.replace('#', '');
			const display = MDParser.getOrganizedTags(ss);
			const print = MDParser.convertOrganizedTopicToMD(display);
			writeAnswer(realMainDir, DEFAULT_SETTINGS.OutputFileName, print);
		}
	}

	async onOpen() {
		const MainOutput = DEFAULT_SETTINGS.OutputDir + DEFAULT_SETTINGS.OutputFileName;
		const vault = this.app.vault;

		const container = this.containerEl.children[1];
		const { contentEl } = this;
		container.empty();
		container.createEl("h4", { text: "Meeting Composer" });
		let search: string = "";

		new Setting(contentEl)
			.setName("Search")
			.addText(item => {
				item.onChange(string => { search = string; });
				if (this.plugin.settings.autoComplete) {
					const datalist = contentEl.createEl('datalist');
					datalist.id = 'mc-search-suggestions';
					MDParser.getAllTopicNames().forEach(name => {
						datalist.createEl('option').value = name;
					});
					item.inputEl.setAttribute('list', 'mc-search-suggestions');
				}
			})
			.addButton(item => {
				item.setButtonText("Search");
				item.onClick(async () => {
					if (!OutputWindow || OutputWindow.getViewState().type == 'empty') {
						OutputWindow = this.app.workspace.getLeaf("tab");
					}
					this.printSearch(search, OutputWindow);
				});
			});

		if (!vault.getFolderByPath(DEFAULT_SETTINGS.OutputDir)) {
			await vault.createFolder(DEFAULT_SETTINGS.OutputDir);
		}

		if (!vault.getFileByPath(MainOutput)) {
			await vault.create(MainOutput, "");
		}
	}

	async onClose() {}
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

		new Setting(containerEl)
			.setName('Minutes directory')
			.setDesc('Folder containing meeting minutes files, relative to the vault root')
			.addText(text => text
				.setPlaceholder('Atas')
				.setValue(this.plugin.settings.MeenutesDir)
				.onChange(async (value) => {
					this.plugin.settings.MeenutesDir = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output file name')
			.setDesc('Name of the file where search results are written')
			.addText(text => text
				.setPlaceholder('output.md')
				.setValue(this.plugin.settings.OutputFileName)
				.onChange(async (value) => {
					this.plugin.settings.OutputFileName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output directory')
			.setDesc('Folder where search results are written, relative to the vault root')
			.addText(text => text
				.setPlaceholder('Meeting_Composer_Search/')
				.setValue(this.plugin.settings.OutputDir)
				.onChange(async (value) => {
					this.plugin.settings.OutputDir = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Search autocomplete')
			.setDesc('Suggest topic names while typing in the search box')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoComplete)
				.onChange(async (value) => {
					this.plugin.settings.autoComplete = value;
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
				MDParser.setPriorityLists(this.plugin.settings.priorityBeforeCities, this.plugin.settings.cities, this.plugin.settings.priorityAfterCities);
				await this.plugin.saveSettings();
			},
		);

		makeListSection(
			'Sectors',
			'Used for grouping and scoped search',
			() => this.plugin.settings.cities,
			async (lines) => {
				this.plugin.settings.cities = lines;
				MDParser.setPriorityLists(this.plugin.settings.priorityBeforeCities, this.plugin.settings.cities, this.plugin.settings.priorityAfterCities);
				await this.plugin.saveSettings();
			},
		);

		makeListSection(
			'Important Topics',
			'Sorted after sectors, top = highest priority',
			() => this.plugin.settings.priorityAfterCities,
			async (lines) => {
				this.plugin.settings.priorityAfterCities = lines;
				MDParser.setPriorityLists(this.plugin.settings.priorityBeforeCities, this.plugin.settings.cities, this.plugin.settings.priorityAfterCities);
				await this.plugin.saveSettings();
			},
		);

		new Setting(containerEl)
			.setName('Reload minutes')
			.setDesc('Re-scan the minutes folder and rebuild the topic tree')
			.addButton(item => {
				item.setButtonText("Reload");
				item.onClick(() => {
					this.plugin.reloadTree();
					this.plugin.activateFileView();
				});
			});
	}
}
