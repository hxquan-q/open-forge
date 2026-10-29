// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块态布局合同（一次性初始化）：coding 会话、团队会话路由、开发档新会话页三种
 * 语境进入时收左栏、开右栏；**离开时不做任何回写**——code 会话里左栏默认收起，
 * 用户要切走必先手动展开，离开时刻的左右栏状态就是用户想要的，自动展开只会弹跳。
 */
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ current: { pathname: "/", search: {} as { cwd?: string } } }));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: routeState.current.pathname }],
	useSearch: () => routeState.current.search,
}));

import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelWidthAtom,
	setActivityPanelWidthAtom,
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

/** 切到已提交的普通会话（离开版块态的确定路径）。 */
function setPlainSession(): void {
	store.set(activeSessionAtom, {
		cwd: "/proj/a",
		runtimeId: "rt-plain",
		sessionPath: "/proj/a/plain.jsonl",
		capabilityProfile: "chat",
	} as never);
}

function setRoute(pathname: string, search: { cwd?: string } = {}): void {
	routeState.current = { pathname, search };
}

beforeEach(() => {
	store.set(activeSessionAtom, null);
	store.set(sidebarCollapsedAtom, false);
	store.set(activityPanelOpenAtom, false);
	store.set(workspaceModeByProjectAtom, new Map());
	setRoute("/");
});

it("coding 会话：收左栏、开右栏、会话区与右栏宽度对半分", () => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setCodingSession(true);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
	// (1280 - 24) / 2 = 628：扣除 AppFrame 内衬（16×2）与列间 gap（8）后五五分，
	// 落成当时的固定像素；窄窗口由 resolveActivityPanelWidth 夹到 [260, 上限]。
	expect(store.get(activityPanelWidthAtom)).toBe(628);

	// 用户随后手动改宽：code 语境内无新边沿，初始化不再覆盖。
	act(() => store.set(setActivityPanelWidthAtom, 540));
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-coding-2",
			sessionPath: "/proj/a/s2.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(activityPanelWidthAtom)).toBe(540);
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

it("开发档新会话页触发初始化；普通档新会话页不动作", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// 用户先手动展开左栏再进普通档新会话页：离开非 code 语境，不收不展。
	act(() => {
		store.set(sidebarCollapsedAtom, false);
		store.set(workspaceModeByProjectAtom, new Map());
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
});

it("发首条消息的过渡窗口（activeSession 未提交、插件加载中）从不展开左栏", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// 发首条消息跳聊天页：路由离开 new-session 且 activeSession 未提交——判定
	// 短暂为否。此前实现（离开延迟展开）在慢机器上会在此把左栏弹开。
	act(() => {
		setRoute("/");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// activeSession 提交（coding），版块态恢复：重新初始化收起。
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-new",
			sessionPath: "/proj/a/new.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
});

it("离开版块态不回写：用户手动开合保持，状态不变时不覆盖", () => {
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

	// 切到普通会话（离开版块态）：不展开也不收起，左栏停留在用户手动状态。
	act(() => {
		setPlainSession();
		setRoute("/");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
	expect(store.get(activityPanelOpenAtom)).toBe(false);
});
