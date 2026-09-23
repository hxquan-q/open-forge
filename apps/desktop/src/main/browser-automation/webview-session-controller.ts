// Copyright The Open Forge contributors.
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	BROWSER_SCREENSHOT_FORMAT,
	type BrowserElementRef,
	type BrowserElementSelectionContext,
	readBrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import type {
	DesktopBrowserCropRect,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserTabEventEnvelope,
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
	capturePage(): Promise<InAppBrowserNativeImage>;
}

export type InAppBrowserEventSink = (envelope: DesktopBrowserTabEventEnvelope) => void;

export type PersistBrowserScreenshot = (
	sessionId: string,
	images: readonly { id: string; mimeType: string; source: { kind: "bytes"; data: Buffer } }[],
) => Promise<readonly { path: string; width?: number; height?: number }[]>;

async function persistBrowserScreenshotDefault(
	sessionId: string,
	images: readonly { id: string; mimeType: string; source: { kind: "bytes"; data: Buffer } }[],
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
	pickerWaiter: Promise<void> | null;
	lastPickDevicePixelRatio?: number;
}

export class InAppBrowserSessionController {
	private readonly sessions = new Map<string, WorkspaceSession>();
	private readonly contentsToWorkspace = new Map<number, string>();
	private readonly pendingContents = new Map<number, InAppBrowserWebContents>();

	constructor(
		private readonly sink: InAppBrowserEventSink,
		private readonly persistScreenshot: PersistBrowserScreenshot = persistBrowserScreenshotDefault,
	) {}

	attachUnboundWebContents(webContents: InAppBrowserWebContents): void {
		this.pendingContents.set(webContents.id, webContents);
		for (const session of this.sessions.values()) {
			if (!session.webContents || session.webContents.isDestroyed()) {
				this.attachWebContents(session.workspaceId, webContents);
				return;
			}
		}
	}

	attachWebContents(workspaceId: string, webContents: InAppBrowserWebContents): DesktopBrowserTabSession {
		const session = this.ensureSession(workspaceId);
		if (session.webContents && session.webContents.id !== webContents.id) this.unbindContents(session.webContents);
		this.pendingContents.delete(webContents.id);
		session.webContents = webContents;
		this.contentsToWorkspace.set(webContents.id, workspaceId);
		this.syncPageIdentity(session, webContents);
		this.emitSession(session);
		if (session.pickerEnabled) void this.runPicker(session);
		void this.installObserver(session);
		return this.toPublic(session);
	}

	detachWebContents(webContents: InAppBrowserWebContents): void {
		this.pendingContents.delete(webContents.id);
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
		const session = this.ensureSession(workspaceId);
		if (!session.webContents || session.webContents.isDestroyed()) {
			const pending = this.pendingContents.values().next().value as InAppBrowserWebContents | undefined;
			if (pending) this.attachWebContents(workspaceId, pending);
		}
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
			const size = next.getSize();
			const attachmentId = `browser-el-${Date.now().toString(36)}`;
			const persisted = await this.persistScreenshot(`browser-${workspaceId}`, [
				{ id: attachmentId, mimeType: "image/png", source: { kind: "bytes", data: png } },
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

	private async stopPicker(session: WorkspaceSession): Promise<void> {
		const contents = session.webContents;
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

	private async waitForPick(
		session: WorkspaceSession,
		contents: InAppBrowserWebContents,
	): Promise<"picked" | "cancelled" | "idle"> {
		let raw: unknown;
		try {
			raw = await contents.executeJavaScript(buildInAppBrowserGuestScript("start"));
		} catch {
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
