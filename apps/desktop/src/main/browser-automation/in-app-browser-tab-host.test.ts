// Copyright The Open Forge contributors.
import type {
	CodingAgentBrowserTabFunctionRequest,
	CodingAgentBrowserTabFunctionResult,
} from "@vetta/coding-agent/function-extensions";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type BrowserTabHostDependencies,
	invokeDesktopBrowserTab,
	resetDesktopBrowserTabHostForTests,
} from "./in-app-browser-tab-host.js";
import {
	type InAppBrowserNativeImage,
	InAppBrowserSessionController,
	type InAppBrowserWebContents,
} from "./webview-session-controller.js";

const WORKSPACE = "ws-test";

function fakeImage(size = { width: 100, height: 60 }): InAppBrowserNativeImage {
	const image: InAppBrowserNativeImage = {
		getSize: () => size,
		crop: () => image,
		resize: (next) => fakeImage(next),
		toPNG: () => Buffer.from("png"),
	};
	return image;
}

function fakeContents(
	overrides: Partial<InAppBrowserWebContents> & { executeJavaScript?: (code: string) => Promise<unknown> } = {},
): InAppBrowserWebContents {
	return {
		id: 7,
		isDestroyed: () => false,
		getURL: () => "https://example.com/form",
		getTitle: () => "Example",
		executeJavaScript: async () => undefined,
		capturePage: async () => fakeImage(),
		loadURL: async () => undefined,
		...overrides,
	};
}

function makeDeps(
	contents: InAppBrowserWebContents | null,
	workspaceId: string | undefined = WORKSPACE,
): {
	deps: BrowserTabHostDependencies;
	controller: InAppBrowserSessionController;
} {
	const controller = new InAppBrowserSessionController(
		() => undefined,
		async () => [{ path: "C:/tmp/shot.png", width: 100, height: 60 }],
	);
	if (contents) controller.attachWebContents(WORKSPACE, contents);
	return {
		controller,
		deps: {
			resolveWorkspaceId: () => workspaceId,
			controller,
		},
	};
}

function request(input: CodingAgentBrowserTabFunctionRequest["input"]): CodingAgentBrowserTabFunctionRequest {
	return { sessionId: "s1", turnId: "t1", input };
}

const snapshotPayload = {
	nodes: [
		{
			role: "button",
			name: "保存",
			xpath: "/html/body[1]/button[1]",
			boundingRect: { x: 10, y: 20, width: 80, height: 30 },
		},
	],
	truncated: false,
};

function snapshottingContents(): InAppBrowserWebContents {
	return fakeContents({
		executeJavaScript: async (code: string) => {
			if (code.includes('"kind":"snapshot"')) return snapshotPayload;
			if (code.includes('"kind":"click"')) return { ok: true };
			if (code.includes('"kind":"fill"')) return { ok: true };
			if (code.includes('"kind":"inspect"')) {
				return { ok: true, inspect: { role: "button", name: "保存" } };
			}
			return { ok: true };
		},
	});
}

async function snapshotFirst(deps: BrowserTabHostDependencies): Promise<CodingAgentBrowserTabFunctionResult> {
	return invokeDesktopBrowserTab(request({ action: "snapshot" }), new AbortController().signal, deps);
}

