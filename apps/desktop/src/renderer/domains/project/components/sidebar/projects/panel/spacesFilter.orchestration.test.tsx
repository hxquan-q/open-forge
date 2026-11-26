// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import {
	confirmDialogAtom,
	defaultConversationCwdAtom,
	defaultConversationFilterAtom,
	projectsAtom,
	type SessionInfo,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { type BatchProject, batchProjectsAtom } from "@shared/store/batch-tasks-atoms";
import { INITIAL_SPACES, MAIN_SPACE, type Space, spacesAtom } from "@shared/store/spaces";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 工作空间分组切片②b 编排测试：真实 panel model + 真实 useProjects，
 * 只有 `window.vetta` IPC 外部边界是 fake。
 *
 * 覆盖（PLAN-0032 P9 / ADR-0156）：
 * - 侧栏按选中空间过滤：项目收窄到归属、批量项目组只在主空间、
 *   默认区会话按路径归属过滤、非主空间 claw/batch 档回落；
 * - 清空会话的空间语义：自定义空间只逐条删该空间归属会话；
 *   主空间且无任何归属记录时走目录级清空。
 *
 * 断言深度豁免理由：删除/清空链路的关键合同是 IPC 边界的调用参数——逐条删
 * `session.delete` 的路径集合、是否走了目录级 `clearDefaultConversation`、
 * 是否因运行中会话而完全没删。这些都以捕获值（mock.calls）断言；列表过滤
 * 本身全用 atom/模型终态断言。
 */

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(async () => undefined),
	useMatches: () => [{ pathname: "/", params: {} }],
}));

