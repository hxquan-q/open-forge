// Copyright The Open Forge contributors.
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	BROWSER_SCREENSHOT_FORMAT,
	type BrowserElementLiveEdit,
	type BrowserElementRef,
	type BrowserElementSelectionContext,
	readBrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import type {
	DesktopBrowserCropRect,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserLiveEditAction,
	DesktopBrowserTabEventEnvelope,
	DesktopBrowserTabLiveEditResult,
	DesktopBrowserTabSession,
} from "../../shared/browser-tab-ipc.js";
import { readExtractedBrowserElement } from "./webview-element-extract.js";
import { createBrowserElementRef, validateBrowserElementRef } from "./webview-element-ref.js";
import { buildInAppBrowserGuestScript } from "./webview-picker-guest.js";
import { resolveCaptureCrop, scaledScreenshotSize } from "./webview-screenshot-crop.js";

export const IN_APP_BROWSER_PARTITION = "persist:vetta-browser";

export interface InAppBrowserNativeImage {
	getSize(): { width: number; height: number };
	crop(rect: { x: number; y: number; width: number; height: number }): InAppBrowserNativeImage;
	resize(options: { width: number; height: number }): InAppBrowserNativeImage;
	toPNG(): Buffer;
}

export interface InAppBrowserWebContents {
	readonly id: number;
	isDestroyed(): boolean;
	getURL(): string;
	getTitle(): string;
	executeJavaScript(code: string): Promise<unknown>;
	capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<InAppBrowserNativeImage>;
	loadURL?(url: string): Promise<void>;
}

export type InAppBrowserEventSink = (envelope: DesktopBrowserTabEventEnvelope) => void;

type PickerOutcome = "picked" | "cancelled" | "idle";

export type PersistBrowserScreenshot = (
	sessionId: string,
	images: readonly { id: string; mimeType: string; source: { kind: "bytes"; data: ArrayBuffer } }[],
) => Promise<readonly { path: string; width?: number; height?: number }[]>;

async function persistBrowserScreenshotDefault(
	sessionId: string,
	images: readonly { id: string; mimeType: string; source: { kind: "bytes"; data: ArrayBuffer } }[],
): Promise<readonly { path: string; width?: number; height?: number }[]> {
	const { persistImageFileCache } = await import("../image-cache/image-cache-service.js");
	return persistImageFileCache(sessionId, images);
}

interface WorkspaceSession {
	workspaceId: string;
	pageUrl: string;
	title: string;
	pageRevision: number;
	pickerEnabled: boolean;
	nextElementId: number;
	webContents: InAppBrowserWebContents | null;
	pickerWaiter: Promise<PickerOutcome> | null;
	lastPickDevicePixelRatio?: number;
	/** 最近一次 picker-result 的 ref；live-edit 只作用于它，防止改到过期元素。 */
	lastPickedRef: BrowserElementRef | null;
}

export class InAppBrowserSessionController {
	private readonly sessions = new Map<string, WorkspaceSession>();
	private readonly contentsToWorkspace = new Map<number, string>();

	constructor(
		private readonly sink: InAppBrowserEventSink,
		private readonly persistScreenshot: PersistBrowserScreenshot = persistBrowserScreenshotDefault,
	) {}

	attachWebContents(workspaceId: string, webContents: InAppBrowserWebContents): DesktopBrowserTabSession {
		const session = this.ensureSession(workspaceId);
		if (session.webContents && session.webContents.id !== webContents.id) this.unbindContents(session.webContents);
		session.webContents = webContents;
		this.contentsToWorkspace.set(webContents.id, workspaceId);
		this.syncPageIdentity(session, webContents);
		this.emitSession(session);
		if (session.pickerEnabled) void this.runPicker(session);
		void this.installObserver(session);
		return this.toPublic(session);
	}

	detachWebContents(webContents: InAppBrowserWebContents): void {
		const workspaceId = this.contentsToWorkspace.get(webContents.id);
		if (!workspaceId) return;
		const session = this.sessions.get(workspaceId);
		if (!session || session.webContents?.id !== webContents.id) return;
		session.webContents = null;
		this.contentsToWorkspace.delete(webContents.id);
		this.emitSession(session);
	}

	workspaceIdForContents(webContentsId: number): string | undefined {
		return this.contentsToWorkspace.get(webContentsId);
	}

	getSession(workspaceId: string): DesktopBrowserTabSession {
		return this.toPublic(this.ensureSession(workspaceId));
	}

