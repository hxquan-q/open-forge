// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";
import type { ToolRiskLevel } from "@vetta/runtime-core/task";

/**
 * 应用内 WebView 的一等 `browser_tab` 工具合同（TASK-0059 / PLAN-0006）。
 * 与 `agent-browser` CLI 是不同会话；不暴露任意 JS 执行面。
 */

export const BROWSER_TAB_TOOL_NAME = "browser_tab";

export const CODING_AGENT_BROWSER_TAB_EXTENSION_ID = "coding-agent.browser-tab";

export const BROWSER_TAB_READ_ACTIONS = ["snapshot", "inspect", "screenshot", "wait", "scroll"] as const;

export const BROWSER_TAB_WRITE_ACTIONS = ["click", "fill", "press", "navigate"] as const;

export const BROWSER_TAB_TOOL_ACTIONS = [...BROWSER_TAB_READ_ACTIONS, ...BROWSER_TAB_WRITE_ACTIONS] as const;

export type BrowserTabReadAction = (typeof BROWSER_TAB_READ_ACTIONS)[number];

export type BrowserTabWriteAction = (typeof BROWSER_TAB_WRITE_ACTIONS)[number];

export type BrowserTabToolAction = (typeof BROWSER_TAB_TOOL_ACTIONS)[number];

export const BROWSER_TAB_TOOL_ERROR_CODES = [
	"stale_reference",
	"no_browser_session",
	"policy_denied",
	"invalid_input",
	"cancelled",
	"unimplemented",
] as const;

export type BrowserTabToolErrorCode = (typeof BROWSER_TAB_TOOL_ERROR_CODES)[number];

export const BROWSER_ELEMENT_REF_ENCODING = "v1";

export const BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX = 1600;

export const BROWSER_SCREENSHOT_FORMAT = "png";

export const BrowserElementRefSchema = Type.Object(
	{
		id: Type.String({
			minLength: 1,
			maxLength: 128,
			pattern: "^[A-Za-z0-9_-]+$",
			description: "Opaque snapshot-local element id",
		}),
		pageRevision: Type.Integer({ minimum: 0, description: "Page revision embedded in the ref; never relocated" }),
	},
	{ additionalProperties: false },
);

export type BrowserElementRef = Static<typeof BrowserElementRefSchema>;

