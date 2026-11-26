// Modified by The Open Forge contributors.
import type { ExecutionModeOverride, ScheduledTask, ScheduledTaskPermissionTiers } from "@shared/store/atoms";
import {
	confirmDialogAtom,
	defaultConversationCwdAtom,
	getProjectDisplayName,
	projectsAtom,
	runningTaskIdsAtom,
} from "@shared/store/atoms";
import type { AutomationDetailStatusTone } from "@vetta-org/theme-ui/scheduler";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { automationTaskTone } from "../automation-status";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";
import {
	describeTaskSchedule,
	getDefaultDailySchedule,
	scheduleToAutomation,
} from "../components/schedule-picker/cron-utils";
import { useScheduledTasks } from "./useScheduledTasks";

export interface AutomationDetailModel {
	readonly mode: "create" | "edit";
	readonly task: ScheduledTask | null;
	readonly draft: SchedulerTaskDraft;
	readonly dirty: boolean;
	readonly canSubmit: boolean;
	readonly submitting: boolean;
	readonly error: string | null;
	readonly tone: AutomationDetailStatusTone;
	readonly statusLabel: string;
	readonly projectLabel: string | null;
	readonly scheduleLabel: string;
	readonly onChange: (value: SchedulerTaskDraft) => void;
	readonly onSubmit: () => void;
	readonly onDiscard: () => void;
	readonly onToggleEnabled: () => void;
	readonly onRunNow: () => void;
	readonly onDelete: () => void;
}

interface UseAutomationDetailModelOptions {
	readonly task: ScheduledTask | null;
	readonly createInitial?: Partial<SchedulerTaskDraft> | undefined;
	readonly onClose: () => void;
	/** 新建成功后回调（如切到该任务的编辑态）。 */
	readonly onCreated?: (task: ScheduledTask) => void;
}

