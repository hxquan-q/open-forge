// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 侧边栏按项目 cwd 反查所属主机名：只有存在 ssh:// 项目时才去读主机清单，
 * 本地项目与未登记的主机一律返回 undefined（孤儿项目由守卫组件接管）。
 */

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useMatches: () => [{ pathname: "/", params: {} }],
}));

vi.mock("@shared/lib/committed-paint", () => ({
	waitForCommittedPaint: () => Promise.resolve("painted"),
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

const listHosts = vi.fn(async () => [] as { id: string; label: string }[]);
const onHostsChanged = vi.fn(() => () => {});
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, { vetta: { ssh: { listHosts, onHostsChanged } } }),
);

const { useProjectsPanelModel } = await import("./useProjectsPanelModel.js");

function projectsState(cwds: readonly string[]) {
	return {
		projects: cwds.map((cwd) => ({ cwd, name: undefined, sessionCount: 0, type: "normal" as const })),
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

describe("useProjectsPanelModel.remoteHostLabel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ssh:// 项目解析出主机显示名，本地项目与未知主机返回 undefined", async () => {
		listHosts.mockResolvedValue([{ id: "h1", label: "build-01" }]);
		useProjectsMock.mockReturnValue(projectsState(["ssh://h1/srv/app", "/repo/local"]));
		const { result } = renderHook(() => useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn() }));

		expect(result.current.remoteHostLabel("/repo/local")).toBeUndefined();
		await waitFor(() =>
			expect(result.current.remoteHostLabel("ssh://h1/srv/app")).toBe("build-01"),
		);
		expect(result.current.remoteHostLabel("ssh://gone/srv/app")).toBeUndefined();
	});

	it("没有远程项目时不读主机清单", async () => {
		useProjectsMock.mockReturnValue(projectsState(["/repo/local"]));
		const { result } = renderHook(() => useProjectsPanelModel({ filter: "all", onOpenSession: vi.fn() }));

		expect(result.current.remoteHostLabel("/repo/local")).toBeUndefined();
		await Promise.resolve();
		expect(listHosts).not.toHaveBeenCalled();
	});
});