	getWebContents(workspaceId: string): InAppBrowserWebContents | null {
		const contents = this.sessions.get(workspaceId)?.webContents ?? null;
		return contents && !contents.isDestroyed() ? contents : null;
	}

	createElementRef(workspaceId: string): BrowserElementRef | undefined {
		const session = this.sessions.get(workspaceId);
		if (!session) return undefined;
		session.nextElementId += 1;
		return createBrowserElementRef(session.pageRevision, session.nextElementId);
	}

	validateElementRef(workspaceId: string, ref: unknown): ReturnType<typeof validateBrowserElementRef> {
		return validateBrowserElementRef(ref, this.sessions.get(workspaceId) ?? null);
	}

	bumpRevision(workspaceId: string, page?: { url?: string; title?: string }): number {
		const session = this.ensureSession(workspaceId);
		session.pageRevision += 1;
		session.lastPickedRef = null;
		if (page?.url && page.url !== "about:blank") session.pageUrl = page.url;
		if (typeof page?.title === "string") session.title = page.title;
		this.emitRevision(session);
		this.emitSession(session);
		if (session.pickerEnabled) void this.runPicker(session);
		return session.pageRevision;
	}

	async setPicker(workspaceId: string, enabled: boolean): Promise<boolean> {
		const session = this.ensureSession(workspaceId);
		session.pickerEnabled = enabled;
		if (enabled) void this.runPicker(session);
		else await this.stopPicker(session);
		this.emitSession(session);
		return session.pickerEnabled;
	}

	async cropScreenshot(
		workspaceId: string,
		rect: DesktopBrowserCropRect,
		devicePixelRatio: number,
	): Promise<DesktopBrowserCropScreenshotResult> {
		const session = this.sessions.get(workspaceId);
		const contents = session?.webContents;
		if (!session || !contents || contents.isDestroyed()) {
			return { ok: false, code: "no_browser_session", message: "no in-app browser page" };
		}
		try {
			await contents.executeJavaScript(buildInAppBrowserGuestScript("hide-overlay"));
			const image = await contents.capturePage();
			await contents.executeJavaScript(buildInAppBrowserGuestScript("show-overlay"));
			const crop = resolveCaptureCrop({
				rect,
				devicePixelRatio: session.lastPickDevicePixelRatio ?? devicePixelRatio,
				imageSize: image.getSize(),
			});
			if (!crop) return { ok: false, code: "crop_failed", message: "element is not visible" };
			let next = image.crop(crop.rect);
			if (crop.scale < 1) next = next.resize(scaledScreenshotSize(crop));
			const png = next.toPNG();
			// Copy out of Node's shared Buffer pool: the image cache owns the bytes past this call.
			const pngBytes = new Uint8Array(png.byteLength);
			pngBytes.set(png);
			const size = next.getSize();
			const attachmentId = `browser-el-${Date.now().toString(36)}`;
			const persisted = await this.persistScreenshot(`browser-${workspaceId}`, [
				{ id: attachmentId, mimeType: "image/png", source: { kind: "bytes", data: pngBytes.buffer } },
			]);
			const path = persisted[0]?.path;
			if (!path) return { ok: false, code: "crop_failed", message: "could not persist screenshot" };
			return {
				ok: true,
				attachmentId,
				mimeType: BROWSER_SCREENSHOT_FORMAT,
				width: persisted[0]?.width ?? size.width,
				height: persisted[0]?.height ?? size.height,
				path,
			};
		} catch {
			return { ok: false, code: "crop_failed", message: "could not capture element" };
		}
	}

