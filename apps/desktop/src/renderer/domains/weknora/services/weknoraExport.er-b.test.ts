// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { WeKnoraMessage } from "@preload/api";
import { describe, expect, it } from "vitest";
import { type LoadMessagesPage, loadAllMessages, type WeKnoraExportMessage } from "./weknoraExport";

/**
 * 外部审查修复轮票 B（ER-B F4）的实现者用例：`loadAllMessages` 的**终止条件**。
 *
 * 缺陷：原终止里有「本页不足 `pageSize` 即止」——假设服务端一定按 `limit` 返回整页；但服务端可能钳制
 * `limit`，据此提前收尾会漏掉更早的历史。现终止只认：空页 / 无新消息(`hasFresh`) / **游标不前进**
 * （本页最早一条 === 上一页游标）/ 无可推导游标 / `maxPages`。本文件专压这几条。
 */

/** 严格递增、可唯一比较的时间戳（分页游标用）。 */
function isoAt(index: number): string {
	return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function msg(id: string, role: WeKnoraMessage["role"], content: string, createdAt?: string): WeKnoraExportMessage {
	return { id, role, content, ...(createdAt === undefined ? {} : { created_at: createdAt }) };
}

describe("loadAllMessages · 终止条件（ER-B F4）", () => {
	it("① 服务端短页但仍有更早消息：继续翻页直到空页", async () => {
		// 服务端每次最多给 2 条（模拟钳制 limit），而 pageSize=10 → 每页都是「短页」。
		const all = Array.from({ length: 5 }, (_, i) =>
			msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `c${i}`, isoAt(i)),
		);
		let calls = 0;
		const loadPage: LoadMessagesPage = async ({ beforeTime }) => {
			calls += 1;
			const upper = beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - 2);
			return all.slice(start, end);
		};

		const result = await loadAllMessages("s1", { pageSize: 10, loadPage });

		// 2 + 2 + 1 + 空页 —— 短页不再终止，5 条全拉到，最早在前。
		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id));
		expect(calls).toBe(4);
	});

	it("② 重复批（无新消息）停：同一批非空 id 反复返回", async () => {
		const page = [msg("m1", "user", "甲", isoAt(0)), msg("m2", "assistant", "乙", isoAt(1))];
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return page;
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(calls).toBe(2); // 第二页无新消息（id 全见过）即停
		expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
	});

	it("③ 游标不前进停：空 id 批重复返回（id 为空使 hasFresh 恒真，靠游标守卫兜住）", async () => {
		const page = [msg("", "user", "甲", isoAt(0)), msg("", "assistant", "乙", isoAt(1))];
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return page;
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		// 空 id 永不进 `seen`、`hasFresh` 恒真 → 只能靠「本页最早一条 === 上一页游标」拦下；
		// 第二页不累加，故不会重复堆叠、也不会一路跑到 maxPages。
		expect(calls).toBe(2);
		expect(result.map((m) => m.content)).toEqual(["甲", "乙"]);
	});

	it("④ maxPages 封顶：游标持续前进时最多拉 maxPages 页", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			const base = calls * 1000;
			return Array.from({ length: 20 }, (_, i) => msg(`m${base + i}`, "user", "x", isoAt(base + i)));
		};

		const result = await loadAllMessages("s1", { pageSize: 20, maxPages: 3, loadPage });

		expect(calls).toBe(3);
		expect(result).toHaveLength(60);
	});

	it("⑤ 空 id 消息不被吞：正文保留且不重复累加", async () => {
		const first = [msg("", "user", "甲", isoAt(0)), msg("", "assistant", "乙", isoAt(1))];
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return calls === 1 ? first : [];
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(result.map((m) => m.content)).toEqual(["甲", "乙"]);
		expect(calls).toBe(2);
	});
});
