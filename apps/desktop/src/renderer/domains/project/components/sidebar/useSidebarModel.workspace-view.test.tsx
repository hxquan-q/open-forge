// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
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
}));
vi.mock("../../../../root-layout/nav-route-prefetch", () => ({ prefetchNavItem }));
vi.mock("@shared/hosted-routes/hosted-route-service", () => ({
	desktopHostedRouteService: { open: hostedRouteOpen },
}));
vi.mock("../../hooks/useNewChatNavigation", () => ({
	useNewChatNavigation: () => vi.fn(),
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

import { pluginWorkspaceViewsAtom } from "@shared/store/atoms";
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
	prefetchNavItem.mockReset();
	hostedRouteOpen.mockReset();
	localStorage.removeItem(SIDEBAR_NAV_LAYOUT_STORAGE_KEY);
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