	/**
	 * `browser_tab.screenshot`：整页或视口截图（与元素裁剪不同路径）。
	 * fullPage 先量文档滚动尺寸再整段 capturePage，视口截图不指定 rect。
	 */
	async captureScreenshot(
		workspaceId: string,
		fullPage: boolean,
	): Promise<
		| { ok: true; attachmentId: string; mimeType: string; width?: number; height?: number; path: string }
		| { ok: false; code: string; message: string }
	> {
		const session = this.sessions.get(workspaceId);
		const contents = session?.webContents;
		if (!session || !contents || contents.isDestroyed()) {
			return { ok: false, code: "no_browser_session", message: "no in-app browser page" };
		}
		try {
			let rect: { x: number; y: number; width: number; height: number } | undefined;
			if (fullPage) {
				const measured = (await contents.executeJavaScript(
					"({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})",
				)) as { w?: number; h?: number } | undefined;
				if (measured?.w && measured.h) rect = { x: 0, y: 0, width: measured.w, height: measured.h };
			}
			const image = await contents.capturePage(rect);
			const png = image.toPNG();
			const pngBytes = new Uint8Array(png.byteLength);
			pngBytes.set(png);
			const size = image.getSize();
			const attachmentId = `browser-shot-${Date.now().toString(36)}`;
			const persisted = await this.persistScreenshot(`browser-${workspaceId}`, [
				{ id: attachmentId, mimeType: "image/png", source: { kind: "bytes", data: pngBytes.buffer } },
			]);
			const path = persisted[0]?.path;
			if (!path) return { ok: false, code: "capture_failed", message: "could not persist screenshot" };
			return {
				ok: true,
				attachmentId,
				mimeType: BROWSER_SCREENSHOT_FORMAT,
				width: persisted[0]?.width ?? size.width,
				height: persisted[0]?.height ?? size.height,
				path,
			};
		} catch {
			return { ok: false, code: "capture_failed", message: "could not capture page" };
		}
	}

	private ensureSession(workspaceId: string): WorkspaceSession {
		const existing = this.sessions.get(workspaceId);
		if (existing) return existing;
		const created: WorkspaceSession = {
			workspaceId,
			pageUrl: "",
			title: "",
			pageRevision: 0,
			pickerEnabled: false,
			nextElementId: 0,
			webContents: null,
			pickerWaiter: null,
			lastPickDevicePixelRatio: undefined,
			lastPickedRef: null,
		};
		this.sessions.set(workspaceId, created);
		return created;
	}

	private unbindContents(contents: InAppBrowserWebContents | null): void {
		if (!contents) return;
		this.contentsToWorkspace.delete(contents.id);
	}

	private syncPageIdentity(session: WorkspaceSession, contents: InAppBrowserWebContents): void {
		const url = contents.getURL();
		if (url && url !== "about:blank") session.pageUrl = url;
		session.title = contents.getTitle();
	}

	private async installObserver(session: WorkspaceSession): Promise<void> {
		const contents = session.webContents;
		if (!contents || contents.isDestroyed()) return;
		try {
			await contents.executeJavaScript(buildInAppBrowserGuestScript("install-observer"));
		} catch {
			// Guest may not be ready yet; the next bump/dom-ready retries.
		}
	}

