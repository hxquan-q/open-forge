// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const onNewChat = vi.hoisted(() => vi.fn());
const onAllstarDev = vi.hoisted(() => vi.fn());
const prefetchNavItem = vi.hoisted(() => vi.fn());
const hostedRouteOpen = vi.hoisted(() => vi.fn(async () => undefined));

/**
 * 插件文案解析合同的替身：%key% 走目录，其余原样回显。
 * 断言看的是「description 与 label 一样过了宿主解析层」，不是译文本身。
 */
const pluginCatalog = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: "/" }],
	useNavigate: () => navigate,
	useSearch: () => ({}),
}));
vi.mock("../../../../root-layout/nav-route-prefetch", () => ({ prefetchNavItem }));
vi.mock("@shared/hosted-routes/hosted-route-service", () => ({
	desktopHostedRouteService: { open: hostedRouteOpen },
}));
vi.mock("../../hooks/useNewChatNavigation", () => ({
	useNewChatNavigation: () => onNewChat,
	useAllstarDevNavigation: () => onAllstarDev,
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
	onAllstarDev.mockReset();
	prefetchNavItem.mockReset();
	hostedRouteOpen.mockReset();
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

it("版块入口不进置顶/收纳布局，点击分发到 Allstar 开发导航", () => {
	const { result } = render();
	const entry = result.current.sectionEntryNavItem;
	expect(entry).toBeDefined();
	expect(entry?.key).toBe("allstar-dev");
	expect(entry?.locked).toBe(true);
	// 目录里没有它：置顶区与「更多」收纳区都不出现版块入口。
	expect(result.current.navItems.some((item) => item.key === "allstar-dev")).toBe(false);
	expect(result.current.moreNavItems.some((item) => item.key === "allstar-dev")).toBe(false);

	result.current.actions.openNavItem(entry!);
	expect(onAllstarDev).toHaveBeenCalledTimes(1);
	expect(onNewChat).not.toHaveBeenCalled();
	expect(navigate).not.toHaveBeenCalled();
});

it("聊天页打开代码模式会话时版块入口高亮，研究会话不高亮", () => {
	const { result, rerender } = renderHook(() => useSidebarModel({ onCollapse: vi.fn() }));
	// 默认（无活动会话）：不高亮。
	expect(result.current.sectionEntryNavItem?.active).toBe(false);

	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/repo/a",
			runtimeId: "rt-allstar-1",
			sessionPath: "/repo/a/s.jsonl",
			capabilityProfile: "coding",
		});
	});
	rerender();
	expect(result.current.sectionEntryNavItem?.active).toBe(true);

	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/repo/a",
			runtimeId: "rt-allstar-2",
			sessionPath: "/repo/a/s2.jsonl",
			capabilityProfile: "work",
		});
	});
	rerender();
	expect(result.current.sectionEntryNavItem?.active).toBe(false);
});