export function useAutomationDetailModel({
	task,
	createInitial,
	onClose,
	onCreated,
}: UseAutomationDetailModelOptions): AutomationDetailModel {
	const { t } = useTranslation("automation");
	const { createTask, updateTask, deleteTask, toggleTask, runNow } = useScheduledTasks();
	const projects = useAtomValue(projectsAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const runningTaskIds = useAtomValue(runningTaskIdsAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [draft, setDraft] = useState<SchedulerTaskDraft>({});
	const [initialDraft, setInitialDraft] = useState<SchedulerTaskDraft>({});
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fallbackCwd = defaultCwd ?? projects[0]?.cwd ?? "";
		const next: SchedulerTaskDraft = task
			? {
					name: task.name,
					cwd: task.runTarget.projectCwd || fallbackCwd,
					prompt: task.prompt,
					schedule: task.schedule,
					enabled: task.enabled,
					executionMode: task.executionMode ?? "full-access",
					modelKey: task.model?.key ?? null,
					skill: task.skill ?? null,
					permissionTiers: task.permissionTiers,
					trigger: task.trigger ?? { type: "cron" },
				}
			: {
					name: createInitial?.name ?? "",
					cwd: createInitial?.cwd ?? fallbackCwd,
					prompt: createInitial?.prompt ?? "",
					...(createInitial?.runMode !== undefined ? { runMode: createInitial.runMode } : {}),
					...(createInitial?.sessionPath !== undefined ? { sessionPath: createInitial.sessionPath } : {}),
					schedule: createInitial?.schedule ?? scheduleToAutomation(getDefaultDailySchedule()),
					enabled: createInitial?.enabled ?? true,
					executionMode: createInitial?.executionMode ?? "full-access",
					modelKey: createInitial?.modelKey,
					skill: createInitial?.skill ?? null,
					permissionTiers: createInitial?.permissionTiers,
					trigger: createInitial?.trigger ?? { type: "cron" },
				};
		setDraft(next);
		setInitialDraft(next);
		setError(null);
	}, [task, createInitial, defaultCwd, projects]);

	const mode: "create" | "edit" = task ? "edit" : "create";
	const dirty = useMemo(() => {
		if (mode === "create") return false;
		return JSON.stringify(draft) !== JSON.stringify(initialDraft);
	}, [draft, initialDraft, mode]);
	const canSubmit = canSubmitFromData(draft);
	const tone = task ? automationTaskTone(task, runningTaskIds.has(task.id)) : "draft";
	const statusLabel = t(`detail.status.${tone}`);
	const projectLabel = task ? getProjectDisplayName(task.runTarget.projectCwd, defaultCwd) : null;
	const scheduleLabel = task ? describeTaskSchedule(task, t) : "";

	return useMemo(
		() => ({
			mode,
			task,
			draft,
			dirty,
			canSubmit,
			submitting,
			error,
			tone,
			statusLabel,
			projectLabel,
			scheduleLabel,
			onChange: setDraft,
			onSubmit: (): void => {
				if (!canSubmit || submitting) return;
				const name = draft.name?.trim();
				const prompt = draft.prompt?.trim();
				const cwd = draft.cwd;
				if (!name || !prompt || !cwd) return;
				const trigger = draft.trigger ?? { type: "cron" as const };
				const isCronTrigger = trigger.type === "cron";
				// cron 触发缺 schedule 时按表单展示值（默认每天）落库，与 picker 显示一致。
				const schedule = isCronTrigger
					? (draft.schedule ?? scheduleToAutomation(getDefaultDailySchedule()))
					: undefined;
				if (isCronTrigger && !schedule) return;
				const permissionTiers = compactPermissionTiers(draft.permissionTiers);
				const runTarget = task
					? task.runTarget.mode === "same-session"
						? { ...task.runTarget, projectCwd: cwd }
						: ({ mode: "new-session", projectCwd: cwd } as const)
					: // 新建：右键「基于此会话创建自动化」带 same-session 绑定预填；
						// 绑定会话必须存在，缺失时退回每次新建会话。
						draft.runMode === "same-session" && draft.sessionPath
						? ({ mode: "same-session", projectCwd: cwd, sessionPath: draft.sessionPath } as const)
						: ({ mode: "new-session", projectCwd: cwd } as const);
				setSubmitting(true);
				const action = task
					? updateTask(task.id, {
							name,
							prompt,
							// executionMode / permissionTiers 未变时不下发：表单默认展示 full-access，
							// 原样下发会把原本继承宿主默认的任务固化成显式覆写（「继承」语义丢失）。
							...(draft.executionMode !== initialDraft.executionMode
								? { executionMode: (draft.executionMode ?? "full-access") as ExecutionModeOverride }
								: {}),
							// 两侧同走 compaction：表单内 false 键与「无该键」语义相同，
							// 全关（compact 后 undefined）等同未变——不改写服务端既有分层。
							...(JSON.stringify(permissionTiers ?? null) !==
							JSON.stringify(compactPermissionTiers(initialDraft.permissionTiers) ?? null)
								? { permissionTiers: permissionTiers ?? {} }
								: {}),
							trigger,
							// enabled 未变时不下发：patch.enabled===true 会清掉目标失效暂停（ADR-0155 §2），
							// 编辑保存不能让「明明没动开关」的表单悄悄解除暂停。
							...(draft.enabled !== undefined && draft.enabled !== initialDraft.enabled
								? { enabled: draft.enabled }
								: {}),
							// skill 未变时不下发；清除走 null。
							...(draft.skill !== initialDraft.skill ? { skill: draft.skill ?? null } : {}),
							// 模型键未变时不下发，保住服务端 reasoning 等其余字段；变了按 null/新键覆盖。
							...(draft.modelKey === (initialDraft.modelKey ?? null)
								? {}
								: { model: draft.modelKey ? { key: draft.modelKey } : null }),
							// 切到 event / manual 后计划不再有意义，显式清除；cron 触发始终带上计划。
							...(isCronTrigger ? { schedule } : task.schedule ? { schedule: null } : {}),
							// 目标 cwd 未变时不下发 runTarget，避免误清 suspendedReason（ADR-0155 §2）。
							...(cwd === initialDraft.cwd ? {} : { runTarget }),
						}).then(() => task)
					: createTask({
							name,
							prompt,
							runTarget,
							enabled: draft.enabled ?? true,
							executionMode: (draft.executionMode ?? "full-access") as ExecutionModeOverride,
							...(isCronTrigger ? { schedule } : {}),
							...(permissionTiers !== undefined ? { permissionTiers } : {}),
							trigger,
							...(draft.skill ? { skill: draft.skill } : {}),
							...(draft.modelKey ? { model: { key: draft.modelKey } } : {}),
						});
				void action
					.then((saved) => {
						onClose();
						onCreated?.(saved);
					})
					.catch((e) => setError(e instanceof Error ? e.message : String(e)))
					.finally(() => setSubmitting(false));
			},
			onDiscard: (): void => {
				if (mode === "create" || !dirty) {
					onClose();
					return;
				}
				setConfirmDialog({
					title: t("confirm.discardTitle"),
					message: t("confirm.discardMsg"),
					confirmLabel: t("confirm.discard"),
					cancelLabel: t("confirm.cancel"),
					variant: "danger",
					onConfirm: () => {
						setDraft(initialDraft);
						onClose();
					},
				});
			},
			onToggleEnabled: (): void => {
				if (task) void toggleTask(task.id);
			},
			onRunNow: (): void => {
				if (task) void runNow(task.id);
			},
			onDelete: (): void => {
				if (!task) return;
				setConfirmDialog({
					title: t("confirm.deleteTitle", { name: task.name }),
					message: t("confirm.deleteMsg"),
					confirmLabel: t("confirm.delete"),
					cancelLabel: t("confirm.cancel"),
					variant: "danger",
					onConfirm: () => {
						void deleteTask(task.id).then(onClose);
					},
				});
			},
		}),
		[
			canSubmit,
			createTask,
			onCreated,
			deleteTask,
			dirty,
			draft,
			error,
			initialDraft,
			mode,
			onClose,
			projectLabel,
			runNow,
			scheduleLabel,
			setConfirmDialog,
			statusLabel,
			submitting,
			t,
			task,
			tone,
			toggleTask,
			updateTask,
		],
	);
}

function canSubmitFromData(data: SchedulerTaskDraft): boolean {
	const trigger = data.trigger ?? { type: "cron" };
	if (trigger.type === "event" && !trigger.event) return false;
	return Boolean(data.name?.trim() && data.prompt?.trim() && data.cwd);
}

/** 只保留显式 true，避免把「全关」写成五个 false 污染默认兼容语义。 */
function compactPermissionTiers(
	tiers: ScheduledTaskPermissionTiers | undefined,
): ScheduledTaskPermissionTiers | undefined {
	if (!tiers) return undefined;
	const entries = Object.entries(tiers).filter(([, enabled]) => enabled === true);
	if (entries.length === 0) return undefined;
	return Object.fromEntries(entries) as ScheduledTaskPermissionTiers;
}
