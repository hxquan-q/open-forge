// Copyright The Open Forge contributors.
import { BROWSER_ELEMENT_SELECTION_SCHEMA } from "@vetta/coding-agent/function-extensions";
import { describe, expect, it, vi } from "vitest";
import type { DesktopBrowserTabEventEnvelope } from "../../shared/browser-tab-ipc.js";
import {
	type InAppBrowserNativeImage,
	InAppBrowserSessionController,
	type InAppBrowserWebContents,
} from "./webview-session-controller.js";

function fakeImage(size = { width: 200, height: 80 }): InAppBrowserNativeImage {
	const image: InAppBrowserNativeImage = {
		getSize: () => size,
		crop: () => image,
		resize: (next) => fakeImage(next),
		toPNG: () => Buffer.from("png"),
	};
	return image;
}

function fakeContents(overrides: Partial<InAppBrowserWebContents> = {}): InAppBrowserWebContents {
	return {
		id: 11,
		isDestroyed: () => false,
		getURL: () => "https://example.com/form",
		getTitle: () => "Example",
		executeJavaScript: async () => undefined,
		capturePage: async () => fakeImage(),
		...overrides,
	};
}

describe("InAppBrowserSessionController", () => {
	it("binds the first pending webview when getSession names the workspace", () => {
		const controller = new InAppBrowserSessionController(() => undefined);
		const contents = fakeContents({ id: 22 });
		controller.attachUnboundWebContents(contents);
		expect(controller.getSession("ws-9").workspaceId).toBe("ws-9");
		expect(controller.getWebContents("ws-9")).toBe(contents);
		expect(controller.workspaceIdForContents(22)).toBe("ws-9");
	});

	it("binds a later webview to a workspace that already asked for a session", () => {
		const controller = new InAppBrowserSessionController(() => undefined);
		controller.getSession("ws-2");
		const contents = fakeContents({ id: 33 });
		controller.attachUnboundWebContents(contents);
		expect(controller.getWebContents("ws-2")).toBe(contents);
		expect(controller.workspaceIdForContents(33)).toBe("ws-2");
	});

	it("binds a workspace webview and increments pageRevision without relocating old refs", async () => {
		const events: DesktopBrowserTabEventEnvelope[] = [];
		const controller = new InAppBrowserSessionController((event) => events.push(event));
		controller.attachWebContents("ws-1", fakeContents());
		expect(controller.getSession("ws-1")).toMatchObject({
			workspaceId: "ws-1",
			pageUrl: "https://example.com/form",
			pageRevision: 0,
		});
		const ref = controller.createElementRef("ws-1");
		expect(ref).toEqual({ id: "e1", pageRevision: 0 });
		expect(controller.bumpRevision("ws-1", { url: "https://example.com/next" })).toBe(1);
		expect(controller.validateElementRef("ws-1", ref)).toEqual({ ok: false, code: "stale_reference" });
		expect(events.some((item) => item.event.kind === "page-revision" && item.event.pageRevision === 1)).toBe(true);
	});

	it("emits a schema-valid picker capsule and keeps picker armed for a replacement pick", async () => {
		const events: DesktopBrowserTabEventEnvelope[] = [];
		let started = 0;
		const controller = new InAppBrowserSessionController((event) => events.push(event));
		controller.attachWebContents(
			"ws-1",
			fakeContents({
				executeJavaScript: async (code) => {
					if (code.includes('"start"')) {
						started += 1;
						if (started > 1) return new Promise(() => undefined);
						return {
							role: "textbox",
							accessibleName: "Email",
							attributes: { id: "email", type: "email" },
							domPath: "input#email",
							xpath: '//*[@id="email"]',
							computedStyle: { display: "inline-block" },
							outerHTML: '<input id="email" type="email">',
							surroundingText: "Email address",
							boundingRect: { x: 10, y: 20, width: 120, height: 24 },
							devicePixelRatio: 2,
						};
					}
					return { ok: true };
				},
			}),
		);
		await controller.setPicker("ws-1", true);
		await vi.waitFor(() => {
			expect(events.some((item) => item.event.kind === "picker-result")).toBe(true);
		});
		const pick = events.find((item) => item.event.kind === "picker-result");
		expect(pick?.event).toMatchObject({
			kind: "picker-result",
			context: {
				schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
				payload: {
					pageUrl: "https://example.com/form",
					role: "textbox",
					domPath: "input#email",
					elementRef: { id: "e1", pageRevision: 0 },
				},
			},
		});
		expect(controller.getSession("ws-1").pickerEnabled).toBe(true);
		await vi.waitFor(() => {
			expect(started).toBe(2);
		});
	});

	it("turns picker off when the guest reports cancel and does not re-arm", async () => {
		let started = 0;
		const controller = new InAppBrowserSessionController(() => undefined);
		controller.attachWebContents(
			"ws-1",
			fakeContents({
				executeJavaScript: async (code) => {
					if (code.includes('"start"')) {
						started += 1;
						return { cancelled: true };
					}
					return { ok: true };
				},
			}),
		);
		await controller.setPicker("ws-1", true);
		await vi.waitFor(() => {
			expect(controller.getSession("ws-1").pickerEnabled).toBe(false);
		});
		expect(started).toBe(1);
	});

	it("crops by device pixels, treats a persist miss as crop_failed, and reports no session", async () => {
		const controller = new InAppBrowserSessionController(
			() => undefined,
			async () => [{ path: "C:/cache/el.png", width: 40, height: 16 }],
		);
		controller.attachWebContents("ws-1", fakeContents());
		await expect(controller.cropScreenshot("ws-1", { x: 10, y: 20, width: 20, height: 8 }, 2)).resolves.toMatchObject(
			{
				ok: true,
				path: "C:/cache/el.png",
				mimeType: "png",
			},
		);
		const miss = new InAppBrowserSessionController(
			() => undefined,
			async () => [],
		);
		miss.attachWebContents("ws-1", fakeContents());
		await expect(miss.cropScreenshot("ws-1", { x: 10, y: 20, width: 20, height: 8 }, 2)).resolves.toMatchObject({
			ok: false,
			code: "crop_failed",
		});
		await expect(controller.cropScreenshot("missing", { x: 1, y: 1, width: 2, height: 2 }, 1)).resolves.toMatchObject(
			{
				ok: false,
				code: "no_browser_session",
			},
		);
	});
});
