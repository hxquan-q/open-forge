// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	classifySessionInterruptHealth,
	isSessionInterruptEligibleForBinding,
	SESSION_INTERRUPT_SETTLING_IDLE_MS,
	SESSION_INTERRUPT_SUSPECT_IDLE_MS,
	type SessionInterruptEvidence,
} from "../../src/execution/session-interrupt-health.js";

function evidence(partial: Partial<SessionInterruptEvidence>): SessionInterruptEvidence {
	return {
		isStreaming: false,
		idleMs: SESSION_INTERRUPT_SETTLING_IDLE_MS + 100,
		stopReason: null,
		errorMessage: null,
		manualStop: false,
		draftNonEmpty: false,
		hasPendingAction: false,
		hasCompletionMarker: false,
		continueAttemptCount: 0,
		maxContinueAttempts: 1,
		...partial,
	};
}

describe("classifySessionInterruptHealth", () => {
	it("streaming 会话保持 running，不触发续接", () => {
		const result = classifySessionInterruptHealth(evidence({ isStreaming: true, stopReason: "error" }));
		expect(result.state).toBe("running");
		expect(result.shouldAutoContinue).toBe(false);
		expect(result.eligibleForBinding).toBe(false);
	});

	it("短空闲处于 settling，不触发", () => {
		const result = classifySessionInterruptHealth(
			evidence({ idleMs: SESSION_INTERRUPT_SETTLING_IDLE_MS - 1, stopReason: "error", errorMessage: "boom" }),
		);
		expect(result.state).toBe("settling");
		expect(result.shouldAutoContinue).toBe(false);
	});

	it.each([
		{
			name: "error",
			partial: { stopReason: "error" as const, errorMessage: "Model returned 500" },
			trigger: "error" as const,
		},
		{
			name: "networkFailure",
			partial: { stopReason: "error" as const, errorMessage: "fetch failed: ECONNRESET" },
			trigger: "networkFailure" as const,
		},
		{
			name: "truncated",
			partial: { stopReason: "length" as const, errorMessage: null },
			trigger: "truncated" as const,
		},
	])("三因触发 $name 且无否决时 shouldAutoContinue", ({ partial, trigger }) => {
		const result = classifySessionInterruptHealth(evidence(partial));
		expect(result.trigger).toBe(trigger);
		expect(result.shouldAutoContinue).toBe(true);
		expect(result.eligibleForBinding).toBe(true);
		expect(isSessionInterruptEligibleForBinding(result)).toBe(result.eligibleForBinding);
	});

	it.each([
		{
			name: "manualStop",
			partial: { manualStop: true, stopReason: "error" as const, errorMessage: "x" },
			veto: "manualStop",
			state: "stopped",
		},
		{
			name: "aborted stopReason",
			partial: { stopReason: "aborted" as const },
			veto: "manualStop",
			state: "stopped",
		},
		{
			name: "nonEmptyDraft",
			partial: {
				draftNonEmpty: true,
				stopReason: "error" as const,
				errorMessage: "fetch failed: ECONNRESET",
			},
			veto: "nonEmptyDraft",
			state: "error",
		},
		{
			name: "pendingAction",
			partial: {
				hasPendingAction: true,
				stopReason: "error" as const,
				errorMessage: "x",
			},
			veto: "pendingAction",
			state: "blocked",
		},
		{
			name: "completionMarker",
			partial: {
				hasCompletionMarker: true,
				stopReason: "stop" as const,
			},
			veto: "completionMarker",
			state: "completed",
		},
		{
			name: "attemptBudgetExhausted",
			partial: {
				stopReason: "error" as const,
				errorMessage: "x",
				continueAttemptCount: 1,
				maxContinueAttempts: 1,
			},
			veto: "attemptBudgetExhausted",
			state: "error",
		},
	])("否决 $name 时零自动续接", ({ partial, veto, state }) => {
		const result = classifySessionInterruptHealth(evidence(partial));
		expect(result.vetoes).toContain(veto);
		expect(result.shouldAutoContinue).toBe(false);
		expect(result.state).toBe(state);
		if (
			veto === "manualStop" ||
			veto === "nonEmptyDraft" ||
			veto === "pendingAction" ||
			veto === "completionMarker"
		) {
			expect(result.eligibleForBinding).toBe(false);
		}
	});

	it("长空闲无完成证据 → suspected，只提示不自动发", () => {
		const result = classifySessionInterruptHealth(
			evidence({
				idleMs: SESSION_INTERRUPT_SUSPECT_IDLE_MS + 1,
				stopReason: "stop",
				hasCompletionMarker: false,
			}),
		);
		expect(result.state).toBe("suspected");
		expect(result.shouldAutoContinue).toBe(false);
		expect(result.shouldNotify).toBe(true);
		expect(result.eligibleForBinding).toBe(true);
		expect(result.vetoes).toContain("insufficientConfidence");
	});

	it("绑定闸门与续跑判定共用同一 classification", () => {
		const ok = classifySessionInterruptHealth(evidence({ stopReason: "length" }));
		expect(ok.shouldAutoContinue).toBe(true);
		expect(isSessionInterruptEligibleForBinding(ok)).toBe(true);

		const vetoed = classifySessionInterruptHealth(evidence({ stopReason: "length", draftNonEmpty: true }));
		expect(vetoed.shouldAutoContinue).toBe(false);
		expect(isSessionInterruptEligibleForBinding(vetoed)).toBe(false);
	});
});
