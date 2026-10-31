// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块态布局合同（意图驱动的一次性初始化，BUG-0158/F01-F02）：创建意图
 * （beginCodingSessionCreation 登记）在 code 语境成立时应用一次——连续新建各自
 * 初始化、首条消息提交过渡不重复不覆盖手动选择、打开既有 coding 会话不初始化；
 * 团队路由与开发档新会话页保留边沿初始化；**离开时不做任何回写**。
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
	activityTabOrderAtom,
	codingSessionCreateIntentAtom,
	hiddenActivityTabsAtom,
	setActivityPanelWidthAtom,
	sidebarCollapsedAtom,
	workspaceModeByProjectAtom,
} from "@shared/store/atoms";
import { useCodingSessionLayout } from "./useCodingSessionLayout";

const store = getDefaultStore();
let intentNonce = 0;

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

function setCreateIntent(cwd = "/proj/a"): void {
	intentNonce += 1;
	store.set(codingSessionCreateIntentAtom, { cwd, nonce: intentNonce });
}

function setRoute(pathname: string, search: { cwd?: string } = {}): void {
	routeState.current = { pathname, search };
}

beforeEach(() => {
	store.set(activeSessionAtom, null);
	store.set(sidebarCollapsedAtom, false);
	store.set(activityPanelOpenAtom, false);
	store.set(codingSessionCreateIntentAtom, null);
	store.set(workspaceModeByProjectAtom, new Map());
	setRoute("/");
});

it("创建意图在 code 语境成立时初始化一次；其后手动选择不被同语境覆盖", () => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
	const { rerender } = renderHook(() => useCodingSessionLayout());

	act(() => {
		setCreateIntent();
		setCodingSession(true);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
	// (1280 - 24) / 2 = 628：扣除 AppFrame 内衬（16×2）与列间 gap（8）后五五分，
	// 落成当时的固定像素；窄窗口由 resolveActivityPanelWidth 夹到 [260, 上限]。
	expect(store.get(activityPanelWidthAtom)).toBe(628);

	// 用户随后手动改宽：同一意图已消费，会话对象更新不覆盖。
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

it("连续新建：code 会话中经创建入口再新建，新意图重新初始化（F01）", () => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
	const { rerender } = renderHook(() => useCodingSessionLayout());

	act(() => {
		setCreateIntent();
		setCodingSession(true);
	});
	rerender();
	// 用户手动展开左栏、收右栏、改宽。
	act(() => {
		store.set(sidebarCollapsedAtom, false);
		store.set(activityPanelOpenAtom, false);
		store.set(setActivityPanelWidthAtom, 540);
	});

	// 从版块再次进入同项目的新 code 会话：active 全程为 true，靠新意图触发。
	act(() => {
		setCreateIntent();
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
	expect(store.get(activityPanelWidthAtom)).toBe(628);
});

it("发首条消息的过渡不重复初始化：手动选择贯穿新会话页到会话提交（F02）", () => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
	const { rerender } = renderHook(() => useCodingSessionLayout());

	act(() => {
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setCreateIntent();
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);

	// 用户在新会话页手动调整布局。
	act(() => {
		store.set(sidebarCollapsedAtom, false);
		store.set(activityPanelOpenAtom, false);
		store.set(setActivityPanelWidthAtom, 540);
	});

	// 发首条消息跳聊天页：路由离开 new-session 且 activeSession 未提交——判定
	// 短暂为否，不回写也不消费新意图。
	act(() => {
		setRoute("/");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);

	// activeSession 提交（coding）：意图已消费，手动选择保留。
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-new",
			sessionPath: "/proj/a/new.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
	expect(store.get(activityPanelOpenAtom)).toBe(false);
	expect(store.get(activityPanelWidthAtom)).toBe(540);
});

it("打开既有 coding 会话不初始化（F02b）", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	// work 会话语境（active false），用户手动展开左栏。
	act(() => {
		setPlainSession();
		store.set(sidebarCollapsedAtom, true);
	});
	rerender();

	act(() => {
		setCodingSession(true);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(false);
});

it("创建意图初始化清页签偏好：新会话回四页签默认；此后手动偏好保留（F10）", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	// 项目有历史偏好：隐藏 terminal + 自定义排序。
	act(() => {
		store.set(hiddenActivityTabsAtom, new Map([["/proj/a", ["terminal"]]]));
		store.set(activityTabOrderAtom, new Map([["/proj/a", ["browser", "file", "git", "terminal"]]]));
	});
	act(() => {
		setCreateIntent();
		setCodingSession(true);
	});
	rerender();
	expect(store.get(hiddenActivityTabsAtom).has("/proj/a")).toBe(false);
	expect(store.get(activityTabOrderAtom).has("/proj/a")).toBe(false);

	// 初始化后用户重新隐藏 terminal：同语境会话对象更新不重置。
	act(() => {
		store.set(hiddenActivityTabsAtom, new Map([["/proj/a", ["terminal"]]]));
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-coding-2",
			sessionPath: "/proj/a/s2.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(hiddenActivityTabsAtom).get("/proj/a")).toEqual(["terminal"]);
});

it("开发档新会话页进入边沿也清该项目页签偏好", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		store.set(hiddenActivityTabsAtom, new Map([["/proj/a", ["terminal"]]]));
		store.set(activityTabOrderAtom, new Map([["/proj/a", ["browser", "file", "git"]]]));
		store.set(workspaceModeByProjectAtom, new Map([["/proj/a", "coding"]]));
		setRoute("/new-session", { cwd: encodeURIComponent("/proj/a") });
	});
	rerender();
	expect(store.get(hiddenActivityTabsAtom).has("/proj/a")).toBe(false);
	expect(store.get(activityTabOrderAtom).has("/proj/a")).toBe(false);
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

it("离开版块态不回写：用户手动开合保持，状态不变时不覆盖", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setCreateIntent();
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
