// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { aiTerminalFeedAtom, type AiTerminalEntry } from "@shared/store/atoms";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { resolveActivityTabs } from "../registry/resolve-activity-tabs";
import type { ActivityTabDefinition, ActivityTabMeta } from "../registry/types";
import {
	defaultHiddenBuiltinTabIds,
	effectiveHiddenActivityTabKeys,
	hideActivityTabKeys,
	revealActivityTabKeys,
} from "../services/activity-tab-visibility";
import { TERMINAL_ACTIVITY_TAB_ID, terminalTabDefinition } from "./terminal-tab";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function wrapperFor(store: ReturnType<typeof createStore>, workspaceId = "ws-1", cwd = "/repo") {
	return ({ children }: { children: ReactNode }) => (
		<Provider store={store}>
			<ActivityPanelContextProvider
				value={{ workspace: { id: workspaceId, cwd, runtimeIds: [] }, knowledgeHistory: false }}
			>
				{children}
			</ActivityPanelContextProvider>
		</Provider>
	);
}

function metaMap(entries: Record<string, ActivityTabMeta>): Map<string, ActivityTabMeta> {
	return new Map(Object.entries(entries));
}

describe("activity panel terminal tab", () => {
	afterEach(() => {
		cleanup();
	});

	it("定义可移除、默认上栏，排序落在 Git 与浏览器之间", () => {
		expect(terminalTabDefinition.id).toBe(TERMINAL_ACTIVITY_TAB_ID);
		expect(terminalTabDefinition.removable).toBe(true);
		expect(terminalTabDefinition.source).toBe("builtin");
		expect(terminalTabDefinition.retention).toBe("warm");
		// 演示定稿：code 会话自带页签「文件(0)、Git(5)、终端、浏览器(15)」。
		expect(terminalTabDefinition.order).toBeGreaterThan(5);
		expect(terminalTabDefinition.order).toBeLessThan(15);
		// 默认上栏：不进「默认隐藏」清单，新建 code 会话右栏直接携带。
		expect(defaultHiddenBuiltinTabIds([terminalTabDefinition])).toEqual([]);
	});

	it("页签 body 是 AI 命令回放：feed 里的命令直接可见", () => {
		const store = createStore();
		const feedEntry: AiTerminalEntry = {
			command: "bun run check",
			key: "call-1",
			running: true,
			at: 1,
			cwd: "/repo",
		};
		store.set(aiTerminalFeedAtom, [feedEntry]);
		const Content = terminalTabDefinition.component;
		render(<Content />, { wrapper: wrapperFor(store) });
		expect(screen.getByRole("region", { name: "activityPanel.terminal.title" })).toBeTruthy();
		expect(screen.getByText("bun run check")).toBeTruthy();
	});

	it("useMeta 始终返回标签，方便进「+」挂载池", () => {
		const store = createStore();
		const { result } = renderHook(() => terminalTabDefinition.useMeta(), {
			wrapper: wrapperFor(store),
		});
		expect(result.current).toMatchObject({
			label: "activityPanel.tabs.terminal",
			icon: "icon-[solar--command-linear]",
		});
	});

	it("用户关闭终端页签后进「+」挂载池，可再挂回上栏", () => {
		const file: ActivityTabDefinition = {
			id: "file",
			order: 0,
			removable: false,
			source: "builtin",
			useMeta: () => ({ label: "activityPanel.tabs.file" }),
			component: () => null,
		};
		const definitions = [file, terminalTabDefinition];
		const defaultHiddenIds = defaultHiddenBuiltinTabIds(definitions);
		const metas = metaMap({
			file: { label: "activityPanel.tabs.file" },
			terminal: { label: "activityPanel.tabs.terminal" },
		});

		// 默认上栏：文件与终端都在栏上。
		const initial = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(undefined, defaultHiddenIds),
			tabOrder: [],
		});
		expect(initial.onBar.map((tab) => tab.id)).toEqual(["file", "terminal"]);

		// 用户关闭终端：默认上栏的 tab 记显式隐藏，进挂载池。
		const closedKeys = hideActivityTabKeys(undefined, "terminal", defaultHiddenIds);
		const closed = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(closedKeys, defaultHiddenIds),
			tabOrder: [],
		});
		expect(closed.onBar.map((tab) => tab.id)).toEqual(["file"]);
		expect(closed.restorable.map((tab) => tab.id)).toEqual(["terminal"]);

		// 从「+」挂回：恢复上栏。
		const mountedKeys = revealActivityTabKeys(closedKeys, "terminal", defaultHiddenIds);
		const mounted = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(mountedKeys, defaultHiddenIds),
			tabOrder: [],
		});
		expect(mounted.onBar.map((tab) => tab.id)).toEqual(["file", "terminal"]);
		expect(mounted.restorable).toEqual([]);
	});
});
