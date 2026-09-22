/**
 * 自动压缩背压闸门（会话内内存态）。
 *
 * 阈值型压缩在长 Agent Loop 中可能围绕阈值反复触发：压缩失败或压缩收益不足时
 * 上下文仍高于阈值，下一个 Model Call 检查点会立刻再跑一次完整摘要（Provider
 * 往返 30-40s 级），形成阻塞式重试风暴。本闸门给「是否发起一次自动压缩尝试」
 * 加三层保护：
 *
 * - single-flight：同一时刻至多一个自动压缩尝试在途，并发触发被拒绝；
 * - 最小间隔/冷却：成功后 `minIntervalMs`、未成功后 `failureCooldownMs` 内不再
 *   发起新尝试；
 * - 滞回带：冷却期内上下文较上次尝试基线增长超过 `hysteresisTokens` 视为真实
 *   压力尖峰，允许提前重试，避免冷却把正常的快速增长也压住。
 *
 * overflow（模型硬溢出）触发的压缩可绕过冷却（urgent），但仍受 single-flight
 * 约束——它是错误恢复的最后手段，被冷却压制会让本可自救的 Turn 直接失败。
 *
 * 闸门只抑制「发起」；已发起的尝试内部错误、熔断与提交语义不变。状态不持久化：
 * 进程重启即回到全量允许，不存在需要恢复的僵尸在途态。
 */

import type { CompactionSettings } from "./contracts.js";

export interface CompactionBackpressurePolicy {
	readonly minIntervalMs: number;
	readonly failureCooldownMs: number;
	readonly hysteresisTokens: number;
}

export const DEFAULT_COMPACTION_BACKPRESSURE_POLICY: CompactionBackpressurePolicy = {
	minIntervalMs: 60_000,
	failureCooldownMs: 120_000,
	hysteresisTokens: 4096,
};

export function compactionBackpressurePolicy(settings: CompactionSettings): CompactionBackpressurePolicy {
	return {
		minIntervalMs: settings.minIntervalMs ?? DEFAULT_COMPACTION_BACKPRESSURE_POLICY.minIntervalMs,
		failureCooldownMs: settings.failureCooldownMs ?? DEFAULT_COMPACTION_BACKPRESSURE_POLICY.failureCooldownMs,
		hysteresisTokens: settings.hysteresisTokens ?? DEFAULT_COMPACTION_BACKPRESSURE_POLICY.hysteresisTokens,
	};
}

export type CompactionBackpressureDenial = "in_flight" | "cooldown";

export class CompactionBackpressureGate {
	private inFlight = false;
	private suppressedUntil = Number.NEGATIVE_INFINITY;
	private rearmBaselineTokens = Number.POSITIVE_INFINITY;

	constructor(private readonly now: () => number = Date.now) {}

	isInFlight(): boolean {
		return this.inFlight;
	}

	/**
	 * 尝试开始一次自动压缩；返回 undefined 表示获准（调用方必须以 `end` 收尾），
	 * 返回拒绝原因表示本次触发被抑制、未持有任何在途态。
	 */
	tryBegin(
		tokens: number,
		policy: CompactionBackpressurePolicy,
		urgent = false,
	): CompactionBackpressureDenial | undefined {
		if (this.inFlight) return "in_flight";
		if (!urgent && this.now() < this.suppressedUntil && tokens < this.rearmBaselineTokens + policy.hysteresisTokens) {
			return "cooldown";
		}
		this.inFlight = true;
		return undefined;
	}

	/**
	 * 结束一次已获准的尝试。`baselineTokens` 是尝试结束后的上下文水位：
	 * 成功时为压缩后估计值（基线低 → 只有重新涨到阈值才会再触发），
	 * 未成功时为尝试前水位（滞回带从失败水位起算）。
	 */
	end(succeeded: boolean, baselineTokens: number, policy: CompactionBackpressurePolicy): void {
		if (!this.inFlight) return;
		this.inFlight = false;
		this.suppressedUntil = this.now() + (succeeded ? policy.minIntervalMs : policy.failureCooldownMs);
		this.rearmBaselineTokens = baselineTokens;
	}
}
