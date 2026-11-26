// Modified by The Open Forge contributors.
import { activeSessionAtom } from "@shared/store/chat-atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { defaultConversationCwdAtom, projectsAtom, sessionsMapAtom } from "@shared/store/project-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import { spacesAtom } from "@shared/store/spaces";
import { atom } from "jotai";
import type { SpaceActivity, SpaceActivityEntry } from "../lib/space-activity";
import { summarizeSpaceActivity } from "../lib/space-activity";

/**
 * 每个工作空间「有多少会话在跑 / 有多少在等用户」。
 *
 * 侧栏的会话行、项目行与工作空间按钮组都读这一份，避免三处各自判定谁在跑、谁在等。
 * 等用户处理的会话同时也在运行集合里，两个计数分别记，由界面决定先显示哪个。
 * 团队会话归 Allstar 版块（ADR-0156 决策 2），不进入工作空间计数。
 */
export const spaceActivityAtom = atom<Map<string, SpaceActivity>>((get) => {
	const runningPaths = get(runningSessionPathsAtom);
	const pendingPaths = get(pendingInteractionPathsAtom);
	const spaces = get(spacesAtom);
	const projects = get(projectsAtom);
	const sessionsMap = get(sessionsMapAtom);
	const defaultCwd = get(defaultConversationCwdAtom);
	const activeSession = get(activeSessionAtom);

	const cwdByPath = new Map<string, string>();
	for (const sessions of sessionsMap.values()) {
		for (const session of sessions) cwdByPath.set(session.path, session.cwd);
	}
	// 刚打开、还没回填进会话列表的会话也要能参与归因。
	if (activeSession?.sessionPath && activeSession.cwd) cwdByPath.set(activeSession.sessionPath, activeSession.cwd);

	const paths = new Set<string>([...runningPaths, ...pendingPaths.keys()]);
	const activity: SpaceActivityEntry[] = [...paths].map((sessionPath) => ({
		sessionPath,
		running: runningPaths.has(sessionPath),
		waiting: (pendingPaths.get(sessionPath) ?? 0) > 0,
		cwd: cwdByPath.get(sessionPath),
	}));

	return summarizeSpaceActivity({
		activity,
		spaces,
		projectCwds: projects.map((project) => project.cwd),
		defaultCwd,
		cwdByPath,
	});
});