vi.mock("@shared/lib/committed-paint", () => ({
	waitForCommittedPaint: vi.fn(async () => "painted"),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ""}`, i18n: { language: "zh" } }),
}));

vi.mock("@shared/hooks/useTeamSidebarConversations", () => ({
	useTeamSidebarConversations: () => ({ conversations: [], loading: false }),
}));

// 显式参数类型：mock.calls 的元素类型来自函数签名，无参签名会让 call[0] 变成
// 空元组索引错误；这里按真实 IPC 签名声明。
const sessionDelete = vi.fn(async (_sessionPath: string) => {});
const clearDefaultConversation = vi.fn(async (_filter: string) => {});
const listRunning = vi.fn(async (): Promise<string[]> => []);
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
			im: { onSessionChanged: () => () => {} },
			session: {
				delete: sessionDelete,
				listRunning,
				clearDefaultConversation,
				listSessions: async () => [],
				onSessionsChanged: () => () => {},
				rename: async () => {},
				deleteAllForCwd: async () => {},
			},
			scheduler: { deleteRecordsBySession: async () => {} },
			agentTeams: { deleteSession: async () => {} },
			conversationTags: { forgetConversations: async () => {} },
			archivedSessions: { forget: async () => {} },
			batchTasks: {
				deleteTask: async () => {},
				getProjects: async () => [],
				onTaskEvent: () => () => {},
			},
			sshHosts: { list: async () => [], onChanged: () => () => {} },
		},
	}),
);

const { useProjectsPanelModel } = await import("./useProjectsPanelModel.js");

const DEFAULT_CWD = "/conv";
const WORK: Space = { id: "work", name: "工作", icon: { kind: "solar", value: "code" } };

function session(path: string, cwd = DEFAULT_CWD): SessionInfo {
	return { id: path, path, cwd, firstMessage: path, modifiedAt: 1 } as SessionInfo;
}

function seedWorkspaceState(selected: string) {
	const store = getDefaultStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [WORK],
		selected,
		projects: { "/w/work-proj": "work" },
		conversations: { [`${DEFAULT_CWD}/work-chat.jsonl`]: "work" },
		locations: {},
	});
	store.set(defaultConversationCwdAtom, DEFAULT_CWD);
	store.set(projectsAtom, [
		{ cwd: DEFAULT_CWD, name: "对话", sessionCount: 0, type: "normal", isDefault: true },
		{ cwd: "/w/work-proj", name: "工作项目", sessionCount: 0, type: "normal" },
		{ cwd: "/w/main-proj", name: "主空间项目", sessionCount: 0, type: "normal" },
	] as never);
	store.set(
		sessionsMapAtom,
		new Map([[DEFAULT_CWD, [session(`${DEFAULT_CWD}/work-chat.jsonl`), session(`${DEFAULT_CWD}/main-chat.jsonl`)]]]),
	);
	// 批量组必须真实 seed：只有 tasks 带 sessionPath 的项目才进入 batchAsProjects，
	// 否则「批量组只在主空间」的断言形同虚设（组恒为空，换不换空间都成立）。
	store.set(batchProjectsAtom, [
		{
			id: "batch-1",
			name: "批量甲",
			prompt: "",
			concurrency: 1,
			tasks: [
				{
					id: "bt-1",
					name: "任务",
					cwd: DEFAULT_CWD,
					sourcePath: "bt-1",
					status: "completed",
					sessionPath: `${DEFAULT_CWD}/bt-1.jsonl`,
					createdAt: 1,
					updatedAt: 1,
				},
			],
			createdAt: 1,
			updatedAt: 1,
		} satisfies BatchProject,
	]);
	return store;
}

function renderPanel(filter: "all" | "batch" | "normal" = "all") {
	return renderHook(() => useProjectsPanelModel({ filter, onOpenSession: vi.fn(async () => undefined) }));
}

describe("侧栏工作空间过滤编排", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listRunning.mockResolvedValue([]);
		const store = getDefaultStore();
		store.set(confirmDialogAtom, null);
		store.set(defaultConversationFilterAtom, "conversation");
	});

	it("主空间：项目只列归属主空间的，批量组在，默认区会话只列归属主空间的", () => {
		seedWorkspaceState(MAIN_SPACE);
		const { result } = renderPanel("all");

		expect(result.current.filteredProjects.map((project) => project.cwd)).toEqual(["/w/main-proj"]);
		expect(result.current.batchProjects.map((entry) => entry.project.cwd)).toEqual(["batch-1"]);
		expect(result.current.defaultSessions.map((row) => row.path)).toEqual([`${DEFAULT_CWD}/main-chat.jsonl`]);
	});

	it("自定义空间：项目收窄到该空间归属，默认区会话按归属过滤，批量组消失", () => {
		const store = seedWorkspaceState("work");
		const { result } = renderPanel("all");

		expect(result.current.filteredProjects.map((project) => project.cwd)).toEqual(["/w/work-proj"]);
		expect(result.current.defaultSessions.map((row) => row.path)).toEqual([`${DEFAULT_CWD}/work-chat.jsonl`]);
		expect(result.current.batchProjects).toEqual([]);
		expect(result.current.showBatchGroup).toBe(true);
		// 无归属记录的 main 项目此时不可见；回到主空间才重新出现。
		act(() => store.set(spacesAtom, { ...store.get(spacesAtom), selected: MAIN_SPACE }));
		expect(result.current.filteredProjects.map((project) => project.cwd)).toEqual(["/w/main-proj"]);
	});

	it("非主空间停在「批量」档：effectiveFilter 回落「全部」而不是空侧栏", () => {
		seedWorkspaceState("work");
		const { result } = renderPanel("batch");

		expect(result.current.showBatchGroup).toBe(true);
		expect(result.current.batchProjects).toEqual([]);
		// 回落到「全部」后该空间的项目仍然可见——用户看到的是收窄后的全量而不是空面板。
		expect(result.current.filteredProjects.map((project) => project.cwd)).toEqual(["/w/work-proj"]);
	});

	it("非主空间停在 Claw 档：默认区档位回落「对话」，会话来源不是 claw cwd", () => {
		const store = seedWorkspaceState("work");
		act(() => store.set(defaultConversationFilterAtom, "claw"));
		const { result } = renderPanel("all");

		expect(result.current.defaultConversationFilter).toBe("conversation");
		expect(result.current.defaultSessionsCwd).toBe(DEFAULT_CWD);
		expect(result.current.defaultSessions.map((row) => row.path)).toEqual([`${DEFAULT_CWD}/work-chat.jsonl`]);
	});

	it("清空会话（自定义空间）：只逐条删该空间归属的会话，不走目录级清空", async () => {
		seedWorkspaceState("work");
		const { result } = renderPanel("all");

		act(() => result.current.actions.clearConversation(DEFAULT_CWD));
		const confirmation = getDefaultStore().get(confirmDialogAtom);
		expect(confirmation).not.toBeNull();
		// 确认框计数只算归属当前空间的 1 条，不是目录下的 2 条。
		expect(confirmation?.message).toContain("\"count\":1");
		await act(async () => {
			await confirmation?.onConfirm(false);
		});

		expect(sessionDelete.mock.calls.map((call) => call[0])).toEqual([`${DEFAULT_CWD}/work-chat.jsonl`]);
		expect(clearDefaultConversation.mock.calls).toEqual([]);
	});

	it("清空会话（主空间且无归属记录）：走目录级清空，不逐条删", async () => {
		const store = seedWorkspaceState(MAIN_SPACE);
		act(() => store.set(spacesAtom, { ...store.get(spacesAtom), conversations: {} }));
		const { result } = renderPanel("all");

		act(() => result.current.actions.clearConversation(DEFAULT_CWD));
		const confirmation = getDefaultStore().get(confirmDialogAtom);
		await act(async () => {
			await confirmation?.onConfirm(false);
		});

		expect(clearDefaultConversation.mock.calls.map((call) => call[0])).toEqual(["conversation"]);
		expect(sessionDelete.mock.calls).toEqual([]);
	});

	it("清空会话（主空间但已有归属记录）：归属记录意味着主空间≠全量，逐条删归属主空间的会话", async () => {
		// 一旦存在归属记录，「清空整个默认区」会把别的空间的会话一起删掉，所以主空间也降级为逐条删。
		seedWorkspaceState(MAIN_SPACE);
		const { result } = renderPanel("all");

		act(() => result.current.actions.clearConversation(DEFAULT_CWD));
		const confirmation = getDefaultStore().get(confirmDialogAtom);
		await act(async () => {
			await confirmation?.onConfirm(false);
		});

		expect(sessionDelete.mock.calls.map((call) => call[0])).toEqual([`${DEFAULT_CWD}/main-chat.jsonl`]);
		expect(clearDefaultConversation.mock.calls).toEqual([]);
	});

	it("清空会话：确认后才移动出去的会话不删；有运行中会话时整条清空取消", async () => {
		const store = seedWorkspaceState("work");
		// 两条会话都归属 work，弹出的确认框计数 2。
		act(() =>
			store.set(spacesAtom, {
				...store.get(spacesAtom),
				conversations: {
					[`${DEFAULT_CWD}/work-chat.jsonl`]: "work",
					[`${DEFAULT_CWD}/main-chat.jsonl`]: "work",
				},
			}),
		);
		const { result } = renderPanel("all");

		act(() => result.current.actions.clearConversation(DEFAULT_CWD));
		const confirmation = getDefaultStore().get(confirmDialogAtom);
		expect(confirmation?.message).toContain("\"count\":2");
		// 确认前用户把 main-chat 移回了主空间——删除范围以确认这一刻的归属为准，
		// 它已经不在 work 里，不能跟着陪葬。
		act(() =>
			store.set(spacesAtom, {
				...store.get(spacesAtom),
				conversations: { [`${DEFAULT_CWD}/work-chat.jsonl`]: "work" },
			}),
		);
		await act(async () => {
			await confirmation?.onConfirm(false);
		});
		expect(sessionDelete.mock.calls.map((call) => call[0])).toEqual([`${DEFAULT_CWD}/work-chat.jsonl`]);

		// 运行中的会话删不得：清空直接取消，一条都不删。
		sessionDelete.mockClear();
		listRunning.mockResolvedValue([`${DEFAULT_CWD}/work-chat.jsonl`]);
		act(() => result.current.actions.clearConversation(DEFAULT_CWD));
		const second = getDefaultStore().get(confirmDialogAtom);
		await act(async () => {
			await second?.onConfirm(false);
		});
		expect(sessionDelete.mock.calls).toEqual([]);
		expect(clearDefaultConversation.mock.calls).toEqual([]);
	});

	it("viewer 只读打开时记住空间位置（rememberSpaceLocation 接线）", async () => {
		seedWorkspaceState("work");
		const store = getDefaultStore();
		// viewer 会话放在 work 归属的项目不可行——位置记忆按归属键记到空间上；
		// 这里验证默认区会话打开 viewer 后，work 空间记住了这个位置。
		const viewerPath = `${DEFAULT_CWD}/work-chat.jsonl`;
		store.set(
			sessionsMapAtom,
			new Map([
				[
					DEFAULT_CWD,
					[
						{
							...session(viewerPath),
							access: { readHistory: true, resume: false, rename: false, delete: false },
						} as never,
						session(`${DEFAULT_CWD}/main-chat.jsonl`),
					],
				],
			]),
		);
		const { result } = renderPanel("all");

		act(() => result.current.actions.defaultSelectSession(DEFAULT_CWD, result.current.defaultSessions[0]!));
		await waitFor(() => {
			expect(store.get(spacesAtom).locations.work).toEqual({
				kind: "conversation",
				cwd: DEFAULT_CWD,
				path: viewerPath,
				viewer: true,
			});
		});
	});
});
