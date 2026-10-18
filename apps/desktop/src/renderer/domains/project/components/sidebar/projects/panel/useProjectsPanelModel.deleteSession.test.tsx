// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { toastsAtom } from "@shared/store/toast-atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BUG-0114 合同：侧栏删除团队会话走 IPC，主进程 rejection（如 runtime 报
 * SESSION_NOT_FOUND 被包成 Error）必须有出口——记错误日志、弹失败 toast，
 * 而不是升级成 unhandled rejection 且用户侧零反馈。
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

vi.mock("@domains/batch-tasks/hooks/useBatchTasks", () => ({
	useBatchTasks: () => ({ deleteTask: vi.fn(), deleteProject: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const useProjectsMock = vi.fn();
vi.mock("../../../../hooks/useProjects", () => ({
	useProjects: () => useProjectsMock(),
}));
vi.mock("../../../../hooks/useTeamSidebarConversations", () => ({
	useTeamSidebarConversations: () => ({ conversations: [], loading: false }),
}));

const deleteTeamSession = vi.fn();
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: { agentTeams: { deleteSession: deleteTeamSession } },
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

function projectsState() {
	return {
		projects: [],
		projectsInitialized: true,
		sessionsMap: new Map(),
		sessionLoadingCwds: new Set<string>(),
		expandedProjects: new Set<string>(),
		expandProject: vi.fn(),
		collapseProject: vi.fn(),
		deleteSession: vi.fn(),
		renameSession: vi.fn(),
		archiveProject: vi.fn(),
		removeProject: vi.fn(),
		deleteProjectFromDisk: vi.fn(),
		loadSessions: vi.fn(),
	};
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
	});

	it("删除成功后通知团队列表刷新", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		const { result } = renderHook(() =>
			useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn().mockResolvedValue(undefined) }),
		);

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
		const { result } = renderHook(() =>
			useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn().mockResolvedValue(undefined) }),
		);

		await act(async () => {
			result.current.actions.deleteSession(TEAM_SESSION);
			await Promise.resolve();
			await Promise.resolve();
		});

		await waitFor(() => expect(errorSpy).toHaveBeenCalledOnce());
		expect(errorSpy.mock.calls[0]?.[0]).toContain("delete team session failed");
		const toasts = getDefaultStore().get(toastsAtom);
		expect(
			toasts.some((toast) => toast.variant === "error" && toast.message.includes("deleteSessionFailedToast")),
		).toBe(true);
		errorSpy.mockRestore();
	});
});
