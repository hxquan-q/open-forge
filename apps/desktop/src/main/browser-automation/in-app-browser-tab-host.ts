// Copyright The Open Forge contributors.
import {
	type BrowserElementRef,
	type BrowserTabToolInput,
	browserTabToolError,
	type CodingAgentBrowserTabFunctionRequest,
	type CodingAgentBrowserTabFunctionResult,
	isAllowedBrowserTabUrl,
} from "@vetta/coding-agent/function-extensions";
import { buildBrowserTabGuestScript } from "./webview-agent-guest.js";
import { getInAppBrowserSessionController, type InAppBrowserSessionController } from "./webview-session-controller.js";

interface StoredLocator {
	readonly xpath: string;
	readonly pageRevision: number;
	readonly boundingRect?: { x: number; y: number; width: number; height: number };
}

const locatorsByWorkspace = new Map<string, Map<string, StoredLocator>>();

export interface BrowserTabHostDependencies {
	readonly resolveWorkspaceId: (sessionId: string, requested?: string) => string | undefined;
	readonly controller: InAppBrowserSessionController;
}

export async function createDesktopBrowserTabHostDependencies(): Promise<BrowserTabHostDependencies> {
	// 延迟加载 runtime：避免把 Electron 侧依赖拉进单测进程。
	const { getSharedRuntime } = await import("../runtime.js");
	return {
		resolveWorkspaceId(sessionId, requested) {
			if (requested?.trim()) return requested.trim();
			return getSharedRuntime().readSessionWorkingDirectory(sessionId) ?? undefined;
		},
		controller: getInAppBrowserSessionController(),
	};
}

export async function invokeDesktopBrowserTab(
	request: CodingAgentBrowserTabFunctionRequest,
	signal: AbortSignal,
	deps?: BrowserTabHostDependencies,
): Promise<CodingAgentBrowserTabFunctionResult> {
	if (signal.aborted) {
		return browserTabToolError("cancelled", "cancelled", { action: request.input.action });
	}
	const resolvedDeps = deps ?? (await createDesktopBrowserTabHostDependencies());
	const workspaceId = resolvedDeps.resolveWorkspaceId(request.sessionId, request.workspaceId);
	if (!workspaceId) {
		return browserTabToolError("no_browser_session", "no in-app browser workspace", { action: request.input.action });
	}
	const contents = resolvedDeps.controller.getWebContents(workspaceId);
	if (!contents) {
		return browserTabToolError("no_browser_session", "the in-app WebView is not available.", {
			action: request.input.action,
		});
	}
	const session = resolvedDeps.controller.getSession(workspaceId);
	const execute = async (code: string): Promise<unknown> => {
		try {
			return await contents.executeJavaScript(code);
		} catch (error) {
			if (contents.isDestroyed()) {
				throw new BrowserTabContentsGoneError();
			}
			throw error;
		}
	};
	const activity = resolvedDeps.controller.beginAgentAction(workspaceId, request.input.action);
	const finishActivity = (): void => activity.dispose();
	signal.addEventListener("abort", finishActivity, { once: true });
	if (signal.aborted) finishActivity();
	try {
		return await dispatchBrowserTabAction(request.input, {
			workspaceId,
			pageRevision: session.pageRevision,
			pageUrl: session.pageUrl || contents.getURL(),
			title: session.title || contents.getTitle(),
			controller: resolvedDeps.controller,
			execute,
			loadURL: contents.loadURL ? (url) => contents.loadURL?.(url) ?? Promise.resolve() : undefined,
			signal,
		});
	} catch (error) {
		if (signal.aborted || error instanceof BrowserTabContentsGoneError) {
			return browserTabToolError(
				signal.aborted ? "cancelled" : "no_browser_session",
				signal.aborted ? "cancelled" : "the in-app WebView was destroyed mid-action.",
				{ action: request.input.action },
			);
		}
		throw error;
	} finally {
		signal.removeEventListener("abort", finishActivity);
		finishActivity();
	}
}

class BrowserTabContentsGoneError extends Error {}

interface ActionContext {
	readonly workspaceId: string;
	readonly pageRevision: number;
	readonly pageUrl: string;
	readonly title: string;
	readonly controller: InAppBrowserSessionController;
	readonly execute: (code: string) => Promise<unknown>;
	readonly loadURL?: (url: string) => Promise<void>;
	readonly signal: AbortSignal;
}

