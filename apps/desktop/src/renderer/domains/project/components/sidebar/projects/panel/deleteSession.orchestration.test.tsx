// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import {
	activeSessionAtom,
	batchProjectsAtom,
	confirmDialogAtom,
	scheduledSessionPathsAtom,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { toastsAtom } from "@shared/store/toast-atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BUG-0191 组合测试：真实菜单 model + 真实 panel model + 真实 useProjects /
 * useProjectActions / useBatchTasks 串成整条删除链，只有 `window.vetta` IPC
 * 外部边界是 fake。pending 用 deferred Promise 控制，不用 sleep。
 *
 * 断言深度豁免理由：本链路的关键合同恰好是边界调用——主删除失败时 forget /
 * 导航不得被调用、成功后必须调用、IPC 入参必须是目标 sessionPath。行存留、
 * toast、atom 状态等可观察结果已尽量断言；剩余调用类断言对应的是「不得调用」
 * 这一无法从最终状态区分的负向合同。
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

vi.mock("@shared/hooks/useTeamSidebarConversations", () => ({
	useTeamSidebarConversations: () => ({ conversations: [], loading: false }),
}));

const sessionDelete = vi.fn();
const schedulerDeleteRecords = vi.fn(async () => {});
const batchDeleteTask = vi.fn(async () => {});
const teamDeleteSession = vi.fn(async () => {});
const forgetConversations = vi.fn(async () => {});
const forgetArchivedSessions = vi.fn(async () => {});
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
				listSessions: async () => [],
				onSessionsChanged: () => () => {},
				rename: async () => {},
				clearDefaultConversation: async () => {},
				deleteAllForCwd: async () => {},
			},
			scheduler: { deleteRecordsBySession: schedulerDeleteRecords },
			agentTeams: { deleteSession: teamDeleteSession },
			conversationTags: { forgetConversations },
			archivedSessions: { forget: forgetArchivedSessions },
			batchTasks: {
				deleteTask: batchDeleteTask,
				getProjects: async () => [],
				onTaskEvent: () => () => {},
			},
			sshHosts: { list: async () => [], onChanged: () => () => {} },
		},
	}),
);

const { useProjectsPanelModel } = await import("./useProjectsPanelModel.js");
const { useProjectsPanelMenusModel } = await import("../../../../hooks/useProjectsPanelMenusModel.js");

const SESSION_PATH = "/repo/a/.vetta/sessions/s-1.jsonl";
const SESSION_ROW = {
	id: "s-1",
	path: SESSION_PATH,
	cwd: "/repo/a",
	firstMessage: "hello",
	modifiedAt: 1,
};
const MENU_SESSION = {
	kind: "conversation",
	id: "s-1",
	path: SESSION_PATH,
	cwd: "/repo/a",
	firstMessage: "hello",
	modifiedAt: 1,
} as never;

const BATCH_PROJECT = {
	id: "batch-1",
	name: "Batch",
	updatedAt: 1,
	tasks: [
		{
			id: "task-1",
			name: "task-1",
			cwd: "/folder-1",
			sessionPath: "/repo/b/.vetta/sessions/t-1.jsonl",
			status: "completed",
			createdAt: 1,
			updatedAt: 1,
		},
	],
};
const BATCH_MENU_SESSION = {
	kind: "conversation",
	id: "task-1",
	path: "/repo/b/.vetta/sessions/t-1.jsonl",
	cwd: "/folder-1",
	firstMessage: "batch task",
	modifiedAt: 1,
} as never;

function deferred<T = void>() {
	let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
	let reject: (reason?: unknown) => void = () => undefined;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function renderChain() {
	return renderHook(() => {
		const panel = useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn().mockResolvedValue(undefined) });
		return useProjectsPanelMenusModel(panel);
	});
}

