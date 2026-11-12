// First-class .orgboard workspace view (spec §6–§7): JSON-backed presets,
// kanban / matrix layouts, drag-and-drop that writes back to Markdown.

import React, { useMemo, useState } from "react";
import { Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { BoardViewPreset, CardNode, OrgBoardFileSchema } from "../types";
import { assignColumn, cardsForPreset, DropOp, normalizeColumn, planDrop } from "../core/boardEngine";
import { parseBoardFile, serializeBoard } from "../core/boardFile";
import * as M from "../core/mutations";
import { buildTree } from "../core/tree";
import { V2Host } from "./host";
import { CardFace, useStoreVersion } from "./components";
import { CardDrawer } from "./CardDrawer";
import { matches } from "./CardsSidebarView";
import { flattenTree, HeadingSuggestModal, JsonEditModal, PromptModal } from "./modals";

export const VIEW_TYPE_ORG_BOARD = "meeting-composer-orgboard";
export const ORGBOARD_EXT = "orgboard";

const DRAG_MIME = "application/x-meeting-composer-card";

export class OrgBoardView extends TextFileView {
	private root: Root | null = null;
	private board: OrgBoardFileSchema | null = null;
	private error: string | null = null;
	private raw = "";

	constructor(leaf: WorkspaceLeaf, private host: V2Host) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_ORG_BOARD;
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Org board";
	}

	/** Invalid files are written back untouched. */
	getViewData(): string {
		return this.board && !this.error ? serializeBoard(this.board) : this.raw;
	}

	setViewData(data: string, clear: boolean): void {
		this.raw = data;
		const r = parseBoardFile(data);
		if (r.ok) {
			this.board = r.board;
			this.error = null;
		} else {
			this.board = null;
			this.error = r.error;
		}
		this.render();
	}

	clear(): void {
		this.board = null;
		this.error = null;
		this.raw = "";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("mc2-board-view");
		this.root = createRoot(this.contentEl);
		this.render();
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}

	private update = (board: OrgBoardFileSchema) => {
		this.board = board;
		this.raw = serializeBoard(board);
		this.requestSave();
		this.render();
	};

	private editJson = () => {
		new JsonEditModal(this.app, this.board ? serializeBoard(this.board) : this.raw, text => {
			const r = parseBoardFile(text);
			if (!r.ok) return r.error;
			this.error = null;
			this.update(r.board);
			return null;
		}).open();
	};

	private render(): void {
		if (!this.root) return;
		this.root.render(
			<BoardApp
				host={this.host}
				view={this}
				board={this.board}
				error={this.error}
				onChange={this.update}
				onEditJson={this.editJson}
			/>,
		);
	}
}

interface BoardAppProps {
	host: V2Host;
	view: OrgBoardView;
	board: OrgBoardFileSchema | null;
	error: string | null;
	onChange: (b: OrgBoardFileSchema) => void;
	onEditJson: () => void;
}

