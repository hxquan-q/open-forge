// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { Textarea } from "@shared/components/ui/textarea";
import { pathTokenText } from "@shared/lib/input-tokens";
import { taskStateBySessionAtom } from "@shared/store/atoms";
import { sendMessageFnRef } from "@shared/store/chat-atoms";
import { showToast } from "@shared/store/toast-atoms";
import type { DesktopArtifactSourceCheck } from "@preload/api-types/task";
import type { ArtifactDescriptor, RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import type { TFunction } from "i18next";
import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTaskProjection } from "../hooks/useTaskProjection";
import { WorkPanelSection } from "./WorkWorkspacePanel";

/**
 * Work 文档处理纵向切片（IA §2 右栏）：计划 / 来源资料 / 产物 / 审阅与导出。
 * 投影事实源在 Runtime 事件日志；打开会话时用主进程快照补齐，
 * 任务命令与产物导出走 Desktop Task IPC，发起任务复用全局消息发送通道。
 */

const ERROR_KEYS = {
	task_not_found: "activityPanel.task.error.notFound",
	task_invalid_transition: "activityPanel.task.error.invalidTransition",
	task_missing_turn_binding: "activityPanel.task.error.missingTurnBinding",
	task_unknown_approval: "activityPanel.task.error.unknownApproval",
	task_duplicate_artifact: "activityPanel.task.error.duplicateArtifact",
	task_event_log_invalid: "activityPanel.task.error.eventLogInvalid",
	task_command_failed: "activityPanel.task.error.commandFailed",
} as const satisfies Record<string, string>;

const STATUS_KEYS = {
	draft: "activityPanel.task.status.draft",
	planning: "activityPanel.task.status.planning",
	awaiting_approval: "activityPanel.task.status.awaitingApproval",
	running: "activityPanel.task.status.running",
	paused: "activityPanel.task.status.paused",
	awaiting_review: "activityPanel.task.status.awaitingReview",
	completed: "activityPanel.task.status.completed",
	failed: "activityPanel.task.status.failed",
	cancelled: "activityPanel.task.status.cancelled",
	rejected: "activityPanel.task.status.rejected",
	changes_requested: "activityPanel.task.status.changesRequested",
} as const;

/**
 * 计划状态的颜色分级（DESIGN §1.3 语义色白名单）：执行中/规划中用成功/运行色，
 * 需要用户处理或返工的用警告色，终态失败用错误色，其余停驻态保持弱化灰。
 * running 额外挂共享呼吸点——「还在跑」的动效统一走 live-animations 登记表。
 */
const STATUS_TONES = {
	draft: "text-muted-foreground/60",
	planning: "text-emerald-400",
	awaiting_approval: "text-amber-400",
	running: "text-emerald-400",
	paused: "text-muted-foreground/60",
	awaiting_review: "text-amber-400",
	completed: "text-muted-foreground/60",
	failed: "text-destructive",
	cancelled: "text-muted-foreground/60",
	rejected: "text-destructive",
	changes_requested: "text-emerald-400",
} as const satisfies Record<keyof typeof STATUS_KEYS, string>;

const LIVE_STATUSES = new Set<keyof typeof STATUS_KEYS>(["planning", "running"]);

const REVIEW_ACTION_KEYS = {
	approved: "activityPanel.task.action.approve",
	changes_requested: "activityPanel.task.action.requestChanges",
	rejected: "activityPanel.task.action.reject",
} as const;

type ReviewDecision = keyof typeof REVIEW_ACTION_KEYS;
type TaskCommand = Parameters<typeof window.vetta.task.runCommand>[1];

function commandErrorMessage(t: TFunction<"chat">, code: string): string {
	const key = ERROR_KEYS[code as keyof typeof ERROR_KEYS] ?? "activityPanel.task.error.commandFailed";
	return t(key);
}

/** 来源列表只显示文件名降低噪音；完整路径留在 title 供悬停与读屏确认。 */
function sourceDisplayName(path: string): string {
	const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? path;
}

