// Closes an origin card when a recall line carries #closed-card (spec §4.2), once per recall,
// and re-opens it when that #closed-card is erased again.

import { EventRef, Notice } from "obsidian";
import { planRemoteCloses, planRemoteReopens } from "../core/remoteClose";
import { VaultCardStore } from "../store/VaultCardStore";
import { MarkdownMutator } from "./MarkdownMutator";

export interface ProcessedKeysStore {
	/** every closing recall already acted on */
	get(): Set<string>;
	/** closing recalls that actually closed their card */
	closedBy(): Set<string>;
	add(keys: string[], closingKeys: string[]): Promise<void>;
	/** forget recalls whose #closed-card was erased */
	release(keys: string[]): Promise<void>;
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
			const reopen = planRemoteReopens(this.store.getCards(), this.keys.closedBy());
			if (reopen.releasedKeys.length) {
				await this.keys.release(reopen.releasedKeys);
				for (const card of reopen.toReopen) {
					if (await this.mutator.setStatus(card, "open")) {
						new Notice(`Re-opened "${card.title}": #closed-card was removed from its recall`);
					}
				}
			}

			const plan = planRemoteCloses(this.store.getCards(), this.keys.get());
			if (plan.newKeys.length === 0) return;
			// persist first: even if a write fails we never re-close a card the user re-opened
			await this.keys.add(plan.newKeys, plan.closingKeys);
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
