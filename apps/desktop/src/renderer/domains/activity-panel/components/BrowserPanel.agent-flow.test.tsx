// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { invokeDesktopBrowserTab } from "@/main/browser-automation/in-app-browser-tab-host";
import type { InAppBrowserWebContents } from "@/main/browser-automation/webview-session-controller";
import { InAppBrowserSessionController } from "@/main/browser-automation/webview-session-controller";
import type { DesktopBrowserTabEventEnvelope } from "@/shared/browser-tab-ipc";
import { ActivityPanelContextProvider } from "../registry/context";
import { BrowserPanel } from "./BrowserPanel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@shared/hooks/useShortcuts", () => ({
	useEffectiveShortcut: () => "mod+shift+d",
}));
vi.mock("@shared/shortcuts", () => ({ useShortcutScope: () => undefined }));
afterEach(cleanup);

it("shares one page with Agent and keeps the user's address draft and focus through an action", async () => {
	const user = userEvent.setup();
	const listeners = new Set<(event: DesktopBrowserTabEventEnvelope) => void>();
	const controller = new InAppBrowserSessionController((event) => {
		for (const listener of listeners) listener(event);
	});
	let finishSnapshot: ((value: unknown) => void) | undefined;
	const contents: InAppBrowserWebContents = {
		id: 1,
		isDestroyed: () => false,
		getURL: () => "https://fixture.example/page",
		getTitle: () => "Shared fixture",
		executeJavaScript: async (code) => {
			if (code.includes('"kind":"snapshot"'))
				return new Promise((resolve) => {
					finishSnapshot = resolve;
				});
			return undefined;
		},
		capturePage: async () => {
			throw new Error("Snapshot must not capture images");
		},
	};
	controller.attachWebContents("flow-workspace", contents);
	window.vetta = {
		browserTab: {
			getSession: async () => ({
				ok: true,
				session: controller.getSession("flow-workspace"),
			}),
			onEvent: (listener: (event: DesktopBrowserTabEventEnvelope) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		browserView: {
			attach: async () => ({
				ok: true,
				state: {
					workspaceId: "flow-workspace",
					url: contents.getURL(),
					title: contents.getTitle(),
					canBack: false,
					canForward: false,
					failed: false,
					loading: false,
				},
			}),
			update: async () => undefined,
			detach: async () => undefined,
			onEvent: () => () => undefined,
			setInputPassthrough: async () => undefined,
		},
	} as unknown as Window["vetta"];
	const panel = render(
		<ActivityPanelContextProvider
			value={{
				workspace: { id: "flow-workspace", cwd: null, runtimeIds: [] },
				knowledgeHistory: false,
			}}
		>
			<BrowserPanel />
		</ActivityPanelContextProvider>,
	);
	const address = screen.getByRole("textbox", { name: "browser.addressLabel" });
	await waitFor(() => expect(address).toHaveProperty("value", contents.getURL()));
	const host = panel.container.querySelector("[data-browser-view-host]");
	await user.clear(address);
	await user.type(address, "https://next.example/draft");
	let pending: ReturnType<typeof invokeDesktopBrowserTab> | undefined;
	act(() => {
		pending = invokeDesktopBrowserTab(
			{
				sessionId: "agent-session",
				turnId: "turn",
				input: { action: "snapshot" },
			},
			new AbortController().signal,
			{ controller, resolveWorkspaceId: () => "flow-workspace" },
		);
	});
	await waitFor(() => expect(screen.getByRole("status").textContent).toBe("browser.agentAction.snapshot"));
	expect(address).toHaveProperty("value", "https://next.example/draft");
	expect(document.activeElement).toBe(address);
	await act(async () => {
		finishSnapshot?.({ nodes: [], truncated: false });
		const result = await pending;
		expect(result).toMatchObject({
			ok: true,
			pageUrl: "https://fixture.example/page",
		});
	});
	expect(screen.getByRole("status").textContent).toBe("browser.agentReady");
	expect(panel.container.querySelector("[data-browser-view-host]")).toBe(host);
	expect(document.activeElement).toBe(address);
	// 失焦经真实 View 接线回显实际页面。
	await user.tab();
	expect(document.activeElement).not.toBe(address);
	expect(screen.getByRole("textbox", { name: "browser.addressLabel" })).toHaveProperty(
		"value",
		contents.getURL(),
	);
	panel.unmount();
	expect(listeners.size).toBe(0);
});
