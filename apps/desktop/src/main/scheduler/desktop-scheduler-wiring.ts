// Modified by The Open Forge contributors.
/**
 * 自动化调度服务的桌面装配（ADR-0155，参照上游 ADR-0127 移植）：
 * 依赖读取真实配置（项目册 / 默认「对话」cwd），并在首次读取任务前
 * 注入旧任务迁移上下文——迁移只发生一次，注入晚于首次读取就永远不会触发。
 */
import type { RuntimeHost } from "@vetta/runtime-core";
import { DEFAULT_CONVERSATION_CWD, readDesktopConfig } from "../config/desktop-config-store.js";
import { isConversationCwd } from "../conversations/session-paths.js";
import { sameProjectPath } from "../projects/project-path.js";
import { syncTaskSchedule, unscheduleTaskInCron } from "./scheduler.js";
import type { SchedulerServiceDependencies } from "./scheduler-service.js";
import { setLegacyMigrationContextProvider } from "./task-storage.js";

/** 项目仍在侧边栏（含归档）才算可用；「对话」恒可用。 */
async function isKnownProject(cwd: string): Promise<boolean> {
	if (isConversationCwd(cwd)) return true;
	const config = await readDesktopConfig();
	return [...(config.projects ?? []), ...(config.archivedProjects ?? [])].some((project) =>
		sameProjectPath(project.path, cwd),
	);
}

export function createDesktopSchedulerDependencies(getRuntime: () => RuntimeHost): SchedulerServiceDependencies {
	// 旧定时任务迁移时，据项目列表推断会话归属；须在首次读取任务前注入。
	setLegacyMigrationContextProvider(async () => {
		const config = await readDesktopConfig();
		const projects = [...(config.projects ?? []), ...(config.archivedProjects ?? [])];
		return {
			conversationCwd: DEFAULT_CONVERSATION_CWD,
			isKnownProject: (cwd) => projects.some((project) => sameProjectPath(project.path, cwd)),
			now: Date.now(),
		};
	});
	return {
		getRuntime,
		syncTask: syncTaskSchedule,
		unscheduleTask: unscheduleTaskInCron,
		isKnownProject,
		sameProjectPath,
		conversationCwd: DEFAULT_CONVERSATION_CWD,
	};
}
