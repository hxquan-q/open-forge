// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, initI18n } from "@shared/i18n";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityTabOrderAtom,
	aiEditTargetAtom,
	hiddenActivityTabsAtom,
	inlineFilePreviewAtom,
	toggleCurrentSessionHotTrackingAtom,
	activityPanelTabByProjectAtom,
	aiTerminalFeedAtom,
	floatingActivityTabsByProjectAtom,
	pluginActivityTabsAtom,
	type RegisteredActivityTab,
} from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { ActivityPanel, ConversationActivityPanel } from "./ActivityPanel";
import { useFollowAiFileEdits } from "../hooks/useFollowAiFileEdits";
import { useAtomValue } from "jotai";

vi.mock("motion/react", () => {
	const motion = new Proxy(
		{},
		{
			get:
				() =>
				({ children }: { children: ReactNode }) => <div>{children}</div>,
		},
	);
	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => children,
		LayoutGroup: ({ children }: { children: ReactNode }) => children,
		motion,
		useReducedMotion: () => true,
	};
});

// 文件树/真实 fs watcher 不参与本测试；保留真实文件跟随 hook 与 Context 接线。
vi.mock("./file-tab/FileTabContent", () => ({
	FileTabContent: () => {
		useFollowAiFileEdits();
		const preview = useAtomValue(inlineFilePreviewAtom);
		return <div>file body{preview ? <span>{preview.path}</span> : null}</div>;
	},
}));

// 内置 Git 页签的 useMeta 会拉取仓库状态（window.vetta.git）；测试桥不带 git 通道，
// 本套件只关心页签解析，桩掉该 hook 避免未处理 rejection。
vi.mock("@shared/hooks/useGitRepoStatus", () => ({
	useGitRepoStatus: () => ({ status: null, loading: false, refresh: () => {} }),
}));

class NoopResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeAll(async () => { await initI18n(); await i18n.changeLanguage("zh"); });

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function pluginTab(): RegisteredActivityTab {
	return {
		pluginId: "demo",
		pluginName: "Demo",
		tabId: "panel",
		label: "Demo panel",
		component: () => <div>demo body</div>,
		scope_use: ["conversation"],
	};
}

const workspace = createActivityWorkspace("agent-team:workspace", "/tmp/team-cwd", ["member-runtime"]);

function renderPanel(scenario: "conversation" | undefined, open = true, hotTracking?: boolean) {
	const store = createStore();
	store.set(activityPanelOpenAtom, open);
	store.set(pluginActivityTabsAtom, [pluginTab()]);
	render(
		<Provider store={store}>
			<ActivityPanel
				workspace={workspace}
				{...(scenario ? { pluginScenario: scenario } : {})}
				{...(hotTracking === undefined ? {} : { hotTracking })}
			/>
		</Provider>,
	);
	return store;
}

