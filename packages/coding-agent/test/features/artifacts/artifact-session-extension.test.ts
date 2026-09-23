// Copyright The Open Forge contributors.
import type { ModelCallContributionContext, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { SessionExtensionComposition, SessionExtensionFunctionRegistry } from "@vetta/runtime-core/session-extensions";
import { afterEach, describe, expect, it } from "vitest";
import { createCodingAgentArtifactSessionExtension } from "../../../src/features/artifacts/artifact-session-extension.js";
import {
	ARTIFACT_TOOL_NAME,
	CODING_AGENT_ARTIFACT_FUNCTION,
} from "../../../src/features/artifacts/artifact-tool-contract.js";

const signal = new AbortController().signal;

describe("artifact session extension", () => {
	const disposals: Array<() => Promise<void> | void> = [];

	afterEach(async () => {
		for (const dispose of disposals.splice(0).reverse()) await dispose();
	});

	it("没有宿主函数时不贡献工具", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentArtifactSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		expect(composition.features).toHaveLength(0);
	});

	it("宿主函数存在时贡献 artifact 工具，并保持 content/details 分层", async () => {
		const functions = new SessionExtensionFunctionRegistry();
		functions.register(CODING_AGENT_ARTIFACT_FUNCTION, async () => ({
			ok: true as const,
			action: "list" as const,
			items: [],
		}));
		disposals.push(() => functions.close());
		const composition = await SessionExtensionComposition.create({
			functions,
			definitions: [createCodingAgentArtifactSessionExtension()],
		});
		disposals.push(() => composition.dispose());
		expect(composition.features).toHaveLength(1);
		const prepared = await composition.features[0]!.prepare({ signal });
		disposals.push(() => prepared.dispose());
		const tool = await readTool(prepared);
		expect(tool?.name).toBe(ARTIFACT_TOOL_NAME);
		const result = await tool?.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "list" },
			signal,
		});
		expect(result?.content[0]).toMatchObject({ type: "text" });
		expect(result?.details).toMatchObject({ ok: true, action: "list" });
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
