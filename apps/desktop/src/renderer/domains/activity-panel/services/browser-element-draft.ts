// Copyright The Open Forge contributors.
import type { RegisteredPromptAttachment } from "@shared/store/atoms";
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	type BrowserElementSelectionContext,
	readBrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";

export const BROWSER_ELEMENT_ATTACHMENT_OWNER = "vetta.browser";
export const BROWSER_ELEMENT_ATTACHMENT_ID = BROWSER_ELEMENT_SELECTION_SCHEMA;

export interface BrowserElementDraftPorts {
	getAttachment: () => RegisteredPromptAttachment | null;
	setAttachment: (attachment: RegisteredPromptAttachment | null) => void;
	insertImage: (path: string) => void;
	removeImage: (path: string) => void;
}

let lastScreenshotPath: string | undefined;

export function isBrowserElementAttachment(attachment: RegisteredPromptAttachment | null): boolean {
	return (
		attachment?.id === BROWSER_ELEMENT_ATTACHMENT_ID && attachment.ownerPluginId === BROWSER_ELEMENT_ATTACHMENT_OWNER
	);
}

export function createBrowserElementAttachment(
	context: BrowserElementSelectionContext,
	label: string,
): RegisteredPromptAttachment {
	const name = context.payload.accessibleName || context.payload.role || context.payload.domPath;
	return {
		id: BROWSER_ELEMENT_ATTACHMENT_ID,
		ownerPluginId: BROWSER_ELEMENT_ATTACHMENT_OWNER,
		label,
		labels: [name],
		icon: "icon-[mdi--cursor-default-click-outline]",
		lifecycle: "once",
		context,
	};
}

export function applyBrowserElementSelectionToDraft(
	ports: BrowserElementDraftPorts,
	input: {
		context: unknown;
		label: string;
		screenshotPath?: string;
		/** 为 false 时只记住路径，不插入输入框。发送失败后再插入。 */
		stageScreenshot?: boolean;
	},
): BrowserElementSelectionContext | undefined {
	const context = readBrowserElementSelectionContext(input.context);
	if (!context) return undefined;
	if (lastScreenshotPath) ports.removeImage(lastScreenshotPath);
	lastScreenshotPath = undefined;
	ports.setAttachment(createBrowserElementAttachment(context, input.label));
	if (input.screenshotPath) {
		lastScreenshotPath = input.screenshotPath;
		if (input.stageScreenshot !== false) ports.insertImage(input.screenshotPath);
	}
	return context;
}

export function resetBrowserElementDraftForTests(): void {
	lastScreenshotPath = undefined;
}

export function readLastBrowserScreenshotPathForTests(): string | undefined {
	return lastScreenshotPath;
}
