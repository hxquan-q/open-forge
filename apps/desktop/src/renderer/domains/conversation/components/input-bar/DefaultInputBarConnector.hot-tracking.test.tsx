// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { installVettaBridge } from "@/test/vetta-bridge";
import { i18n, initI18n } from "@shared/i18n";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import {
	activeSessionAtom,
	activeSessionHotTrackingAtom,
	hotTrackingBySessionAtom,
} from "@shared/store/atoms";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { DefaultInputBarConnector } from "./DefaultInputBarConnector";

// 外部主题扩展使用出厂 fallback；业务 Connector / View / toggle 按钮 / atoms 均真实。
vi.mock("@vetta-org/theme-sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@vetta-org/theme-sdk")>()),
	useThemeComponent: (_key: string, fallback: unknown) => fallback,
}));
vi.mock("@vetta-org/theme-sdk/appearance", async (importOriginal) => ({
	...(await importOriginal<typeof import("@vetta-org/theme-sdk/appearance")>()),
	useThemeSurface: () => undefined,
}));
// 不挂载与开关无关的编辑器/下拉与授权弹窗；保留真实工具栏配方和新按钮。
vi.mock("./editor/InputEditor", () => ({ InputEditor: () => null }));
vi.mock("./InputBarToolbar", async (importOriginal) => ({
	...(await importOriginal<typeof import("./InputBarToolbar")>()),
	InputBarModelAction: () => null,
	InputBarContextAction: () => null,
}));

beforeAll(async () => { await initI18n(); await i18n.changeLanguage("zh"); });
beforeEach(() => {
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
	installVettaBridge({
		session: { getGoalState: async () => null },
		mcp: { get: async () => ({ mcpServers: {} }) },
		skills: { list: async () => [] },
		appMonitor: { getPromptRefUsage: async () => ({}) },
		abilities: { listOpenMarketplaces: async () => ({ abilities: [] }) },
	});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function renderComposer(profile: "coding" | "work" | undefined) {
	const store = createStore();
	store.set(activeSessionAtom, { runtimeId: "a", cwd: "/repo", sessionPath: "/a.jsonl", capabilityProfile: profile });
	const routeTree = createRootRoute({
		component: () => <Provider store={store}><DefaultInputBarConnector onSend={async () => {}} onAbort={async () => {}} /></Provider>,
	});
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
	await router.load();
	render(<RouterProvider router={router} />);
	return store;
}

it("coding 输入栏按钮默认选中，点击关开；切换会话回到进程内上次状态", async () => {
	const user = userEvent.setup();
	const store = await renderComposer("coding");
	const button = screen.getByRole("button", { name: "LLM 行为热追踪" });
	expect(button.getAttribute("aria-pressed")).toBe("true");
	await user.click(button);
	expect(button.getAttribute("aria-pressed")).toBe("false");
	expect(store.get(activeSessionHotTrackingAtom)).toBe(false);
	act(() => store.set(activeSessionAtom, { runtimeId: "b", cwd: "/repo", sessionPath: "/b.jsonl", capabilityProfile: "coding" }));
	expect(button.getAttribute("aria-pressed")).toBe("true");
	act(() => store.set(activeSessionAtom, { runtimeId: "a", cwd: "/repo", sessionPath: "/a.jsonl", capabilityProfile: "coding" }));
	expect(button.getAttribute("aria-pressed")).toBe("false");
	await user.click(button);
	expect(button.getAttribute("aria-pressed")).toBe("true");
	expect(store.get(activeSessionHotTrackingAtom)).toBe(true);
});

it.each(["work", undefined] as const)("档位 %s 不装配热追踪按钮", async (profile) => {
	const store = await renderComposer(profile);
	expect(screen.queryByRole("button", { name: "LLM 行为热追踪" })).toBeNull();
	expect(store.get(hotTrackingBySessionAtom).size).toBe(0);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(false);
});
