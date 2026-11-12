// Closes an origin card when a recall line carries #closed-card (spec §4.2), once per recall.

import { EventRef, Notice } from "obsidian";
import { planRemoteCloses } from "../core/remoteClose";
import { VaultCardStore } from "../store/VaultCardStore";
import { MarkdownMutator } from "./MarkdownMutator";

export interface ProcessedKeysStore {
	get(): Set<string>;
	add(keys: string[]): Promise<void>;
}

export class RemoteCloser {
	private running = false;
	private again = false;

	constructor(
		private store: VaultCardStore,
		private mutator: MarkdownMutator,
		private keys: ProcessedKeysStore,
	) {}

	attach(register: (ref: EventRef) => void): void {
		register(this.store.on("updated", () => this.check()));
	}

	async check(): Promise<void> {
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const plan = planRemoteCloses(this.store.getCards(), this.keys.get());
			if (plan.newKeys.length === 0) return;
			// persist first: even if a write fails we never re-close a card the user re-opened
			await this.keys.add(plan.newKeys);
			for (const card of plan.toClose) {
				if (await this.mutator.setStatus(card, "closed")) {
					new Notice(`Closed "${card.title}" from a recall`);
				}
			}
		} finally {
			this.running = false;
			if (this.again) {
				this.again = false;
				void this.check();
			}
		}
	}
}