const BrowserTabSnapshotInputSchema = Type.Object(
	{
		action: Type.Literal("snapshot"),
		description: Type.Optional(Type.String()),
		interactiveOnly: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

const BrowserTabInspectInputSchema = Type.Object(
	{
		action: Type.Literal("inspect"),
		description: Type.Optional(Type.String()),
		elementRef: BrowserElementRefSchema,
	},
	{ additionalProperties: false },
);

const BrowserTabScreenshotInputSchema = Type.Object(
	{
		action: Type.Literal("screenshot"),
		description: Type.Optional(Type.String()),
		elementRef: Type.Optional(BrowserElementRefSchema),
		fullPage: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

const BrowserTabWaitInputSchema = Type.Object(
	{
		action: Type.Literal("wait"),
		description: Type.Optional(Type.String()),
		timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 60_000 })),
		elementRef: Type.Optional(BrowserElementRefSchema),
		state: Type.Optional(Type.Union([Type.Literal("visible"), Type.Literal("hidden"), Type.Literal("stable")])),
	},
	{ additionalProperties: false },
);

const BrowserTabScrollInputSchema = Type.Object(
	{
		action: Type.Literal("scroll"),
		description: Type.Optional(Type.String()),
		elementRef: Type.Optional(BrowserElementRefSchema),
		deltaX: Type.Optional(Type.Number()),
		deltaY: Type.Optional(Type.Number()),
	},
	{ additionalProperties: false },
);

const BrowserTabClickInputSchema = Type.Object(
	{
		action: Type.Literal("click"),
		description: Type.Optional(Type.String()),
		elementRef: BrowserElementRefSchema,
	},
	{ additionalProperties: false },
);

const BrowserTabFillInputSchema = Type.Object(
	{
		action: Type.Literal("fill"),
		description: Type.Optional(Type.String()),
		elementRef: BrowserElementRefSchema,
		value: Type.String({ description: "Text to type; host must not echo secrets in tool content" }),
	},
	{ additionalProperties: false },
);

const BrowserTabPressInputSchema = Type.Object(
	{
		action: Type.Literal("press"),
		description: Type.Optional(Type.String()),
		key: Type.String({ minLength: 1, maxLength: 32, description: "Key name such as Enter, Tab, or a" }),
		elementRef: Type.Optional(BrowserElementRefSchema),
	},
	{ additionalProperties: false },
);

const BrowserTabNavigateInputSchema = Type.Object(
	{
		action: Type.Literal("navigate"),
		description: Type.Optional(Type.String()),
		url: Type.String({ minLength: 1, description: "http(s) URL only; host allowlist is [*]" }),
	},
	{ additionalProperties: false },
);

export const BrowserTabToolInputSchema = Type.Union([
	BrowserTabSnapshotInputSchema,
	BrowserTabInspectInputSchema,
	BrowserTabScreenshotInputSchema,
	BrowserTabWaitInputSchema,
	BrowserTabScrollInputSchema,
	BrowserTabClickInputSchema,
	BrowserTabFillInputSchema,
	BrowserTabPressInputSchema,
	BrowserTabNavigateInputSchema,
]);

export type BrowserTabToolInput = Static<typeof BrowserTabToolInputSchema>;

export const BrowserTabToolErrorSchema = Type.Object(
	{
		ok: Type.Literal(false),
		code: Type.Union([
			Type.Literal("stale_reference"),
			Type.Literal("no_browser_session"),
			Type.Literal("policy_denied"),
			Type.Literal("invalid_input"),
			Type.Literal("cancelled"),
			Type.Literal("unimplemented"),
		]),
		message: Type.String(),
		action: Type.Optional(
			Type.Union([
				Type.Literal("snapshot"),
				Type.Literal("inspect"),
				Type.Literal("screenshot"),
				Type.Literal("wait"),
				Type.Literal("scroll"),
				Type.Literal("click"),
				Type.Literal("fill"),
				Type.Literal("press"),
				Type.Literal("navigate"),
			]),
		),
		pageRevision: Type.Optional(Type.Integer({ minimum: 0 })),
		elementRef: Type.Optional(BrowserElementRefSchema),
	},
	{ additionalProperties: false },
);

export type BrowserTabToolError = Static<typeof BrowserTabToolErrorSchema>;

export interface BrowserTabSnapshotNode {
	readonly elementRef: BrowserElementRef;
	readonly role: string;
	readonly name: string;
}

export interface BrowserTabSuccess {
	readonly ok: true;
	readonly action: BrowserTabToolAction;
	readonly pageUrl?: string;
	readonly title?: string;
	readonly pageRevision?: number;
	readonly nodes?: readonly BrowserTabSnapshotNode[];
	readonly truncated?: boolean;
	readonly inspect?: Record<string, unknown>;
	readonly screenshotAttachmentId?: string;
}

export type CodingAgentBrowserTabFunctionResult = BrowserTabSuccess | BrowserTabToolError;

export interface CodingAgentBrowserTabFunctionRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly workspaceId?: string;
	readonly input: BrowserTabToolInput;
}

export const CODING_AGENT_BROWSER_TAB_FUNCTION = defineSessionExtensionFunction<
	CodingAgentBrowserTabFunctionRequest,
	CodingAgentBrowserTabFunctionResult
>(CODING_AGENT_BROWSER_TAB_EXTENSION_ID, "invoke");

export const BROWSER_TAB_TOOL_DESCRIPTION = [
	"Operate the in-app Browser WebView that the user is looking at (same page, same session).",
	"Read actions: snapshot, inspect, screenshot, wait, scroll. Write actions: click, fill, press, navigate.",
	"snapshot returns an interactive accessibility tree with elementRef values that embed pageRevision.",
	"After navigation or DOM change, old refs return stale_reference — take a new snapshot; never guess a new locator.",
	"navigate accepts only http/https URLs. This tool cannot evaluate JavaScript, read cookies, or export tokens.",
	"This is not the agent-browser CLI; that Skill uses a separate browser session.",
].join(" ");

export function isBrowserTabToolAction(value: unknown): value is BrowserTabToolAction {
	return typeof value === "string" && (BROWSER_TAB_TOOL_ACTIONS as readonly string[]).includes(value);
}

export function isBrowserTabReadAction(value: unknown): value is BrowserTabReadAction {
	return typeof value === "string" && (BROWSER_TAB_READ_ACTIONS as readonly string[]).includes(value);
}

