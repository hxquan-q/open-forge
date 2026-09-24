// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityTabActivationContextProvider } from "../registry/activation-context";
import { ActivityPanelContextProvider } from "../registry/context";
import {
	activityTerminalTabId,
	useActivityTerminalHandle,
	useActivityTerminalMeta,
} from "./useActivityTerminalHandle";

function wrapperFor(workspaceId: string, cwd: string | null, active: boolean) {
	const store = createStore();
	return {
		store,
		wrapper: ({ children }: { children: ReactNode }) => (
			<Provider store={store}>
				<ActivityPanelContextProvider
					value={{ workspace: { id: workspaceId, cwd, runtimeIds: [] }, knowledgeHistory: false }}
				>
					<ActivityTabActivationContextProvider value={active}>{children}</ActivityTabActivationContextProvider>
				</ActivityPanelContextProvider>
			</Provider>
		),
	};
}

describe("activity terminal handle", () => {
	afterEach(() => {
		cleanup();
	});

	it("按 workspace 生成稳定 tabId，且不与底部面板 tab-uuid 撞车", () => {
		expect(activityTerminalTabId("ws-a")).toBe("activity-terminal:ws-a");
		expect(activityTerminalTabId("ws-b")).toBe("activity-terminal:ws-b");
		expect(activityTerminalTabId("ws-a").startsWith("tab-")).toBe(false);
	});

	it("两个 adapter 形状一致：cwd/tabId/active/setMeta/setCloseGuard", () => {
		const { wrapper } = wrapperFor("ws-a", "/repo", true);
		const { result } = renderHook(() => useActivityTerminalHandle(), { wrapper });
		expect(result.current).toEqual(
			expect.objectContaining({
				tabId: "activity-terminal:ws-a",
				cwd: "/repo",
				active: true,
			}),
		);
		expect(typeof result.current.setMeta).toBe("function");
		expect(typeof result.current.setCloseGuard).toBe("function");
	});

	it("active 来自活动面板激活态；setCloseGuard 是空操作", () => {
		const inactive = wrapperFor("ws-a", "/repo", false);
		const { result } = renderHook(() => useActivityTerminalHandle(), { wrapper: inactive.wrapper });
		expect(result.current.active).toBe(false);
		expect(() => result.current.setCloseGuard(async () => ({ title: "x", message: "y" }))).not.toThrow();
	});

	it("setMeta 更新该 workspace 的标签，卸载后清掉", () => {
		const { wrapper } = wrapperFor("ws-a", "/repo", true);
		const hook = renderHook(
			() => ({
				handle: useActivityTerminalHandle(),
				meta: useActivityTerminalMeta(),
			}),
			{ wrapper },
		);
		expect(hook.result.current.meta).toBeUndefined();
		hook.result.current.handle.setMeta({ label: "repo" });
		hook.rerender();
		expect(hook.result.current.meta).toMatchObject({ label: "repo" });
		hook.unmount();
	});
});
