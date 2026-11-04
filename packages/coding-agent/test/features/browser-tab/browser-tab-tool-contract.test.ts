// Copyright The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { createBrowserTabTool } from "../../../src/features/browser-tab/browser-tab-tool.js";
import {
	BROWSER_TAB_READ_ACTIONS,
	BROWSER_TAB_TOOL_NAME,
	BROWSER_TAB_WRITE_ACTIONS,
	BrowserTabToolErrorSchema,
	type BrowserTabToolInput,
	BrowserTabToolInputSchema,
	browserTabToolError,
	encodeBrowserElementRef,
	formatBrowserTabToolResult,
	isAllowedBrowserTabUrl,
	isBrowserTabReadAction,
	isBrowserTabWriteAction,
	raiseBrowserTabToolRisk,
	readBrowserElementRef,
	readBrowserTabToolInput,
	readBrowserTabToolInputResult,
} from "../../../src/features/browser-tab/browser-tab-tool-contract.js";

const ref = { id: "e1", pageRevision: 3 };

describe("browser_tab action classification", () => {
	it("读类与写类互斥且覆盖全部动作", () => {
		for (const action of BROWSER_TAB_READ_ACTIONS) {
			expect(isBrowserTabReadAction(action)).toBe(true);
			expect(isBrowserTabWriteAction(action)).toBe(false);
			expect(raiseBrowserTabToolRisk({ action })).toBeUndefined();
		}
		for (const action of BROWSER_TAB_WRITE_ACTIONS) {
			expect(isBrowserTabWriteAction(action)).toBe(true);
			expect(isBrowserTabReadAction(action)).toBe(false);
			expect(raiseBrowserTabToolRisk({ action })).toBe("L3");
		}
	});
});

describe("browser_tab elementRef encoding", () => {
	it("结构化 ref 与 v1:revision:id 编码双向兼容", () => {
		expect(encodeBrowserElementRef(ref)).toBe("v1:3:e1");
		expect(readBrowserElementRef("v1:3:e1")).toEqual(ref);
		expect(readBrowserElementRef(ref)).toEqual(ref);
		expect(readBrowserElementRef("e1")).toBeUndefined();
		expect(readBrowserElementRef("v1:-1:e1")).toBeUndefined();
		expect(readBrowserElementRef({ id: "e1" })).toBeUndefined();
	});
});

describe("browser_tab input schema", () => {
	it("模型可见 Schema 顶层暴露 action 和动作参数，不依赖根级 anyOf", () => {
		const tool = createBrowserTabTool({ invoke: async () => undefined });
		expect(tool.inputSchema).toMatchObject({
			type: "object",
			required: ["action"],
			properties: {
				action: expect.any(Object),
				url: { type: "string" },
				elementRef: expect.any(Object),
			},
		});
		expect(tool.inputSchema.anyOf).toBeUndefined();
		// Provider 表面允许各动作字段；执行前仍按动作联合严格校验。
		expect(readBrowserTabToolInput({})).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "navigate" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "snapshot", url: "https://example.com" })).toBeUndefined();
	});

	it("接受各动作的合法参数", () => {
		const cases: BrowserTabToolInput[] = [
			{ action: "snapshot", interactiveOnly: true },
			{ action: "inspect", elementRef: ref },
			{ action: "screenshot", fullPage: false },
			{ action: "wait", timeoutMs: 1000, state: "visible" },
			{ action: "scroll", deltaY: 200 },
			{ action: "click", elementRef: ref },
			{ action: "fill", elementRef: ref, value: "hello" },
			{ action: "press", key: "Enter" },
			{ action: "navigate", url: "https://example.com/path" },
			{ action: "navigate", url: "file:///D:/demo/index.html" },
		];
		for (const input of cases) {
			expect(readBrowserTabToolInput(input)).toEqual(input);
		}
	});

	it("snapshot 打印的 elementRef 编码串可原样回传（生产-消费往返）", () => {
		const snapshot = formatBrowserTabToolResult({
			ok: true,
			action: "snapshot",
			pageRevision: 3,
			nodes: [{ elementRef: ref, role: "button", name: "提交" }],
		});
		const printed = String((snapshot.content[0] as { text: string }).text);
		const token = /- (\S+) role=/.exec(printed)?.[1];
		expect(token).toBe("v1:3:e1");
		expect(readBrowserTabToolInput({ action: "click", elementRef: token })).toEqual({
			action: "click",
			elementRef: ref,
		});
		expect(readBrowserTabToolInput({ action: "inspect", elementRef: "v1:3:e1" })).toEqual({
			action: "inspect",
			elementRef: ref,
		});
	});

	it("对外 Schema 允许 elementRef 以 snapshot 编码串传入，畸形串仍不匹配", () => {
		expect(Value.Check(BrowserTabToolInputSchema, { action: "click", elementRef: "v1:3:e1" })).toBe(true);
		expect(Value.Check(BrowserTabToolInputSchema, { action: "fill", elementRef: "v1:3:e1", value: "hi" })).toBe(true);
		expect(Value.Check(BrowserTabToolInputSchema, { action: "click", elementRef: "e1" })).toBe(false);
		expect(Value.Check(BrowserTabToolInputSchema, { action: "click", elementRef: { id: "e1" } })).toBe(false);
	});

	it("拒绝脚本面、缺 revision 的 ref、非法协议和多余字段", () => {
		expect(readBrowserTabToolInput({ action: "evaluate", script: "1+1" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "click", elementRef: { id: "e1" } })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "click", elementRef: "e1" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "click", elementRef: "v1:-1:e1" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "click", elementRef: "v1:3:" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "navigate", url: "chrome://version" })).toBeUndefined();
		expect(readBrowserTabToolInput({ action: "navigate", url: "javascript:alert(1)" })).toBeUndefined();
		expect(isAllowedBrowserTabUrl("http://localhost:3000")).toBe(true);
		expect(Value.Check(BrowserTabToolInputSchema, { action: "snapshot", eval: "no" })).toBe(false);
	});
});

