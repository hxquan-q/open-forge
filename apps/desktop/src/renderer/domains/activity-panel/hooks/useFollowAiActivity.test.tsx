// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { DesktopBrowserTabEventEnvelope } from "@/shared/browser-tab-ipc";
import { activityPanelTabByProjectAtom, aiEditTargetAtom, aiTerminalFeedAtom, type AiTerminalEntry } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFollowAiActivity } from "./useFollowAiActivity";

const workspace: ActivityWorkspace = { id: "ws-1", cwd: "/repo", runtimeIds: [] };
function entry(key: string): AiTerminalEntry {
	return { command: "bun run check", key, running: true, at: 1, cwd: "/repo" };
}
function renderFollow(store: ReturnType<typeof createStore>) {
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	return renderHook(({ current }) => useFollowAiActivity(current), { wrapper, initialProps: { current: workspace } });
}
function activeTab(store: ReturnType<typeof createStore>): string | undefined {
	return store.get(activityPanelTabByProjectAtom).get("ws-1");
}
function browserEvent(id: string, active = true): DesktopBrowserTabEventEnvelope {
	return { workspaceId: id, event: { kind: "session-changed", session: {
		workspaceId: id, pageUrl: "file:///demo/index.html", title: "Demo", pageRevision: 1, pickerEnabled: false,
		...(active ? { agentActivity: { action: "navigate", activeCount: 1 } } : {}),
	} } };
}

describe("useFollowAiActivity", () => {
	afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

	it("新 shell 活动切终端；已在目标页签时不重复发布 Map", () => {
		const store = createStore();
		renderFollow(store);
		act(() => store.set(aiTerminalFeedAtom, [entry("a")]));
		expect(activeTab(store)).toBe("terminal");
		const before = store.get(activityPanelTabByProjectAtom);
		act(() => store.set(aiTerminalFeedAtom, [entry("a"), entry("b")]));
		expect(store.get(activityPanelTabByProjectAtom)).toBe(before);
	});

	it("用户切走后，下一条同类活动重新跟随", () => {
		const store = createStore();
		renderFollow(store);
		act(() => store.set(aiTerminalFeedAtom, [entry("a")]));
		act(() => store.set(activityPanelTabByProjectAtom, new Map([[workspace.id, "file"]])));
		act(() => store.set(aiTerminalFeedAtom, [entry("b")]));
		expect(activeTab(store)).toBe("terminal");
		act(() => store.set(aiEditTargetAtom, { path: "/repo/a.ts", at: 1 }));
		expect(activeTab(store)).toBe("file");
		act(() => store.set(activityPanelTabByProjectAtom, new Map([[workspace.id, "terminal"]])));
		// 同一文件下一次编辑也属于新活动。
		act(() => store.set(aiEditTargetAtom, { path: "/repo/a.ts", at: 2 }));
		expect(activeTab(store)).toBe("file");
	});

	it("挂载不重放旧信号，切工作区不把已有命令带过去", () => {
		const store = createStore();
		store.set(aiTerminalFeedAtom, [entry("old")]);
		store.set(aiEditTargetAtom, { path: "/repo/old.ts", at: 1 });
		const { rerender } = renderFollow(store);
		expect(activeTab(store)).toBeUndefined();
		rerender({ current: { ...workspace, id: "ws-2", cwd: "/other" } });
		act(() => store.set(aiTerminalFeedAtom, [entry("a")]));
		expect(store.get(activityPanelTabByProjectAtom).has("ws-2")).toBe(false);
	});

	it("只消费同工作区浏览器 Agent 信封，忽略闲置事件并清理订阅", () => {
		const listeners = new Set<(event: DesktopBrowserTabEventEnvelope) => void>();
		vi.stubGlobal("vetta", { browserTab: { onEvent: (listener: (event: DesktopBrowserTabEventEnvelope) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		} } });
		const store = createStore();
		const { unmount } = renderFollow(store);
		act(() => { for (const fn of listeners) fn(browserEvent("other")); });
		expect(activeTab(store)).toBeUndefined();
		act(() => { for (const fn of listeners) fn(browserEvent("ws-1", false)); });
		expect(activeTab(store)).toBeUndefined();
		act(() => { for (const fn of listeners) fn(browserEvent("ws-1")); });
		expect(activeTab(store)).toBe("browser");
		unmount();
		expect(listeners.size).toBe(0);
	});
});
