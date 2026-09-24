import { describe, expect, it } from "vitest";
import {
	CompactionBackpressureGate,
	type CompactionBackpressurePolicy,
	type CompactionSettings,
	compactionBackpressurePolicy,
	DEFAULT_COMPACTION_BACKPRESSURE_POLICY,
} from "../src/compaction/index.js";

const SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 20,
	minFreePercent: 20,
	keepRecentTokens: 1,
};

const POLICY: CompactionBackpressurePolicy = {
	minIntervalMs: 60_000,
	failureCooldownMs: 120_000,
	hysteresisTokens: 8,
};

describe("compactionBackpressurePolicy", () => {
	it("derives defaults when settings omit backpressure fields", () => {
		expect(compactionBackpressurePolicy(SETTINGS)).toEqual(DEFAULT_COMPACTION_BACKPRESSURE_POLICY);
	});

	it("honours explicit settings overrides", () => {
		expect(
			compactionBackpressurePolicy({
				...SETTINGS,
				minIntervalMs: 5,
				failureCooldownMs: 9,
				hysteresisTokens: 2,
			}),
		).toEqual({ minIntervalMs: 5, failureCooldownMs: 9, hysteresisTokens: 2 });
	});
});

describe("CompactionBackpressureGate", () => {
	it("allows the first attempt and rejects a concurrent second one", () => {
		const gate = new CompactionBackpressureGate(() => 0);

		expect(gate.tryBegin(90, POLICY)).toBeUndefined();
		expect(gate.isInFlight()).toBe(true);
		expect(gate.tryBegin(90, POLICY)).toBe("in_flight");
		// urgent（overflow）也不能越过在途尝试
		expect(gate.tryBegin(90, POLICY, true)).toBe("in_flight");
	});

	it("suppresses retries during the failure cooldown and re-arms after it", () => {
		let now = 1_000;
		const gate = new CompactionBackpressureGate(() => now);

		gate.tryBegin(90, POLICY);
		gate.end(false, 90, POLICY);

		// 冷却期内、水位未越过滞回带 → 抑制
		expect(gate.tryBegin(91, POLICY)).toBe("cooldown");
		// 冷却期内但压力增长越过滞回带 → 放行
		expect(gate.tryBegin(98, POLICY)).toBeUndefined();
		gate.end(false, 98, POLICY);

		now += POLICY.failureCooldownMs + 1;
		expect(gate.tryBegin(90, POLICY)).toBeUndefined();
	});

	it("measures the hysteresis band from the post-compaction baseline after success", () => {
		let now = 0;
		const gate = new CompactionBackpressureGate(() => now);

		// 压缩收益不足（基线仍在阈值附近）：滞回带抑制贴着水位的立即重试
		gate.tryBegin(90, POLICY);
		gate.end(true, 85, POLICY);
		expect(gate.tryBegin(86, POLICY)).toBe("cooldown");
		expect(gate.tryBegin(85 + POLICY.hysteresisTokens, POLICY)).toBeUndefined();

		// 压缩后水位大幅下降：冷却仍在，但重新越过阈值的水位已远超滞回带 → 放行
		gate.end(true, 30, POLICY);
		now = 20_000;
		expect(gate.tryBegin(90, POLICY)).toBeUndefined();
	});

	it("treats urgent overflow attempts as exempt from cooldown but not single-flight", () => {
		const gate = new CompactionBackpressureGate(() => 0);

		gate.tryBegin(90, POLICY);
		gate.end(false, 90, POLICY);

		expect(gate.tryBegin(90, POLICY)).toBe("cooldown");
		expect(gate.tryBegin(90, POLICY, true)).toBeUndefined();
	});

	it("ignores end without a matching begin and keeps later attempts allowed", () => {
		const gate = new CompactionBackpressureGate(() => 0);

		gate.end(false, 90, POLICY);
		expect(gate.tryBegin(90, POLICY)).toBeUndefined();
	});
});
