import { App, Component, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, View } from 'obsidian';
import { editorInfoField } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownParser } from './DataMeenutes/App';
import { createRoot, Root } from 'react-dom/client';
import {StrictMode} from 'react';
import FileTree from './FileTree';
const MDParser = new MarkdownParser();

//const MDParser = new MarkdownParser();

export const VIEW_TYPE_EXAMPLE = "example-view";
export const VIEW_TYPE_FILE = "file-view";

import {basicSetup} from 'codemirror';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
  } from "@codemirror/view";
import { writeAnswer } from 'DataMeenutes/FileReader';
import { render } from 'react-dom';
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	MeenutesDir: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	MeenutesDir: 'Atas'
}

class TreeFolder {
	name: string;
	children: TreeFolder[];
  
	constructor(name: string) {
	  this.name = name;
	  this.children = [];
	}
  }

  	let TreeView : MyFolderItemView | null = null;
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;	
	createTreeView(leaf: WorkspaceLeaf, folder: TreeFolder): ItemView {
		const view = new MyFolderItemView(leaf, this,folder);
		TreeView = view;
		// Recursively add child ItemViews
		for (const child of folder.children) {
		  view.addChild(this.createTreeView(leaf, child));
		  console.log(child.name);
		}
		console.log(view);
		return view;
	  }

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

	async reloadTree(){
		MDParser.resetTree();
		TreeView?.onOpen()
		await this.loadTree();
	}

	async onload() {
		await this.loadSettings();
		this.loadTree();
		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new ExampleView(leaf)
		  );

		  const folder = new TreeFolder("test");
		  folder.children = [new TreeFolder("ff"),new TreeFolder("aa"),new TreeFolder("rrr")];

		this.registerView(
			VIEW_TYPE_FILE,
			(leaf) => this.createTreeView(leaf,folder)
		);

		
		  this.addRibbonIcon("scroll-text", "Activate view", () => {
			this.activateView();
			this.activateFileView();
		  });

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

	  async activateFileView() {
		const { workspace } = this.app;
	
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FILE);
	
		if (leaves.length > 0) {
		  // A leaf with our view already exists, use that
		  leaf = leaves[0];
		} else {
		  // Our view could not be found in the workspace, create a new leaf
		  // in the right sidebar for it
		  leaf = workspace.getRightLeaf(false);
		  if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_FILE, active: true });
			// "Reveal" the leaf in case it is in a collapsed sidebar
			workspace.revealLeaf(leaf);
		  }
		  
		}
	  }
	

	
}

interface Folder {
	name: string;
	children?: Folder[];
	toggleFolder : Function;
	isOpen : Boolean;
  }
  

class MyFolderItemView extends ItemView {
	plugin: MyPlugin;
	folder: any;
	isOpen: boolean = false;
	children: ItemView[] = [];

	root : Root;
  
	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
	  super(leaf);
	  this.plugin = plugin;
	  
	}
  
	getViewType(): string {
	  return VIEW_TYPE_FILE; // differentiate folder view type
	}
  
	getDisplayText(): string {
	  return "Tree up up hehe";
	}
	
	async renderTreeContainer(TopicTree : any){
		const container = this.containerEl.children[1];
		const {contentEl} = this;
		container.empty();
		const pointer = container.createEl("h4", { text: "Tree is up up " });
		
		// const toggleFolder = (data:any)=>{
		// 	data.isOpen = !data.isOpen;
		// 	console.log(data.name);
		// 	console.log(data.isOpen);
		// 	console.log('toggle');
		// 	console.log(data.isOpen);
		// };

		// var myData : any = {
		// name: 'Root Folder',
		// 	children: [
		// 	{ name: 'Folder 1', 
		// 			children: [{ name: 'File A' }, { name: 'File B' }],
		// 			isOpen : true,
		// 			toggleFolder: toggleFolder,
		// 		},
		// 	  { name: 'Folder 2', 
		// 	  		children: [
		// 				{ name: 'File C',
		// 				children: [{ name: 'File A' }, { name: 'File B' }],
		// 				isOpen : true,
		// 				toggleFolder: toggleFolder,
		// 				}],
		// 			isOpen : true,
		// 			toggleFolder: toggleFolder,
		// 		},
		// 	],
		// 	isOpen : true,
		// 	toggleFolder: toggleFolder,
			

		//   };
		
		
		
		//console.log(TopicTree);

		this.root = createRoot(container);
		const funcfunc = ()=>{
			console.log('\n wbhfiuwehbfbawbfoeigy \n\n wbhfiuwehbfbawbfoeigy \n\n wbhfiuwehbfbawbfoeigy \n')
		};
		pointer.onClickEvent(funcfunc);

		
		this.root.render(FileTree(TopicTree, 0, TopicTree));
		// this.containerEl.children[0].;
		
	}

	async onOpen(){
		
		
		const toggleFolder = (data:Folder, root :Folder, self:any = true, name = '')=>{
			
			console.log(name);
			
			//console.log(data.isOpen);
			if(!(root.name == data.name)){	
				console.log(data.name);
				console.log(name);
				console.log(self);
				console.log('in');
				console.log(data.name == name);

				//	console.log(this);
				

				if (data.name == name) {
					if (self) {
					data.isOpen = !data.isOpen;
					console.log(data.name);
					console.log(root);
					console.log('in not self');

					data.children?.forEach(element => {
						element.toggleFolder(element, root, false)
					});
					console.log(root);

					if (self) {
						this.renderTreeContainer(root);
					}
				}else{
					//data.isOpen = true;
				} 
				
				// data.children?.forEach(element => {
				// 	element.toggleFolder(element, root, false)
				// });
				}
			}
			
		};
		const TopicTree = MDParser.GenerateTopicTree(false, toggleFolder);
		this.renderTreeContainer(TopicTree);
		
	  //this.plugin.app.vault.postMessage({ type: "folder-toggle", folder: this.folder, isOpen: this.isOpen });
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
	}
	
	

	addChild<T extends Component>(child: T): T {
		this.children.push(child as unknown as ItemView); // Cast child to ItemView
		return child;
  }

  }
  
  // Respond to messages from the main view to update the dropdown state