/** 统一执行 Task 命令：成功时更新投影，失败分支收敛为可读错误 toast。 */
function useRunTaskCommand(runtimeId: string | undefined) {
	const { t } = useTranslation("chat");
	const setTaskState = useSetAtom(taskStateBySessionAtom);

	return useCallback(
		async (command: TaskCommand): Promise<boolean> => {
			if (!runtimeId) return false;
			try {
				const outcome = await window.vetta.task.runCommand(runtimeId, command);
				if (outcome.ok) {
					setTaskState((prev) => new Map(prev).set(runtimeId, outcome.state));
					return true;
				}
				showToast({ message: commandErrorMessage(t, outcome.code), variant: "error" });
				return false;
			} catch {
				showToast({ message: t("activityPanel.task.error.commandFailed"), variant: "error" });
				return false;
			}
		},
		[runtimeId, setTaskState, t],
	);
}

function PlanSection({ tasks }: { readonly tasks: readonly RuntimeTaskSnapshot[] }): JSX.Element {
	const { t } = useTranslation("chat");
	if (tasks.length === 0) return <WorkPanelSection id="plan" />;
	return (
		<WorkPanelSection id="plan">
			<ul className="space-y-1">
				{tasks.map((task) => {
					const isLive = LIVE_STATUSES.has(task.status);
					return (
						<li key={task.identity.taskId} className="flex min-w-0 items-center gap-2">
							<span
								className="min-w-0 flex-1 truncate text-[12px] text-foreground"
								title={task.title ?? t("activityPanel.task.untitled")}
							>
								{task.title ?? t("activityPanel.task.untitled")}
							</span>
							{isLive ? (
								<span className="vetta-live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" aria-hidden />
							) : null}
							<span className={`shrink-0 text-[11px] ${STATUS_TONES[task.status]}`}>
								{t(STATUS_KEYS[task.status])}
							</span>
						</li>
					);
				})}
			</ul>
		</WorkPanelSection>
	);
}

/**
 * 「选路径 + 目标/问题 → 建任务并发消息」的共享流程（文档/研究/数据三节同源）。
 * 路径经 pathTokenText 序列化为输入 token，消息走既有全局发送通道，
 * 成功后清空本节选择。
 */
function useStartTaskWithSources(runtimeId: string | undefined) {
	const { t } = useTranslation("chat");
	const runCommand = useRunTaskCommand(runtimeId);
	const [busy, setBusy] = useState(false);

	const start = useCallback(
		async (sources: readonly string[], goal: string): Promise<boolean> => {
			const trimmedGoal = goal.trim();
			if (!trimmedGoal || sources.length === 0 || busy) return false;
			setBusy(true);
			try {
				const created = await runCommand({ type: "create", title: trimmedGoal });
				if (!created) return false;
				const sender = sendMessageFnRef.current;
				if (!sender) {
					showToast({ message: t("workspace.work.sources.sendUnavailable"), variant: "error" });
					return false;
				}
				const text = [...sources.map(pathTokenText), trimmedGoal].join(" ");
				const result = await sender(text);
				if (result?.status === "failed") {
					showToast({ message: t("workspace.work.sources.sendUnavailable"), variant: "error" });
					return false;
				}
				return true;
			} catch {
				showToast({ message: t("workspace.work.sources.sendUnavailable"), variant: "error" });
				return false;
			} finally {
				setBusy(false);
			}
		},
		[busy, runCommand, t],
	);
	return { start, busy };
}

interface SourcesSectionProps {
	readonly runtimeIds: readonly string[];
}

/** 来源节的双入口：既有文档处理（选文件）与 TASK-0025 本地研究（选资料集目录）。 */
type SourcesEntryMode = "document" | "research";

