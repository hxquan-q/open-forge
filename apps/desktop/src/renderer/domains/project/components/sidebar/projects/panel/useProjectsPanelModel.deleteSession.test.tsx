// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { activeSessionAtom, batchProjectsAtom, sessionsMapAtom } from "@shared/store/atoms";
import { toastsAtom } from "@shared/store/toast-atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 侧栏会话删除的合同测试。
 *
 * - 团队会话（BUG-0114）：IPC rejection 必须有出口——记错误日志、弹失败 toast。
 * - 普通/批量会话（BUG-0191）：删除编排收口在本 model——主删除失败时只弹失败
 *   toast，不导航、不清标记、不动活动会话；标注/归档标记、摘行与必要导航只在
 *   删除成功之后执行；等待期间活动会话以完成时最新状态判定。
 *
 * 断言深度豁免理由：本文件的被测对象就是「编排」本身——正确性体现在哪一步
 * 调用哪个外部边界（删除 IPC、forget 元数据、导航）、以什么顺序、失败时哪一步
 * 不调用。这类行为没有更深的可观察状态可断言，调用类断言即合同本身。
 */

const navigateSpy = vi.fn();
let routeMatches: Array<{ pathname: string; params: Record<string, string> }> = [{ pathname: "/", params: {} }];
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateSpy,
	useMatches: () => routeMatches,
}));

vi.mock("@shared/lib/committed-paint", () => ({
	waitForCommittedPaint: vi.fn(async () => "painted"),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const deleteBatchTask = vi.fn();
const deleteBatchProject = vi.fn();
vi.mock("@domains/batch-tasks/hooks/useBatchTasks", () => ({
	useBatchTasks: () => ({ deleteTask: deleteBatchTask, deleteProject: deleteBatchProject }),
}));

const useProjectsMock = vi.fn();
vi.mock("../../../../hooks/useProjects", () => ({
	useProjects: () => useProjectsMock(),
}));
vi.mock("@shared/hooks/useTeamSidebarConversations", () => ({
	useTeamSidebarConversations: () => ({ conversations: [], loading: false }),
}));

const deleteTeamSession = vi.fn();
const forgetConversations = vi.fn(async () => {});
const forgetArchivedSessions = vi.fn(async () => {});
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			agentTeams: { deleteSession: deleteTeamSession },
			conversationTags: { forgetConversations },
			archivedSessions: { forget: forgetArchivedSessions },
		},
	}),
);

const { useProjectsPanelModel } = await import("./useProjectsPanelModel.js");

const TEAM_SESSION = {
	kind: "agent-team",
	id: "team-session-1",
	path: "/team/session.jsonl",
	cwd: "/repo/a",
	firstMessage: "Ship it",
	modifiedAt: 1,
	teamId: "team-1",
	teamSessionId: "team-session-1",
	memberAvatarUrls: [],
	sessionTitle: "Ship it",
} as Parameters<ReturnType<typeof useProjectsPanelModel>["actions"]["deleteSession"]>[0];

const NORMAL_SESSION = {
	kind: "conversation",
	id: "normal-1",
	path: "/repo/a/.vetta/sessions/normal-1.jsonl",
	cwd: "/repo/a",
	firstMessage: "normal chat",
	modifiedAt: 1,
} as unknown as Parameters<ReturnType<typeof useProjectsPanelModel>["actions"]["deleteSession"]>[0];

const BATCH_TASK_SESSION = {
	kind: "conversation",
	id: "task-1",
	path: "/repo/b/.vetta/sessions/task-1.jsonl",
	cwd: "/folder-1",
	firstMessage: "batch task",
	modifiedAt: 1,
} as unknown as Parameters<ReturnType<typeof useProjectsPanelModel>["actions"]["deleteSession"]>[0];

const BATCH_PROJECT = {
	id: "batch-1",
	name: "Batch",
	updatedAt: 1,
	tasks: [
		{
			id: "task-1",
			name: "task-1",
			cwd: "/folder-1",
			sessionPath: BATCH_TASK_SESSION.path,
			status: "completed",
			createdAt: 1,
			updatedAt: 1,
		},
	],
};

function projectsState(overrides: Record<string, unknown> = {}) {
	return {
		projects: [],
		projectsInitialized: true,
		sessionsMap: new Map(),
		sessionLoadingCwds: new Set<string>(),
		expandedProjects: new Set<string>(),
		expandProject: vi.fn(),
		collapseProject: vi.fn(),
		deleteSession: vi.fn(async () => ({ cleanupFailed: false })),
		renameSession: vi.fn(),
		archiveProject: vi.fn(),
		removeProject: vi.fn(),
		deleteProjectFromDisk: vi.fn(),
		loadSessions: vi.fn(),
		removePinnedSessions: vi.fn(),
		...overrides,
	};
}