describe("browser_tab 单一判定入口", () => {
	it("成功返回规范化入参，失败返回可纠正说明且判定不变", () => {
		expect(readBrowserTabToolInputResult({ action: "click", elementRef: "v1:3:e1" })).toEqual({
			ok: true,
			input: { action: "click", elementRef: ref },
		});
		for (const invalid of [
			{ action: "click", elementRef: "e1" },
			{ action: "evaluate" },
			{ action: "navigate", url: "file:///etc/passwd" },
			{ action: "snapshot", eval: "1+1" },
			undefined,
		]) {
			const read = readBrowserTabToolInputResult(invalid);
			// 保留原 file URL 样本，按用户已批准的本地文件导航合同显式验证成功。
			if (invalid?.action === "navigate" && invalid.url === "file:///etc/passwd") {
				expect(readBrowserTabToolInput(invalid)).toEqual(invalid);
				expect(read).toEqual({ ok: true, input: invalid });
				continue;
			}
			expect(readBrowserTabToolInput(invalid)).toBeUndefined();
			expect(read.ok).toBe(false);
			if (read.ok) continue;
			expect(read.message.length).toBeGreaterThan(0);
			expect(read.message).toContain("browser_tab");
		}
	});
});

describe("browser_tab error shape", () => {
	it("接受 stale_reference / no_browser_session / policy_denied", () => {
		expect(
			Value.Check(
				BrowserTabToolErrorSchema,
				browserTabToolError("stale_reference", "stale", { action: "click", pageRevision: 4, elementRef: ref }),
			),
		).toBe(true);
		expect(Value.Check(BrowserTabToolErrorSchema, browserTabToolError("no_browser_session", "closed"))).toBe(true);
		expect(Value.Check(BrowserTabToolErrorSchema, browserTabToolError("policy_denied", "not https"))).toBe(true);
		expect(Value.Check(BrowserTabToolErrorSchema, { ok: false, code: "stale_snapshot", message: "old" })).toBe(false);
	});
});

describe("browser_tab tool adapter", () => {
	it("宿主不可用时返回 unimplemented", async () => {
		const tool = createBrowserTabTool({ invoke: async () => undefined });
		expect(tool.name).toBe(BROWSER_TAB_TOOL_NAME);
		const result = await tool.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "snapshot" },
			signal: new AbortController().signal,
		});
		expect(result.isError).toBe(true);
		expect(result.details).toMatchObject({ code: "unimplemented" });
	});

	it("validateInput 拒绝非 http(s) navigate", () => {
		const tool = createBrowserTabTool({ invoke: async () => undefined });
		expect(() => tool.validateInput?.({ action: "navigate", url: "ftp://example.com" })).toThrow();
	});

	it("接受编码串 ref 并把解码后的对象交给宿主，畸形串仍拒绝", async () => {
		const received: unknown[] = [];
		const tool = createBrowserTabTool({
			invoke: async (request) => {
				received.push(request.input);
				return { ok: true, action: "click", pageRevision: 3 };
			},
		});
		expect(() => tool.validateInput?.({ action: "click", elementRef: "v1:3:e1" })).not.toThrow();
		expect(() => tool.validateInput?.({ action: "click", elementRef: "e1" })).toThrow();
		const result = await tool.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "click", elementRef: "v1:3:e1" } as unknown as BrowserTabToolInput,
			signal: new AbortController().signal,
		});
		expect(result.isError).toBeUndefined();
		expect(received).toEqual([{ action: "click", elementRef: ref }]);
	});

	it("stale_reference 进入 details 且 isError，content 只给摘要", () => {
		const result = formatBrowserTabToolResult(
			browserTabToolError("stale_reference", "page changed", { action: "click", pageRevision: 8 }),
		);
		expect(result.isError).toBe(true);
		expect(result.details).toMatchObject({ code: "stale_reference", pageRevision: 8 });
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(String((result.content[0] as { text: string }).text)).toContain("take a new snapshot");
	});
});