export function isBrowserTabWriteAction(value: unknown): value is BrowserTabWriteAction {
	return typeof value === "string" && (BROWSER_TAB_WRITE_ACTIONS as readonly string[]).includes(value);
}

export function isBrowserTabToolErrorCode(value: unknown): value is BrowserTabToolErrorCode {
	return typeof value === "string" && (BROWSER_TAB_TOOL_ERROR_CODES as readonly string[]).includes(value);
}

export function encodeBrowserElementRef(ref: BrowserElementRef): string {
	return `${BROWSER_ELEMENT_REF_ENCODING}:${ref.pageRevision}:${ref.id}`;
}

export function readBrowserElementRef(value: unknown): BrowserElementRef | undefined {
	if (typeof value === "string") {
		const match = /^v1:(\d+):([A-Za-z0-9_-]+)$/.exec(value);
		if (!match) return undefined;
		const pageRevision = Number(match[1]);
		const id = match[2];
		if (!Number.isInteger(pageRevision) || pageRevision < 0 || !id) return undefined;
		return { id, pageRevision };
	}
	return Value.Check(BrowserElementRefSchema, value) ? value : undefined;
}

export function isAllowedBrowserTabUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

export function readBrowserTabToolInput(value: unknown): BrowserTabToolInput | undefined {
	if (!Value.Check(BrowserTabToolInputSchema, value)) return undefined;
	if (value.action === "navigate" && !isAllowedBrowserTabUrl(value.url)) return undefined;
	return value;
}

export function readBrowserTabToolError(value: unknown): BrowserTabToolError | undefined {
	return Value.Check(BrowserTabToolErrorSchema, value) ? value : undefined;
}

/** 写类动作提升到 L3，走现有 Tool Approval；读类保持描述符默认 L0。 */
export function raiseBrowserTabToolRisk(input: Readonly<Record<string, unknown>>): ToolRiskLevel | undefined {
	return isBrowserTabWriteAction(input.action) ? "L3" : undefined;
}

export function browserTabToolError(
	code: BrowserTabToolErrorCode,
	message: string,
	extras: Omit<BrowserTabToolError, "ok" | "code" | "message"> = {},
): BrowserTabToolError {
	return { ok: false, code, message, ...extras };
}

export function formatBrowserTabToolResult(result: CodingAgentBrowserTabFunctionResult): RuntimeToolResult {
	if (!result.ok) {
		return {
			content: [{ type: "text", text: formatBrowserTabToolError(result) }],
			details: result,
			isError: true,
		};
	}
	return {
		content: [{ type: "text", text: formatBrowserTabToolSuccess(result) }],
		details: result,
	};
}

function formatBrowserTabToolSuccess(result: BrowserTabSuccess): string {
	if (result.action === "snapshot") {
		const nodes = result.nodes ?? [];
		const head = `snapshot pageRevision=${result.pageRevision ?? "?"} url=${result.pageUrl ?? ""}${result.truncated ? " (truncated)" : ""}`;
		if (nodes.length === 0) return `${head}\n(no interactive nodes)`;
		return [
			head,
			...nodes.map(
				(node) =>
					`- ${encodeBrowserElementRef(node.elementRef)} role=${node.role} name=${JSON.stringify(node.name)}`,
			),
		].join("\n");
	}
	if (result.action === "inspect") {
		return `inspect pageRevision=${result.pageRevision ?? "?"} ${JSON.stringify(result.inspect ?? {})}`;
	}
	if (result.action === "screenshot") {
		return `screenshot captured${result.screenshotAttachmentId ? ` attachment=${result.screenshotAttachmentId}` : ""}.`;
	}
	return `${result.action} ok${result.pageRevision === undefined ? "" : ` pageRevision=${result.pageRevision}`}.`;
}

function formatBrowserTabToolError(error: BrowserTabToolError): string {
	if (error.code === "stale_reference") {
		return `stale_reference: pageRevision is now ${error.pageRevision ?? "?"}; take a new snapshot before acting.`;
	}
	if (error.code === "no_browser_session") {
		return "no_browser_session: the in-app WebView is not available.";
	}
	if (error.code === "policy_denied") {
		return `policy_denied: ${error.message}`;
	}
	return `${error.code}: ${error.message}`;
}