function errorToasts() {
	return getDefaultStore()
		.get(toastsAtom)
		.filter((toast) => toast.variant === "error");
}

function renderPanel() {
	return renderHook(() => useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn().mockResolvedValue(undefined) }));
}

describe("useProjectsPanelModel.deleteSession（团队会话）", () => {
	beforeEach(() => {
		navigateSpy.mockReset();
		navigateSpy.mockResolvedValue(undefined);
		routeMatches = [{ pathname: "/", params: {} }];
		useProjectsMock.mockReset();
		useProjectsMock.mockReturnValue(projectsState());
		deleteTeamSession.mockReset();
		deleteTeamSession.mockResolvedValue(undefined);
		forgetConversations.mockClear();
		forgetArchivedSessions.mockClear();
		getDefaultStore().set(toastsAtom, []);
		getDefaultStore().set(activeSessionAtom, null);
		getDefaultStore().set(batchProjectsAtom, []);
	});

	it("删除成功后通知团队列表刷新", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(TEAM_SESSION);
			await Promise.resolve();
		});

		expect(deleteTeamSession).toHaveBeenCalledWith({
			id: "team-session-1",
			coordinationSessionPath: "/team/session.jsonl",
		});
		expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringContaining("team") }));
		dispatchSpy.mockRestore();
	});

	it("IPC 删除失败时记错误日志并弹失败 toast，不产生 unhandled rejection（BUG-0114）", async () => {
		deleteTeamSession.mockRejectedValueOnce(
			new Error("Error invoking remote method 'vetta:agent-teams:delete-session': Error: [object Object]"),
		);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(TEAM_SESSION);
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() => expect(errorSpy).toHaveBeenCalledOnce());
		expect(errorSpy.mock.calls[0]?.[0]).toContain("delete team session failed");
		expect(errorToasts().some((toast) => toast.message.includes("deleteSessionFailedToast"))).toBe(true);
		errorSpy.mockRestore();
	});
});

