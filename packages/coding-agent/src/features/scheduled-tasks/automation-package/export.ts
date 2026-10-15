// Copyright The Open Forge contributors.
import type { AgentScheduledTask } from "../contracts.js";
import {
	AUTOMATION_PACKAGE_CAPABILITIES,
	AUTOMATION_PACKAGE_SCHEMA_VERSION,
	AUTOMATION_TASK_SCHEMA_VERSION,
	type AutomationPackageV1,
} from "./types.js";

export interface BuildAutomationPackageOptions {
	/** 覆盖默认从 task.id 推导的包 id（必须符合点分规则）。 */
	readonly packageId?: string;
	readonly packageVersion?: string;
	readonly description?: string;
	readonly minAppVersion?: string;
}

/**
 * 将本地定时任务导出为 automation-package.v1。
 * 不含 cwd / 运行态 / 凭据。
 */
export function buildAutomationPackageFromTask(
	task: Pick<
		AgentScheduledTask,
		"id" | "name" | "prompt" | "cron" | "isOnce" | "modelKey" | "executionMode" | "skill" | "permissionTiers"
	>,
	options: BuildAutomationPackageOptions = {},
): AutomationPackageV1 {
	const id = options.packageId ?? derivePackageId(task.id, task.name);
	const capabilities: string[] = ["scheduler.cron"];
	if (task.skill !== undefined) capabilities.push("scheduler.skill");
	if (task.permissionTiers !== undefined && Object.keys(task.permissionTiers).length > 0) {
		capabilities.push("scheduler.permissionTiers");
	}

	return {
		schemaVersion: AUTOMATION_PACKAGE_SCHEMA_VERSION,
		id,
		version: options.packageVersion ?? "1.0.0",
		name: task.name,
		...(options.description !== undefined ? { description: options.description } : {}),
		requires: {
			taskSchemaVersion: AUTOMATION_TASK_SCHEMA_VERSION,
			...(options.minAppVersion !== undefined ? { minAppVersion: options.minAppVersion } : {}),
			capabilities: capabilities.filter((cap) =>
				(AUTOMATION_PACKAGE_CAPABILITIES as readonly string[]).includes(cap),
			),
		},
		task: {
			name: task.name,
			prompt: task.prompt,
			cron: task.cron,
			isOnce: task.isOnce,
			...(task.modelKey !== undefined ? { modelKey: task.modelKey } : {}),
			...(task.executionMode !== undefined ? { executionMode: task.executionMode } : {}),
			...(task.skill !== undefined ? { skill: task.skill } : {}),
			...(task.permissionTiers !== undefined ? { permissionTiers: task.permissionTiers } : {}),
		},
	};
}

/** 若 task.id 已是点分 id 则复用，否则由名称生成可移植 id。 */
export function derivePackageId(taskId: string, taskName: string): string {
	if (/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/.test(taskId)) return taskId;
	const slug = taskName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	const safe = slug.length > 0 ? slug : "task";
	return `local.openforge.${safe}`;
}
