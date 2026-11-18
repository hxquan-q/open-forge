// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 团队会话语境跟踪合同（BUG-0187）：activeTeamSessionAtom 的唯一写者是本跟踪器——
 * 团队会话路由（含成员子路由）激活时记录 {teamId, sessionId}；普通会话面路由
 * （/、/project、/new-session）清空；其余路由（computer-use 授权页等）保留现值，
 * 用户从团队会话切去授权页时语境必须仍在。
 */
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
	current: { pathname: "/", params: {} as Record<string, string> },
}));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: routeState.current.pathname, params: routeState.current.params }],
}));

import { activeTeamSessionAtom } from "@shared/store/atoms";
import { useActiveTeamSessionContext } from "./useActiveTeamSessionContext";

const store = getDefaultStore();

function setRoute(pathname: string, params: Record<string, string> = {}): void {
	routeState.current = { pathname, params };
}

beforeEach(() => {
	store.set(activeTeamSessionAtom, null);
	setRoute("/");
});

it("团队会话路由激活时记录语境，成员子路由切换 sessionId 时刷新", async () => {
	const { rerender } = renderHook(() => useActiveTeamSessionContext());
	setRoute("/agent-teams/team-1/sessions/ts-1", { teamId: "team-1", sessionId: "ts-1" });
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toEqual({ teamId: "team-1", sessionId: "ts-1" });

	setRoute("/agent-teams/team-1/sessions/ts-2/members/m-1", { teamId: "team-1", sessionId: "ts-2", memberId: "m-1" });
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toEqual({ teamId: "team-1", sessionId: "ts-2" });
});

it("路由参数按 URL 编码解码", async () => {
	const { rerender } = renderHook(() => useActiveTeamSessionContext());
	setRoute("/agent-teams/team%201/sessions/ts%201", { teamId: "team%201", sessionId: "ts%201" });
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toEqual({ teamId: "team 1", sessionId: "ts 1" });
});

it("非会话路由（computer-use 等）保留语境：授权页正是依赖语境工作的页面", async () => {
	const { rerender } = renderHook(() => useActiveTeamSessionContext());
	setRoute("/agent-teams/team-1/sessions/ts-1", { teamId: "team-1", sessionId: "ts-1" });
	await act(async () => {
		rerender();
	});
	setRoute("/computer-use");
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toEqual({ teamId: "team-1", sessionId: "ts-1" });

	// 团队列表/设置页（无 sessionId）同样保留现值。
	setRoute("/agent-teams", {});
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toEqual({ teamId: "team-1", sessionId: "ts-1" });
});

it.each([
	["/", "/"],
	["项目会话页", "/project/D%3A%2Fproj"],
	["新会话页", "/new-session/D%3A%2Fproj"],
])("%s 清空语境：普通会话语境由 activeSessionAtom 承载", async (_name, pathname) => {
	const { rerender } = renderHook(() => useActiveTeamSessionContext());
	setRoute("/agent-teams/team-1/sessions/ts-1", { teamId: "team-1", sessionId: "ts-1" });
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).not.toBeNull();

	setRoute(pathname);
	await act(async () => {
		rerender();
	});
	expect(store.get(activeTeamSessionAtom)).toBeNull();
});
