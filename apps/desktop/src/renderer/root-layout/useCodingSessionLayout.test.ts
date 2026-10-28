// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块态布局合同：coding 会话、团队会话路由、开发档新会话页三种语境都会收左栏、
 * 开右栏；离开时展开左栏；状态不变时不覆盖用户手动开合（边沿生效）。
 */
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ current: { pathname: "/", search: {} as { cwd?: string } } }));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: routeState.current.pathname }],
	useSearch: () => routeState.current.search,
}));

import {
	activeSessionAtom,
	activityPanelOpenAtom,
	sidebarCollapsedAtom,
	workspaceModeByProjectAtom,
} from "@shared/store/atoms";
import { useCodingSessionLayout } from "./useCodingSessionLayout";

const store = getDefaultStore();

function setCodingSession(active: boolean): void {
	store.set(
		activeSessionAtom,
		active
			? ({
					cwd: "/proj/a",
					runtimeId: "rt-coding",
					sessionPath: "/proj/a/s.jsonl",
					capabilityProfile: "coding",
				} as never)
			: null,
	);
}

function setRoute(pathname: string, search: { cwd?: string } = {}): void {
	routeState.current = { pathname, search };
}

beforeEach(() => {
	vi.useFakeTimers();
	store.set(activeSessionAtom, null);
	store.set(sidebarCollapsedAtom, false);
	store.set(activityPanelOpenAtom, false);
	store.set(workspaceModeByProjectAtom, new Map());
	setRoute("/");
});

afterEach(() => {
	vi.useRealTimers();
});

it("coding 会话：收左栏、开右栏", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setCodingSession(true);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
});

it("团队会话路由（不写 activeSession）：收左栏、开右栏", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setRoute("/agent-teams/team-1/sessions/s1");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
});

it("开发档新会话页按项目档位触发；普通档新会话页延迟后回落", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	act(() => {
		store.set(workspaceModeByProjectAtom, new Map());
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	// 延迟窗口内保持收起，稳定离开才展开。
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	act(() => {
		vi.advanceTimersByTime(1200);
	});
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
});

it("发首条消息的过渡闪断被延迟吸收：false→true 在窗口内恢复则不展开", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// 过渡瞬间：路由离开 new-session 且 activeSession 未提交——版块态短暂判否。
	act(() => {
		setRoute("/");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// activeSession 提交（coding），窗口内恢复版块态。
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-new",
			sessionPath: "/proj/a/new.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	act(() => {
		vi.advanceTimersByTime(1200);
	});
	// 左栏始终没有被展开过。
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
});

it("离开版块态：展开左栏；状态不变时不覆盖手动开合", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setCodingSession(true);
	});
	rerender();
	// 用户在版块态里手动展开左栏、收起右栏。
	act(() => {
		store.set(sidebarCollapsedAtom, false);
		store.set(activityPanelOpenAtom, false);
	});
	// 同为 coding 的会话对象更新：不重置用户选择。
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-coding-2",
			sessionPath: "/proj/a/s2.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
	expect(store.get(activityPanelOpenAtom)).toBe(false);

	// 切回普通语境：延迟窗口后展开左栏。
	act(() => {
		setCodingSession(false);
		setRoute("/");
	});
	rerender();
	act(() => {
		vi.advanceTimersByTime(1200);
	});
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
});
