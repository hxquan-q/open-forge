// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 model 的行为合同（ADR-0151 决策 5/7）：近期开发会话聚合全部项目的 coding
 * 会话（agentMode 过滤、modifiedAt 倒序、截取上限），项目选项含默认「对话」项目，
 * 新建开发会话走「写 coding 档 → 新会话页」链路，打开会话委托全局上下文。
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
					session({ path: "/shard/a/a1.jsonl", modifiedAt: 5, agentMode: "coding", firstMessage: "修登录缺陷" }),
					session({ path: "/shard/a/a2.jsonl", modifiedAt: 3, agentMode: "work" }),
					session({ path: "/shard/a/a3.jsonl", modifiedAt: 1, agentMode: "coding" }),
				],
			],
			[
				"/proj/b",
				[
					session({ path: "/shard/b/b1.jsonl", cwd: "/proj/b", modifiedAt: 9, agentMode: "coding", name: "数据看板" }),
					session({ path: "/shard/b/b2.jsonl", cwd: "/proj/b", modifiedAt: 8, agentMode: "work" }),
				],
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

it("聚合全部项目的 coding 会话：倒序截取、过滤 work 与无记录、项目名归一", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());

	const recent = result.current.recentSessions;
	expect(recent.map((item) => item.path)).toEqual([
		"/shard/b/b1.jsonl",
		"/shard/default/d1.jsonl",
		"/shard/a/a1.jsonl",
		"/shard/a/a3.jsonl",
	]);
	// 展示名：命名优先，其次首条消息；项目名默认项目显示「对话」。
	expect(recent[0]).toMatchObject({ title: "数据看板", projectName: "b" });
	expect(recent[1]).toMatchObject({ title: "未命名会话", projectName: "对话" });
	expect(recent[2]).toMatchObject({ title: "修登录缺陷", projectName: "a" });
});

it("项目未初始化时呈现 loading，且已初始化的项目不再重复拉取列表", () => {
	store.set(projectsInitializedAtom, false);
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	expect(result.current.loading).toBe(true);

	act(() => {
		store.set(projectsInitializedAtom, true);
	});
	// 三个项目的会话桶都已就位，不应触发任何补拉。
	expect(loadSessions).not.toHaveBeenCalled();
	expect(result.current.loading).toBe(false);
});

it("会话桶缺失的项目在初始化后补拉列表", async () => {
	store.set(
		sessionsMapAtom,
		new Map<string, SessionInfo[]>([["/proj/default", []]]),
	);
	renderHook(() => useAllstarDevHomePageModel());

	await waitFor(() => {
		expect(loadSessions).toHaveBeenCalledWith("/proj/a");
		expect(loadSessions).toHaveBeenCalledWith("/proj/b");
	});
	expect(loadSessions).not.toHaveBeenCalledWith("/proj/default");
});

it("新建开发会话：默认选默认项目，写 coding 档并导航新会话页", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	expect(result.current.selectedCwd).toBe("/proj/default");

	act(() => {
		result.current.onStartNewSession();
	});
	expect(navigate).toHaveBeenCalledWith({
		to: "/new-session/$cwd",
		params: { cwd: encodeURIComponent("/proj/default") },
	});
	const modes = store.get(workspaceModeByProjectAtom);
	expect(modes.get("/proj/default")).toBe("coding");
});

it("打开近期会话委托全局会话打开上下文", () => {
	const { result } = renderHook(() => useAllstarDevHomePageModel());
	act(() => {
		result.current.onOpenSession("/proj/b", "/shard/b/b1.jsonl");
	});
	expect(openProjectSession).toHaveBeenCalledWith("/proj/b", "/shard/b/b1.jsonl");
});
