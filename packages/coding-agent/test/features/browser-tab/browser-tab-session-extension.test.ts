// Copyright The Open Forge contributors.
import type { ModelCallContributionContext, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { SessionExtensionComposition, SessionExtensionFunctionRegistry } from "@vetta/runtime-core/session-extensions";
import { afterEach, describe, expect, it } from "vitest";
import { createCodingAgentBrowserTabSessionExtension } from "../../../src/features/browser-tab/browser-tab-session-extension.js";
import {
	BROWSER_TAB_TOOL_NAME,
	CODING_AGENT_BROWSER_TAB_FUNCTION,
} from "../../../src/features/browser-tab/browser-tab-tool-contract.js";

const signal = new AbortController().signal;

describe("browser_tab session extension", () => {
	const disposals: Array<() => Promise<void> | void> = [];

	afterEach(async () => {
		for (const dispose of disposals.splice(0).reverse()) await dispose();
	});

	it("没有 WebView 宿主函数时不贡献工具（CLI 场景自然不可用）", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentBrowserTabSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		expect(composition.features).toHaveLength(0);
	});

	it("宿主函数存在时贡献 browser_tab，过期 ref 进入 details 且 isError", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		functions.register(CODING_AGENT_BROWSER_TAB_FUNCTION, async () => ({
			ok: false as const,
			code: "stale_reference" as const,
			message: "page changed",
			action: "click" as const,
			pageRevision: 9,
		}));
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentBrowserTabSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		const prepared = await composition.features[0]!.prepare({ signal });
		disposals.push(() => prepared.dispose());
		const tool = await readTool(prepared);
		expect(tool?.name).toBe(BROWSER_TAB_TOOL_NAME);
		const result = await tool?.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "click", elementRef: { id: "e1", pageRevision: 3 } },
			signal,
		});
		expect(result?.isError).toBe(true);
		expect(result?.details).toMatchObject({ code: "stale_reference", pageRevision: 9 });
	});

	it("模型回传 snapshot 打印的编码串时，宿主函数收到解码后的对象 ref", async () => {
		const received: unknown[] = [];
		const functions = new SessionExtensionFunctionRegistry();
		functions.register(CODING_AGENT_BROWSER_TAB_FUNCTION, async (request) => {
			received.push(request);
			return { ok: true as const, action: "click" as const, pageRevision: 3 };
		});
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentBrowserTabSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		const prepared = await composition.features[0]!.prepare({ signal });
		disposals.push(() => prepared.dispose());
		const tool = await readTool(prepared);
		const result = await tool?.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "click", elementRef: "v1:3:e1" },
			signal,
		});
		expect(result?.isError).toBeUndefined();
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			input: { action: "click", elementRef: { id: "e1", pageRevision: 3 } },
		});
	});
	it("缺失页面先给恢复步骤，打开后沿同一工具完成 snapshot 与 click", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		let pageReady = false;
		functions.register(CODING_AGENT_BROWSER_TAB_FUNCTION, async ({ input }) => {
			if (!pageReady)
				return {
					ok: false as const,
					code: "no_browser_session" as const,
					message: "the in-app WebView is not available.",
					action: input.action,
				};
			if (input.action === "snapshot")
				return {
					ok: true as const,
					action: "snapshot" as const,
					pageRevision: 3,
					pageUrl: "https://example.test/",
					nodes: [{ elementRef: { id: "e1", pageRevision: 3 }, role: "button", name: "Continue" }],
				};
			expect(input).toEqual({ action: "click", elementRef: { id: "e1", pageRevision: 3 } });
			return { ok: true as const, action: "click" as const, pageRevision: 3 };
		});
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentBrowserTabSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		const prepared = await composition.features[0]!.prepare({ signal });
		disposals.push(() => prepared.dispose());
		const tool = await readTool(prepared);
		if (!tool) throw new Error("Expected browser_tab tool");
		const request = { sessionId: "s1", turnId: "t1", toolCallId: "c1", input: { action: "snapshot" }, signal };
		const missing = await tool.execute(request);
		expect(missing.isError).toBe(true);
		expect(missing.details).toEqual({
			ok: false,
			code: "no_browser_session",
			message: "the in-app WebView is not available.",
			action: "snapshot",
		});
		expect(missing.content).toEqual([
			{ type: "text", text: expect.stringContaining("open the intended page in the in-app Browser") },
		]);
		expect(missing.content).toEqual([
			{ type: "text", text: expect.stringContaining("not mean that all browser tools are unavailable") },
		]);
		expect(missing.content).toEqual([
			{ type: "text", text: expect.stringContaining("Do not silently switch to a separate browser session") },
		]);
		pageReady = true;
		const snapshot = await tool.execute({ ...request, toolCallId: "c2" });
		expect(snapshot.isError).toBeUndefined();
		const text = snapshot.content.find((part) => part.type === "text");
		if (text?.type !== "text") throw new Error("Expected snapshot text");
		const ref = text.text.match(/v1:\d+:[A-Za-z0-9_-]+/)?.[0];
		expect(ref).toBe("v1:3:e1");
		const result = await tool.execute({ ...request, toolCallId: "c3", input: { action: "click", elementRef: ref } });
		expect(result.isError).toBeUndefined();
		expect(result.details).toMatchObject({ ok: true, action: "click", pageRevision: 3 });
	});
});

async function readTool(prepared: {
	contribute: (
		context: ModelCallContributionContext,
	) => Promise<{ readonly tools?: readonly RuntimeToolDefinition[] }>;
}): Promise<RuntimeToolDefinition | undefined> {
	const contribution = await prepared.contribute({ signal } as ModelCallContributionContext);
	return contribution.tools?.[0];
}
