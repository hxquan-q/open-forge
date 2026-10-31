// Copyright The Open Forge contributors.
import { type Static, type TSchema, Type } from "@sinclair/typebox";
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

/** snapshot 打印给模型的不透明编码串；模型可原样回传，由 `readBrowserTabToolInput` 解码。 */
const BrowserEncodedElementRefSchema = Type.String({
	pattern: "^v1:\\d+:[A-Za-z0-9_-]+$",
	description: "Opaque elementRef token printed by snapshot; pass it back verbatim",
});

const BrowserElementRefInputSchema = Type.Union([BrowserElementRefSchema, BrowserEncodedElementRefSchema]);

/** 按 elementRef 形态生成 9 个动作分支，避免对象与编码串两种形态各维护一份动作定义。 */
function buildBrowserTabActionSchemas<TRef extends TSchema>(elementRef: () => TRef) {
	return [
		Type.Object(
			{
				action: Type.Literal("snapshot"),
				description: Type.Optional(Type.String()),
				interactiveOnly: Type.Optional(Type.Boolean()),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("inspect"),
				description: Type.Optional(Type.String()),
				elementRef: elementRef(),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("screenshot"),
				description: Type.Optional(Type.String()),
				elementRef: Type.Optional(elementRef()),
				fullPage: Type.Optional(Type.Boolean()),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("wait"),
				description: Type.Optional(Type.String()),
				timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 60_000 })),
				elementRef: Type.Optional(elementRef()),
				state: Type.Optional(Type.Union([Type.Literal("visible"), Type.Literal("hidden"), Type.Literal("stable")])),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("scroll"),
				description: Type.Optional(Type.String()),
				elementRef: Type.Optional(elementRef()),
				deltaX: Type.Optional(Type.Number()),
				deltaY: Type.Optional(Type.Number()),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("click"),
				description: Type.Optional(Type.String()),
				elementRef: elementRef(),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("fill"),
				description: Type.Optional(Type.String()),
				elementRef: elementRef(),
				value: Type.String({ description: "Text to type; host must not echo secrets in tool content" }),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("press"),
				description: Type.Optional(Type.String()),
				key: Type.String({ minLength: 1, maxLength: 32, description: "Key name such as Enter, Tab, or a" }),
				elementRef: Type.Optional(elementRef()),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("navigate"),
				description: Type.Optional(Type.String()),
				url: Type.String({
					minLength: 1,
					description:
						"HTTP(S) URL, file:// URL, or absolute local path (e.g. D:/demo/index.html) for local preview",
				}),
			},
			{ additionalProperties: false },
		),
	];
}

const BrowserTabProviderActionSchemas = buildBrowserTabActionSchemas(() => BrowserElementRefInputSchema);

/** Provider 需要顶层 object/properties；动作间的必填/互斥规则仍由运行时联合校验。 */
function buildBrowserTabProviderSchema() {
	const properties: Record<string, TSchema> = {
		action: Type.Union(BROWSER_TAB_TOOL_ACTIONS.map((action) => Type.Literal(action))),
	};
	for (const schema of BrowserTabProviderActionSchemas) {
		for (const [name, property] of Object.entries(schema.properties)) {
			if (name !== "action") properties[name] = Type.Optional(property);
		}
	}
	return Type.Object(properties, { additionalProperties: false });
}

/** elementRef 接受 snapshot 打印的编码串或已解码对象，字段从动作分支推导。 */
export const BrowserTabToolInputSchema = buildBrowserTabProviderSchema();

/** 运行时校验用的规范化 Schema：elementRef 只接受对象，编码串在校验前已被解码。 */
const BrowserTabNormalizedInputSchema = Type.Union(buildBrowserTabActionSchemas(() => BrowserElementRefSchema));

/** 交给宿主的规范化入参：elementRef 恒为 `{ id, pageRevision }`。 */
export type BrowserTabToolInput = Static<typeof BrowserTabNormalizedInputSchema>;

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

const BROWSER_TAB_NO_SESSION_GUIDANCE =
	"Ask the user to open the intended page in the in-app Browser, then retry snapshot. " +
	"This error concerns that in-app page and does not mean that all browser tools are unavailable. " +
	"Do not silently switch to a separate browser session or copy login state to work around it.";