describe("activity panel plugin tabs outside the ordinary conversation host", () => {
	it("普通 coding 会话关闭热追踪后移除终端、不跟随页签与文件；重新开启恢复且不改页签偏好", () => {
		// jsdom 无布局，提供足够的栏宽以便按可访问 role 查询所有页签。
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
		vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
		const store = createStore();
		const cwd = "/repo";
		store.set(activeSessionAtom, { runtimeId: "code-a", sessionPath: "/a.jsonl", cwd, capabilityProfile: "coding" });
		store.set(activityPanelOpenAtom, true);
		store.set(hiddenActivityTabsAtom, new Map([[cwd, ["todo"]]]));
		store.set(activityTabOrderAtom, new Map([[cwd, ["browser", "file", "terminal", "git"]]]));
		const hiddenBefore = store.get(hiddenActivityTabsAtom);
		const orderBefore = store.get(activityTabOrderAtom);
		render(<Provider store={store}><ConversationActivityPanel /></Provider>);
		expect(screen.getByRole("tab", { name: "终端" })).toBeTruthy();
		act(() => store.set(aiEditTargetAtom, { path: "/repo/on.ts", cwd, at: 1 }));
		expect(store.get(inlineFilePreviewAtom)?.path).toBe("/repo/on.ts");

		act(() => store.set(toggleCurrentSessionHotTrackingAtom));
		expect(screen.queryByRole("tab", { name: "终端" })).toBeNull();
		act(() => {
			store.set(aiTerminalFeedAtom, [{ key: "off", command: "no-follow", running: true, cwd, at: 2 }]);
			store.set(aiEditTargetAtom, { path: "/repo/off.ts", cwd, at: 2 });
		});
		expect(store.get(activityPanelTabByProjectAtom).get(cwd)).toBe("file");
		expect(store.get(inlineFilePreviewAtom)?.path).toBe("/repo/on.ts");
		expect(screen.queryByText("no-follow")).toBeNull();

		act(() => store.set(toggleCurrentSessionHotTrackingAtom));
		expect(screen.getByRole("tab", { name: "终端" })).toBeTruthy();
		act(() => store.set(aiTerminalFeedAtom, [{ key: "on", command: "follow-again", running: true, cwd, at: 3 }]));
		expect(store.get(activityPanelTabByProjectAtom).get(cwd)).toBe("terminal");
		expect(screen.getByText("follow-again")).toBeTruthy();
		act(() => store.set(aiEditTargetAtom, { path: "/repo/again.ts", cwd, at: 4 }));
		expect(store.get(activityPanelTabByProjectAtom).get(cwd)).toBe("file");
		expect(store.get(inlineFilePreviewAtom)?.path).toBe("/repo/again.ts");
		expect(store.get(hiddenActivityTabsAtom)).toBe(hiddenBefore);
		expect(store.get(activityTabOrderAtom)).toBe(orderBefore);
	});

	it("真实面板入口把 shell 活动切到当前工作区终端，不写入 unbound", () => {
		const store = renderPanel(undefined, true, true);
		act(() => store.set(aiTerminalFeedAtom, [{
			key: "shell-1", command: "bun run check", running: true, at: 1, cwd: workspace.cwd,
		}]));
		expect(store.get(activityPanelTabByProjectAtom).get(workspace.id)).toBe("terminal");
		expect(store.get(activityPanelTabByProjectAtom).has("unbound")).toBe(false);
		expect(screen.getByText("bun run check")).toBeTruthy();
		// 用户切走后，下一次同类活动仍能跟随，而不是被上一次 AI 目标缓存挡掉。
		act(() => store.set(activityPanelTabByProjectAtom, new Map([[workspace.id, "file"]])));
		act(() => store.set(aiTerminalFeedAtom, [{
			key: "shell-2", command: "git status", running: true, at: 2, cwd: workspace.cwd,
		}]));
		expect(store.get(activityPanelTabByProjectAtom).get(workspace.id)).toBe("terminal");
		expect(screen.getByText("git status")).toBeTruthy();
	});

	it("§11.3：默认（非 coding 挂载点）不热跟随，AI 终端页签不出现", () => {
		const store = renderPanel("conversation");
		act(() =>
			store.set(aiTerminalFeedAtom, [
				{ key: "shell-1", command: "bun run check", running: true, at: 1, cwd: workspace.cwd },
			]),
		);
		expect(store.get(activityPanelTabByProjectAtom).get(workspace.id)).toBeUndefined();
		expect(screen.queryByText("bun run check")).toBeNull();
	});

	// A Team session never drives the global scenario atom, so the host must hand the
	// panel its own scenario; without it plugin contributions fail closed and the bar
	// collapses to the builtin tabs only.
	it("puts a registered plugin tab on the bar when the host supplies its scenario", () => {
		renderPanel("conversation");
		expect(screen.queryByText("Demo panel")).not.toBeNull();
	});

	it("keeps plugin tabs off the bar when the host supplies no scenario", () => {
		renderPanel(undefined);
		expect(screen.queryByText("Demo panel")).toBeNull();
	});

	it("does not mount the docked tab bar or docked content while closed", () => {
		const store = renderPanel("conversation", false);

		expect(screen.queryByText("Demo panel")).toBeNull();
		expect(screen.queryByText("file body")).toBeNull();

		act(() => store.set(activityPanelOpenAtom, true));
		expect(screen.queryByText("Demo panel")).not.toBeNull();
		expect(screen.queryByText("file body")).not.toBeNull();
	});

	it("keeps floating tab content mounted while the docked panel is closed", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, false);
		store.set(floatingActivityTabsByProjectAtom, new Map([
			[
				workspace.id,
				[{ key: "file", x: 20, y: 20, width: 480, height: 360, zIndex: 1 }],
			],
		]));

		render(
			<Provider store={store}>
				<ActivityPanel workspace={workspace} pluginScenario="conversation" />
			</Provider>,
		);

		expect(screen.queryByText("file body")).not.toBeNull();
	});
});
