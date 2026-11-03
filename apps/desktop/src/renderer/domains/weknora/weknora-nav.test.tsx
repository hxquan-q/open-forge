// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const prefetchNavItem = vi.hoisted(() => vi.fn());
const hostedRouteOpen = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: "/" }],
	useNavigate: () => navigate,
	useSearch: () => ({}),
}));
vi.mock("../../root-layout/nav-route-prefetch", () => ({ prefetchNavItem }));
vi.mock("@shared/hosted-routes/hosted-route-service", () => ({
	desktopHostedRouteService: { open: hostedRouteOpen },
}));
vi.mock("../project/hooks/useNewChatNavigation", () => ({
	useNewChatNavigation: () => vi.fn(),
	useAllstarDevNavigation: () => vi.fn(),
}));
vi.mock("../plugins/runtime/plugin-i18n", () => ({
	usePluginTextResolver: () => (_pluginId: string, raw: string | undefined) => raw ?? "",
}));
// 目录文案在模型层解析；这里断言的是「label 经 t(labelKey) 得来」，不是译文本身。
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { pluginWorkspaceViewsAtom } from "@shared/store/atoms";
import { SIDEBAR_NAV_LAYOUT_STORAGE_KEY } from "../project/components/sidebar/sidebar-nav-layout";
import { useSidebarModel } from "../project/components/sidebar/useSidebarModel";

const store = getDefaultStore();

function render() {
	return renderHook(() => useSidebarModel({ onCollapse: vi.fn() }));
}

beforeEach(() => {
	navigate.mockReset();
	prefetchNavItem.mockReset();
	hostedRouteOpen.mockReset();
	localStorage.removeItem(SIDEBAR_NAV_LAYOUT_STORAGE_KEY);
	store.set(pluginWorkspaceViewsAtom, []);
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

describe("侧边栏「智能客服」入口", () => {
	it("目录含 /weknora 项，label 经 i18n 键解析（AC-1）", () => {
		const { result } = render();
		const item = [...result.current.navItems, ...result.current.moreNavItems].find(
			(entry) => entry.key === "/weknora",
		);
		expect(item).toBeDefined();
		expect(item?.type).toBe("route");
		expect(item?.path).toBe("/weknora");
		expect(item?.labelKey).toBe("sidebar.nav.weknora");
		expect(item?.label).toBe("sidebar.nav.weknora");
	});

	it("默认落在置顶区，不进「更多」收纳（用户 2026-10-16 要求）", () => {
		const { result } = render();
		expect(result.current.navItems.some((entry) => entry.key === "/weknora")).toBe(true);
		expect(result.current.moreNavItems.some((entry) => entry.key === "/weknora")).toBe(false);
	});

	it("点击导航项跳转到 /weknora（AC-1 进入独立整页）", () => {
		const { result } = render();
		const item = result.current.navItems.find((entry) => entry.key === "/weknora");
		expect(item).toBeDefined();

		act(() => result.current.actions.openNavItem(item!));

		expect(navigate).toHaveBeenCalledWith({ to: "/weknora" });
	});

	it("既有导航项仍在（不回归）", () => {
		const { result } = render();
		const keys = [...result.current.navItems, ...result.current.moreNavItems].map((entry) => entry.key);
		for (const key of ["/abilities", "/agents", "/automation", "/knowledge", "/batch-tasks", "/scenes"]) {
			expect(keys).toContain(key);
		}
	});
});
