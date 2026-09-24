// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { pluginArtifactRenderersAtom } from "@shared/store/atoms";
import type { DesktopArtifactView } from "@preload/api-types/task";
import type { RuntimeTaskSnapshot, RuntimeTaskStatus } from "@vetta/runtime-core/task";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivityRuntimeIds, useActivityRuntimeLabels } from "../registry/context";
import type { TaskPanelModel } from "../hooks/useTaskPanelModel";
import { useTaskPanelModel } from "../hooks/useTaskPanelModel";
import { TaskArtifactPreview } from "./TaskArtifactPreview";

/** 活动面板的任务页：Task 状态、Review 裁决与 Artifact 索引；事实源在 Runtime 事件日志。 */
export function TaskTabPanel(): JSX.Element {
	const model = useTaskPanelModel();
	const { t } = useTranslation("chat");
	const renderers = useAtomValue(pluginArtifactRenderersAtom);
	const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
	const selectedArtifact = useMemo(
		() => model.artifacts.find((artifact) => artifact.descriptor.artifactId === openArtifactId),
		[model.artifacts, openArtifactId],
	);
	const renderer = useMemo(() => {
		if (!selectedArtifact) return undefined;
		const type = selectedArtifact.descriptor.rendererType ?? selectedArtifact.descriptor.kind;
		return renderers.find(
			(candidate) =>
				candidate.type === type && candidate.canRead && candidate.validateDescriptor(selectedArtifact.descriptor),
		);
	}, [renderers, selectedArtifact]);

	useEffect(() => setOpenArtifactId(null), [model.primaryRuntimeId]);

	if (model.tasks.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
				<span aria-hidden className="icon-[solar--clipboard-text-linear] h-8 w-8 text-muted-foreground/60" />
				<p className="text-[13px] text-muted-foreground">{model.emptyLabel}</p>
				<Button size="sm" variant="outline" onClick={() => void model.actions.create()}>
					{model.createLabel}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
				<span aria-hidden className="icon-[solar--checklist-minimalistic-linear] h-4 w-4 shrink-0 text-primary" />
				<h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{model.headline}</h2>
			</div>
			<div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
				{model.tasks.map((task) => (
					<TaskCard
						key={`${task.runtimeId}:${task.snapshot.identity.taskId}`}
						runtimeId={task.runtimeId}
						snapshot={task.snapshot}
						statusLabel={model.statusLabel(task.snapshot.status)}
						actions={model.actions}
					/>
				))}
				{model.artifacts.length > 0 ? (
					<ArtifactList
						artifacts={model.artifacts}
						openLabel={(title) => t("activityPanel.task.artifactOpen", { title })}
						onOpen={setOpenArtifactId}
					/>
				) : null}
				{selectedArtifact ? (
					<TaskArtifactPreview
						key={`${selectedArtifact.sourceSessionId}:${selectedArtifact.descriptor.artifactId}:${selectedArtifact.descriptor.version}`}
						artifact={selectedArtifact}
						renderer={renderer}
						onClose={() => setOpenArtifactId(null)}
					/>
				) : null}
			</div>
		</div>
	);
}

function TaskCard(props: {
	readonly runtimeId: string;
	readonly snapshot: RuntimeTaskSnapshot;
	readonly statusLabel: string;
	readonly actions: TaskPanelModel["actions"];
}): JSX.Element {
	const { t } = useTranslation("chat");
	const { runtimeId, snapshot, statusLabel, actions } = props;
	const taskId = snapshot.identity.taskId;
	const status = snapshot.status;
	// 归属 chip 只在多 Runtime 聚合的工作空间（Team 全景）显示；普通对话仍是单 Runtime。
	const runtimeIds = useActivityRuntimeIds();
	const runtimeLabels = useActivityRuntimeLabels();
	const ownerLabel = runtimeLabels[runtimeId];
	const showOwner = runtimeIds.length > 1 && Boolean(ownerLabel);

	return (
		<section className="rounded-xl border border-border/50 bg-card/40 px-3.5 pt-3 pb-3">
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<h3 className="truncate text-[13px] font-medium text-foreground">
						{snapshot.title ?? t("activityPanel.task.untitled")}
					</h3>
					<p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
						<span className="truncate">{t("activityPanel.task.turn", { turn: snapshot.activeTurnId ?? "—" })}</span>
						{showOwner ? (
							<span className="shrink-0 rounded-full bg-accent/60 px-1.5 py-px text-[10px] text-muted-foreground">
								{ownerLabel}
							</span>
						) : null}
					</p>
				</div>
				<TaskStatusChip status={status} label={statusLabel} />
			</div>
			<div className="mt-2.5 flex flex-wrap items-center gap-2">
				{status === "running" ? (
					<Button size="sm" variant="secondary" onClick={() => void actions.pause(runtimeId, taskId)}>
						{t("activityPanel.task.action.pause")}
					</Button>
				) : null}
				{status === "awaiting_review" ? (
					<>
						<Button size="sm" onClick={() => void actions.review(runtimeId, taskId, "approved")}>
							{t("activityPanel.task.action.approve")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void actions.review(runtimeId, taskId, "changes_requested")}
						>
							{t("activityPanel.task.action.requestChanges")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void actions.review(runtimeId, taskId, "rejected")}
						>
							{t("activityPanel.task.action.reject")}
						</Button>
					</>
				) : null}
				{status === "paused" ? (
					<p className="text-[11px] text-muted-foreground/60">{t("activityPanel.task.resumeHint")}</p>
				) : null}
				{status !== "completed" && status !== "cancelled" && status !== "rejected" && status !== "failed" ? (
					<Button
						size="sm"
						variant="ghost"
						className="text-destructive hover:text-destructive"
						onClick={() => void actions.cancel(runtimeId, taskId)}
					>
						{t("activityPanel.task.action.cancel")}
					</Button>
				) : null}
			</div>
		</section>
	);
}

function TaskStatusChip(props: { readonly status: RuntimeTaskStatus; readonly label: string }): JSX.Element {
	const tone =
		props.status === "running"
			? "bg-emerald-500/15 text-emerald-400"
			: props.status === "failed" || props.status === "rejected"
				? "bg-destructive/15 text-destructive"
				: props.status === "awaiting_review" || props.status === "awaiting_approval" || props.status === "changes_requested"
					? "bg-amber-500/15 text-amber-400"
					: "bg-accent/60 text-muted-foreground";
	return (
		<span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{props.label}</span>
	);
}

function ArtifactList(props: {
	readonly artifacts: readonly DesktopArtifactView[];
	readonly openLabel: (title: string) => string;
	onOpen: (artifactId: string) => void;
}): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<section className="rounded-xl border border-border/50 bg-card/40 px-3.5 pt-3 pb-3">
			<h3 className="text-[12px] font-medium text-muted-foreground">{t("activityPanel.task.artifacts")}</h3>
			<ul className="mt-2 space-y-1.5">
				{props.artifacts.map((artifact) => (
					<li key={artifact.descriptor.artifactId} className="flex min-w-0 items-center gap-2">
						<span aria-hidden className="icon-[solar--file-linear] h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
						<Button
							className="min-w-0 flex-1 justify-start truncate px-1"
							variant="ghost"
							size="sm"
							aria-label={props.openLabel(artifact.descriptor.title)}
							onClick={() => props.onOpen(artifact.descriptor.artifactId)}
						>
							{artifact.descriptor.title}
						</Button>
						{artifact.availability === "missing" ? (
							<span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
								{t("activityPanel.task.artifactMissing")}
							</span>
						) : null}
					</li>
				))}
			</ul>
		</section>
	);
}
