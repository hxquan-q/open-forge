// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { WeKnoraMessage } from "@preload/api";
import { describe, expect, it } from "vitest";
import { type LoadMessagesPage, loadAllMessages, type WeKnoraExportMessage } from "./weknoraExport";

/**
 * ER 轮独立复验（F4：loadAllMessages 分页终止条件）。
 *
 * 独立角度（不照抄实现者用例）：全部以**手写假服务端**穷举对抗场景。
 * - 服务端把 `limit` 钳到 1（每页仅 1 条）→ 仍拉全（不依赖「短页即止」）；
 * - 游标不前进（本页最早一条 === 上一页游标）→ 停且**不累加**（用「新 id + 同时间戳」构造，区别于实现者的空 id 构造）；
 * - 对抗探测：同 created_at 被分页切开 / 服务端忽略游标重复同批 / 游标返回更早 / 游标返回更晚 / 全无 created_at；
 * - maxPages 封顶。
 *
 * 「记录真实行为」的用例断言的是**当前实际输出**（注释标明），用于把边界行为钉在案；
 * 其中确属缺陷的（漏消息）在报告 FAIL 区逐条登记，不在测试里粉饰。
 */

function isoAt(index: number): string {
	return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function msg(id: string, role: WeKnoraMessage["role"], content: string, createdAt?: string): WeKnoraExportMessage {
	return { id, role, content, ...(createdAt === undefined ? {} : { created_at: createdAt }) };
}

describe("loadAllMessages 终止条件 · ER 独立复验（F4）", () => {
	it("服务端把 limit 钳到 1：每页仅 1 条，仍拉全（不依赖短页终止）", async () => {
		const all = Array.from({ length: 6 }, (_, i) =>
			msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `c${i}`, isoAt(i)),
		);
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ beforeTime }) => {
			calls += 1;
			const upper = beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - 1); // 无视请求的 limit，只给 1 条（钳制）
			return all.slice(start, end);
		};

		const result = await loadAllMessages("s1", { pageSize: 10, loadPage });

		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id)); // 6 条全拉
		expect(calls).toBe(7); // 6 页各 1 条 + 1 空页
	});

	it("游标不前进：本页最早一条 === 上一页游标 → 停且**不累加**（新 id + 同时间戳构造）", async () => {
		const first = [msg("m1", "user", "一", isoAt(1)), msg("m2", "assistant", "二", isoAt(2))];
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ beforeTime }) => {
			calls += 1;
			if (beforeTime === undefined) return first;
			// 病态服务端：返回一条**新 id** 但时间戳等于游标（游标没前进）。
			return [msg("mX", "user", "重复区", isoAt(1))];
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(calls).toBe(2);
		// mX 未被累加（重复批不堆叠）。
		expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
	});

	it("[对抗·记录] 服务端忽略游标重复返回同一批：hasFresh 拦下，无重复、不死循环", async () => {
		const batch = [msg("m1", "user", "一", isoAt(1)), msg("m2", "assistant", "二", isoAt(2))];
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return batch;
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(calls).toBe(2); // 第二页无新消息即停
		expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
	});

	it("[对抗·记录] 游标返回更早时间戳（服务端病态）：有界终止，不堆叠", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ beforeTime }) => {
			calls += 1;
			if (beforeTime === undefined) return [msg("m0", "user", "首", isoAt(5))];
			// 之后每页都返回同一「更早」时间戳的新 id → 第二次游标不前进时被拦。
			return [msg(`mX${calls}`, "user", "重复区", isoAt(1))];
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(calls).toBe(3); // 页1 m0(游标 iso5) → 页2 mX2(游标 iso1) → 页3 游标不前进停
		expect(result.map((m) => m.id).sort()).toEqual(["m0", "mX2"]);
	});

	it("[对抗·记录] 游标持续「更晚」（服务端不理会游标）：靠 maxPages 兜底，有界", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			const base = calls * 100; // 每页比上一页更晚 → 游标永不重复、hasFresh 恒真
			return [msg(`m${base}`, "user", "x", isoAt(base))];
		};

		const result = await loadAllMessages("s1", { pageSize: 5, maxPages: 4, loadPage });

		expect(calls).toBe(4); // 只能靠 maxPages 收口
		expect(result).toHaveLength(4);
	});

	it("[对抗·记录] 同一 created_at 被分页切开：更早的同刻消息拿不到（见报告 FAIL-F4-1）", async () => {
		// 建模「before_time 严格早于」的服务端语义：同刻消息在下一页拿不到。
		const same = isoAt(0);
		const all = Array.from({ length: 4 }, (_, i) => msg(`m${i}`, "user", `c${i}`, same));
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ beforeTime }) => {
			calls += 1;
			if (beforeTime === undefined) return all.slice(0, 2);
			return all.filter((m) => Date.parse(m.created_at as string) < Date.parse(beforeTime));
		};

		const result = await loadAllMessages("s1", { pageSize: 2, loadPage });

		expect(calls).toBe(2); // 有界：不死循环
		// 记录真实行为：只回 2 条，m2/m3 丢失（时间戳游标无法区分同刻消息）。这是**现状记录**，非验收期望。
		expect(result.map((m) => m.id)).toEqual(["m0", "m1"]);
	});

	it("[对抗·记录] 全无 created_at（无可推导游标）：只回首屏一页（更早历史拿不到）", async () => {
		const server = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, "user", `c${i}`)); // 无 created_at
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ limit }) => {
			calls += 1;
			return server.slice(0, limit);
		};

		const result = await loadAllMessages("s1", { pageSize: 10, loadPage });

		expect(calls).toBe(1); // 无游标可推 → 单页即止
		expect(result).toHaveLength(10); // 记录：更早的 20 条拿不到（见报告 open question）
	});

	it("maxPages 封顶：游标持续前进（永不重复）时最多拉 maxPages 页", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			const base = calls * 10;
			return Array.from({ length: 3 }, (_, i) => msg(`m${base + i}`, "user", "x", isoAt(base + i)));
		};

		const result = await loadAllMessages("s1", { pageSize: 3, maxPages: 5, loadPage });

		expect(calls).toBe(5);
		expect(result).toHaveLength(15);
	});
});
