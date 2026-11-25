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
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { automationTaskTone } from "../automation-status";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";
import {
	describeSchedule,
	getDefaultDailySchedule,
	parseCronExpression,
	toCronExpression,
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
					cwd: task.cwd || fallbackCwd,
					prompt: task.prompt,
					cron: task.cron,
					isOnce: task.isOnce,
					enabled: task.enabled,
					executionMode: task.executionMode ?? "full-access",
					modelKey: task.modelKey,
					skill: task.skill ?? null,
					permissionTiers: task.permissionTiers,
					trigger: task.trigger ?? { type: "cron" },
				}
			: {
					name: createInitial?.name ?? "",
					cwd: createInitial?.cwd ?? fallbackCwd,
					prompt: createInitial?.prompt ?? "",
					cron: createInitial?.cron ?? toCronExpression(getDefaultDailySchedule()),
					isOnce: createInitial?.isOnce ?? false,
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
	const projectLabel = task?.cwd ? getProjectDisplayName(task.cwd, defaultCwd) : null;
	const scheduleLabel = task ? taskScheduleLabel(task, t) : "";

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
				const cron = trigger.type === "cron" ? draft.cron : draft.cron?.trim() ? draft.cron : "0 0 1 1 *";
				if (trigger.type === "cron" && !cron) return;
				const permissionTiers = compactPermissionTiers(draft.permissionTiers);
				const taskData = {
					name,
					prompt,
					cron: cron!,
					isOnce: draft.isOnce ?? false,
					enabled: draft.enabled ?? true,
					cwd,
					executionMode: (draft.executionMode ?? "full-access") as ExecutionModeOverride,
					modelKey: draft.modelKey ?? undefined,
					skill: draft.skill ?? undefined,
					...(permissionTiers !== undefined ? { permissionTiers } : {}),
					trigger,
				};
				setSubmitting(true);
				const action = task
					? updateTask(task.id, { ...taskData, permissionTiers: permissionTiers ?? {}, trigger }).then(() => task)
					: createTask(taskData);
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

function taskScheduleLabel(task: ScheduledTask, t: TFunction<"automation">): string {
	const parsed = parseCronExpression(task.cron, task.isOnce);
	if (parsed) return describeSchedule(parsed, t);
	return task.cron;
}

function canSubmitFromData(data: SchedulerTaskDraft): boolean {
	const trigger = data.trigger ?? { type: "cron" };
	if (trigger.type === "event" && !trigger.event) return false;
	if (trigger.type === "cron") {
		return Boolean(data.name?.trim() && data.prompt?.trim() && data.cwd && data.cron);
	}
	return Boolean(data.name?.trim() && data.prompt?.trim() && data.cwd);
}

/** 只保留显式 true，避免把「全关」写成五个 false 污染默认兼容语义。 */
function compactPermissionTiers(
	tiers: ScheduledTaskPermissionTiers | undefined,
): ScheduledTaskPermissionTiers | undefined {
	if (!tiers) return undefined;
	const next: ScheduledTaskPermissionTiers = {};
	let saw = false;
	for (const [key, enabled] of Object.entries(tiers) as Array<
		[keyof ScheduledTaskPermissionTiers, boolean | undefined]
	>) {
		if (enabled === true) {
			next[key] = true;
			saw = true;
		}
	}
	return saw ? next : undefined;
}
