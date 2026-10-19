// Copyright The Open Forge contributors.
import { expect, it } from "vitest";
import { reportedUsage } from "./usage.mjs";

it("counts actual CLI usage envelopes and leaves unreported cost unknown", () => {
	expect(reportedUsage('{"status":"completed","usage":{"input_tokens":99}}')).toBeNull();
	expect(
		reportedUsage('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":3,"cached_input_tokens":4}}'),
	).toEqual({ source: "cli-reported", inputTokens: 10, outputTokens: 3, cachedInputTokens: 4, costUsd: null });
	expect(
		reportedUsage('{"type":"result","usage":{"input_tokens":10,"output_tokens":3},"total_cost_usd":0.02}').costUsd,
	).toBe(0.02);
	expect(reportedUsage('{"type":"turn.completed","usage":{"input_tokens":-10,"output_tokens":3}}')).toBeNull();
});
