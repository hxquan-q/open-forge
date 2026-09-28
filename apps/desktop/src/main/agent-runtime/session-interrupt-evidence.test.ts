// Copyright The Open Forge contributors.

import type { Message } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { buildSessionInterruptEvidence } from "./session-interrupt-evidence.js";

function assistant(partial: Partial<Extract<Message, { role: "assistant" }>> & { stopReason: string }): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text: "hello" }],
		api: "openai-completions",
		provider: "openai",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		timestamp: 1_000,
		...partial,
		stopReason: partial.stopReason as Extract<Message, { role: "assistant" }>["stopReason"],
	};
}

describe("buildSessionInterruptEvidence", () => {
	it("maps length stopReason and idle from last message timestamp", () => {
		const evidence = buildSessionInterruptEvidence({
			isStreaming: false,
			messages: [assistant({ stopReason: "length", timestamp: 5_000 })],
			nowMs: 10_000,
			manualStop: false,
			draftNonEmpty: false,
			hasPendingAction: false,
			continueAttemptCount: 0,
			maxContinueAttempts: 1,
		});
		expect(evidence.stopReason).toBe("length");
		expect(evidence.idleMs).toBe(5_000);
		expect(evidence.hasCompletionMarker).toBe(false);
	});

	it("marks completion when stop with visible text", () => {
		const evidence = buildSessionInterruptEvidence({
			isStreaming: false,
			messages: [assistant({ stopReason: "stop", timestamp: 1_000 })],
			nowMs: 10_000,
			manualStop: false,
			draftNonEmpty: false,
			hasPendingAction: false,
			continueAttemptCount: 0,
			maxContinueAttempts: 1,
		});
		expect(evidence.hasCompletionMarker).toBe(true);
	});
});
