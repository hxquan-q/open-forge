// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * sessions-changed 增量插入的档位合同（BUG-0156）：带 agentMode 的载荷原样保留，
 * coding 增量行不落入普通侧栏投影；work/无标记载荷按既有语义进入。全量刷新的
 * 档位下发见 listSessions 侧测试，此处只锁增量窗口。
 */
import { useAllstarDevHomePageModel } from "@domains/allstar-dev/hooks/useAllstarDevHomePageModel";
import { NO_MESSAGES_SENTINEL, type SessionInfo, sessionsMapAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { projectSidebarConversations } from "../services/sidebar-conversation-projection";
import { useProjectActions } from "./useProjects";

type SessionsChangedHandler = (payload: {
	cwd: string;
	sessionPath: string;
	session?: { id: string; cwd: string; firstMessage: string; modifiedAt: number; agentMode?: string };
}) => void;

const sessionsChangedHandlers = new Set<SessionsChangedHandler>();
const listSessions = vi.fn(async (_cwd: string): Promise<SessionInfo[]> => []);

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@shared/app-shell/session-open-context", () => ({ useOpenProjectSession: () => vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			config: {
				get: async () => ({ projects: [], archivedProjects: [], defaultConversationCwd: "" }),
				set: async () => {},
				onProjectsChanged: () => () => {},
			},
			project: {
				readMeta: async () => null,
				list: async () => ({ allstarProjects: [] }),
			},
			dialog: { selectFolder: async () => "" },
			fs: { delete: async () => {} },
			session: {
				listSessions,
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
	vi.useFakeTimers();
	listSessions.mockReset();
	listSessions.mockResolvedValue([]);
	store.set(sessionsMapAtom, new Map());
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

it("增量插入保留 agentMode：coding 不入普通投影，work 照常进入", async () => {
	renderHook(() => useProjectActions());
	expect(sessionsChangedHandlers.size).toBeGreaterThan(0);

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
	expect(sessionsChangedHandlers.size).toBeGreaterThan(0);

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

it.each([undefined, "work"])(
	"已有行模式为 %s 时，coding 事件在全量刷新前恢复开发历史并移出普通侧栏",
	async (agentMode) => {
		const cached: SessionInfo = {
			id: "coding-1",
			path: "/shard/a/coding-1.jsonl",
			cwd: "/proj/a",
			firstMessage: NO_MESSAGES_SENTINEL,
			modifiedAt: 1,
			...(agentMode ? { agentMode } : {}),
		};
		store.set(sessionsMapAtom, new Map([[cached.cwd, [cached]]]));
		const { result } = renderHook(() => useAllstarDevHomePageModel());
		await act(async () => {});
		expect(result.current.projectCards).toEqual([]);
		expect(projectSidebarConversations([cached], [], { kind: "project", projectPath: cached.cwd })).toHaveLength(1);

		const session = { id: cached.id, cwd: cached.cwd, firstMessage: "构建项目", modifiedAt: 2, agentMode: "coding" };
		act(() => {
			for (const handler of sessionsChangedHandlers) {
				handler({ cwd: cached.cwd, sessionPath: cached.path, session });
			}
		});

		const updated = store.get(sessionsMapAtom).get(cached.cwd) ?? [];
		expect(projectSidebarConversations(updated, [], { kind: "project", projectPath: cached.cwd })).toEqual([]);
		expect(result.current.projectCards).toMatchObject([
			{ cwd: cached.cwd, totalSessions: 1, sessions: [{ path: cached.path, title: "构建项目" }] },
		]);
		expect(updated).toEqual([{ ...cached, ...session }]);
		expect(listSessions).not.toHaveBeenCalled();

		listSessions.mockResolvedValue([{ ...cached, ...session }]);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		expect(listSessions).toHaveBeenCalledWith(cached.cwd);
		expect(result.current.projectCards[0]?.sessions).toEqual([{ path: cached.path, title: "构建项目" }]);
	},
);

it("明确 work 事件纠正已有 coding 行，不覆盖已知标题、首条消息或较新时间", () => {
	const cached: SessionInfo = {
		id: "work-1",
		path: "/shard/a/work-1.jsonl",
		cwd: "/proj/a",
		name: "用户标题",
		firstMessage: "已有首条消息",
		modifiedAt: 10,
		agentMode: "coding",
	};
	store.set(sessionsMapAtom, new Map([[cached.cwd, [cached]]]));
	renderHook(() => useProjectActions());

	act(() => {
		for (const handler of sessionsChangedHandlers) {
			handler({
				cwd: cached.cwd,
				sessionPath: cached.path,
				session: { id: cached.id, cwd: cached.cwd, firstMessage: "事件首条消息", modifiedAt: 2, agentMode: "work" },
			});
		}
	});

	const updated = store.get(sessionsMapAtom).get(cached.cwd) ?? [];
	expect(projectSidebarConversations(updated, [], { kind: "project", projectPath: cached.cwd })).toMatchObject([
		{ path: cached.path, agentMode: "work" },
	]);
	expect(updated).toEqual([{ ...cached, agentMode: "work" }]);
	expect(listSessions).not.toHaveBeenCalled();
});

it("无模式的兼容事件更新已有行时保留已知 coding 归属", () => {
	const cached: SessionInfo = {
		id: "coding-1",
		path: "/shard/a/coding-1.jsonl",
		cwd: "/proj/a",
		firstMessage: "已有首条消息",
		modifiedAt: 1,
		agentMode: "coding",
	};
	store.set(sessionsMapAtom, new Map([[cached.cwd, [cached]]]));
	renderHook(() => useProjectActions());

	act(() => {
		for (const handler of sessionsChangedHandlers) {
			handler({
				cwd: cached.cwd,
				sessionPath: cached.path,
				session: { id: cached.id, cwd: cached.cwd, firstMessage: "事件首条消息", modifiedAt: 2 },
			});
		}
	});

	const updated = store.get(sessionsMapAtom).get(cached.cwd) ?? [];
	expect(updated).toEqual([{ ...cached, modifiedAt: 2 }]);
	expect(projectSidebarConversations(updated, [], { kind: "project", projectPath: cached.cwd })).toEqual([]);
});

it.each(["missing-mode", "old-mode", "missing-row"])(
	"事件前启动的 %s 列表响应不撤销新模式，后续权威列表仍可更新和删除",
	async (snapshot) => {
		const cached: SessionInfo = {
			id: "coding-1",
			path: "/shard/a/coding-1.jsonl",
			cwd: "/proj/a",
			firstMessage: "已有消息",
			modifiedAt: 1,
			agentMode: "work",
		};
		store.set(sessionsMapAtom, new Map([[cached.cwd, [cached]]]));
		let resolveList!: (rows: SessionInfo[]) => void;
		const response = new Promise<SessionInfo[]>((resolve) => {
			resolveList = resolve;
		});
		listSessions.mockReturnValueOnce(response);
		const { result } = renderHook(() => ({
			actions: useProjectActions(),
			home: useAllstarDevHomePageModel(),
		}));
		await act(async () => {});
		let loading!: Promise<void>;
		act(() => {
			loading = result.current.actions.loadSessions(cached.cwd);
		});
		act(() => {
			for (const handler of sessionsChangedHandlers) {
				handler({
					cwd: cached.cwd,
					sessionPath: cached.path,
					session: { id: cached.id, cwd: cached.cwd, firstMessage: "已有消息", modifiedAt: 2, agentMode: "coding" },
				});
			}
		});
		expect(result.current.home.projectCards[0]?.totalSessions).toBe(1);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		expect(listSessions).toHaveBeenCalledTimes(1);

		const { agentMode: _agentMode, ...legacyRow } = cached;
		const staleRows = snapshot === "missing-row" ? [] : snapshot === "missing-mode" ? [legacyRow] : [cached];
		await act(async () => {
			resolveList(staleRows);
			await loading;
		});

		const updated = store.get(sessionsMapAtom).get(cached.cwd) ?? [];
		expect(updated).toMatchObject([{ path: cached.path, agentMode: "coding" }]);
		expect(projectSidebarConversations(updated, [], { kind: "project", projectPath: cached.cwd })).toEqual([]);
		expect(result.current.home.projectCards[0]?.sessions).toEqual([{ path: cached.path, title: "已有消息" }]);

		listSessions.mockResolvedValue([cached]);
		await act(async () => {
			await result.current.actions.loadSessions(cached.cwd);
		});
		expect(store.get(sessionsMapAtom).get(cached.cwd)?.[0]?.agentMode).toBe("work");
		expect(result.current.home.projectCards).toEqual([]);

		listSessions.mockResolvedValue([]);
		await act(async () => {
			await result.current.actions.loadSessions(cached.cwd);
		});
		expect(store.get(sessionsMapAtom).get(cached.cwd)).toEqual([]);
	},
);
