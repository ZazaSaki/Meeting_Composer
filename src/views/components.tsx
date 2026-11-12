import React, { useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "obsidian";
import { CardNode, HierarchyPath } from "../types";
import { V2Host, ViewProps } from "./host";
import { VaultCardStore } from "../store/VaultCardStore";

/** Re-render on every store update. */
export function useStoreVersion(store: VaultCardStore): number {
	const [v, setV] = useState(0);
	useEffect(() => {
		const ref = store.on("updated", () => setV(x => x + 1));
		return () => store.offref(ref);
	}, [store]);
	return v;
}

export function HierarchyPill({ h }: { h: HierarchyPath }) {
	if (h.segments.length === 0) return null;
	return <span className="mc2-pill">{h.segments.map(s => s.text).join(" → ")}</span>;
}

export function TagChips({ tags, onRemove }: { tags: string[]; onRemove?: (t: string) => void }) {
	return (
		<span className="mc2-tags">
			{tags.map(t => (
				<span key={t} className="mc2-tag">
					{t}
					{onRemove && (
						<button className="mc2-tag-x" aria-label={`Remove ${t}`} onClick={e => { e.stopPropagation(); onRemove(t); }}>
							×
						</button>
					)}
				</span>
			))}
		</span>
	);
}

export function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function CardFace({ card, compact }: { card: CardNode; compact?: boolean }) {
	return (
		<div className="mc2-card-face">
			<div className="mc2-card-title">
				<span className={`mc2-status mc2-status-${card.status}`} aria-label={card.status} />
				{card.title || <em>(untitled)</em>}
			</div>
			{!compact && <HierarchyPill h={card.hierarchy} />}
			<div className="mc2-card-meta">
				<TagChips tags={card.tags} />
				<span className="mc2-muted">
					{plural(card.recalls.length, "recall")}
					{card.lastUpdated ? ` · ${card.lastUpdated}` : ""}
				</span>
			</div>
		</div>
	);
}

/** Renders Markdown with Obsidian's renderer (links, lists, tags…). */
export function MarkdownBlock({ host, component, markdown, sourcePath }: ViewProps & { markdown: string; sourcePath: string }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.empty();
		if (markdown.trim()) void MarkdownRenderer.render(host.app, markdown, el, sourcePath, component);
	}, [markdown, sourcePath]);
	return <div ref={ref} className="mc2-md" />;
}

function baseName(path: string): string {
	return path.split("/").pop() ?? path;
}

/** Description + chronological recall history (spec §4.2). */
export function CardHistory({ host, component, card, hideDescription }: ViewProps & { card: CardNode; hideDescription?: boolean }) {
	return (
		<div className="mc2-history">
			{!hideDescription && (
				<section>
					<div className="mc2-section-title">
						Description{card.openedAt ? ` (opened ${card.openedAt})` : ""}
					</div>
					{card.description.trim() ? (
						<MarkdownBlock host={host} component={component} markdown={card.description} sourcePath={card.filePath} />
					) : (
						<div className="mc2-muted">No description</div>
					)}
				</section>
			)}
			<section>
				<div className="mc2-section-title">Recall history</div>
				{card.recalls.length === 0 && <div className="mc2-muted">No recalls yet</div>}
				{card.recalls.map(r => (
					<div key={r.sourceFilePath + ":" + r.anchorLine} className="mc2-recall">
						<a
							className="mc2-recall-head"
							onClick={() => host.openLocation(r.sourceFilePath, r.anchorLine)}
							title="Open in the meeting note"
						>
							[{r.timestamp ?? "no timestamp"}] — {baseName(r.sourceFilePath)}
							{r.closes && <span className="mc2-tag">#closed-card</span>}
						</a>
						<MarkdownBlock host={host} component={component} markdown={r.content} sourcePath={r.sourceFilePath} />
					</div>
				))}
			</section>
		</div>
	);
}

export function DuplicateBanner({ host }: { host: V2Host }) {
	const dups = host.store.getDuplicates();
	if (dups.length === 0) return null;
	return (
		<div className="mc2-warning">
			<div>⚠ {plural(dups.length, "duplicate card id")} (copied card lines?)</div>
			{dups.map(d => (
				<div key={d.filePath + d.titleLine} className="mc2-dup">
					<a onClick={() => host.openCard(d)}>
						^{d.id} in {baseName(d.filePath)}
					</a>
					<button onClick={() => host.reissueId(d)}>Re-issue id</button>
				</div>
			))}
		</div>
	);
}
