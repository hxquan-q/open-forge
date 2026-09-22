import type { DesktopArtifactView } from "@preload/api-types/task";
import { EMPTY_TASK_STATE, getTaskStateForSession, taskStateBySessionAtom } from "@shared/store/task-atoms";
import { showToast } from "@shared/store/toast-atoms";
import { mergeTaskStateSeed } from "@shared/task/task-projection.js";
import type { RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivityRuntimeIds } from "../registry/context";
import { collectRuntimeScoped } from "../services/runtime-scope";

export interface TaskPanelTaskView {
	readonly runtimeId: string;
	readonly snapshot: RuntimeTaskSnapshot;
}

export interface TaskPanelModel {
	tasks: readonly TaskPanelTaskView[];
	artifacts: readonly DesktopArtifactView[];
	headline: string;
	emptyLabel: string;
	createLabel: string;
	statusLabel: (status: RuntimeTaskSnapshot["status"]) => string;
	actions: {
		create: () => Promise<void>;
		cancel: (runtimeId: string, taskId: string) => Promise<void>;
		pause: (runtimeId: string, taskId: string) => Promise<void>;
		review: (
			runtimeId: string,
			taskId: string,
			decision: "approved" | "changes_requested" | "rejected",
		) => Promise<void>;
	};
}

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
} as const satisfies Record<RuntimeTaskSnapshot["status"], string>;

export function useTaskPanelModel(): TaskPanelModel {
	const { t } = useTranslation("chat");
	const runtimeIds = useActivityRuntimeIds();
	const taskMap = useAtomValue(taskStateBySessionAtom);
	const setTaskState = useSetAtom(taskStateBySessionAtom);
	const [artifacts, setArtifacts] = useState<readonly DesktopArtifactView[]>([]);

	const tasks = useMemo(
		() =>
			collectRuntimeScoped(runtimeIds, (runtimeId) => getTaskStateForSession(taskMap, runtimeId).tasks).map(
				(row) => ({ runtimeId: row.runtimeId, snapshot: row.item }),
			),
		[runtimeIds, taskMap],
	);

	// 打开/切换会话时用主进程快照补齐投影（重启后历史 Task 由此恢复）。
	useEffect(() => {
		let cancelled = false;
		const primary = runtimeIds[0];
		if (!primary || !window.vetta?.task) return;
		void (async () => {
			try {
				const state = await window.vetta.task.getState(primary);
				if (cancelled) return;
				setTaskState((prev) => {
					const current = prev.get(primary) ?? EMPTY_TASK_STATE;
					const next = mergeTaskStateSeed(current, state);
					return next === current ? prev : new Map(prev).set(primary, next);
				});
				const views = await window.vetta.task.getArtifactViews(primary);
				if (!cancelled) setArtifacts(views);
			} catch {
				// 快照补齐是尽力而为：事件流折叠仍会继续更新投影。
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [runtimeIds, setTaskState]);

	const runCommand = useCallback(
		async (runtimeId: string, command: Parameters<typeof window.vetta.task.runCommand>[1]): Promise<boolean> => {
			try {
				const outcome = await window.vetta.task.runCommand(runtimeId, command);
				if (outcome.ok) {
					setTaskState((prev) => new Map(prev).set(runtimeId, outcome.state));
				} else {
					showToast({ message: outcome.message, variant: "error" });
				}
				return outcome.ok;
			} catch (error) {
				showToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
				return false;
			}
		},
		[setTaskState],
	);

	const primaryRuntimeId = runtimeIds[0];

	return {
		tasks,
		artifacts,
		headline: t("activityPanel.task.headline"),
		emptyLabel: t("activityPanel.task.empty"),
		createLabel: t("activityPanel.task.create"),
		statusLabel: (status) => t(STATUS_KEYS[status]),
		actions: {
			create: async () => {
				if (primaryRuntimeId) await runCommand(primaryRuntimeId, { type: "create" });
			},
			cancel: async (runtimeId, taskId) => {
				await runCommand(runtimeId, { type: "cancel", taskId });
			},
			pause: async (runtimeId, taskId) => {
				await runCommand(runtimeId, { type: "pause", taskId });
			},
			review: async (runtimeId, taskId, decision) => {
				await runCommand(runtimeId, { type: "review", taskId, decision });
			},
		},
	};
}