// //   addCachedData({
// // 	type: "folder-toggle",
// // 	handler: (data: { folder: TFolder; isOpen: boolean }) => {
// // 	  // Find the corresponding ItemView and update its state
// // 	  // ... (implementation to find and update the ItemView)
// // 	},
// //   });

export class ExampleView extends ItemView {
	root : Root;
	
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
	  
	  const SearchArea = new Setting(contentEl).setName("Search").addText(item => {
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
	  
	  const inner : string = `<!DOCTYPE html>
	  <html>
	  <head>
	  <meta name="viewport" content="width=device-width, initial-scale=1">
	  <style>
	  ul, #myUL {
		list-style-type: none;
	  }
	  
	  #myUL {
		margin: 0;
		padding: 0;
	  }
	  
	  .caret {
		cursor: pointer;
		-webkit-user-select: none; /* Safari 3.1+ */
		-moz-user-select: none; /* Firefox 2+ */
		-ms-user-select: none; /* IE 10+ */
		user-select: none;
	  }
	  
	  .caret::before {
		content: "\\25B6";
		color: black;
		display: inline-block;
		margin-right: 6px;
	  }
	  
	  .caret-down::before {
		-ms-transform: rotate(90deg); /* IE 9 */
		-webkit-transform: rotate(90deg); /* Safari */'
		transform: rotate(90deg);  
	  }
	  
	  .nested {
		display: none;
	  }
	  
	  .active {
		display: block;
	  }
	  </style>
	  </head>
	  <body>
	  
	  <h2>Tree View</h2>
	  <p>A tree view represents a hierarchical view of information, where each item can have a number of subitems.</p>
	  <p>Click on the arrow(s) to open or close the tree branches.</p>
	  
	  <ul id="myUL">
		<li><span class="caret">Beverages</span>
		  <ul class="nested">
			<li>Water</li>
			<li>Coffee</li>
			<li><span class="caret">Tea</span>
			  <ul class="nested">
				<li>Black Tea</li>
				<li>White Tea</li>
				<li><span class="caret">Green Tea</span>
				  <ul class="nested">
					<li>Sencha</li>
					<li>Gyokuro</li>
					<li>Matcha</li>
					<li>Pi Lo Chun</li>
				  </ul>
				</li>
			  </ul>
			</li>  
		  </ul>
		</li>
	  </ul>
	  
	  <script>
	  var toggler = document.getElementsByClassName("caret");
	  var i;
	  
	  for (i = 0; i < toggler.length; i++) {
		toggler[i].addEventListener("click", function() {
		  this.parentElement.querySelector(".nested").classList.toggle("active");
		  this.classList.toggle("caret-down");
		});
	  }
	  </script>
	  
	  </body>
	  </html>
	  `
	  
	  const div = container.createEl("li", "Name",(Root) => {
		//Root.appendChild();
	  });
	  
	  const bb = new Setting(div).addButton((bbb)=>{
		bbb.setButtonText("name");
	  });

	  new Setting(div).addColorPicker(()=>{

	  });
	  
	  new Setting(div).setHeading().setName("File");

	  div.onClickEvent((event)=>{
		console.log("here it is");
		console.log(event);
		console.log("here it was");

	  });
	  //container.createEl('textarea', {text : print, attr :{width : '100%'}, }).setCssStyles({width : "100%", height : "70vh"});

	  
	  
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

		new Setting(containerEl).setName('Reload the Files').addButton((item)=>{
			item.onClick(()=>{
				this.plugin.reloadTree();
				this.plugin.activateFileView();
			});
			item.setButtonText("Reload");
		});
	}

}





