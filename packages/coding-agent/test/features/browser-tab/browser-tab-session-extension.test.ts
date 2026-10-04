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
});

async function readTool(prepared: {
	contribute: (
		context: ModelCallContributionContext,
	) => Promise<{ readonly tools?: readonly RuntimeToolDefinition[] }>;
}): Promise<RuntimeToolDefinition | undefined> {
	const contribution = await prepared.contribute({ signal } as ModelCallContributionContext);
	return contribution.tools?.[0];
}
