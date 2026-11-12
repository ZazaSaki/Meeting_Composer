// Card inspection drawer (spec §6.2): edit title / description / tags / status,
// read the chronological recall history. All edits go through MarkdownMutator.

import React, { useEffect, useState } from "react";
import { CardNode } from "../types";
import { ViewProps } from "./host";
import { CardHistory, HierarchyPill, TagChips } from "./components";
import { normalizeTag } from "../core/syntax";

export function CardDrawer({ host, component, card, onClose }: ViewProps & { card: CardNode; onClose: () => void }) {
	const [title, setTitle] = useState(card.title);
	const [desc, setDesc] = useState(card.description);
	const [descDirty, setDescDirty] = useState(false);
	const [newTag, setNewTag] = useState("");

	// follow external edits unless the user is mid-edit
	useEffect(() => setTitle(card.title), [card.id, card.title]);
	useEffect(() => {
		if (!descDirty) setDesc(card.description);
	}, [card.id, card.description]);
	useEffect(() => setDescDirty(false), [card.id]);

	const commitTitle = () => {
		const t = title.trim();
		if (t && t !== card.title) void host.mutator.setTitle(card, t);
		else setTitle(card.title);
	};

	const saveDesc = async () => {
		await host.mutator.setDescription(card, desc);
		setDescDirty(false);
	};

	const addTag = () => {
		const raw = newTag.trim();
		if (!raw) return;
		const tag = normalizeTag(raw.replace(/\s+/g, "-"));
		void host.mutator.addTag(card, tag);
		setNewTag("");
	};

	return (
		<aside className="mc2-drawer" aria-label="Card details">
			<div className="mc2-drawer-head">
				<input
					className="mc2-drawer-title"
					value={title}
					onChange={e => setTitle(e.target.value)}
					onBlur={commitTitle}
					onKeyDown={e => {
						if (e.key === "Enter") (e.target as HTMLInputElement).blur();
						if (e.key === "Escape") {
							setTitle(card.title);
							(e.target as HTMLInputElement).blur();
						}
					}}
					aria-label="Card title"
				/>
				<button className="mc2-icon-btn" onClick={onClose} aria-label="Close drawer">
					✕
				</button>
			</div>
			<div className="mc2-drawer-sub">
				<HierarchyPill h={card.hierarchy} />
				<span className="mc2-muted">^{card.id}</span>
			</div>

			<div className="mc2-drawer-row">
				<button
					className={card.status === "open" ? "mod-cta" : ""}
					onClick={() => host.mutator.setStatus(card, card.status === "open" ? "closed" : "open")}
				>
					{card.status === "open" ? "Close card" : "Re-open card"}
				</button>
				<button onClick={() => host.openCard(card)}>Open in note</button>
				<button onClick={() => host.insertRecall(card)}>Insert recall</button>
			</div>

			<div className="mc2-section-title">Tags</div>
			<div className="mc2-drawer-row">
				<TagChips tags={card.tags} onRemove={t => host.mutator.removeTag(card, t)} />
				<input
					className="mc2-tag-input"
					placeholder="#add-tag"
					value={newTag}
					onChange={e => setNewTag(e.target.value)}
					onKeyDown={e => e.key === "Enter" && addTag()}
				/>
			</div>

			<div className="mc2-section-title">
				Description{card.openedAt ? ` (opened ${card.openedAt})` : ""}
			</div>
			<textarea
				className="mc2-drawer-desc"
				value={desc}
				rows={8}
				onChange={e => {
					setDesc(e.target.value);
					setDescDirty(true);
				}}
			/>
			{descDirty && (
				<div className="mc2-drawer-row">
					<button className="mod-cta" onClick={saveDesc}>
						Save description
					</button>
					<button
						onClick={() => {
							setDesc(card.description);
							setDescDirty(false);
						}}
					>
						Discard
					</button>
				</div>
			)}

			<CardHistory host={host} component={component} card={card} hideDescription />
		</aside>
	);
}
