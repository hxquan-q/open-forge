// Copyright The Open Forge contributors.
//
// T03 合同补齐：`WeKnoraMessage` 归一化透出 `created_at`，供渲染层分页翻页（`before_time`
// 游标）与顺序校正。本文件为纯新增用例（不改 http.test.ts 的既有断言）。

import { describe, expect, it } from "vitest";
import { WeKnoraHttpClient } from "./http.js";

const BASE_URL = "http://weknora.example:8083";
const API_KEY = "tenant-api-key-placeholder";

function clientWith(fetchImpl: typeof fetch): WeKnoraHttpClient {
	return new WeKnoraHttpClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
}

function jsonFetch(payload: unknown): typeof fetch {
	return (async () =>
		new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as typeof fetch;
}

describe("loadMessages · created_at 归一化(AC-6 分页游标合同补齐)", () => {
	it("透出服务端 created_at,供渲染层翻页(before_time)与顺序校正", async () => {
		const fetchImpl = jsonFetch({
			success: true,
			data: [
				{ id: "m1", role: "user", content: "问", created_at: "2026-10-20T10:00:00Z" },
				{ id: "m2", role: "assistant", content: "答", created_at: "2026-10-20T10:00:01Z" },
			],
		});

		const messages = await clientWith(fetchImpl).loadMessages("sess-1", {});

		expect(messages.map((message) => message.created_at)).toEqual(["2026-10-20T10:00:00Z", "2026-10-20T10:00:01Z"]);
	});

	it("服务端未给 created_at 时缺省,不臆造", async () => {
		const fetchImpl = jsonFetch({ success: true, data: [{ id: "m1", role: "user", content: "问" }] });

		const messages = await clientWith(fetchImpl).loadMessages("sess-1", {});

		expect(messages[0]?.created_at).toBeUndefined();
	});

	it("beforeTime 透传到 before_time 查询参数(翻页游标)", async () => {
		const calls: string[] = [];
		const fetchImpl = (async (input: RequestInfo | URL) => {
			calls.push(String(input));
			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		await clientWith(fetchImpl).loadMessages("sess-1", { limit: 50, beforeTime: "2026-10-20T10:00:00Z" });

		const url = new URL(calls[0] ?? "");
		expect(url.pathname).toBe("/api/v1/messages/sess-1/load");
		expect(url.searchParams.get("limit")).toBe("50");
		expect(url.searchParams.get("before_time")).toBe("2026-10-20T10:00:00Z");
	});
});