export const BROWSER_TAB_TOOL_DESCRIPTION = [
	"Operate the in-app Browser WebView that the user is looking at (same page, same session).",
	"Call this tool directly; it does not require a shell, MCP search, or installing a browser CLI.",
	"Read actions: snapshot, inspect, screenshot, wait, scroll. Write actions: click, fill, press, navigate.",
	"snapshot returns an interactive accessibility tree with elementRef values that embed pageRevision.",
	"Pass elementRef back exactly as snapshot printed it (the opaque v1:<pageRevision>:<id> token); {id, pageRevision} is accepted too.",
	"After navigation or DOM change, old refs return stale_reference — take a new snapshot; never guess a new locator.",
	"navigate accepts http/https URLs, file:// URLs and absolute local paths — open a local HTML artifact by its path directly, no static server needed. This tool cannot evaluate JavaScript, read cookies, or export tokens.",
	"This is not the agent-browser CLI; that Skill uses a separate browser session.",
	`If no_browser_session is returned: ${BROWSER_TAB_NO_SESSION_GUIDANCE}`,
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

/**
 * 本地路径 → file:// URL：Windows 盘符（`D:\…`/`D:/…`）、UNC（`\server\…`）、
 * posix 绝对路径（`/…`）；非本地路径形态原样返回。文件名里的 `#`/`?` 对 URL 是
 * 片段/查询语义，必须转义。地址栏与工具入参共用这一份规则（单一事实源）。
 */
export function localPathToBrowserFileUrl(raw: string): string {
	const trimmed = raw.trim();
	const isWindowsDrive = /^[a-zA-Z]:[\\/]/.test(trimmed);
	const isUnc = trimmed.startsWith("\\\\") || trimmed.startsWith("//");
	if (!isWindowsDrive && !isUnc && !trimmed.startsWith("/")) return raw;
	const path = trimmed.replace(/\\/g, "/");
	const encodePath = (value: string) => value.split("/").map(encodeURIComponent).join("/");
	try {
		if (isWindowsDrive) return `file:///${path.slice(0, 2)}/${encodePath(path.slice(3))}`;
		if (isUnc) {
			const slash = path.indexOf("/", 2);
			if (slash < 0) return raw;
			return new URL(`file://${path.slice(2, slash)}${encodePath(path.slice(slash))}`).href;
		}
		return `file://${encodePath(path)}`;
	} catch {
		return raw;
	}
}

export function isAllowedBrowserTabUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		// 延续本地文件预览的协议集合；这里只判协议，不代表文件访问授权或目录隔离。
		// 宿主的审批、页面会话及平台安全配置仍独立生效。
		return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:";
	} catch {
		return false;
	}
}

/**
 * 模型从 snapshot 结果文本里拿到的是 `v1:<pageRevision>:<id>` 编码串，原样回传是最自然的用法；
 * 校验前统一解码成对象 ref，对象形式保持不变。解码失败的字符串原样保留，交给 Schema 判非法。
 */
function normalizeBrowserElementRefInput(value: unknown): unknown {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
	const record = value as Record<string, unknown>;
	if (typeof record.elementRef !== "string") return value;
	const ref = readBrowserElementRef(record.elementRef);
	return ref ? { ...record, elementRef: ref } : value;
}

export function readBrowserTabToolInput(value: unknown): BrowserTabToolInput | undefined {
	const normalized = normalizeBrowserElementRefInput(value);
	if (!Value.Check(BrowserTabNormalizedInputSchema, normalized)) return undefined;
	if (normalized.action !== "navigate") return normalized;
	const url = localPathToBrowserFileUrl(normalized.url);
	return isAllowedBrowserTabUrl(url) ? { ...normalized, url } : undefined;
}

export type BrowserTabToolInputRead =
	| { readonly ok: true; readonly input: BrowserTabToolInput }
	| { readonly ok: false; readonly message: string };

/** 校验入口：成功给规范化入参，失败给可纠正的问题描述（模型据此能直接改调用）。 */
export function readBrowserTabToolInputResult(value: unknown): BrowserTabToolInputRead {
	const input = readBrowserTabToolInput(value);
	return input ? { ok: true, input } : { ok: false, message: describeBrowserTabToolInputProblem(value) };
}

