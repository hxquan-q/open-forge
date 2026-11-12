// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 model 的团队会话并入合同（BUG-0187）：团队会话按 cwd 并入项目卡片、
 * 与普通 coding 会话混排；work 会话仍被过滤；团队条目点击分派团队路由而不是
 * openProjectSession。旧实现完全不消费团队侧栏投影——「卡片含团队会话」必红。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@shared/app-shell/session-open-context", () => ({ useOpenProjectSession: vi.fn(async () => undefined) }));
vi.mock("@domains/project/hooks/useProjects", () => ({ useProjectActions: () => ({ loadSessions: vi.fn() }) }));
vi.mock("./useAllstarProjectConfig", () => ({
	useAllstarProjectConfig: () => ({
		open: false,
		projectName: "",
		content: "",
		status: "idle",
		dirty: false,
		openForProject: vi.fn(),
		close: vi.fn(),
		changeContent: vi.fn(),
		save: vi.fn(async () => undefined),
	}),
}));

import { projectsInitializedAtom, sessionsMapAtom } from "@shared/store/atoms";
import { useAllstarDevHomePageModel } from "./useAllstarDevHomePageModel";

const store = getDefaultStore();

function stubWindow(
	teamConversations: readonly Record<string, unknown>[],
	allstarProjects: readonly { path: string; name?: string }[] = [{ path: "/proj/a", name: "A" }],
): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			project: { list: vi.fn(async () => ({ allstarProjects })) },
			agentTeams: { listSidebarConversations: vi.fn(async () => teamConversations) },
		},
	});
}

function teamConversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		kind: "agent-team",
		teamId: "team-1",
		teamSessionId: "ts-1",
		coordinationSessionPath: "C:/sessions/coord.jsonl",
		cwd: "/proj/a",
		memberAvatarUrls: [],
		sessionTitle: "团队彩排",
		createdAt: 1,
		updatedAt: 5,
		placement: { kind: "project", projectPath: "/proj/a" },
		...overrides,
	};
}

beforeEach(() => {
	navigate.mockClear();
	store.set(projectsInitializedAtom, true);
	store.set(sessionsMapAtom, new Map());
	stubWindow([]);
});

it("团队会话按 cwd 并入项目卡片，与普通 coding 会话混排", async () => {
	stubWindow([teamConversation()]);
	store.set(
		sessionsMapAtom,
		new Map([
			[
				"/proj/a",
				[
					{
						id: "s1",
						path: "/proj/a/s1.jsonl",
						cwd: "/proj/a",
						firstMessage: "普通 coding 会话",
						modifiedAt: 3,
						agentMode: "coding",
					},
					{
						id: "s2",
						path: "/proj/a/s2.jsonl",
						cwd: "/proj/a",
						firstMessage: "work 会话不得出现",
						modifiedAt: 9,
						agentMode: "work",
					},
				],
			],
		]),
	);

	const { result } = renderHook(() => useAllstarDevHomePageModel());
	await waitFor(() => {
		const card = result.current.projectCards.find((candidate) => candidate.cwd === "/proj/a");
		expect(card).toBeDefined();
		expect(card?.totalSessions).toBe(2);
		expect(card?.sessions.map((session) => session.kind)).toEqual(["team", "chat"]);
	});
	const teamRow = result.current.projectCards[0]?.sessions.find((session) => session.kind === "team");
	expect(teamRow).toMatchObject({ teamId: "team-1", teamSessionId: "ts-1", title: "团队彩排" });
});

it("团队条目点击分派团队路由，不走 openProjectSession 的 JSONL 打开链路", async () => {
	stubWindow([teamConversation()]);
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	await waitFor(() => {
		expect(result.current.projectCards[0]?.sessions.some((session) => session.kind === "team")).toBe(true);
	});

	const teamRow = result.current.projectCards[0]?.sessions.find((session) => session.kind === "team");
	expect(teamRow).toBeDefined();
	act(() => {
		result.current.onOpenSession("/proj/a", teamRow!);
	});
	expect(navigate).toHaveBeenCalledWith({
		to: "/agent-teams/$teamId/sessions/$sessionId",
		params: { teamId: "team-1", sessionId: "ts-1" },
	});
});

it("团队会话落在未登记项目 cwd 下时按 cwd 自成卡片（不依赖 placement 归组）", async () => {
	stubWindow([teamConversation({ cwd: "/proj/b", placement: { kind: "default" } })]);
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	await waitFor(() => {
		expect(result.current.projectCards.some((card) => card.cwd === "/proj/b")).toBe(true);
	});
});