function SourcesSection({ runtimeIds }: SourcesSectionProps): JSX.Element {
	const { t } = useTranslation("chat");
	const { start, busy } = useStartTaskWithSources(runtimeIds[0]);
	const [mode, setMode] = useState<SourcesEntryMode>("document");
	const [sources, setSources] = useState<readonly string[]>([]);
	const [goal, setGoal] = useState("");

	const switchMode = useCallback((next: SourcesEntryMode) => {
		setMode(next);
		setSources([]);
	}, []);

	const pickSources = useCallback(async () => {
		try {
			const selected =
				mode === "research" ? await window.vetta.dialog.selectFolders() : await window.vetta.dialog.selectFiles();
			if (selected.length > 0) setSources(selected);
		} catch {
			showToast({ message: t("workspace.work.sources.pickFailed"), variant: "error" });
		}
	}, [mode, t]);

	const removeSource = useCallback((source: string) => {
		setSources((prev) => prev.filter((item) => item !== source));
	}, []);

	const submit = useCallback(async () => {
		if (await start(sources, goal)) {
			setGoal("");
			setSources([]);
		}
	}, [start, sources, goal]);

	return (
		<WorkPanelSection id="sources">
			<div className="space-y-2">
				<div className="flex gap-1" role="group" aria-label={t("workspace.work.sources.modeLabel")}>
					{(["document", "research"] as const).map((entry) => (
						<Button
							key={entry}
							size="sm"
							variant={mode === entry ? "primary" : "outline"}
							aria-pressed={mode === entry}
							onClick={() => switchMode(entry)}
						>
							{t(`workspace.work.sources.mode.${entry}`)}
						</Button>
					))}
				</div>
				<Button variant="primary" size="sm" onClick={() => void pickSources()}>
					{t(mode === "research" ? "workspace.work.sources.pickFolder" : "workspace.work.sources.pickFile")}
				</Button>
				{sources.length > 0 ? (
					<ul className="space-y-1">
						{sources.map((source) => (
							<li key={source} className="flex min-w-0 items-center gap-1.5">
								<span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={source}>
									{sourceDisplayName(source)}
								</span>
								<Button
									aria-label={t("workspace.work.sources.remove", { file: sourceDisplayName(source) })}
									className="h-6 w-6 shrink-0 p-0"
									size="icon-xs"
									variant="ghost"
									onClick={() => removeSource(source)}
								>
									<span className="icon-[solar--close-circle-linear] h-3.5 w-3.5" aria-hidden />
								</Button>
							</li>
						))}
					</ul>
				) : null}
				<Textarea
					value={goal}
					rows={2}
					placeholder={t(
						mode === "research"
							? "workspace.work.sources.questionPlaceholder"
							: "workspace.work.sources.goalPlaceholder",
					)}
					onChange={(event) => setGoal(event.target.value)}
				/>
				<Button
					size="sm"
					disabled={runtimeIds.length === 0 || busy || goal.trim().length === 0 || sources.length === 0}
					onClick={() => void submit()}
				>
					{t(mode === "research" ? "workspace.work.sources.startResearch" : "workspace.work.sources.start")}
				</Button>
			</div>
		</WorkPanelSection>
	);
}

/** TASK-0026 数据集节：选 CSV/TSV/JSON/Excel 数据文件 + 分析目标，走同一任务通道。 */
function DatasetSection({ runtimeIds }: SourcesSectionProps): JSX.Element {
	const { t } = useTranslation("chat");
	const { start, busy } = useStartTaskWithSources(runtimeIds[0]);
	const [files, setFiles] = useState<readonly string[]>([]);
	const [goal, setGoal] = useState("");

	const pickFiles = useCallback(async () => {
		try {
			const selected = await window.vetta.dialog.selectFiles();
			if (selected.length > 0) setFiles(selected);
		} catch {
			showToast({ message: t("workspace.work.dataset.pickFailed"), variant: "error" });
		}
	}, [t]);

	const removeFile = useCallback((file: string) => {
		setFiles((prev) => prev.filter((item) => item !== file));
	}, []);

	const submit = useCallback(async () => {
		if (await start(files, goal)) {
			setGoal("");
			setFiles([]);
		}
	}, [start, files, goal]);

	return (
		<WorkPanelSection id="dataset">
			<div className="space-y-2">
				<Button variant="primary" size="sm" onClick={() => void pickFiles()}>
					{t("workspace.work.dataset.pickFile")}
				</Button>
				{files.length > 0 ? (
					<ul className="space-y-1">
						{files.map((file) => (
							<li key={file} className="flex min-w-0 items-center gap-1.5">
								<span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={file}>
									{sourceDisplayName(file)}
								</span>
								<Button
									aria-label={t("workspace.work.sources.remove", { file: sourceDisplayName(file) })}
									className="h-6 w-6 shrink-0 p-0"
									size="icon-xs"
									variant="ghost"
									onClick={() => removeFile(file)}
								>
									<span className="icon-[solar--close-circle-linear] h-3.5 w-3.5" aria-hidden />
								</Button>
							</li>
						))}
					</ul>
				) : null}
				<Textarea
					value={goal}
					rows={2}
					placeholder={t("workspace.work.dataset.goalPlaceholder")}
					onChange={(event) => setGoal(event.target.value)}
				/>
				<Button
					size="sm"
					disabled={runtimeIds.length === 0 || busy || goal.trim().length === 0 || files.length === 0}
					onClick={() => void submit()}
				>
					{t("workspace.work.dataset.start")}
				</Button>
			</div>
		</WorkPanelSection>
	);
}