function BoardApp({ host, view, board, error, onChange, onEditJson }: BoardAppProps) {
	const version = useStoreVersion(host.store);
	const [selected, setSelected] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [dragOver, setDragOver] = useState<string | null>(null);

	const preset = board?.presets.find(p => p.id === board.activePresetId) ?? board?.presets[0];

	const columns = useMemo(() => {
		const out = new Map<string, CardNode[]>();
		if (!preset) return out;
		preset.columns.forEach(c => out.set(c.id, []));
		const q = query.trim().toLowerCase();
		for (const c of cardsForPreset(host.store.getCards(), preset)) {
			if (q && !matches(c, q)) continue;
			const col = assignColumn(c, preset);
			if (col) out.get(col)?.push(c);
		}
		out.forEach(list => list.sort((a, b) => (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "")));
		return out;
	}, [version, preset, query]);

	if (error) {
		return (
			<div className="mc2-board-error">
				<h3>This board file could not be read</h3>
				<p className="mc2-error">{error}</p>
				<p className="mc2-muted">The file is left untouched. Fix it in the JSON editor:</p>
				<button className="mod-cta" onClick={onEditJson}>Edit board JSON</button>
			</div>
		);
	}
	if (!board || !preset) return <div className="mc2-muted mc2-empty">Loading…</div>;

	const selectedCard = selected ? host.store.getCard(selected) : undefined;

	const setPreset = (id: string) => onChange({ ...board, activePresetId: id });
	const replacePreset = (p: BoardViewPreset) =>
		onChange({ ...board, presets: board.presets.map(x => (x.id === p.id ? p : x)) });

	const addColumn = () => {
		if (preset.dropMode === "header") {
			const tree = buildTree(host.store.getAllPaths(), host.store.getCards(), (a, b) => host.compareTopics(a, b));
			new HeadingSuggestModal(host.app, flattenTree(tree), n => {
				replacePreset({
					...preset,
					columns: [...preset.columns, { id: "col-" + Date.now().toString(36), title: n.name, ruleType: "header", ruleValue: n.slug }],
				});
			}).open();
		} else {
			new PromptModal(host.app, "New tag column", "#tag (e.g. #waiting)", v => {
				const tag = v.startsWith("#") ? v : "#" + v;
				replacePreset({
					...preset,
					columns: [...preset.columns, { id: "col-" + Date.now().toString(36), title: tag, ruleType: "tag", ruleValue: tag }],
				});
			}).open();
		}
	};

	const removeColumn = (id: string) => replacePreset({ ...preset, columns: preset.columns.filter(c => c.id !== id) });

	const onDrop = async (toId: string, e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(null);
		let payload: { id: string; from: string | null };
		try {
			payload = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
		} catch {
			return;
		}
		const card = host.store.getCard(payload.id);
		if (!card) return;
		const ops = planDrop(card, payload.from, toId, preset);
		if (ops.length === 0) return;
		const known = host.store.getAllPaths().map(p => p.segments);
		await host.mutator.applyAll(card, ops.map(op => opToFn(op, card.id, known)));
	};

	const cols = preset.columns.map(c => ({ raw: c, norm: normalizeColumn(c, preset.scopeFilter?.hierarchyPrefix) }));

	return (
		<div className={`mc2-board ${selectedCard ? "has-drawer" : ""}`}>
			<div className="mc2-board-toolbar">
				<div className="mc2-presets" role="tablist">
					{board.presets.map(p => (
						<button
							key={p.id}
							role="tab"
							aria-selected={p.id === preset.id}
							className={p.id === preset.id ? "is-active" : ""}
							onClick={() => setPreset(p.id)}
						>
							{p.name}
						</button>
					))}
				</div>
				<input type="search" placeholder="Filter cards…" value={query} onChange={e => setQuery(e.target.value)} />
				<button onClick={addColumn} title="Add a column to this view">＋ Column</button>
				<button onClick={onEditJson} title="Edit the presets as JSON">{"{ } JSON"}</button>
			</div>

			<div className="mc2-board-body">
				<div className={`mc2-columns mc2-layout-${preset.layout}`}>
					{cols.map(({ raw, norm }) => {
						const list = columns.get(raw.id) ?? [];
						return (
							<section
								key={raw.id}
								className={`mc2-column ${dragOver === raw.id ? "is-drag-over" : ""}`}
								style={raw.color ? { borderTopColor: raw.color } : undefined}
								onDragOver={e => {
									if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									if (dragOver !== raw.id) setDragOver(raw.id);
								}}
								onDragLeave={e => {
									if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver(null);
								}}
								onDrop={e => onDrop(raw.id, e)}
							>
								<header className="mc2-column-head">
									<span className="mc2-column-title">{raw.title}</span>
									<span className="mc2-muted mc2-column-rule">{ruleLabel(norm)}</span>
									<span className="mc2-badge">{list.length}</span>
									<button className="mc2-icon-btn" aria-label={`Remove column ${raw.title}`} onClick={() => removeColumn(raw.id)}>
										×
									</button>
								</header>
								<div className="mc2-column-cards">
									{list.map(c => (
										<div
											key={c.id}
											className={`mc2-card mc2-board-card ${selected === c.id ? "is-selected" : ""}`}
											draggable
											onDragStart={e => {
												e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: c.id, from: raw.id }));
												e.dataTransfer.effectAllowed = "move";
											}}
											onClick={() => setSelected(selected === c.id ? null : c.id)}
										>
											<CardFace card={c} />
										</div>
									))}
									{list.length === 0 && <div className="mc2-muted mc2-drop-hint">Drop cards here</div>}
								</div>
							</section>
						);
					})}
					{cols.length === 0 && <div className="mc2-muted mc2-empty">This view has no columns. Use ＋ Column.</div>}
				</div>
				{selectedCard && (
					<CardDrawer host={host} component={view} card={selectedCard} onClose={() => setSelected(null)} />
				)}
			</div>
		</div>
	);
}

function ruleLabel(c: { ruleType: string; ruleValue: string; requiredTags?: string[] }): string {
	if (c.ruleType === "status") return c.ruleValue === "closed" ? "#closed-card" : "#open-card";
	if (c.ruleType === "tag") return [c.ruleValue, ...(c.requiredTags ?? [])].join(" + ");
	return c.ruleValue;
}

function opToFn(op: DropOp, id: string, known: { level: number; text: string }[][]): (t: string) => string {
	switch (op.kind) {
		case "addTag":
			return t => M.addTag(t, id, op.tag);
		case "removeTag":
			return t => M.removeTag(t, id, op.tag);
		case "setStatus":
			return t => M.setStatus(t, id, op.status);
		case "move": {
			const segments = M.segmentsForSlug(op.slug, known, op.title);
			if (segments.length === 0) {
				new Notice("Meeting Composer: column has no heading path");
				return t => t;
			}
			return t => M.moveCardToHeading(t, id, segments);
		}
	}
}
