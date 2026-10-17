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

	it("streaming 且活动新鲜（健康长回合）保持沉默，不误报中断", () => {
		// 长回合模型可以安静思考数十秒：streaming + 短 idle 是健康形态，
		// 任何修复「悬挂失明」的方案都不得把它误判成中断。
		const result = classifySessionInterruptHealth(evidence({ isStreaming: true, idleMs: 1_000 }));
		expect(result.state).toBe("running");
		expect(result.shouldNotify).toBe(false);
		expect(result.shouldAutoContinue).toBe(false);
		expect(result.eligibleForBinding).toBe(false);
	});

	it("streaming 但零活动远超 provider 看门狗窗口（异常悬挂）不得沉默", () => {
		// 「会话异常中断后转圈无输出」复现：turn 永不结算（工具/审批等待悬挂等），
		// kernel 停在 running、事件流彻底安静。provider 零事件看门狗窗口是 180s，
		// 远超该窗口仍 streaming 的会话只剩两种解释：悬挂，或事件证据失修——
		// 两者都必须浮出水面提示用户，而不是按「streaming = 健康 running」短路。
		const result = classifySessionInterruptHealth(
			evidence({ isStreaming: true, idleMs: 10 * 60_000, stopReason: null }),
		);
		expect(result.shouldNotify).toBe(true);
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

	it("等待子代理的长空闲是合法安静，不判 suspected（BUG-0126）", () => {
		// 旧实现红：同样证据（不流式 + idle 超阈 + 无完成标记）落 suspected 并通知。
		const result = classifySessionInterruptHealth(
			evidence({
				idleMs: SESSION_INTERRUPT_SUSPECT_IDLE_MS + 1,
				stopReason: "stop",
				hasCompletionMarker: false,
				waitingOnSubagent: true,
			}),
		);
		expect(result.state).toBe("running");
		expect(result.shouldNotify).toBe(false);
		expect(result.shouldAutoContinue).toBe(false);
		expect(result.eligibleForBinding).toBe(false);
	});

	it("等待子代理但命中硬否决时仍按否决裁决", () => {
		const result = classifySessionInterruptHealth(
			evidence({
				idleMs: SESSION_INTERRUPT_SUSPECT_IDLE_MS + 1,
				waitingOnSubagent: true,
				manualStop: true,
			}),
		);
		expect(result.state).toBe("stopped");
		expect(result.eligibleForBinding).toBe(false);
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