interface ArtifactsSectionProps {
	readonly artifacts: readonly ArtifactDescriptor[];
}

/** 引用清单可复查的产物类型：研究与数据产物都以 vetta-research-sources 清单记录输入来源。 */
const SOURCE_VERIFIABLE_KINDS = new Set(["research-evidence", "dataset", "analysis"]);

const SOURCE_STATUS_KEYS = {
	ok: "workspace.work.artifacts.citedOk",
	missing: "workspace.work.artifacts.citedMissing",
	changed: "workspace.work.artifacts.citedChanged",
} as const;

const SOURCE_STATUS_TONES = {
	ok: "text-muted-foreground/60",
	missing: "text-destructive",
	changed: "text-amber-400",
} as const;

interface ArtifactPreviewState {
	readonly title: string;
	readonly content: string;
	readonly truncated: boolean;
	/** 带来源清单的产物（research-evidence/dataset/analysis）的复查结果；未复查为 undefined。 */
	readonly citedSources?: readonly DesktopArtifactSourceCheck[];
}

function ArtifactsSection({ artifacts }: ArtifactsSectionProps): JSX.Element {
	const { t } = useTranslation("chat");
	const [preview, setPreview] = useState<ArtifactPreviewState | null>(null);

	const openPreview = useCallback(
		async (artifact: ArtifactDescriptor): Promise<void> => {
			try {
				const outcome = await window.vetta.task.readArtifact(artifact.sourceSessionId, artifact.artifactId);
				if (outcome.status === "ok") {
					let citedSources: readonly DesktopArtifactSourceCheck[] | undefined;
					if (SOURCE_VERIFIABLE_KINDS.has(artifact.kind)) {
						const verified = await window.vetta.task.verifyArtifactSources(
							artifact.sourceSessionId,
							artifact.artifactId,
						);
						if (verified.status === "ok") citedSources = verified.sources;
					}
					setPreview({
						title: outcome.title ?? artifact.title,
						content: outcome.content,
						truncated: outcome.truncated,
						citedSources,
					});
					return;
				}
				const key =
					outcome.status === "source-missing"
						? "workspace.work.artifacts.sourceMissing"
						: "workspace.work.artifacts.previewUnavailable";
				showToast({ message: t(key), variant: "error" });
			} catch {
				showToast({ message: t("workspace.work.artifacts.previewUnavailable"), variant: "error" });
			}
		},
		[t],
	);

	if (artifacts.length === 0) {
		return <WorkPanelSection id="artifacts" />;
	}

	return (
		<WorkPanelSection id="artifacts">
			<ul className="space-y-1">
				{artifacts.map((artifact) => (
					<li key={artifact.artifactId} className="flex min-w-0 items-center">
						<button
							type="button"
							className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[12px] text-foreground hover:bg-accent/60"
							onClick={() => void openPreview(artifact)}
							title={artifact.title}
						>
							{artifact.title}
						</button>
					</li>
				))}
			</ul>
			{preview ? (
				<>
					<pre
						aria-label={preview.title}
						className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 text-[11px] leading-5 text-muted-foreground"
					>
						{preview.content}
						{preview.truncated ? (
							<span className="mt-1 block text-[10px] text-muted-foreground/60">
								{t("workspace.work.artifacts.truncated")}
							</span>
						) : null}
					</pre>
					{preview.citedSources ? (
						<ul
							aria-label={t("workspace.work.artifacts.citedSourcesTitle")}
							className="mt-1 space-y-0.5"
						>
							{preview.citedSources.map((source) => (
								<li key={source.uri} className="flex min-w-0 items-center gap-1.5 text-[11px]">
									<span className="min-w-0 flex-1 truncate text-muted-foreground" title={source.path}>
										{source.name}
									</span>
									<span className={`shrink-0 ${SOURCE_STATUS_TONES[source.status]}`}>
										{t(SOURCE_STATUS_KEYS[source.status])}
									</span>
								</li>
							))}
						</ul>
					) : null}
				</>
			) : null}
		</WorkPanelSection>
	);
}

