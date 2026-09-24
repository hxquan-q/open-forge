// Copyright The Open Forge contributors.
import type { RuntimeToolDefinition, RuntimeToolResult } from "@vetta/runtime-core/kernel";
import {
	ARTIFACT_TOOL_DESCRIPTION,
	ARTIFACT_TOOL_NAME,
	type ArtifactToolInput,
	ArtifactToolInputSchema,
	artifactToolError,
	type CodingAgentArtifactFunctionRequest,
	type CodingAgentArtifactFunctionResult,
	formatArtifactToolResult,
	readArtifactToolInput,
} from "./artifact-tool-contract.js";

export interface ArtifactToolOptions {
	readonly invoke: (
		request: CodingAgentArtifactFunctionRequest,
		signal: AbortSignal,
	) => Promise<CodingAgentArtifactFunctionResult | undefined>;
	readonly modelOrder?: number;
}

export function createArtifactTool(options: ArtifactToolOptions): RuntimeToolDefinition<ArtifactToolInput> {
	return {
		name: ARTIFACT_TOOL_NAME,
		label: "artifact",
		description: ARTIFACT_TOOL_DESCRIPTION,
		inputSchema: ArtifactToolInputSchema,
		...(options.modelOrder === undefined ? {} : { modelOrder: options.modelOrder }),
		validateInput: (input) => {
			const parsed = readArtifactToolInput(input);
			if (!parsed) throw new Error("invalid artifact tool input");
			return parsed;
		},
		async execute({ input, sessionId, turnId, signal }): Promise<RuntimeToolResult> {
			const parsed = readArtifactToolInput(input);
			if (!parsed) {
				return formatArtifactToolResult(artifactToolError("invalid_input", "invalid artifact tool input"));
			}
			const outcome = await options.invoke({ sessionId, turnId, input: parsed }, signal);
			if (!outcome) {
				return formatArtifactToolResult(
					artifactToolError("unimplemented", "Artifact host function is unavailable in this session.", {
						action: parsed.action,
					}),
				);
			}
			return formatArtifactToolResult(outcome);
		},
	};
}
