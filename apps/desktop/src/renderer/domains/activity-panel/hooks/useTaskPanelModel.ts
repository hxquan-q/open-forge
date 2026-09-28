// Copyright The Open Forge contributors.
import type { DesktopArtifactView } from "@preload/api-types/task";
import { getTaskStateForSession, taskStateBySessionAtom } from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { seedSessionTaskState } from "@shared/task/task-projection.js";
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
	primaryRuntimeId: string | null;
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

/** 稳定 RuntimeTaskErrorCode → 本地化文案；未知码落到通用失败文案。 */
const ERROR_KEYS = {
	task_not_found: "activityPanel.task.error.notFound",
	task_invalid_transition: "activityPanel.task.error.invalidTransition",
	task_missing_turn_binding: "activityPanel.task.error.missingTurnBinding",
	task_unknown_approval: "activityPanel.task.error.unknownApproval",
	task_duplicate_artifact: "activityPanel.task.error.duplicateArtifact",
	task_event_log_invalid: "activityPanel.task.error.eventLogInvalid",
	task_command_failed: "activityPanel.task.error.commandFailed",
} as const satisfies Record<string, string>;

export function useTaskPanelModel(): TaskPanelModel {
	const { t } = useTranslation("chat");
	const runtimeIds = useActivityRuntimeIds();
	const taskMap = useAtomValue(taskStateBySessionAtom);
	const setTaskState = useSetAtom(taskStateBySessionAtom);
	const [artifactSnapshot, setArtifactSnapshot] = useState<{
		sessionId: string;
		views: readonly DesktopArtifactView[];
	} | null>(null);

	const tasks = useMemo(
		() =>
			collectRuntimeScoped(runtimeIds, (runtimeId) => getTaskStateForSession(taskMap, runtimeId).tasks).map(
				(row) => ({ runtimeId: row.runtimeId, snapshot: row.item }),
			),
		[runtimeIds, taskMap],
	);
	const primaryRuntimeId = runtimeIds[0] ?? null;
	const artifacts = artifactSnapshot?.sessionId === primaryRuntimeId ? artifactSnapshot.views : [];
	const projectedArtifacts = useMemo(
		() => (primaryRuntimeId ? getTaskStateForSession(taskMap, primaryRuntimeId).artifacts : []),
		[primaryRuntimeId, taskMap],
	);
	const artifactRevision = projectedArtifacts
		.map((artifact) => `${artifact.artifactId}:${artifact.version}:${artifact.updatedAt}`)
		.join("|");

	// 打开/切换会话时用主进程快照补齐投影（重启后历史 Task 由此恢复）。
	useEffect(() => {
		if (primaryRuntimeId) void seedSessionTaskState(primaryRuntimeId, setTaskState);
	}, [primaryRuntimeId, setTaskState]);

	// artifact 版本一变就重新拉取视图快照，否则新版本写入后预览仍停留在旧视图。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 依赖是「重新拉取时机」而非读取值
	useEffect(() => {
		let cancelled = false;
		if (!primaryRuntimeId || !window.vetta?.task) {
			setArtifactSnapshot(null);
			return;
		}
		void window.vetta.task
			.getArtifactViews(primaryRuntimeId)
			.then((views) => {
				if (!cancelled) setArtifactSnapshot({ sessionId: primaryRuntimeId, views });
			})
			.catch(() => {
				if (!cancelled) setArtifactSnapshot({ sessionId: primaryRuntimeId, views: [] });
			});
		return () => {
			cancelled = true;
		};
	}, [primaryRuntimeId, artifactRevision]);

	const runCommand = useCallback(
		async (runtimeId: string, command: Parameters<typeof window.vetta.task.runCommand>[1]): Promise<boolean> => {
			const api = window.vetta?.task;
			if (!api) return false;
			try {
				const outcome = await api.runCommand(runtimeId, command);
				if (outcome.ok) {
					setTaskState((prev) => new Map(prev).set(runtimeId, outcome.state));
				} else {
					const key = ERROR_KEYS[outcome.code as keyof typeof ERROR_KEYS];
					showToast({ message: key ? t(key) : t("activityPanel.task.error.commandFailed"), variant: "error" });
				}
				return outcome.ok;
			} catch {
				showToast({ message: t("activityPanel.task.error.commandFailed"), variant: "error" });
				return false;
			}
		},
		[setTaskState, t],
	);

	return {
		primaryRuntimeId,
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
