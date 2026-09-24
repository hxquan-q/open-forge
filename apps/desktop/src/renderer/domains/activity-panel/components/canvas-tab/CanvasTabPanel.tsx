// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import type { CanvasSelectedView, CanvasTabModel, CanvasTabRowView } from "../../hooks/useCanvasTabModel";
import { useCanvasTabModel } from "../../hooks/useCanvasTabModel";
import { CodePreview } from "../previews/CodePreview";
import { MarkdownPreview } from "../previews/MarkdownPreview";
import { CanvasHtmlSandbox } from "./CanvasHtmlSandbox";

export function CanvasTabPanel(): JSX.Element {
	return <CanvasTabPanelView model={useCanvasTabModel()} />;
}

export function CanvasTabPanelView({ model }: { readonly model: CanvasTabModel }): JSX.Element {
	if (model.selected) {
		return <CanvasPreview model={model} selected={model.selected} />;
	}
	if (model.loading) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
				<span aria-hidden className="icon-[solar--refresh-linear] h-5 w-5 animate-spin text-muted-foreground/60" />
				<p className="text-[13px] text-muted-foreground">{model.labels.loading}</p>
			</div>
		);
	}
	if (model.empty) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
				<span aria-hidden className="icon-[solar--notes-linear] h-8 w-8 text-muted-foreground/60" />
				<p className="text-[13px] text-foreground">{model.emptyLabel}</p>
				<p className="text-[12px] text-muted-foreground">{model.emptyHint}</p>
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
				{model.groups.map((group) => (
					<section key={group.sessionId} className="space-y-2">
						<h3 className="px-0.5 text-[11px] text-muted-foreground/60">
							{model.labels.groupBySession} · {group.sessionTitle}
						</h3>
						<ul className="space-y-2">
							{group.items.map((item) => (
								<li key={item.artifactId}>
									<CanvasArtifactRow
										item={item}
										openLabel={model.labels.open}
										missingLabel={model.labels.missingFile}
										externalUpdateLabel={model.labels.externalUpdate}
										onOpen={model.actions.open}
									/>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}

function CanvasArtifactRow({
	item,
	openLabel,
	missingLabel,
	externalUpdateLabel,
	onOpen,
}: {
	readonly item: CanvasTabRowView;
	readonly openLabel: string;
	readonly missingLabel: string;
	readonly externalUpdateLabel: string;
	readonly onOpen: (artifactId: string) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={`${openLabel} ${item.title}`}
			onClick={() => onOpen(item.artifactId)}
			className="flex w-full flex-col gap-1 rounded-xl border border-border/50 bg-card/40 px-3.5 pt-3 pb-3 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-card/60"
		>
			<span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
			<span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/60">
				<span>{item.kindLabel}</span>
				<span aria-hidden>·</span>
				<span>{item.versionLabel}</span>
				<span aria-hidden>·</span>
				<span>{item.updatedAtLabel}</span>
			</span>
			{item.missing ? (
				<span className="text-[11px] text-destructive" role="status">
					{missingLabel}
				</span>
			) : null}
			{item.externalUpdate ? (
				<span className="text-[11px] text-amber-400" role="status">
					{externalUpdateLabel}
				</span>
			) : null}
		</button>
	);
}

function CanvasPreview({
	model,
	selected,
}: {
	readonly model: CanvasTabModel;
	readonly selected: CanvasSelectedView;
}): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<Button size="sm" variant="ghost" onClick={model.actions.back}>
					{model.labels.back}
				</Button>
				<div className="min-w-0 flex-1">
					<h2 className="truncate text-[13px] font-medium text-foreground">{selected.title}</h2>
					<p className="text-[11px] text-muted-foreground/60">
						{selected.kindLabel} · {selected.versionLabel}
					</p>
				</div>
				<Button size="sm" variant="outline" onClick={model.actions.saveToProject} disabled={selected.missing}>
					{model.labels.saveToProject}
				</Button>
				<Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={model.actions.deleteSelected}>
					{model.labels.delete}
				</Button>
			</div>
			{selected.externalUpdate ? (
				<p className="shrink-0 px-4 py-2 text-[12px] text-amber-400" role="status">
					{model.labels.externalUpdateHint}
				</p>
			) : null}
			{selected.missing ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center" role="status">
					<p className="text-[13px] text-foreground">{model.labels.missingFile}</p>
					<p className="text-[12px] text-muted-foreground">{model.labels.missingFileHint}</p>
				</div>
			) : (
				<CanvasPreviewBody model={model} selected={selected} />
			)}
			{model.selectionActionVisible ? (
				<div className="shrink-0 border-t border-border px-3 py-2">
					<Button size="sm" onClick={model.actions.attachSelection}>
						{model.labels.selectToAsk}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function CanvasPreviewBody({
	model,
	selected,
}: {
	readonly model: CanvasTabModel;
	readonly selected: CanvasSelectedView;
}): JSX.Element {
	if (selected.previewKind === "html" && selected.htmlSrc) {
		return (
			<CanvasHtmlSandbox
				src={selected.htmlSrc}
				label={model.labels.htmlSandboxLabel}
				onNavigate={model.actions.onHtmlNavigation}
			/>
		);
	}
	return (
		<div
			data-testid="canvas-text-preview"
			tabIndex={0}
			className="min-h-0 flex-1 overflow-y-auto"
			onMouseUp={(event) => model.actions.onPreviewSelectionChange(event.currentTarget)}
			onKeyUp={(event) => model.actions.onPreviewSelectionChange(event.currentTarget)}
		>
			{selected.previewKind === "code" ? (
				<CodePreview content={selected.content} extension={selected.extension.replace(/^\./, "")} theme={model.theme} />
			) : (
				<MarkdownPreview content={selected.content} />
			)}
		</div>
	);
}
