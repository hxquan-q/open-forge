// Copyright The Open Forge contributors.
import type { RuntimeToolDefinition, RuntimeToolResult } from "@vetta/runtime-core/kernel";
import {
	BROWSER_TAB_TOOL_DESCRIPTION,
	BROWSER_TAB_TOOL_NAME,
	type BrowserTabToolInput,
	BrowserTabToolInputSchema,
	browserTabToolError,
	type CodingAgentBrowserTabFunctionRequest,
	type CodingAgentBrowserTabFunctionResult,
	formatBrowserTabToolResult,
	readBrowserTabToolInputResult,
} from "./browser-tab-tool-contract.js";

export interface BrowserTabToolOptions {
	readonly invoke: (
		request: CodingAgentBrowserTabFunctionRequest,
		signal: AbortSignal,
	) => Promise<CodingAgentBrowserTabFunctionResult | undefined>;
	readonly modelOrder?: number;
}

export function createBrowserTabTool(options: BrowserTabToolOptions): RuntimeToolDefinition<BrowserTabToolInput> {
	return {
		name: BROWSER_TAB_TOOL_NAME,
		label: "browser tab",
		description: BROWSER_TAB_TOOL_DESCRIPTION,
		inputSchema: BrowserTabToolInputSchema,
		...(options.modelOrder === undefined ? {} : { modelOrder: options.modelOrder }),
		validateInput: (input) => {
			const parsed = readBrowserTabToolInputResult(input);
			if (!parsed.ok) throw new Error(parsed.message);
			return parsed.input;
		},
		async execute({ input, sessionId, turnId, signal }): Promise<RuntimeToolResult> {
			const parsed = readBrowserTabToolInputResult(input);
			if (!parsed.ok) {
				return formatBrowserTabToolResult(browserTabToolError("invalid_input", parsed.message));
			}
			const outcome = await options.invoke({ sessionId, turnId, input: parsed.input }, signal);
			if (!outcome) {
				return formatBrowserTabToolResult(
					browserTabToolError("unimplemented", "browser_tab host function is unavailable in this session.", {
						action: parsed.input.action,
					}),
				);
			}
			return formatBrowserTabToolResult(outcome);
		},
	};
}
