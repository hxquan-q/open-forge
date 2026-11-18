// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const onNewChat = vi.hoisted(() => vi.fn());
const prefetchNavItem = vi.hoisted(() => vi.fn());
const hostedRouteOpen = vi.hoisted(() => vi.fn(async () => undefined));

/** 当前路由态：useMatches 的 pathname 由用例改写，验证版块入口在版块路由下高亮。 */
const routeState = vi.hoisted(() => ({ current: { pathname: "/" } }));

/**
 * 插件文案解析合同的替身：%key% 走目录，其余原样回显。
 * 断言看的是「description 与 label 一样过了宿主解析层」，不是译文本身。
 */
const pluginCatalog = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: routeState.current.pathname }],
	useNavigate: () => navigate,
	useSearch: () => ({}),
}));
vi.mock("../../../../root-layout/nav-route-prefetch", () => ({ prefetchNavItem }));
vi.mock("@shared/hosted-routes/hosted-route-service", () => ({
	desktopHostedRouteService: { open: hostedRouteOpen },
}));
vi.mock("../../hooks/useNewChatNavigation", () => ({
	useNewChatNavigation: () => onNewChat,
}));
vi.mock("../../../plugins/runtime/plugin-i18n", () => ({
	usePluginTextResolver: () => (_pluginId: string, raw: string | undefined) => {
		if (raw == null) return "";
		const match = /^%(.*)%$/.exec(raw);
		return match ? (pluginCatalog.current[match[1]!] ?? raw) : raw;
	},
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { activeSessionAtom, pluginWorkspaceViewsAtom } from "@shared/store/atoms";
import { useSidebarModel } from "./useSidebarModel";
import { SIDEBAR_NAV_LAYOUT_STORAGE_KEY } from "./sidebar-nav-layout";

const store = getDefaultStore();

function workspaceView(overrides: Record<string, unknown> = {}) {
	return {
		pluginId: "vetta-ui-design",
		pluginName: "Vetta 设计",
		viewId: "gallery",
		label: "%gallery.nav.label%",
		description: "%gallery.nav.description%",
		navOrder: 0,
		sidebar: true,
		component: () => null,
		...overrides,
	};
}

function render() {
	return renderHook(() => useSidebarModel({ onCollapse: vi.fn() }));
}

beforeEach(() => {
	navigate.mockReset();
	onNewChat.mockReset();
	prefetchNavItem.mockReset();
	hostedRouteOpen.mockReset();
	routeState.current = { pathname: "/" };
	localStorage.removeItem(SIDEBAR_NAV_LAYOUT_STORAGE_KEY);
	store.set(activeSessionAtom, null);
	pluginCatalog.current = {
		"gallery.nav.label": "设计",
		"gallery.nav.description": "所有带设计稿的项目",
	};
	store.set(pluginWorkspaceViewsAtom, [workspaceView()]);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			im: {
				subscribeStatus: vi.fn(async () => () => {}),
				getStatus: vi.fn(async () => ({ transport: "offline" })),
			},
		},
	});
});

it("插件工作区视图的 label 与 description 都经宿主解析，不落原始 %key%", () => {
	const { result } = render();
	const item = [...result.current.navItems, ...result.current.moreNavItems].find(
		(entry) => entry.key === "workspace:vetta-ui-design/gallery",
	);
	expect(item).toBeDefined();
	expect(item?.label).toBe("设计");
	expect(item?.title).toBe("设计 · 所有带设计稿的项目");
});

it("description 缺省时 tooltip 回落到插件名", () => {
	store.set(pluginWorkspaceViewsAtom, [workspaceView({ description: undefined })]);
	const { result } = render();
	const item = [...result.current.navItems, ...result.current.moreNavItems].find(
		(entry) => entry.key === "workspace:vetta-ui-design/gallery",
	);
	expect(item?.title).toBe("设计 · Vetta 设计");
});

it("Allstar 是原型设计后的普通置顶项，点击导航到 /allstar", () => {
	const { result } = render();
	const navItems = result.current.navItems;
	const galleryIndex = navItems.findIndex((item) => item.key === "workspace:vetta-ui-design/gallery");
	const allstarIndex = navItems.findIndex((item) => item.key === "allstar-dev");
	const entry = navItems[allstarIndex];

	expect(galleryIndex).toBeGreaterThanOrEqual(0);
	expect(allstarIndex).toBe(galleryIndex + 1);
	expect(entry?.pinned).toBe(true);
	expect(entry?.locked).not.toBe(true);
	expect(result.current.moreNavItems.some((item) => item.key === "allstar-dev")).toBe(false);

	result.current.actions.openNavItem(entry!);
	expect(navigate).toHaveBeenCalledWith({ to: "/allstar" });
	expect(onNewChat).not.toHaveBeenCalled();
});

it("Allstar 可像普通页签一样移入更多并持久化用户选择", () => {
	const { result, rerender } = renderHook(() => useSidebarModel({ onCollapse: vi.fn() }));
	expect(result.current.navItems.some((item) => item.key === "allstar-dev")).toBe(true);

	act(() => result.current.actions.moveNavItem("allstar-dev", "more", null));
	rerender();

	const entry = result.current.moreNavItems.find((item) => item.key === "allstar-dev");
	expect(entry?.pinned).toBe(false);
	expect(localStorage.getItem(SIDEBAR_NAV_LAYOUT_STORAGE_KEY)).toContain("allstar-dev");
	result.current.actions.openNavItem(entry!);
	expect(navigate).toHaveBeenCalledWith({ to: "/allstar" });

	routeState.current = { pathname: "/allstar" };
	rerender();
	expect(result.current.moreActive).toBe(true);
});

it("Allstar 标准导航项保留页面与 coding 会话的激活状态", () => {
	const { result, rerender } = renderHook(() => useSidebarModel({ onCollapse: vi.fn() }));
	const isActive = (): boolean =>
		[...result.current.navItems, ...result.current.moreNavItems].find((item) => item.key === "allstar-dev")?.active ??
		false;
	// 默认（无活动会话）不高亮。
	expect(isActive()).toBe(false);

	routeState.current = { pathname: "/allstar" };
	rerender();
	expect(isActive()).toBe(true);

	routeState.current = { pathname: "/" };
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/repo/a",
			runtimeId: "rt-allstar-1",
			sessionPath: "/repo/a/s.jsonl",
			capabilityProfile: "coding",
		});
	});
	rerender();
	expect(isActive()).toBe(true);

	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/repo/a",
			runtimeId: "rt-allstar-2",
			sessionPath: "/repo/a/s2.jsonl",
			capabilityProfile: "work",
		});
	});
	rerender();
	expect(isActive()).toBe(false);
});
