// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { activityPanelOpenAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/** 该诊断日志每次解析变化都会序列化约 3KB 的页签全量投影，只应存在于开发模式。 */
async function loadModel() {
	vi.resetModules();
	return import("./useActivityPanelModel.js");
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
	window.localStorage.clear();
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.append(container);
});

afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
	root = null;
	container = null;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function mountPanel(store: ReturnType<typeof createStore>, useModel: () => { actions: unknown }): void {
	function Probe(): null {
		useModel();
		return null;
	}
	act(() => {
		root = createRoot(container as HTMLDivElement);
		root.render(createElement(Provider, { store }, createElement(Probe)));
	});
}

it("生产构建不再为每次页签解析输出全量调试 JSON", async () => {
	vi.stubEnv("DEV", false);
	const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
	const { useActivityPanelModel } = await loadModel();
	const store = createStore();
	mountPanel(store, () =>
		useActivityPanelModel({ cwd: null, workspaceId: "ws-debug", definitions: [], metaById: new Map() }),
	);
	act(() => store.set(activityPanelOpenAtom, true));
	act(() => store.set(activityPanelOpenAtom, false));
	expect(debug).not.toHaveBeenCalled();
});

it("开发模式保留该诊断输出", async () => {
	vi.stubEnv("DEV", true);
	const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
	const { useActivityPanelModel } = await loadModel();
	const store = createStore();
	mountPanel(store, () =>
		useActivityPanelModel({ cwd: null, workspaceId: "ws-debug", definitions: [], metaById: new Map() }),
	);
	expect(debug).toHaveBeenCalled();
	act(() => store.set(activityPanelOpenAtom, true));
	expect(debug.mock.calls.some((call) => String(call[0]).includes("[activity-tab-debug]"))).toBe(true);
});
