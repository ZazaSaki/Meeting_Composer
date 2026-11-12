// What the v2 views need from the plugin. Implemented by src/MeetingComposerV2.ts.

import { App, Component } from "obsidian";
import { VaultCardStore } from "../store/VaultCardStore";
import { MarkdownMutator } from "../sync/MarkdownMutator";
import { CardNode } from "../types";

export interface V2Host {
	app: App;
	store: VaultCardStore;
	mutator: MarkdownMutator;
	insertRecall(card: CardNode): void;
	/** Open the card syntax guide. */
	showHelp(): void;
	openCard(card: CardNode): Promise<void>;
	openLocation(path: string, line: number): Promise<void>;
	reissueId(card: CardNode): Promise<void>;
	compareTopics(a: string, b: string): number;
	/** Subscribe to the heading path under the active editor cursor. Returns an unsubscribe fn. */
	onCursorScope(cb: (slug: string) => void): () => void;
	currentCursorScope(): string;
}

export interface ViewProps {
	host: V2Host;
	component: Component; // owner for MarkdownRenderer children
}
