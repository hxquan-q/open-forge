// Copyright The Open Forge contributors.

import { CODING_AGENT_TODO_CLEAR } from "@vetta/coding-agent/session-extensions";
import type { HostDomainImplementation, SESSION_GOAL_HOST_METHODS } from "@vetta/host-protocol";
import { DesktopGoalController } from "../conversations/desktop-goal-controller.js";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话 goal/todos 子域的 Host 实现（TASK-0469）：goal 操作经
 * DesktopGoalController（唯一编排点，start/resume 失败回滚语义保留）；
 * clearTodos 薄桥接 session extension。
 */
export const sessionGoalHostDomain: HostDomainImplementation<typeof SESSION_GOAL_HOST_METHODS> = {
	getGoalState: ({ sessionId }) => new DesktopGoalController(getSharedRuntime()).read(sessionId),
	startGoal: ({ sessionId, objective }) => new DesktopGoalController(getSharedRuntime()).start(sessionId, objective),
	pauseGoal: ({ sessionId, goalId }) => new DesktopGoalController(getSharedRuntime()).pause(sessionId, goalId),
	resumeGoal: ({ sessionId, goalId }) => new DesktopGoalController(getSharedRuntime()).resume(sessionId, goalId),
	clearGoal: ({ sessionId, goalId }) => new DesktopGoalController(getSharedRuntime()).clear(sessionId, goalId),
	clearTodos: ({ sessionId }) =>
		getSharedRuntime().invokeSessionExtension(sessionId, CODING_AGENT_TODO_CLEAR, undefined),
};
