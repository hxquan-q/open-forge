// Copyright The Open Forge contributors.
import type { ModelCallContributionContext } from "@vetta/runtime-core/kernel";
import { SessionExtensionComposition, SessionExtensionFunctionRegistry } from "@vetta/runtime-core/session-extensions";
import { describe, expect, it } from "vitest";
import { COMPUTER_USE_FUNCTION } from "./computer-use-contract.js";
import { createComputerUseSessionExtension } from "./computer-use-session-extension.js";

describe("computer use host function extension", () => {
	it("adds no tools without an explicitly provided host capability", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createComputerUseSessionExtension()],
		});
		try {
			expect(composition.features).toEqual([]);
		} finally {
			await composition.dispose();
			await functions.close();
		}
	});
	it("preserves session identity, cancellation and tool images through the real extension registry", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		const controller = new AbortController();
		functions.register(COMPUTER_USE_FUNCTION, async (request, signal) => {
			expect(request).toEqual({ sessionId: "session-1", input: { action: "observe" } });
			expect(signal.aborted).toBe(false);
			return { content: [{ type: "image" as const, data: "cG5n", mimeType: "image/png" }] };
		});
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createComputerUseSessionExtension()],
		});
		const prepared = await composition.features[0]!.prepare({ signal: controller.signal });
		try {
			const contribution = await prepared.contribute({ signal: controller.signal } as ModelCallContributionContext);
			const tool = contribution.tools?.[0];
			expect(tool?.name).toBe("computer_observe");
			if (!tool) throw new Error("Missing tool");
			const request = {
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "call-1",
				input: { action: "observe" },
				signal: controller.signal,
			};
			expect((await tool.execute(request)).content).toEqual([
				{ type: "image", data: "cG5n", mimeType: "image/png" },
			]);
			controller.abort();
			await expect(tool.execute(request)).rejects.toThrow();
		} finally {
			await prepared.dispose();
			await composition.dispose();
			await functions.close();
		}
	});
	it("publishes global desktop actions as individual Responses-compatible object tools", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		functions.register(COMPUTER_USE_FUNCTION, async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createComputerUseSessionExtension()],
		});
		const prepared = await composition.features[0]!.prepare({ signal: new AbortController().signal });
		try {
			const contribution = await prepared.contribute({
				signal: new AbortController().signal,
			} as ModelCallContributionContext);
			const tools = contribution.tools ?? [];
			expect(tools.map((tool) => tool.name)).toEqual([
				"computer_observe",
				"computer_click",
				"computer_press",
				"computer_type",
				"computer_scroll",
			]);
			for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: "object" });
		} finally {
			await prepared.dispose();
			await composition.dispose();
			await functions.close();
		}
	});
});
