// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { installVettaBridge } from "@/test/vetta-bridge";
import { i18n, initI18n } from "@shared/i18n";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { activeSessionAtom, inputValueAtom, promptSuggestionsAtom } from "@shared/store/atoms";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { DefaultInputBarConnector } from "./DefaultInputBarConnector";

// 断言深度豁免理由（断言基线）：
// 本文件是接线测试——handleKeyDown 链路与 placeholder 拼装是否正确，只有走到 DOM
// （placeholder 文本、遮罩显隐）与 inputValueAtom 终态才算数；连接器编排的对象回调
// 调用本身就发生在组件内部，DOM/原子终态断言即合同本身，无需调用类断言。

// 外部主题扩展使用出厂 fallback；业务 Connector / View / atoms 均真实。
vi.mock("@vetta-org/theme-sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@vetta-org/theme-sdk")>()),
	useThemeComponent: (_key: string, fallback: unknown) => fallback,
}));
vi.mock("@vetta-org/theme-sdk/appearance", async (importOriginal) => ({
	...(await importOriginal<typeof import("@vetta-org/theme-sdk/appearance")>()),
	useThemeSurface: () => undefined,
}));
// 编辑器换成可派发按键的桩：placeholder 遮罩与 onKeyDownCapture 都在外层容器上，
// Lexical 内部行为由 useInlinePromptSuggestion 的单测覆盖。
vi.mock("./editor/InputEditor", () => ({ InputEditor: () => <div data-testid="input-editor-stub" /> }));
vi.mock("./InputBarToolbar", async (importOriginal) => ({
	...(await importOriginal<typeof import("./InputBarToolbar")>()),
	InputBarModelAction: () => null,
	InputBarContextAction: () => null,
}));

const RUNTIME = "runtime-inline";

function placeholderText(text: string) {
	return (_content: string, element: Element | null) =>
		element?.tagName === "SPAN" && element.textContent === text;
}

async function renderComposer() {
	const store = createStore();
	store.set(activeSessionAtom, { runtimeId: RUNTIME, cwd: "/repo", sessionPath: "/a.jsonl" });
	const routeTree = createRootRoute({
		component: () => (
			<Provider store={store}>
				<DefaultInputBarConnector onSend={async () => {}} onAbort={async () => {}} />
			</Provider>
		),
	});
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
	await router.load();
	render(<RouterProvider router={router} />);
	return store;
}

beforeAll(async () => {
	await initI18n();
	await i18n.changeLanguage("zh");
});
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
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("预测到达后第一条以 Tab 前缀显示在空输入框，按 Tab 填入且不发送", async () => {
	const store = await renderComposer();
	act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: ["运行全部测试", "顺手提交"] }));

	// placeholder 走 AnimatePresence mode="wait" 换帧，新文案在微任务后才落进 DOM。
	expect(await screen.findByText(placeholderText("Tab ⇥  运行全部测试"))).not.toBeNull();

	fireEvent.keyDown(screen.getByTestId("input-editor-stub"), { key: "Tab" });

	expect(store.get(inputValueAtom)).toBe("运行全部测试");
	await waitFor(() => expect(screen.queryByText(placeholderText("Tab ⇥  运行全部测试"))).toBeNull());

	// 填入后删回空，这一轮不再出现（已视为用过）。
	act(() => store.set(inputValueAtom, ""));
	expect(screen.queryByText(placeholderText("Tab ⇥  运行全部测试"))).toBeNull();
});

it("Esc 放弃本轮第一条；新一轮预测重新显示", async () => {
	const store = await renderComposer();
	act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: ["运行全部测试"] }));
	expect(await screen.findByText(placeholderText("Tab ⇥  运行全部测试"))).not.toBeNull();

	fireEvent.keyDown(screen.getByTestId("input-editor-stub"), { key: "Escape" });
	await waitFor(() => expect(screen.queryByText(placeholderText("Tab ⇥  运行全部测试"))).toBeNull());

	act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: ["继续昨晚的修复"] }));
	expect(await screen.findByText(placeholderText("Tab ⇥  继续昨晚的修复"))).not.toBeNull();
});