interface ReviewSectionProps {
	readonly runtimeId: string | undefined;
	readonly tasks: readonly RuntimeTaskSnapshot[];
	readonly artifacts: readonly ArtifactDescriptor[];
}

function ReviewSection({ runtimeId, tasks, artifacts }: ReviewSectionProps): JSX.Element {
	const { t } = useTranslation("chat");
	const runCommand = useRunTaskCommand(runtimeId);
	const [exportResult, setExportResult] = useState<string | null>(null);
	const reviewTask = tasks.find((task) => task.status === "awaiting_review");
	const acceptedArtifacts = artifacts.filter((artifact) => artifact.status === "accepted");

	const review = useCallback(
		async (taskId: string, decision: ReviewDecision): Promise<void> => {
			await runCommand({ type: "review", taskId, decision });
		},
		[runCommand],
	);

	const exportArtifact = useCallback(
		async (artifactId: string): Promise<void> => {
			if (!runtimeId) return;
			setExportResult(null);
			try {
				const outcome = await window.vetta.task.exportArtifact(runtimeId, artifactId);
				switch (outcome.status) {
					case "exported":
						setExportResult(t("workspace.work.review.exported", { targetUri: outcome.targetUri }));
						return;
					case "cancelled":
						setExportResult(t("workspace.work.review.cancelled"));
						return;
					case "source-missing":
						setExportResult(t("workspace.work.review.sourceMissing"));
						showToast({ message: t("workspace.work.review.sourceMissing"), variant: "error" });
						return;
					case "not-exportable":
						setExportResult(t("workspace.work.review.notExportable"));
						showToast({ message: t("workspace.work.review.notExportable"), variant: "error" });
						return;
					case "not-found":
						setExportResult(t("workspace.work.review.notFound"));
						showToast({ message: t("workspace.work.review.notFound"), variant: "error" });
						return;
				}
			} catch {
				setExportResult(t("workspace.work.review.notExportable"));
				showToast({ message: t("workspace.work.review.notExportable"), variant: "error" });
			}
		},
		[runtimeId, t],
	);

	return (
		<WorkPanelSection id="review">
			<div className="space-y-2">
				{reviewTask ? (
					<div className="flex flex-wrap items-center gap-2">
						<span
							className="min-w-0 flex-1 truncate text-[12px] text-foreground"
							title={reviewTask.title ?? t("activityPanel.task.untitled")}
						>
							{reviewTask.title ?? t("activityPanel.task.untitled")}
						</span>
						{(Object.keys(REVIEW_ACTION_KEYS) as ReviewDecision[]).map((decision) => (
							<Button
								key={decision}
								size="sm"
								variant={decision === "approved" ? "primary" : "outline"}
								onClick={() => void review(reviewTask.identity.taskId, decision)}
							>
								{t(REVIEW_ACTION_KEYS[decision])}
							</Button>
						))}
					</div>
				) : null}
				{acceptedArtifacts.map((artifact) => (
					<div
						key={artifact.artifactId}
						className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5"
					>
						<span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={artifact.title}>
							{artifact.title}
						</span>
						<Button size="sm" variant="outline" onClick={() => void exportArtifact(artifact.artifactId)}>
							{t("workspace.work.review.export")}
						</Button>
					</div>
				))}
				{exportResult ? (
					<p className="break-all text-[11px] leading-5 text-muted-foreground">{exportResult}</p>
				) : null}
			</div>
		</WorkPanelSection>
	);
}

export interface WorkDocumentSectionsProps {
	/** 当前会话可投递任务的 Runtime 集合（来自 ActivityWorkspace）。 */
	readonly runtimeIds: readonly string[];
}

/** work 右栏的文档处理四节内容。 */
export function WorkDocumentSections({ runtimeIds }: WorkDocumentSectionsProps): JSX.Element {
	const runtimeId = runtimeIds[0];
	const { tasks, artifacts } = useTaskProjection(runtimeIds);

	return (
		<>
			<PlanSection tasks={tasks} />
			<SourcesSection runtimeIds={runtimeIds} />
			<DatasetSection runtimeIds={runtimeIds} />
			<ArtifactsSection artifacts={artifacts} />
			<ReviewSection runtimeId={runtimeId} tasks={tasks} artifacts={artifacts} />
		</>
	);
}
