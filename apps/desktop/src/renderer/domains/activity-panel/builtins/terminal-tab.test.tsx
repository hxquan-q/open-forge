// Copyright The Open Forge contributors.
// @vitest-environment jsdom

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

vi.mock("@domains/bottom-panel/terminal/TerminalSurface", () => ({
	TerminalSurface: ({ handle }: { handle: { tabId: string; cwd: string | null; active: boolean } }) => (
		<div
			data-testid="activity-terminal-surface"
			data-tab-id={handle.tabId}
			data-cwd={handle.cwd ?? ""}
			data-active={String(handle.active)}
		/>
	),
}));

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

	it("定义可移除、默认不上栏、每 workspace 单实例", () => {
		expect(terminalTabDefinition.id).toBe(TERMINAL_ACTIVITY_TAB_ID);
		expect(terminalTabDefinition.removable).toBe(true);
		expect(terminalTabDefinition.initiallyVisible).toBe(false);
		expect(terminalTabDefinition.source).toBe("builtin");
		expect(terminalTabDefinition.retention).toBe("warm");
	});

	it("右栏 surface 使用 workspace 级 tabId，与底部面板实例隔离", () => {
		const store = createStore();
		const Content = terminalTabDefinition.component;
		render(<Content />, { wrapper: wrapperFor(store) });
		const surface = screen.getByTestId("activity-terminal-surface");
		expect(surface.getAttribute("data-tab-id")).toBe("activity-terminal:ws-1");
		expect(surface.getAttribute("data-cwd")).toBe("/repo");
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

	it("用户从「+」挂载后再关闭：上栏出现终端，关闭后回到挂载池", () => {
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

		const hidden = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(undefined, defaultHiddenIds),
			tabOrder: [],
		});
		expect(hidden.onBar.map((tab) => tab.id)).toEqual(["file"]);
		expect(hidden.restorable.map((tab) => tab.id)).toEqual(["terminal"]);

		const mountedKeys = revealActivityTabKeys(undefined, "terminal", defaultHiddenIds);
		const mounted = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(mountedKeys, defaultHiddenIds),
			tabOrder: [],
		});
		expect(mounted.onBar.map((tab) => tab.id)).toEqual(["file", "terminal"]);
		expect(mounted.restorable).toEqual([]);

		const closedKeys = hideActivityTabKeys(mountedKeys, "terminal", defaultHiddenIds);
		const closed = resolveActivityTabs({
			definitions,
			metaById: metas,
			tabVisibilityRecords: [],
			hiddenKeys: effectiveHiddenActivityTabKeys(closedKeys, defaultHiddenIds),
			tabOrder: [],
		});
		expect(closed.onBar.map((tab) => tab.id)).toEqual(["file"]);
		expect(closed.restorable.map((tab) => tab.id)).toEqual(["terminal"]);
	});
});