describe("browser_tab 宿主函数", () => {
	afterEach(() => {
		resetDesktopBrowserTabHostForTests();
	});

	it("工作空间无法解析时返回 no_browser_session，不触碰控制器", async () => {
		const { controller } = makeDeps(snapshottingContents());
		const deps: BrowserTabHostDependencies = { resolveWorkspaceId: () => undefined, controller };
		const result = await invokeDesktopBrowserTab(request({ action: "snapshot" }), new AbortController().signal, deps);
		expect(result).toMatchObject({ ok: false, code: "no_browser_session", action: "snapshot" });
	});

	it("WebView 未打开时返回 no_browser_session", async () => {
		const { deps } = makeDeps(null);
		const result = await invokeDesktopBrowserTab(request({ action: "snapshot" }), new AbortController().signal, deps);
		expect(result).toMatchObject({ ok: false, code: "no_browser_session", action: "snapshot" });
	});

	it("snapshot 免审批返回元素树与 pageRevision，ref 可供后续动作定位", async () => {
		const executed: string[] = [];
		const contents = fakeContents({
			executeJavaScript: async (code: string) => {
				executed.push(code);
				if (code.includes('"kind":"snapshot"')) return snapshotPayload;
				return { ok: true };
			},
		});
		const { deps } = makeDeps(contents);

		const snapshot = await snapshotFirst(deps);
		expect(snapshot).toMatchObject({
			ok: true,
			action: "snapshot",
			pageRevision: 0,
			pageUrl: "https://example.com/form",
		});
		const node = snapshot.ok ? snapshot.nodes?.[0] : undefined;
		expect(node?.elementRef).toMatchObject({ pageRevision: 0 });

		const click = await invokeDesktopBrowserTab(
			request({ action: "click", elementRef: node!.elementRef }),
			new AbortController().signal,
			deps,
		);
		expect(click).toMatchObject({ ok: true, action: "click" });
		expect(executed.some((code) => code.includes('"kind":"click"') && code.includes("/html/body[1]/button[1]"))).toBe(
			true,
		);
	});

	it("页面变更后旧 ref 返回 stale_reference 且不执行动作；重新 snapshot 后恢复", async () => {
		const executed: string[] = [];
		const contents = fakeContents({
			executeJavaScript: async (code: string) => {
				executed.push(code);
				if (code.includes('"kind":"snapshot"')) return snapshotPayload;
				return { ok: true };
			},
		});
		const { deps, controller } = makeDeps(contents);
		const snapshot = await snapshotFirst(deps);
		const ref = snapshot.ok ? snapshot.nodes![0]!.elementRef : undefined;

		controller.bumpRevision(WORKSPACE, { url: "https://example.com/next" });
		const stale = await invokeDesktopBrowserTab(
			request({ action: "click", elementRef: ref! }),
			new AbortController().signal,
			deps,
		);
		expect(stale).toMatchObject({
			ok: false,
			code: "stale_reference",
			action: "click",
			pageRevision: 1,
		});
		expect(executed.filter((code) => code.includes('"kind":"click"'))).toHaveLength(0);

		const fresh = await snapshotFirst(deps);
		expect(fresh).toMatchObject({ ok: true, pageRevision: 1 });
	});

	it("inspect 返回元素详情且错误回显真实动作名", async () => {
		const { deps } = makeDeps(snapshottingContents());
		const staleRef = { id: "e99", pageRevision: 5 };
		const result = await invokeDesktopBrowserTab(
			request({ action: "inspect", elementRef: staleRef }),
			new AbortController().signal,
			deps,
		);
		expect(result).toMatchObject({ ok: false, code: "stale_reference", action: "inspect" });
	});

	it("未知 ref id 提示先 snapshot", async () => {
		const { deps } = makeDeps(snapshottingContents());
		const result = await invokeDesktopBrowserTab(
			request({ action: "fill", elementRef: { id: "e1", pageRevision: 0 }, value: "hello" }),
			new AbortController().signal,
			deps,
		);
		expect(result).toMatchObject({ ok: false, code: "invalid_input", action: "fill" });
	});

	it("navigate 拒绝非 http(s) scheme 且不加载，放行 https 并返回新 revision", async () => {
		const loadURL = vi.fn(async () => undefined);
		const { deps } = makeDeps(fakeContents({ loadURL }));

		const denied = await invokeDesktopBrowserTab(
			request({ action: "navigate", url: "file:///etc/passwd" }),
			new AbortController().signal,
			deps,
		);
		expect(denied).toMatchObject({ ok: false, code: "policy_denied", action: "navigate" });
		expect(loadURL).not.toHaveBeenCalled();

		const allowed = await invokeDesktopBrowserTab(
			request({ action: "navigate", url: "https://example.org" }),
			new AbortController().signal,
			deps,
		);
		expect(allowed).toMatchObject({
			ok: true,
			action: "navigate",
			pageUrl: "https://example.org",
			pageRevision: 1,
		});
		expect(loadURL).toHaveBeenCalledWith("https://example.org");
	});

	it("screenshot 持久化页面截图并返回 attachmentId", async () => {
		const { deps } = makeDeps(fakeContents());
		const result = await invokeDesktopBrowserTab(
			request({ action: "screenshot" }),
			new AbortController().signal,
			deps,
		);
		expect(result).toMatchObject({ ok: true, action: "screenshot", screenshotAttachmentId: expect.any(String) });
	});

	it("publishes workspace-scoped activity while the real host action runs and clears it on success", async () => {
		let finish: ((value: unknown) => void) | undefined;
		const contents = fakeContents({
			executeJavaScript: async (code) => {
				if (code.includes('"kind":"snapshot"'))
					return new Promise((resolve) => {
						finish = resolve;
					});
				return undefined;
			},
		});
		const { deps, controller } = makeDeps(contents);
		const pending = invokeDesktopBrowserTab(request({ action: "snapshot" }), new AbortController().signal, deps);
		expect(controller.getSession(WORKSPACE).agentActivity).toEqual({ action: "snapshot", activeCount: 1 });
		expect(controller.getSession("other-workspace").agentActivity).toBeUndefined();
		finish?.(snapshotPayload);
		expect(await pending).toMatchObject({ ok: true, action: "snapshot" });
		expect(controller.getSession(WORKSPACE).agentActivity).toBeUndefined();
	});

	it("clears activity on rejection without swallowing the host error", async () => {
		const { deps, controller } = makeDeps(
			fakeContents({
				executeJavaScript: async (code) => {
					if (code.includes('"kind":"snapshot"')) throw new Error("guest failure");
					return undefined;
				},
			}),
		);
		await expect(
			invokeDesktopBrowserTab(request({ action: "snapshot" }), new AbortController().signal, deps),
		).rejects.toThrow("guest failure");
		expect(controller.getSession(WORKSPACE).agentActivity).toBeUndefined();
	});

	it("cancellation and old completion do not clear another concurrent action", async () => {
		const finish = new Map<string, (value: unknown) => void>();
		const contents = fakeContents({
			executeJavaScript: async (code) => {
				for (const action of ["snapshot", "wait"]) {
					if (code.includes(`"kind":"${action}"`))
						return new Promise((resolve) => {
							finish.set(action, resolve);
						});
				}
				return undefined;
			},
		});
		const { deps, controller } = makeDeps(contents);
		const abort = new AbortController();
		const first = invokeDesktopBrowserTab(request({ action: "snapshot" }), abort.signal, deps);
		const second = invokeDesktopBrowserTab(
			request({ action: "wait", timeoutMs: 1000 }),
			new AbortController().signal,
			deps,
		);
		expect(controller.getSession(WORKSPACE).agentActivity).toEqual({ action: "wait", activeCount: 2 });
		abort.abort();
		expect(controller.getSession(WORKSPACE).agentActivity).toEqual({ action: "wait", activeCount: 1 });
		finish.get("snapshot")?.(snapshotPayload);
		await first;
		expect(controller.getSession(WORKSPACE).agentActivity).toEqual({ action: "wait", activeCount: 1 });
		controller.detachWebContents(contents);
		expect(controller.getSession(WORKSPACE).agentActivity).toBeUndefined();
		finish.get("wait")?.({ ok: true });
		await second;
		expect(controller.getSession(WORKSPACE).agentActivity).toBeUndefined();
	});

	it("信号取消返回 cancelled", async () => {
		const controller = new AbortController();
		controller.abort();
		const { deps } = makeDeps(snapshottingContents());
		const result = await invokeDesktopBrowserTab(request({ action: "snapshot" }), controller.signal, deps);
		expect(result).toMatchObject({ ok: false, code: "cancelled", action: "snapshot" });
	});
});
