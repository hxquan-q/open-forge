import { describe, expect, it } from "vitest";
import { rememberTurnStats, turnStatsCache } from "./chat-service";

describe("turnStatsCache 内存上界", () => {
	it("bounds the cached sessions and keeps the most recently written entries", () => {
		turnStatsCache.clear();
		const stats = { outputSpeed: 10, durationSeconds: 2 };

		for (let index = 0; index < 130; index += 1) {
			rememberTurnStats(`session-${index}.jsonl`, stats);
		}

		expect(turnStatsCache.size).toBeLessThanOrEqual(128);
		// 最早的会话被淘汰，最近的会话仍在。
		expect(turnStatsCache.has("session-0.jsonl")).toBe(false);
		expect(turnStatsCache.has("session-129.jsonl")).toBe(true);

		// 重复写入刷新新近度：重写最旧的键后，它不再是最先被淘汰的条目。
		rememberTurnStats("session-2.jsonl", stats);
		for (let index = 130; index < 132; index += 1) {
			rememberTurnStats(`session-${index}.jsonl`, stats);
		}
		expect(turnStatsCache.size).toBeLessThanOrEqual(128);
		expect(turnStatsCache.has("session-2.jsonl")).toBe(true);
		expect(turnStatsCache.has("session-3.jsonl")).toBe(false);

		turnStatsCache.clear();
	});
});
