import { getTodoItemsForSession, todoItemsBySessionAtom } from "@shared/store/atoms";
import type { TodoItem } from "@shared/store/todo-atoms";
import type { TodoTabPanelViewLabels } from "@vetta-org/theme-ui/activity";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActivityRuntimeIds, useActivityRuntimeLabels } from "../registry/context";
import { collectRuntimeScoped } from "../services/runtime-scope";

/** One owner's slice of the aggregated todo list, keyed by its runtime session. */
export interface TodoOwnerGroup {
	readonly runtimeId: string;
	/** Owner display name from the workspace labels; empty when the runtime is unlabeled. */
	readonly ownerLabel: string;
	readonly items: readonly TodoItem[];
}

export interface TodoTabPanelModel {
	items: TodoItem[];
	/** Aggregated rows grouped per contributing runtime, in runtimeIds order. */
	groups: readonly TodoOwnerGroup[];
	/** True when several labeled runtimes contributed rows — render the per-owner sections. */
	grouped: boolean;
	emptyLabel: string;
	labels: TodoTabPanelViewLabels;
}

export function useTodoTabPanelModel(): TodoTabPanelModel {
	const { t } = useTranslation("chat");
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const runtimeIds = useActivityRuntimeIds();
	const runtimeLabels = useActivityRuntimeLabels();
	const groups = useMemo(() => {
		// collectRuntimeScoped 每行是一条 item（不是每 Runtime 一行），先按 runtimeId 归并成节。
		const byRuntime = new Map<string, { runtimeId: string; ownerLabel: string; items: TodoItem[] }>();
		for (const runtimeId of runtimeIds) {
			byRuntime.set(runtimeId, { runtimeId, ownerLabel: runtimeLabels[runtimeId] ?? "", items: [] });
		}
		for (const row of collectRuntimeScoped(runtimeIds, (id) => getTodoItemsForSession(todoMap, id))) {
			byRuntime.get(row.runtimeId)?.items.push(row.item);
		}
		return [...byRuntime.values()];
	}, [runtimeIds, runtimeLabels, todoMap]);
	const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);
	// 只有当多个「有数据的」Runtime 里至少两个有归属标注时才值得分节；普通对话与
	// 成员视图（收窄单 Runtime）保持既有扁平时间线。
	const labeledContributors = groups.filter((group) => group.items.length > 0 && group.ownerLabel);
	const grouped = labeledContributors.length > 1;

	const labels = useMemo(
		(): TodoTabPanelViewLabels => ({
			headline: t("activityPanel.todo.headline"),
			allDone: t("activityPanel.todo.allDone"),
			progress: (done, total) => t("activityPanel.todo.progress", { done, total }),
			statusDone: t("activityPanel.todo.statusDone"),
			statusInProgress: t("activityPanel.todo.statusInProgress"),
			statusPending: t("activityPanel.todo.statusPending"),
		}),
		[t],
	);

	return {
		items,
		groups,
		grouped,
		emptyLabel: t("activityPanel.todo.empty"),
		labels,
	};
}
