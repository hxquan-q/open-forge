// Copyright The Open Forge contributors.
import { FILE_EDITOR_SAVE_EVENT } from "@/shared/shortcuts";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { Textarea } from "@shared/components/ui/textarea";
import { cn } from "@shared/lib/utils";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
	CanvasEditorView,
	CanvasSelectedView,
	CanvasTabModel,
	CanvasTabRowView,
} from "../../hooks/useCanvasTabModel";
import { useCanvasTabModel } from "../../hooks/useCanvasTabModel";
import { parseCanvasChart } from "../../services/canvas-chart";
import { parseCanvasChecklist } from "../../services/canvas-checklist";
import { groupCanvasDiffFiles } from "../../services/canvas-diff";
import type { SessionChangeStatus } from "../../services/session-changes";
import { EditDiffView } from "../../../conversation/components/blocks/tool-views/EditDiffView";
import { CodePreview } from "../previews/CodePreview";
import { MarkdownPreview } from "../previews/MarkdownPreview";
import { CanvasChartPreview } from "./CanvasChartPreview";
import { CanvasChecklistPreview } from "./CanvasChecklistPreview";
import { CanvasDataGridPreview } from "./CanvasDataGridPreview";
import { CanvasHtmlSandbox } from "./CanvasHtmlSandbox";
import { CanvasStructuredDiffPreview } from "./CanvasStructuredDiffPreview";

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
	if (model.empty && model.section === "artifacts") {
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
			<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<SegmentedControl
					items={[
						{ key: "artifacts", label: model.labels.sectionArtifacts },
						{ key: "changes", label: model.labels.sectionChanges(model.changeFiles.length) },
					]}
					value={model.section}
					onChange={model.actions.selectSection}
				/>
				{model.section === "artifacts" ? (
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<Button
							size="sm"
							variant="outline"
							disabled={model.groups.length === 0}
							onClick={model.actions.saveAllArtifacts}
						>
							{model.labels.saveAllToProject}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="text-destructive hover:text-destructive"
							disabled={model.groups.length === 0}
							onClick={model.actions.discardAllArtifacts}
						>
							{model.labels.discardAll}
						</Button>
					</div>
				) : null}
			</div>
			{model.section === "changes" ? (
				<CanvasChangesOverview model={model} />
			) : (
				<CanvasArtifactList model={model} />
			)}
		</div>
	);
}