describe("useProjectsPanelModel.deleteSession（普通会话，BUG-0191）", () => {
	let deleteSessionMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		navigateSpy.mockReset();
		navigateSpy.mockResolvedValue(undefined);
		routeMatches = [{ pathname: "/", params: {} }];
		deleteSessionMock = vi.fn(async () => ({ cleanupFailed: false }));
		useProjectsMock.mockReset();
		useProjectsMock.mockReturnValue(projectsState({ deleteSession: deleteSessionMock }));
		deleteBatchTask.mockReset();
		deleteBatchTask.mockResolvedValue(undefined);
		forgetConversations.mockClear();
		forgetArchivedSessions.mockClear();
		getDefaultStore().set(toastsAtom, []);
		getDefaultStore().set(activeSessionAtom, null);
		getDefaultStore().set(sessionsMapAtom, new Map());
		getDefaultStore().set(batchProjectsAtom, []);
	});

	it("删除成功后清理标注/归档标记；目标非活动会话时不导航、不动活动会话", async () => {
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(NORMAL_SESSION);
			await Promise.resolve();
		});

		expect(deleteSessionMock).toHaveBeenCalledWith("/repo/a", NORMAL_SESSION.path);
		expect(forgetConversations).toHaveBeenCalledWith([NORMAL_SESSION.path]);
		expect(forgetArchivedSessions).toHaveBeenCalledWith([NORMAL_SESSION.path]);
		expect(navigateSpy).not.toHaveBeenCalled();
		expect(getDefaultStore().get(activeSessionAtom)).toBeNull();
		expect(errorToasts()).toEqual([]);
	});

	it("标注/归档清理不得先于删除结果执行", async () => {
		let resolveDelete: () => void = () => undefined;
		deleteSessionMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveDelete = () => resolve({ cleanupFailed: false } as never);
				}),
		);
		const { result } = renderPanel();

		act(() => {
			result.current.actions.deleteSession(NORMAL_SESSION);
		});
		// 主删除仍 pending：任何元数据清理都不得发生。
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(forgetArchivedSessions).not.toHaveBeenCalled();

		await act(async () => {
			resolveDelete();
			await Promise.resolve();
		});
		expect(forgetConversations).toHaveBeenCalledWith([NORMAL_SESSION.path]);
	});

	it("主删除拒绝：失败 toast + 日志，不导航、不清标记、不动活动会话（BUG-0191）", async () => {
		deleteSessionMock.mockRejectedValueOnce(new Error("EIO: locked"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		getDefaultStore().set(activeSessionAtom, { sessionPath: NORMAL_SESSION.path, cwd: "/repo/a" } as never);
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(NORMAL_SESSION);
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() =>
			expect(errorToasts().some((toast) => toast.message.includes("deleteSessionFailedToast"))).toBe(true),
		);
		expect(errorSpy).toHaveBeenCalled();
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(forgetArchivedSessions).not.toHaveBeenCalled();
		expect(navigateSpy).not.toHaveBeenCalled();
		// 活动会话原样保留，不被清掉。
		expect(getDefaultStore().get(activeSessionAtom)).toMatchObject({ sessionPath: NORMAL_SESSION.path });
		errorSpy.mockRestore();
	});

	it("等待期间用户切走：完成时以最新活动状态判定，不清新会话、不拉回（BUG-0191）", async () => {
		let resolveDelete: () => void = () => undefined;
		deleteSessionMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveDelete = () => resolve({ cleanupFailed: false } as never);
				}),
		);
		getDefaultStore().set(activeSessionAtom, { sessionPath: NORMAL_SESSION.path, cwd: "/repo/a" } as never);
		const { result } = renderPanel();

		act(() => {
			result.current.actions.deleteSession(NORMAL_SESSION);
		});
		// 删除 pending 期间用户切到会话 B。
		act(() => {
			getDefaultStore().set(activeSessionAtom, { sessionPath: "/other/b.jsonl", cwd: "/repo/a" } as never);
		});
		await act(async () => {
			resolveDelete();
			await Promise.resolve();
		});

		expect(getDefaultStore().get(activeSessionAtom)).toMatchObject({ sessionPath: "/other/b.jsonl" });
		expect(navigateSpy).not.toHaveBeenCalled();
	});

	it("等待期间活动会话一直是目标：成功后清活动并导航到新建页", async () => {
		let resolveDelete: () => void = () => undefined;
		deleteSessionMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveDelete = () => resolve({ cleanupFailed: false } as never);
				}),
		);
		getDefaultStore().set(activeSessionAtom, { sessionPath: NORMAL_SESSION.path, cwd: "/repo/a" } as never);
		const { result } = renderPanel();

		act(() => {
			result.current.actions.deleteSession(NORMAL_SESSION);
		});
		await act(async () => {
			resolveDelete();
			await Promise.resolve();
		});

		await waitFor(() => expect(getDefaultStore().get(activeSessionAtom)).toBeNull());
		await waitFor(() => expect(navigateSpy).toHaveBeenCalledOnce());
		expect(navigateSpy.mock.calls[0]?.[0]).toMatchObject({ to: "/new-session/$cwd" });
	});
});

describe("useProjectsPanelModel.deleteSession（批量任务分支，BUG-0191）", () => {
	beforeEach(() => {
		navigateSpy.mockReset();
		navigateSpy.mockResolvedValue(undefined);
		routeMatches = [{ pathname: "/", params: {} }];
		useProjectsMock.mockReset();
		useProjectsMock.mockReturnValue(projectsState());
		deleteBatchTask.mockReset();
		deleteBatchTask.mockResolvedValue(undefined);
		forgetConversations.mockClear();
		forgetArchivedSessions.mockClear();
		getDefaultStore().set(toastsAtom, []);
		getDefaultStore().set(activeSessionAtom, null);
		getDefaultStore().set(batchProjectsAtom, [BATCH_PROJECT] as never);
	});

	it("批量删除成功后才清理标记；非活动目标不导航", async () => {
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(BATCH_TASK_SESSION);
			await Promise.resolve();
		});

		expect(deleteBatchTask).toHaveBeenCalledWith("batch-1", "task-1");
		expect(forgetConversations).toHaveBeenCalledWith([BATCH_TASK_SESSION.path]);
		expect(navigateSpy).not.toHaveBeenCalled();
		expect(errorToasts()).toEqual([]);
	});

	it("批量删除拒绝：失败 toast，不导航、不清标记", async () => {
		deleteBatchTask.mockRejectedValueOnce(new Error("disk busy"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { result } = renderPanel();

		await act(async () => {
			result.current.actions.deleteSession(BATCH_TASK_SESSION);
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() =>
			expect(errorToasts().some((toast) => toast.message.includes("deleteSessionFailedToast"))).toBe(true),
		);
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(navigateSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
