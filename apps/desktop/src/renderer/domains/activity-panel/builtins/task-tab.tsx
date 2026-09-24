import { getTaskStateForSession, taskStateBySessionAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TaskTabPanel } from "../components/TaskTabPanel";
import { useActivityRuntimeIds } from "../registry/context";
import type { ActivityTabDefinition } from "../registry/types";
import { collectRuntimeItems } from "../services/runtime-scope";

function TaskActivityTab(): JSX.Element {
	return <TaskTabPanel />;
}

export const taskTabDefinition: ActivityTabDefinition = {
	id: "task",
	// 待办之前：Task 是待办的执行载体，先看任务再看逐项进度。
	order: 19,
	removable: true,
	source: "builtin",
	useMeta: () => {
		const { t } = useTranslation("chat");
		const runtimeIds = useActivityRuntimeIds();
		const taskMap = useAtomValue(taskStateBySessionAtom);
		const tasks = useMemo(
			() => collectRuntimeItems(runtimeIds, (runtimeId) => getTaskStateForSession(taskMap, runtimeId).tasks),
			[taskMap, runtimeIds],
		);
		if (tasks.length === 0) return null;
		const active = tasks.filter((task) => task.status === "running" || task.status === "awaiting_review").length;
		return {
			label: t("activityPanel.tabs.task"),
			icon: "icon-[solar--checklist-minimalistic-linear]",
			badge: active || undefined,
		};
	},
	component: TaskActivityTab,
};
