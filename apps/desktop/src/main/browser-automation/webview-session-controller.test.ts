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
	it("attachWebContents 把 contents 直连到具名 workspace（TASK-0072：guest 归属创建时已知）", () => {
		const controller = new InAppBrowserSessionController(() => undefined);
		const contents = fakeContents({ id: 22 });
		controller.attachWebContents("ws-9", contents);
		expect(controller.getSession("ws-9").workspaceId).toBe("ws-9");
		expect(controller.getWebContents("ws-9")).toBe(contents);
		expect(controller.workspaceIdForContents(22)).toBe("ws-9");
	});

	it("先问会话再建 view：getSession 先登记 workspace，view 创建后 attach 即联通", () => {
		const controller = new InAppBrowserSessionController(() => undefined);
		expect(controller.getWebContents("ws-2")).toBeNull();
		controller.getSession("ws-2");
		const contents = fakeContents({ id: 33 });
		controller.attachWebContents("ws-2", contents);
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

	describe("liveEdit（TASK-0085 页面内即时预览）", () => {
		const pickCapsule = {
			role: "button",
			accessibleName: "Save",
			attributes: { id: "save" },
			domPath: "button#save",
			xpath: '//*[@id="save"]',
			computedStyle: { display: "inline-block" },
			outerHTML: '<button id="save">Save</button>',
			surroundingText: "Save",
			boundingRect: { x: 10, y: 20, width: 80, height: 24 },
			devicePixelRatio: 1,
		};

		function liveEditContents(guestResult: unknown = { ok: true, edits: [], hasElement: true }) {
			let started = 0;
			return fakeContents({
				executeJavaScript: async (code) => {
					// 注入脚本尾部调用形如 `})("apply-edit",…,{deps}`；runtime 源码本身也含命令名，故只认调用点。
					const invoked = /\)\("([a-z-]+)",/.exec(code)?.[1];
					if (
						invoked === "apply-edit" ||
						invoked === "revert-edit" ||
						invoked === "revert-all-edits" ||
						invoked === "edit-state"
					) {
						return guestResult;
					}
					if (invoked === "start") {
						started += 1;
						if (started > 1) return new Promise(() => undefined);
						return pickCapsule;
					}
					return { ok: true };
				},
			});
		}

		async function pickOnce(controller: InAppBrowserSessionController, events: DesktopBrowserTabEventEnvelope[]) {
			await controller.setPicker("ws-1", true);
			await vi.waitFor(() => {
				expect(events.some((item) => item.event.kind === "picker-result")).toBe(true);
			});
		}

		it("点选命中后 apply 注入 apply-edit 脚本并回报 edits", async () => {
			const events: DesktopBrowserTabEventEnvelope[] = [];
			const controller = new InAppBrowserSessionController((event) => events.push(event));
			const scripts: string[] = [];
			let started = 0;
			const contents = fakeContents({
				executeJavaScript: async (code) => {
					scripts.push(code);
					const invoked = /\)\("([a-z-]+)",/.exec(code)?.[1];
					if (invoked === "apply-edit")
						return { ok: true, edits: [{ kind: "style", property: "color", before: "", after: "red" }] };
					if (invoked === "start") {
						started += 1;
						if (started > 1) return new Promise(() => undefined);
						return pickCapsule;
					}
					return { ok: true };
				},
			});
			controller.attachWebContents("ws-1", contents);
			await pickOnce(controller, events);
			const pick = events.find((item) => item.event.kind === "picker-result");
			const elementRef =
				pick?.event.kind === "picker-result"
					? (pick.event.context.payload as { elementRef: unknown }).elementRef
					: undefined;
			const result = await controller.liveEdit("ws-1", elementRef, {
				type: "apply",
				edit: { kind: "style", property: "color", value: "red" },
			});
			expect(result).toMatchObject({ ok: true, edits: [{ kind: "style", property: "color", after: "red" }] });
			expect(
				scripts.some((code) => code.includes(')("apply-edit",{"kind":"style","property":"color","value":"red"}')),
			).toBe(true);
		});

		it("无浏览器会话 / 非最新选中 / 翻页或停止 picker 后拒绝 stale_reference", async () => {
			const events: DesktopBrowserTabEventEnvelope[] = [];
			const controller = new InAppBrowserSessionController((event) => events.push(event));
			controller.attachWebContents("ws-1", liveEditContents());
			await pickOnce(controller, events);
			const pick = events.find((item) => item.event.kind === "picker-result");
			const elementRef =
				pick?.event.kind === "picker-result"
					? (pick.event.context.payload as { elementRef: unknown }).elementRef
					: undefined;

			await expect(controller.liveEdit("missing", elementRef, { type: "state" })).resolves.toMatchObject({
				ok: false,
				code: "no_browser_session",
			});
			await expect(
				controller.liveEdit("ws-1", { id: "e99", pageRevision: 0 }, { type: "state" }),
			).resolves.toMatchObject({ ok: false, code: "stale_reference" });

			controller.bumpRevision("ws-1", { url: "https://example.com/next" });
			await expect(controller.liveEdit("ws-1", elementRef, { type: "state" })).resolves.toMatchObject({
				ok: false,
				code: "stale_reference",
			});
		});

		it("停止 picker 后再改同一条 ref 被拒", async () => {
			const events: DesktopBrowserTabEventEnvelope[] = [];
			const controller = new InAppBrowserSessionController((event) => events.push(event));
			controller.attachWebContents("ws-1", liveEditContents());
			await pickOnce(controller, events);
			const pick = events.find((item) => item.event.kind === "picker-result");
			const elementRef =
				pick?.event.kind === "picker-result"
					? (pick.event.context.payload as { elementRef: unknown }).elementRef
					: undefined;
			await controller.setPicker("ws-1", false);
			await expect(controller.liveEdit("ws-1", elementRef, { type: "state" })).resolves.toMatchObject({
				ok: false,
				code: "stale_reference",
			});
		});

		it("guest 返回失败或脚本不可达时映射为 apply_failed", async () => {
			const events: DesktopBrowserTabEventEnvelope[] = [];
			const controller = new InAppBrowserSessionController((event) => events.push(event));
			controller.attachWebContents("ws-1", liveEditContents({ ok: false, code: "unknown_property" }));
			await pickOnce(controller, events);
			const pick = events.find((item) => item.event.kind === "picker-result");
			const elementRef =
				pick?.event.kind === "picker-result"
					? (pick.event.context.payload as { elementRef: unknown }).elementRef
					: undefined;
			await expect(
				controller.liveEdit("ws-1", elementRef, {
					type: "apply",
					edit: { kind: "style", property: "display", value: "none" },
				}),
			).resolves.toMatchObject({ ok: false, code: "apply_failed", message: "unknown_property" });
		});
	});
});
