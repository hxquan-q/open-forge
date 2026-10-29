// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * AI 活动跟随页签：shell 开跑切终端、编辑目标换文件切文件页、内嵌浏览器会话
 * 变化切浏览器；同类信号按目标页签去重，不产生多余 Map 写入。
 */
import {
	activityPanelTabByProjectAtom,
	aiEditTargetAtom,
	aiTerminalFeedAtom,
	type AiTerminalEntry,
} from "@shared/store/atoms";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { useFollowAiActivity } from "./useFollowAiActivity";

type BrowserEventListener = (event: { kind: string }) => void;

function entry(key: string): AiTerminalEntry {
	return { command: "bun run check", key, running: true, at: 1, cwd: "/repo" };
}

function renderFollow(store: ReturnType<typeof createStore>) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<Provider store={store}>
			<ActivityPanelContextProvider
				value={{ workspace: { id: "ws-1", cwd: "/repo", runtimeIds: [] }, knowledgeHistory: false }}
			>
				{children}
			</ActivityPanelContextProvider>
		</Provider>
	);
	return renderHook(() => useFollowAiActivity(), { wrapper });
}

function activeTab(store: ReturnType<typeof createStore>): string | undefined {
	return store.get(activityPanelTabByProjectAtom).get("ws-1");
}

describe("useFollowAiActivity", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("shell 命令开跑切终端页签；同类信号去重不重复写入", () => {
		const store = createStore();
		const { rerender } = renderFollow(store);
		expect(activeTab(store)).toBeUndefined();

		act(() => store.set(aiTerminalFeedAtom, [entry("call-1")]));
		rerender();
		expect(activeTab(store)).toBe("terminal");

		// 追加新命令仍是终端：目标页签相同，Map 引用不变（无多余重渲源）。
		const before = store.get(activityPanelTabByProjectAtom);
		act(() => store.set(aiTerminalFeedAtom, [entry("call-1"), entry("call-2")]));
		rerender();
		expect(activeTab(store)).toBe("terminal");
		expect(store.get(activityPanelTabByProjectAtom)).toBe(before);
	});

	it("写类工具发起切文件页；换文件再触发", () => {
		const store = createStore();
		const { rerender } = renderFollow(store);
		act(() => store.set(aiEditTargetAtom, { path: "/repo/a.ts", at: 1 }));
		rerender();
		expect(activeTab(store)).toBe("file");

		act(() => store.set(aiEditTargetAtom, { path: "/repo/b.ts", at: 2 }));
		rerender();
		expect(activeTab(store)).toBe("file");
	});

	it("内嵌浏览器会话变化切浏览器页", () => {
		const listeners = new Set<BrowserEventListener>();
		vi.stubGlobal("vetta", {
			browserTab: { onEvent: (listener: BrowserEventListener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			} },
		});
		const store = createStore();
		renderFollow(store);
		expect(activeTab(store)).toBeUndefined();

		act(() => {
			for (const listener of listeners) listener({ kind: "session-changed" });
		});
		expect(activeTab(store)).toBe("browser");

		// 非会话事件不跟随。
		act(() => {
			for (const listener of listeners) listener({ kind: "picker-result" });
		});
		expect(activeTab(store)).toBe("browser");
	});

	it("信号序列切换：shell 后编辑文件，页签随活动切到文件", () => {
		const store = createStore();
		const { rerender } = renderFollow(store);
		act(() => store.set(aiTerminalFeedAtom, [entry("call-1")]));
		rerender();
		expect(activeTab(store)).toBe("terminal");

		act(() => store.set(aiEditTargetAtom, { path: "/repo/a.ts", at: 1 }));
		rerender();
		expect(activeTab(store)).toBe("file");
	});
});
