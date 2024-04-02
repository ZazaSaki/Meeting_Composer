import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, View } from 'obsidian';
import { editorInfoField } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownParser } from './DataMeenutes/App';
const MDParser = new MarkdownParser();

//const MDParser = new MarkdownParser();

export const VIEW_TYPE_EXAMPLE = "example-view";
import {basicSetup} from 'codemirror';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
  } from "@codemirror/view";
import { writeAnswer } from 'DataMeenutes/FileReader';
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	MeenutesDir: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	MeenutesDir: 'Atas'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;	

	async loadTree(){
		if (!this.app.vault.getFolderByPath(DEFAULT_SETTINGS.MeenutesDir)) {
			this.app.vault.createFolder(DEFAULT_SETTINGS.MeenutesDir)
		} 

		const folder = this.app.vault.getFolderByPath(DEFAULT_SETTINGS.MeenutesDir);

		await folder?.children.forEach(async (file)=>{
			const realPath = this.app.vault.adapter.basePath+ '/' + file.path;
			console.log(realPath);
			console.log(file.name.replace('.md','').trim());
			const name : string = await file.name.replace('.md','').trim();
			MDParser.AppendToExistingTreeFromPath(realPath, name);
		});


	}

	async onload() {
		await this.loadSettings();
		this.loadTree();
		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new ExampleView(leaf)
		  );
	  
		  this.addRibbonIcon("dice", "Activate view", () => {
			this.activateView();
		  });

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Using Meeting Composer');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		
		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));


		//my code

		this.addRibbonIcon('dice', 'Greet', () => {
			new Notice('Hello, world!');
		  });

				  
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
	
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);
	
		if (leaves.length > 0) {
		  // A leaf with our view already exists, use that
		  leaf = leaves[0];
		} else {
		  // Our view could not be found in the workspace, create a new leaf
		  // in the right sidebar for it
		  leaf = workspace.getRightLeaf(false);
		  if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
			// "Reveal" the leaf in case it is in a collapsed sidebar
			workspace.revealLeaf(leaf);
		  }
		  
		}
	
		
	  }
	

	
}

export class ExampleView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
	  super(leaf);
	}
  
	getViewType() {

	  return VIEW_TYPE_EXAMPLE;
	}
  
	getDisplayText() {
	  return "Meeting Composer";
	}
  
	async onOpen() {
	  const MainDir = 'Meeting_Composer_Search/';
	  const MainOutputName = 'output.md';
	  const MainOutput = MainDir + MainOutputName;
	  const realMainDir = this.app.vault.adapter.basePath+ '/' + MainDir;
	  const realMainOutput = this.app.vault.adapter.basePath + '/' + MainOutput;

	  const container = this.containerEl.children[1];
	  const {contentEl} = this;
	  container.empty();
	  container.createEl("h4", { text: "Meetting Composer" });
      let search : string = "";
	  
	  new Setting(contentEl).setName("Search").addText(item => {
	    item.onChange(string =>{
			
			search = string;
		});
		
		new Notice(item.getValue())
	  }).addButton(item =>{
		item.setButtonText("search");
	    
		let Work : WorkspaceLeaf | null = null;
		item.onClick(async ()=>{
			const file = await this.app.vault.getFileByPath(MainOutput);
			//Work = this.app.workspace.getLeaf("tab");

			if (!Work) {
				Work = this.app.workspace.getLeaf("tab");
				//this.app.workspace.getMostRecentLeaf();
				
			}
            

			
			
			
			let markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

			if (markdownView) {
				Work.setViewState({type: "markdown", active : true});
				new Notice(new MarkdownView(Work).getViewType());
			}
			
			markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

			if (markdownView) {
				//Work.getCursor();
				
			}
			
			if (file) {
				Work.openFile(file);
				
			}
			
			//this.app.workspace.openPopoutLeaf();
			new Notice("should open");	

			if (!search.includes('#')) {
				const display = MDParser.getOrganizedTopics(search,true);
				const print = MDParser.convertOrganizedTopicToMD(display);
				writeAnswer(realMainDir,MainOutputName,print);
			}else{
				const ss = search.replace('#','');
				console.log(ss);
				const display = MDParser.getOrganizedTags(ss);
				const print = MDParser.convertOrganizedTopicToMD(display);
				writeAnswer(realMainDir,MainOutputName,print);
			}

			
			//container.createEl('textarea', {text : print, attr :{width : '100%'}, }).setCssStyles({width : "100%", height : "70vh"});
			
			

		})
		
	  });
	  const vault = this.app.vault;
	  

	  console.log(MainOutput);
	  
	  if (!vault.getFolderByPath(MainDir)) {
		vault.createFolder(MainDir);
	  } 

	  const folder = vault.getFolderByPath(MainDir);

	  if (!vault.getFileByPath(MainOutput)) {
		vault.create(MainOutput, "");
	  }


	  const file = vault.getFileByPath(MainOutput);
	  console.log(file);
	  
	  if (file) {
		console.log(realMainDir);
	  }
	  
	  const display = MDParser.getOrganizedTopics("Reunião",true);
	  const print = MDParser.convertOrganizedTopicToMD(display);
	  container.createEl('button',{text : "click me"})
	  container.createDiv();
	  container.createEl('br');

	  //container.createEl('textarea', {text : print, attr :{width : '100%'}, }).setCssStyles({width : "100%", height : "70vh"});
	  
	  writeAnswer(realMainDir,MainOutputName,print);
	  
	  container.getElementsByTagName("button")
	}
  
	async onClose() {
	  // Nothing to clean up.
	}
  }
  

class EditorTab implements PluginValue {
	constructor(view : EditorView) {
		
	}
	
	update(update: ViewUpdate) {
	// ...
	}

	destroy() {
	// ...
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Meenutes Settings')
			.setDesc('Meenutes Directory')
			.addText(text => text
				.setPlaceholder('Use the Relarive Pah')
				.setValue(this.plugin.settings.MeenutesDir)
				.onChange(async (value) => {
					this.plugin.settings.MeenutesDir = value;
					await this.plugin.saveSettings();
				}));
	}

}





