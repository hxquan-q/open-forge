// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 model 的行为合同（ADR-0151 决策 5/7）：项目卡片从会话池按 coding 模式分组
 * 派生（组内倒序截取、卡片按最近活跃排序、只统计 coding），空态引导的选择回落默认
 * 项目，新建开发会话走「写 coding 档 → 新会话页」链路，打开会话委托全局上下文。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const openProjectSession = vi.hoisted(() => vi.fn(async () => undefined));
const loadSessions = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
}));
vi.mock("@shared/app-shell/session-open-context", () => ({
	useOpenProjectSession: () => openProjectSession,
}));
vi.mock("@domains/project/hooks/useProjects", () => ({
	useProjectActions: () => ({ loadSessions }),
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import {
	defaultConversationCwdAtom,
	projectsAtom,
	projectsInitializedAtom,
	sessionsMapAtom,
	workspaceModeByProjectAtom,
	type Project,
	type SessionInfo,
} from "@shared/store/atoms";
import { useAllstarDevHomePageModel } from "./useAllstarDevHomePageModel";

const store = getDefaultStore();

/** 版块册快照；各用例自行覆写返回值。 */
const allstarSnapshot = {
	workspacePath: "",
	projects: [],
	archivedProjects: [],
	allstarProjects: [] as readonly { path: string; name?: string; id?: string }[],
	allstarArchivedProjects: [],
};

beforeEach(() => {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: {
			project: {
				list: vi.fn(async () => allstarSnapshot),
				openAllstar: vi.fn(async () => ({ path: "/x" })),
			},
			dialog: { selectFolder: vi.fn(async () => null) },
		},
	});
});

function session(overrides: Partial<SessionInfo> & { path: string }): SessionInfo {
	return {
		id: overrides.path,
		cwd: "/proj/a",
		firstMessage: "(no messages)",
		modifiedAt: 0,
		...overrides,
	};
}

function seedFixtures(): void {
	const projects: Project[] = [
		{ cwd: "/proj/default", sessionCount: 0, type: "normal", isDefault: true },
		{ cwd: "/proj/a", sessionCount: 0, type: "normal" },
		{ cwd: "/proj/b", sessionCount: 0, type: "normal" },
	];
	store.set(projectsAtom, projects);
	store.set(projectsInitializedAtom, true);
	store.set(defaultConversationCwdAtom, "/proj/default");
	store.set(
		sessionsMapAtom,
		new Map<string, SessionInfo[]>([
			[
				"/proj/default",
				[
					session({ path: "/shard/default/d1.jsonl", cwd: "/proj/default", modifiedAt: 7, agentMode: "coding" }),
					session({ path: "/shard/default/d2.jsonl", cwd: "/proj/default", modifiedAt: 2 }),
				],
			],
			[
				"/proj/a",
				[
					// 7 条 coding：验证组内倒序截取 5 条 + totalSessions 全量。
					...Array.from({ length: 7 }, (_, index) =>
						session({
							path: `/shard/a/a${index + 1}.jsonl`,
							modifiedAt: index + 1,
							agentMode: "coding",
							firstMessage: `会话 ${index + 1}`,
						}),
					),
					session({ path: "/shard/a/work.jsonl", modifiedAt: 99, agentMode: "work" }),
					session({ path: "/shard/a/legacy.jsonl", modifiedAt: 98 }),
				],
			],
			[
				"/proj/b",
				[
					session({ path: "/shard/b/b1.jsonl", cwd: "/proj/b", modifiedAt: 9, agentMode: "coding", name: "数据看板" }),
					session({ path: "/shard/b/b2.jsonl", cwd: "/proj/b", modifiedAt: 8, agentMode: "work" }),
				],
			],
			[
				"/proj/work-only",
				// 只有 work 会话的项目不出现卡片（版块项目列表与普通侧栏天然分离）。
				[session({ path: "/shard/w/w1.jsonl", cwd: "/proj/work-only", modifiedAt: 50, agentMode: "work" })],
			],
		]),
	);
}

beforeEach(() => {
	navigate.mockReset();
	openProjectSession.mockReset();
	loadSessions.mockReset();
	localStorage.clear();
	store.set(workspaceModeByProjectAtom, new Map());
	seedFixtures();
});

it("项目卡片按 coding 会话分组派生：组内倒序截取、卡片按最近活跃排序、work/无记录排除", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());

	const cards = result.current.projectCards;
	// 最近活跃：b(9) > default(7) = a(7)；同值平局按 sessionsMap 插入序稳定排（default
	// 桶先建组）。work-only 无卡片。
	expect(cards.map((card) => card.cwd)).toEqual(["/proj/b", "/proj/default", "/proj/a"]);

	const cardA = cards.find((card) => card.cwd === "/proj/a");
	expect(cardA).toBeDefined();
	expect(cardA?.totalSessions).toBe(7);
	expect(cardA?.sessions.map((item) => item.title)).toEqual([
		"会话 7",
		"会话 6",
		"会话 5",
		"会话 4",
		"会话 3",
	]);

	// 项目名归一：默认项目显示「对话」，其余显示目录名。
	expect(cards.find((card) => card.cwd === "/proj/default")?.projectName).toBe("对话");
	expect(cards.find((card) => card.cwd === "/proj/b")?.projectName).toBe("b");
});

it("项目未初始化时呈现 loading，且已初始化的项目不再重复拉取列表", () => {
	store.set(projectsInitializedAtom, false);
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	expect(result.current.loading).toBe(true);

	act(() => {
		store.set(projectsInitializedAtom, true);
	});
	expect(loadSessions).not.toHaveBeenCalled();
	expect(result.current.loading).toBe(false);
});

it("会话桶缺失的项目在初始化后补拉列表", async () => {
	store.set(sessionsMapAtom, new Map<string, SessionInfo[]>([["/proj/default", []]]));
	renderHook(() => useAllstarDevHomePageModel());

	await waitFor(() => {
		expect(loadSessions).toHaveBeenCalledWith("/proj/a");
		expect(loadSessions).toHaveBeenCalledWith("/proj/b");
	});
	expect(loadSessions).not.toHaveBeenCalledWith("/proj/default");
});

it("空态引导默认选默认项目；新建开发会话按传入 cwd 写 coding 档并导航新会话页", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	expect(result.current.selectedCwd).toBe("/proj/default");

	act(() => {
		result.current.onStartNewSession("/proj/b");
	});
	expect(navigate).toHaveBeenCalledWith({
		to: "/new-session/$cwd",
		params: { cwd: encodeURIComponent("/proj/b") },
	});
	const modes = store.get(workspaceModeByProjectAtom);
	expect(modes.get("/proj/b")).toBe("coding");
});

it("打开卡片会话委托全局会话打开上下文", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	act(() => {
		result.current.onOpenSession("/proj/b", "/shard/b/b1.jsonl");
	});
	expect(openProjectSession).toHaveBeenCalledWith("/proj/b", "/shard/b/b1.jsonl");
});
