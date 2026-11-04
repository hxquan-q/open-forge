// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * sessions-changed 增量插入的档位合同（BUG-0156）：带 agentMode 的载荷原样保留，
 * coding 增量行不落入普通侧栏投影；work/无标记载荷按既有语义进入。全量刷新的
 * 档位下发见 listSessions 侧测试，此处只锁增量窗口。
 */
import { sessionsMapAtom } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { projectSidebarConversations } from "../services/sidebar-conversation-projection";
import { useProjectActions } from "./useProjects";

type SessionsChangedHandler = (payload: {
	cwd: string;
	sessionPath: string;
	session?: { id: string; cwd: string; firstMessage: string; modifiedAt: number; agentMode?: string };
}) => void;

const sessionsChangedHandlers = new Set<SessionsChangedHandler>();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			config: {
				get: async () => ({ projects: [], archivedProjects: [], defaultConversationCwd: "" }),
				set: async () => {},
				onProjectsChanged: () => () => {},
			},
			project: { readMeta: async () => null },
			dialog: { selectFolder: async () => "" },
			fs: { delete: async () => {} },
			session: {
				listSessions: async () => [],
				onSessionsChanged: (handler: SessionsChangedHandler) => {
					sessionsChangedHandlers.add(handler);
					return () => sessionsChangedHandlers.delete(handler);
				},
			},
			im: { onSessionChanged: () => () => {} },
		},
	}),
);

const store = getDefaultStore();

// useProjects 的 sessions-changed 订阅带模块级 guard（renderer 生命周期只装一次），
// 本文件首个用例注册后常驻；这里只重置数据，不清理 handler。
beforeEach(() => {
	store.set(sessionsMapAtom, new Map());
});

it("增量插入保留 agentMode：coding 不入普通投影，work 照常进入", async () => {
	renderHook(() => useProjectActions());
	await waitFor(() => expect(sessionsChangedHandlers.size).toBeGreaterThan(0));

	act(() => {
		for (const handler of sessionsChangedHandlers) {
			handler({
				cwd: "/proj/a",
				sessionPath: "/shard/a/coding-1.jsonl",
				session: { id: "coding-1", cwd: "/proj/a", firstMessage: "构建", modifiedAt: 1, agentMode: "coding" },
			});
			handler({
				cwd: "/proj/a",
				sessionPath: "/shard/a/work-1.jsonl",
				session: { id: "work-1", cwd: "/proj/a", firstMessage: "总结", modifiedAt: 2, agentMode: "work" },
			});
		}
	});

	const list = store.get(sessionsMapAtom).get("/proj/a") ?? [];
	expect(list).toHaveLength(2);
	expect(list.find((item) => item.path === "/shard/a/coding-1.jsonl")?.agentMode).toBe("coding");
	const projected = projectSidebarConversations(list, [], { kind: "project", projectPath: "/proj/a" });
	expect(projected.map((item) => (item.kind === "conversation" ? item.path : item.teamSessionId))).toEqual([
		"/shard/a/work-1.jsonl",
	]);
});

it("无标记载荷按 work 兼容语义进入普通投影", async () => {
	renderHook(() => useProjectActions());
	await waitFor(() => expect(sessionsChangedHandlers.size).toBeGreaterThan(0));

	act(() => {
		for (const handler of sessionsChangedHandlers) {
			handler({
				cwd: "/proj/a",
				sessionPath: "/shard/a/legacy-1.jsonl",
				session: { id: "legacy-1", cwd: "/proj/a", firstMessage: "旧会话", modifiedAt: 3 },
			});
		}
	});

	const list = store.get(sessionsMapAtom).get("/proj/a") ?? [];
	const projected = projectSidebarConversations(list, [], { kind: "project", projectPath: "/proj/a" });
	expect(projected).toHaveLength(1);
});