	/**
	 * 点选命中后的页面内即时预览（TASK-0085）：改动只落到 WebView DOM，
	 * 不写源码；picker 停止/页面改版时自动还原。
	 */
	async liveEdit(
		workspaceId: string,
		elementRef: unknown,
		action: DesktopBrowserLiveEditAction,
	): Promise<DesktopBrowserTabLiveEditResult> {
		const session = this.sessions.get(workspaceId);
		const contents = session?.webContents;
		if (!session || !contents || contents.isDestroyed()) {
			return { ok: false, code: "no_browser_session", message: "no in-app browser page" };
		}
		const parsed = this.validateElementRef(workspaceId, elementRef);
		if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.code };
		if (!session.lastPickedRef || parsed.ref.id !== session.lastPickedRef.id) {
			return { ok: false, code: "stale_reference", message: "element is not the latest pick" };
		}
		const [command, arg] =
			action.type === "apply"
				? (["apply-edit", action.edit] as const)
				: action.type === "revert"
					? typeof action.index === "number"
						? (["revert-edit", { index: action.index }] as const)
						: (["revert-all-edits", undefined] as const)
					: (["edit-state", undefined] as const);
		try {
			const raw = (await contents.executeJavaScript(buildInAppBrowserGuestScript(command, arg))) as
				| { ok: true; edits?: unknown; hasElement?: boolean }
				| { ok: false; code: string }
				| undefined;
			if (!raw || typeof raw !== "object" || raw.ok !== true) {
				return {
					ok: false,
					code: "apply_failed",
					message: raw && typeof raw === "object" && "code" in raw ? String(raw.code) : "guest rejected edit",
				};
			}
			const edits = Array.isArray(raw.edits) ? (raw.edits as BrowserElementLiveEdit[]) : [];
			return { ok: true, edits, hasElement: raw.hasElement === true };
		} catch {
			return { ok: false, code: "apply_failed", message: "could not reach in-app browser page" };
		}
	}

	private async stopPicker(session: WorkspaceSession): Promise<void> {
		const contents = session.webContents;
		session.lastPickedRef = null;
		if (!contents || contents.isDestroyed()) return;
		try {
			await contents.executeJavaScript(buildInAppBrowserGuestScript("stop"));
		} catch {
			// Destroyed or navigated guests do not need a second stop.
		}
	}

	private async runPicker(session: WorkspaceSession): Promise<void> {
		const contents = session.webContents;
		if (!session.pickerEnabled || !contents || contents.isDestroyed()) return;
		if (session.pickerWaiter) return;
		const wait = this.waitForPick(session, contents);
		session.pickerWaiter = wait;
		try {
			const outcome = await wait;
			if (session.pickerWaiter === wait) session.pickerWaiter = null;
			if (session.pickerEnabled && outcome !== "cancelled") void this.runPicker(session);
		} finally {
			if (session.pickerWaiter === wait) session.pickerWaiter = null;
		}
	}

	private async waitForPick(session: WorkspaceSession, contents: InAppBrowserWebContents): Promise<PickerOutcome> {
		let raw: unknown;
		try {
			raw = await contents.executeJavaScript(buildInAppBrowserGuestScript("start"));
		} catch (error) {
			// 注入脚本自身抛错（历史上是打包器辅助函数缺失，BUG-0051）此前被静默吞掉，
			// 面板上只表现为「点选没反应」；这里留下证据再回到 idle。
			console.error("[browser-picker] guest start failed", { workspaceId: session.workspaceId, error });
			return "idle";
		}
		if (!session.pickerEnabled) return "idle";
		if (!raw || typeof raw !== "object") return "idle";
		if ("cancelled" in raw) {
			session.pickerEnabled = false;
			this.emitSession(session);
			return "cancelled";
		}
		const extracted = readExtractedBrowserElement(raw);
		if (!extracted) return "idle";
		this.syncPageIdentity(session, contents);
		const pageUrl = session.pageUrl || contents.getURL();
		if (!pageUrl || pageUrl === "about:blank") return "idle";
		session.lastPickDevicePixelRatio = extracted.devicePixelRatio;
		session.nextElementId += 1;
		const elementRef = createBrowserElementRef(session.pageRevision, session.nextElementId);
		session.lastPickedRef = elementRef;
		const context = readBrowserElementSelectionContext({
			schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
			version: BROWSER_ELEMENT_SELECTION_VERSION,
			payload: {
				pageUrl,
				title: session.title.slice(0, 512),
				elementRef,
				pageRevision: session.pageRevision,
				role: extracted.role,
				accessibleName: extracted.accessibleName,
				attributes: extracted.attributes,
				domPath: extracted.domPath,
				xpath: extracted.xpath,
				computedStyle: extracted.computedStyle,
				outerHTML: extracted.outerHTML,
				surroundingText: extracted.surroundingText,
				boundingRect: extracted.boundingRect,
			},
		});
		if (!context) return "idle";
		this.emitPickerResult(session.workspaceId, context);
		return "picked";
	}

	private emitPickerResult(workspaceId: string, context: BrowserElementSelectionContext): void {
		this.sink({ workspaceId, event: { kind: "picker-result", context } });
	}

	private emitRevision(session: WorkspaceSession): void {
		this.sink({
			workspaceId: session.workspaceId,
			event: { kind: "page-revision", workspaceId: session.workspaceId, pageRevision: session.pageRevision },
		});
	}

	private emitSession(session: WorkspaceSession): void {
		this.sink({
			workspaceId: session.workspaceId,
			event: { kind: "session-changed", session: this.toPublic(session) },
		});
	}

	private toPublic(session: WorkspaceSession): DesktopBrowserTabSession {
		return {
			workspaceId: session.workspaceId,
			pageUrl: session.pageUrl,
			title: session.title,
			pageRevision: session.pageRevision,
			pickerEnabled: session.pickerEnabled,
		};
	}
}

let sharedController: InAppBrowserSessionController | undefined;
let eventSink: InAppBrowserEventSink = () => undefined;

export function setInAppBrowserEventSink(sink: InAppBrowserEventSink): void {
	eventSink = sink;
}

export function getInAppBrowserSessionController(): InAppBrowserSessionController {
	sharedController ??= new InAppBrowserSessionController((envelope) => eventSink(envelope));
	return sharedController;
}

export function resetInAppBrowserSessionControllerForTests(): void {
	sharedController = undefined;
	eventSink = () => undefined;
}