function CanvasArtifactList({ model }: { readonly model: CanvasTabModel }): JSX.Element {
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

/**
 * 任务变更：会话内文件改动的只读汇总。文件列表给出路径、状态与增删行，
 * 选中后在下方复用 `EditDiffView` 展示该文件的差异；不写会话事实、不改文件。
 */
function CanvasChangesOverview({ model }: { readonly model: CanvasTabModel }): JSX.Element {
	if (model.changeFiles.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center" role="status">
				<span aria-hidden className="icon-[solar--branching-paths-up-linear] h-8 w-8 text-muted-foreground/60" />
				<p className="text-[13px] text-foreground">{model.labels.changesEmpty}</p>
				<p className="text-[12px] text-muted-foreground">{model.labels.changesEmptyHint}</p>
			</div>
		);
	}

	const statusLabel: Record<SessionChangeStatus, string> = {
		added: model.labels.statusAdded,
		modified: model.labels.statusModified,
		deleted: model.labels.statusDeleted,
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="shrink-0 px-4 pt-2 text-[11px] tabular-nums text-muted-foreground/60">
				<span className="text-emerald-400">{`+${model.changeTotals.added}`}</span>
				<span aria-hidden> / </span>
				<span className="text-destructive">{`-${model.changeTotals.removed}`}</span>
			</div>
			<ul className="max-h-56 shrink-0 space-y-1 overflow-y-auto px-3 py-2">
				{model.changeFiles.map((file) => (
					<li key={file.path}>
						<Button
							size="sm"
							variant="ghost"
							aria-pressed={model.selectedChange?.path === file.path}
							className={cn(
								"w-full justify-start gap-2",
								model.selectedChange?.path === file.path && "bg-primary/10 text-foreground",
							)}
							onClick={() => model.actions.selectChange(file.path)}
						>
							<span className="truncate text-[12px] text-foreground">{file.path}</span>
							<span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
								<span className="text-muted-foreground/60">{statusLabel[file.status]}</span>
								{file.changes > 1 ? (
									<span className="text-muted-foreground/50">{model.labels.changeCount(file.changes)}</span>
								) : null}
								<span className="text-emerald-400">{`+${file.added}`}</span>
								<span className="text-destructive">{`-${file.removed}`}</span>
							</span>
						</Button>
					</li>
				))}
			</ul>
			<div className="min-h-0 flex-1 overflow-auto border-t border-border px-4 py-3">
				{model.selectedChange ? (
					<EditDiffView block={{ args: {}, uiDetails: { diff: model.selectedChange.diff } }} />
				) : (
					<p className="text-[12px] text-muted-foreground/60">{model.labels.changePickHint}</p>
				)}
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
			<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<Button size="sm" variant="ghost" onClick={model.actions.back}>
					{model.labels.back}
				</Button>
				<div className="min-w-0 flex-1">
					<h2 className="truncate text-[13px] font-medium text-foreground">{selected.title}</h2>
					<p className="text-[11px] text-muted-foreground/60">
						{selected.kindLabel} · {selected.versionLabel}
					</p>
				</div>
				{selected.editable ? (
					<Button
						size="sm"
						variant="outline"
						onClick={model.actions.toggleEditing}
						aria-pressed={model.editor !== null}
					>
						<span
							aria-hidden
							className={`h-3.5 w-3.5 ${model.editor ? "icon-[solar--eye-linear]" : "icon-[solar--pen-2-linear]"}`}
						/>
						{model.editor ? model.labels.exitEdit : model.labels.enterEdit}
					</Button>
				) : null}
				{selected.previewKind === "html" && !selected.missing ? (
					<Button size="sm" variant="outline" onClick={model.actions.openInBrowser}>
						{model.labels.openInBrowser}
					</Button>
				) : null}
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
			) : model.editor ? (
				<CanvasContentEditor model={model} editor={model.editor} />
			) : (
				<CanvasPreviewBody model={model} selected={selected} />
			)}
			{model.selectionActionVisible ? (
				<div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
					<Button size="sm" onClick={model.actions.attachSelection}>
						{model.labels.selectToAsk}
					</Button>
					{model.macros.length > 0 ? (
						<div
							role="group"
							aria-label={model.labels.macrosLabel}
							className="ml-auto flex flex-wrap items-center gap-1"
						>
							{model.macros.map((macro) => (
								<Button
									key={macro.id}
									size="sm"
									variant="outline"
									onClick={() => model.actions.runMacro(macro.id)}
								>
									<span aria-hidden className={`${macro.icon} h-3.5 w-3.5`} />
									{macro.label}
								</Button>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/**
 * 就地编辑正文。保存键走既有 `save-file` keybinding 广播（`mod+s` 可在设置里改），
 * 面板不写死按键；未保存的草稿只在用户显式退出编辑或载入最新版本时丢弃。
 */
function CanvasContentEditor({
	model,
	editor,
}: {
	readonly model: CanvasTabModel;
	readonly editor: CanvasEditorView;
}): JSX.Element {
	const saveRef = useRef(model.actions.saveDraft);
	saveRef.current = model.actions.saveDraft;
	const saving = editor.saving;

	useEffect(() => {
		if (saving) return;
		const onSave = (): void => saveRef.current();
		window.addEventListener(FILE_EDITOR_SAVE_EVENT, onSave);
		return () => window.removeEventListener(FILE_EDITOR_SAVE_EVENT, onSave);
	}, [saving]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{editor.staleVersion ? (
				<div className="shrink-0 space-y-1 border-b border-border px-4 py-2" role="status">
					<p className="text-[12px] text-amber-400">{model.labels.staleVersion}</p>
					<p className="text-[11px] text-muted-foreground/70">{model.labels.staleVersionHint}</p>
					<Button size="sm" variant="outline" onClick={model.actions.reloadSelected}>
						{model.labels.reload}
					</Button>
				</div>
			) : null}
			<Textarea
				aria-label={model.labels.editorLabel}
				value={editor.draft}
				onChange={(event) => model.actions.updateDraft(event.target.value)}
				className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-[12px] leading-relaxed focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50 md:text-[12px]"
			/>
			<div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
				<Button size="sm" onClick={model.actions.saveDraft} disabled={editor.saving}>
					{editor.saving ? model.labels.saving : model.labels.save}
				</Button>
			</div>
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
	if (selected.previewKind === "data-grid" && selected.dataGridFormat) {
		return (
			<CanvasDataGridPreview
				content={selected.content}
				format={selected.dataGridFormat}
				labels={model.labels.dataGrid}
				onSelectionChange={model.actions.onDataGridSelectionChange}
			/>
		);
	}
	// 声明式组件解析失败时不白屏：给出明确提示并降级到代码视图。
	const degraded = (): JSX.Element => (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<p className="shrink-0 border-b border-border px-4 py-2 text-[12px] text-amber-400" role="status">
				{model.labels.invalidStructured}
			</p>
			<CanvasTextPreview model={model} selected={selected} />
		</div>
	);
	if (selected.previewKind === "chart") {
		const spec = parseCanvasChart(selected.content);
		return spec ? <CanvasChartPreview spec={spec} labels={model.labels.chart} /> : degraded();
	}
	if (selected.previewKind === "checklist") {
		const spec = parseCanvasChecklist(selected.content);
		return spec ? <CanvasChecklistPreview spec={spec} labels={model.labels.checklist} /> : degraded();
	}
	if (selected.previewKind === "diff") {
		const files = groupCanvasDiffFiles(selected.content);
		return files.length > 0 ? (
			<CanvasStructuredDiffPreview files={files} labels={model.labels.diff} />
		) : (
			degraded()
		);
	}
	return <CanvasTextPreview model={model} selected={selected} />;
}

function CanvasTextPreview({
	model,
	selected,
}: {
	readonly model: CanvasTabModel;
	readonly selected: CanvasSelectedView;
}): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<div
			data-testid="canvas-text-preview"
			tabIndex={0}
			className="min-h-0 flex-1 overflow-y-auto"
			onMouseUp={(event) => model.actions.onPreviewSelectionChange(event.currentTarget)}
			onKeyUp={(event) => model.actions.onPreviewSelectionChange(event.currentTarget)}
		>
			{selected.previewKind === "code" ? (
				<CodePreview
					content={selected.content}
					extension={selected.extension.replace(/^\./, "")}
					theme={model.theme}
					degradationNotice={t("preview.degraded.artifact")}
				/>
			) : (
				<MarkdownPreview content={selected.content} />
			)}
		</div>
	);
}