/** 从动作分支 Schema 推导合法字段，避免另维护一份字段清单。 */
function browserTabActionFields(action: BrowserTabToolAction): readonly string[] {
	for (const schema of BrowserTabProviderActionSchemas) {
		const properties = (schema as { properties?: Record<string, { const?: unknown }> }).properties;
		if (properties?.action?.const === action) return Object.keys(properties);
	}
	return ["action"];
}

function describeAllowedInput(action: BrowserTabToolAction): string {
	return `Allowed fields for ${action}: ${browserTabActionFields(action).join(", ")}.`;
}

function describeSchemaProblems(normalized: unknown): string {
	const errors = [...Value.Errors(BrowserTabNormalizedInputSchema, normalized)];
	if (errors.length === 0) return "the input does not match any browser_tab action.";
	return errors
		.slice(0, 3)
		.map((error) => `${error.path || "/"}: ${error.message}`)
		.join("; ");
}

function describeUrlScheme(url: string): string {
	try {
		return new URL(url).protocol.replace(/:$/, "");
	} catch {
		return "unparseable";
	}
}

/**
 * 把一次校验失败讲清楚：模型收到的错误必须能直接指导下一次调用。
 * 保持严格判定不变——这里只解释「为什么被拒」和「怎么改」，不替模型猜动作。
 */
export function describeBrowserTabToolInputProblem(value: unknown): string {
	const actions = BROWSER_TAB_TOOL_ACTIONS.join(", ");
	const minimalExample = '{"action":"snapshot"}';
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return `browser_tab input must be a JSON object. Actions: ${actions}. Minimal example: ${minimalExample}.`;
	}
	const record = value as Record<string, unknown>;
	const action = record.action;
	if (typeof action !== "string" || action.trim() === "") {
		return `browser_tab is missing "action". Actions: ${actions}. Minimal example: ${minimalExample}.`;
	}
	if (!isBrowserTabToolAction(action)) {
		return `browser_tab does not support action ${JSON.stringify(action)}. Actions: ${actions}. Minimal example: ${minimalExample}.`;
	}
	const allowedFields = browserTabActionFields(action);
	const extraFields = Object.keys(record).filter((key) => !allowedFields.includes(key));
	if (extraFields.length > 0) {
		return `browser_tab ${action} does not accept ${extraFields.map((field) => JSON.stringify(field)).join(", ")}. ${describeAllowedInput(action)}`;
	}
	if (record.elementRef !== undefined && readBrowserElementRef(record.elementRef) === undefined) {
		return `browser_tab ${action}: elementRef must be the opaque token snapshot printed (v1:<pageRevision>:<id>) or {"id","pageRevision"}. Take a snapshot and pass the token back verbatim.`;
	}
	if (action === "navigate") {
		if (typeof record.url !== "string" || record.url.trim() === "") {
			return 'browser_tab navigate requires "url". Example: {"action":"navigate","url":"https://example.com"}.';
		}
		if (!isAllowedBrowserTabUrl(record.url)) {
			const scheme = describeUrlScheme(record.url);
			if (scheme === "file" || scheme === "vetta-file") {
				return 'browser_tab navigate requires a valid http/https URL, file:// URL or absolute local path. Example: {"action":"navigate","url":"file:///D:/demo/index.html"}.';
			}
			return `browser_tab navigate accepts http/https URLs, file:// URLs and absolute local paths (got ${JSON.stringify(scheme)}). Example: {"action":"navigate","url":"https://example.com"}.`;
		}
	}
	return `browser_tab ${action} input is invalid: ${describeSchemaProblems(normalizeBrowserElementRefInput(value))}. ${describeAllowedInput(action)}`;
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
		return `no_browser_session: ${error.message} ${BROWSER_TAB_NO_SESSION_GUIDANCE} Open the in-app Browser page in the current workspace, then retry with a fresh snapshot; retrying the same call while that page stays closed cannot succeed.`;
	}
	if (error.code === "unimplemented") {
		return `unimplemented: ${error.message} Ask the user to open the in-app Browser page in the current workspace; retrying the same call will not help.`;
	}
	if (error.code === "policy_denied") {
		return `policy_denied: ${error.message}`;
	}
	return `${error.code}: ${error.message}`;
}