async function dispatchBrowserTabAction(
	input: BrowserTabToolInput,
	context: ActionContext,
): Promise<CodingAgentBrowserTabFunctionResult> {
	if (input.action === "snapshot") {
		const raw = await context.execute(
			buildBrowserTabGuestScript({ kind: "snapshot", interactiveOnly: input.interactiveOnly !== false }),
		);
		const parsed = readSnapshotPayload(raw);
		const locators = new Map<string, StoredLocator>();
		const nodes = parsed.nodes.map((node) => {
			const elementRef = context.controller.createElementRef(context.workspaceId) ?? {
				id: `e${locators.size + 1}`,
				pageRevision: context.pageRevision,
			};
			locators.set(elementRef.id, {
				xpath: node.xpath,
				pageRevision: elementRef.pageRevision,
				boundingRect: node.boundingRect,
			});
			return { elementRef, role: node.role, name: node.name };
		});
		locatorsByWorkspace.set(context.workspaceId, locators);
		return {
			ok: true,
			action: "snapshot",
			pageUrl: context.pageUrl,
			title: context.title,
			pageRevision: context.pageRevision,
			nodes,
			truncated: parsed.truncated,
		};
	}
	if (input.action === "navigate") {
		if (!isAllowedBrowserTabUrl(input.url)) {
			return browserTabToolError("policy_denied", "navigate requires a valid http/https or file URL", {
				action: "navigate",
			});
		}
		if (!context.loadURL) {
			return browserTabToolError("unimplemented", "WebView cannot navigate", { action: "navigate" });
		}
		await context.loadURL(input.url);
		const pageRevision = context.controller.bumpRevision(context.workspaceId, { url: input.url });
		return {
			ok: true,
			action: "navigate",
			pageUrl: input.url,
			pageRevision,
		};
	}
	if (input.action === "screenshot") {
		if (input.elementRef) {
			const located = locateRef(context, input.elementRef, input.action);
			if (!located.ok) return located.error;
			if (!located.locator.boundingRect) {
				return browserTabToolError("invalid_input", "element has no bounding rect", { action: "screenshot" });
			}
			const shot = await context.controller.cropScreenshot(context.workspaceId, located.locator.boundingRect, 1);
			if (!shot.ok) {
				return browserTabToolError("no_browser_session", shot.message, { action: "screenshot" });
			}
			return {
				ok: true,
				action: "screenshot",
				screenshotAttachmentId: shot.attachmentId,
				pageRevision: context.pageRevision,
			};
		}
		const shot = await context.controller.captureScreenshot(context.workspaceId, input.fullPage === true);
		if (!shot.ok) {
			return browserTabToolError("no_browser_session", shot.message, { action: "screenshot" });
		}
		return {
			ok: true,
			action: "screenshot",
			screenshotAttachmentId: shot.attachmentId,
			pageRevision: context.pageRevision,
		};
	}
	if (input.action === "inspect" || input.action === "click" || input.action === "fill") {
		const located = locateRef(context, input.elementRef, input.action);
		if (!located.ok) return located.error;
		if (context.signal.aborted) {
			return browserTabToolError("cancelled", "cancelled", { action: input.action });
		}
		if (input.action === "inspect") {
			const raw = await context.execute(
				buildBrowserTabGuestScript({ kind: "inspect", xpath: located.locator.xpath }),
			);
			const inspect = asRecord(raw);
			return {
				ok: true,
				action: "inspect",
				pageRevision: context.pageRevision,
				inspect: asRecord(inspect?.inspect) ?? inspect ?? {},
			};
		}
		const raw = await context.execute(
			buildBrowserTabGuestScript({
				kind: input.action,
				xpath: located.locator.xpath,
				...(input.action === "fill" ? { value: input.value } : {}),
			}),
		);
		if (asRecord(raw)?.ok === false) {
			return browserTabToolError("invalid_input", "element is not available on this revision", {
				action: input.action,
			});
		}
		return { ok: true, action: input.action, pageRevision: context.pageRevision };
	}
	if (input.action === "press" || input.action === "scroll" || input.action === "wait") {
		let xpath: string | undefined;
		if ("elementRef" in input && input.elementRef) {
			const located = locateRef(context, input.elementRef, input.action);
			if (!located.ok) return located.error;
			xpath = located.locator.xpath;
		}
		const raw = await context.execute(
			buildBrowserTabGuestScript({
				kind: input.action,
				xpath,
				...(input.action === "press" ? { key: input.key } : {}),
				...(input.action === "scroll" ? { deltaX: input.deltaX, deltaY: input.deltaY } : {}),
				...(input.action === "wait" ? { timeoutMs: input.timeoutMs, state: input.state } : {}),
			}),
		);
		if (asRecord(raw)?.ok === false) {
			return browserTabToolError("invalid_input", "wait/scroll target is not available", { action: input.action });
		}
		return { ok: true, action: input.action, pageRevision: context.pageRevision };
	}
	return browserTabToolError("invalid_input", "unsupported browser_tab action");
}

function locateRef(
	context: ActionContext,
	ref: BrowserElementRef,
	action: BrowserTabToolInput["action"],
): { ok: true; locator: StoredLocator } | { ok: false; error: CodingAgentBrowserTabFunctionResult } {
	const validated = context.controller.validateElementRef(context.workspaceId, ref);
	if (!validated.ok) {
		return {
			ok: false,
			error: browserTabToolError(
				validated.code === "stale_reference" ? "stale_reference" : "invalid_input",
				validated.code,
				{
					action,
					pageRevision: context.pageRevision,
					elementRef: ref,
				},
			),
		};
	}
	const locator = locatorsByWorkspace.get(context.workspaceId)?.get(ref.id);
	if (!locator) {
		return {
			ok: false,
			error: browserTabToolError("invalid_input", "unknown elementRef; take a snapshot first", {
				action,
				elementRef: ref,
			}),
		};
	}
	return { ok: true, locator };
}

function readSnapshotPayload(raw: unknown): {
	nodes: Array<{ role: string; name: string; xpath: string; boundingRect: StoredLocator["boundingRect"] }>;
	truncated: boolean;
} {
	const record = asRecord(raw);
	const nodes: Array<{ role: string; name: string; xpath: string; boundingRect: StoredLocator["boundingRect"] }> = [];
	if (Array.isArray(record?.nodes)) {
		for (const item of record.nodes) {
			const node = asRecord(item);
			if (!node || typeof node.xpath !== "string") continue;
			const rect = asRecord(node.boundingRect);
			nodes.push({
				role: typeof node.role === "string" ? node.role : "generic",
				name: typeof node.name === "string" ? node.name : "",
				xpath: node.xpath,
				boundingRect:
					rect &&
					typeof rect.x === "number" &&
					typeof rect.y === "number" &&
					typeof rect.width === "number" &&
					typeof rect.height === "number"
						? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
						: undefined,
			});
		}
	}
	return { nodes, truncated: record?.truncated === true };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function resetDesktopBrowserTabHostForTests(): void {
	locatorsByWorkspace.clear();
}