async function confirmDeletion(pathSession: unknown) {
	const { result } = renderChain();
	act(() => {
		result.current.actions.deleteSession(pathSession as never);
	});
	const confirmation = getDefaultStore().get(confirmDialogAtom);
	expect(confirmation).not.toBeNull();
	act(() => {
		confirmation?.onConfirm(false);
	});
	return result;
}

function sessionRowExists(path: string): boolean {
	for (const sessions of getDefaultStore().get(sessionsMapAtom).values()) {
		if (sessions.some((session) => session.path === path)) return true;
	}
	return false;
}

function toastMessages(variant: string) {
	return getDefaultStore()
		.get(toastsAtom)
		.filter((toast) => toast.variant === variant)
		.map((toast) => toast.message);
}

describe("会话删除编排组合链（BUG-0191）", () => {
	beforeEach(() => {
		navigateSpy.mockReset();
		navigateSpy.mockResolvedValue(undefined);
		routeMatches = [{ pathname: "/", params: {} }];
		sessionDelete.mockReset();
		schedulerDeleteRecords.mockReset();
		schedulerDeleteRecords.mockResolvedValue(undefined);
		batchDeleteTask.mockReset();
		batchDeleteTask.mockResolvedValue(undefined);
		teamDeleteSession.mockReset();
		teamDeleteSession.mockResolvedValue(undefined);
		forgetConversations.mockClear();
		forgetArchivedSessions.mockClear();
		const store = getDefaultStore();
		store.set(toastsAtom, []);
		store.set(activeSessionAtom, null);
		store.set(confirmDialogAtom, null);
		store.set(batchProjectsAtom, []);
		store.set(scheduledSessionPathsAtom, new Set<string>());
		store.set(sessionsMapAtom, new Map([["/repo/a", [SESSION_ROW] as never]]));
	});

	it("主删除拒绝：失败 toast、行保留、标记不动、不导航、无 unhandled rejection", async () => {
		const pending = deferred();
		sessionDelete.mockReturnValueOnce(pending.promise);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await confirmDeletion(MENU_SESSION);
		expect(sessionDelete).toHaveBeenCalledWith(SESSION_PATH);
		// 确认后拒绝落地。
		await act(async () => {
			pending.reject(new Error("EIO: locked"));
			await pending.promise.catch(() => undefined);
		});

		await waitFor(() =>
			expect(toastMessages("error").some((message) => message.includes("deleteSessionFailedToast"))).toBe(true),
		);
		expect(sessionRowExists(SESSION_PATH)).toBe(true);
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(forgetArchivedSessions).not.toHaveBeenCalled();
		expect(navigateSpy).not.toHaveBeenCalled();
		expect(toastMessages("error").some((message) => message.includes("PartialCleanup"))).toBe(false);
		errorSpy.mockRestore();
	});

	it("延迟成功且等待期切走：摘行、清标记，但不清新活动会话、不拉回", async () => {
		const pending = deferred();
		sessionDelete.mockReturnValueOnce(pending.promise);
		getDefaultStore().set(activeSessionAtom, { sessionPath: SESSION_PATH, cwd: "/repo/a" } as never);

		await confirmDeletion(MENU_SESSION);
		// 删除 pending 期间用户切到会话 B。
		act(() => {
			getDefaultStore().set(activeSessionAtom, { sessionPath: "/other/b.jsonl", cwd: "/repo/a" } as never);
		});
		await act(async () => {
			pending.resolve();
			await pending.promise;
		});

		await waitFor(() => expect(sessionRowExists(SESSION_PATH)).toBe(false));
		expect(forgetConversations).toHaveBeenCalledWith([SESSION_PATH]);
		expect(forgetArchivedSessions).toHaveBeenCalledWith([SESSION_PATH]);
		expect(getDefaultStore().get(activeSessionAtom)).toMatchObject({ sessionPath: "/other/b.jsonl" });
		expect(navigateSpy).not.toHaveBeenCalled();
		expect(toastMessages("error")).toEqual([]);
	});

	it("主删除成功但 scheduler 清理失败：行已摘，提示部分完成而非删除失败", async () => {
		const pending = deferred();
		sessionDelete.mockReturnValueOnce(pending.promise);
		schedulerDeleteRecords.mockRejectedValueOnce(new Error("scheduler gone"));
		getDefaultStore().set(scheduledSessionPathsAtom, new Set([SESSION_PATH]));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await confirmDeletion(MENU_SESSION);
		await act(async () => {
			pending.resolve();
			await pending.promise;
		});

		await waitFor(() => expect(sessionRowExists(SESSION_PATH)).toBe(false));
		await waitFor(() =>
			expect(toastMessages("warning").some((message) => message.includes("deleteSessionPartialCleanupToast"))).toBe(
				true,
			),
		);
		expect(toastMessages("error").some((message) => message.includes("deleteSessionFailedToast"))).toBe(false);
		errorSpy.mockRestore();
	});

	it("失败后可从菜单重试：第一次拒绝、第二次成功摘行", async () => {
		sessionDelete.mockRejectedValueOnce(new Error("locked")).mockResolvedValueOnce(undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await confirmDeletion(MENU_SESSION);
		await waitFor(() =>
			expect(toastMessages("error").some((message) => message.includes("deleteSessionFailedToast"))).toBe(true),
		);
		expect(sessionRowExists(SESSION_PATH)).toBe(true);

		// 用户重试：再走一遍菜单确认。
		const { result } = renderChain();
		act(() => {
			result.current.actions.deleteSession(MENU_SESSION);
		});
		act(() => {
			getDefaultStore().get(confirmDialogAtom)?.onConfirm(false);
		});

		await waitFor(() => expect(sessionRowExists(SESSION_PATH)).toBe(false));
		expect(sessionDelete).toHaveBeenCalledTimes(2);
		vi.restoreAllMocks();
	});

	it("批量分支删除拒绝：不导航、不清标记、任务行保留", async () => {
		getDefaultStore().set(batchProjectsAtom, [BATCH_PROJECT] as never);
		batchDeleteTask.mockRejectedValueOnce(new Error("disk busy"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await confirmDeletion(BATCH_MENU_SESSION);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() =>
			expect(toastMessages("error").some((message) => message.includes("deleteSessionFailedToast"))).toBe(true),
		);
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(navigateSpy).not.toHaveBeenCalled();
		const batch = getDefaultStore().get(batchProjectsAtom);
		expect(batch[0]?.tasks.some((task) => task.id === "task-1")).toBe(true);
		errorSpy.mockRestore();
	});

	it("批量分支删除成功：任务摘除、标记清理，原 batch 落点语义不变", async () => {
		getDefaultStore().set(batchProjectsAtom, [BATCH_PROJECT] as never);
		batchDeleteTask.mockResolvedValueOnce(undefined);

		await confirmDeletion(BATCH_MENU_SESSION);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() => {
			const batch = getDefaultStore().get(batchProjectsAtom);
			expect(batch[0]?.tasks.some((task) => task.id === "task-1")).toBe(false);
		});
		expect(forgetConversations).toHaveBeenCalledWith(["/repo/b/.vetta/sessions/t-1.jsonl"]);
		expect(toastMessages("error")).toEqual([]);
	});

	it("取消确认：不调用任何删除或清理", async () => {
		const { result } = renderChain();
		act(() => {
			result.current.actions.deleteSession(MENU_SESSION);
		});
		expect(getDefaultStore().get(confirmDialogAtom)).not.toBeNull();
		// 用户点取消：confirmDialogAtom 由对话框 UI 清空，这里模拟不点确认直接关闭。
		act(() => {
			getDefaultStore().set(confirmDialogAtom, null);
		});

		expect(sessionDelete).not.toHaveBeenCalled();
		expect(batchDeleteTask).not.toHaveBeenCalled();
		expect(forgetConversations).not.toHaveBeenCalled();
		expect(sessionRowExists(SESSION_PATH)).toBe(true);
	});
});
