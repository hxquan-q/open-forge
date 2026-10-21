// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { WeKnoraHttpClient } from "./http.js";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-14/AC-15 主进程数据面合同)。
 *
 * 与实现者用例(http.test.ts)的角度差异:
 * - 200 夹具用 T00 实测 **chunk-probe.json 的完整真实形态**(全部真实字段名,含
 *   image_info/metadata/relation_chunks 等长字段裁剪为形状占位),断言归一化**恰好**收敛为
 *   三字段契约——多余字段一个不透传、一个不丢;
 * - 只读铁律按"调用日志全集"断言:整个流程只发出**一次** fetch、方法是 GET、无 body、
 *   URL 只指向 chunks/by-id 读端点(不触任何写端点)。
 * baseUrl 为假域名、Key 为占位串(C1/C2:不触真实实例,无 Key 入夹具)。
 */

const BASE_URL = "http://weknora-acceptance.invalid:8083";
const API_KEY = "tenant-api-key-placeholder";

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function capturingFetch(handler: () => Response): { fetchImpl: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return handler();
	}) as typeof fetch;
	return { fetchImpl, calls };
}

function clientWith(fetchImpl: typeof fetch): WeKnoraHttpClient {
	return new WeKnoraHttpClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
}

/** chunk-probe.json 真实 200 响应形态(字段名逐一保留;长文本值裁剪,不含凭据)。 */
function realProbeBody(): unknown {
	return {
		data: {
			id: "f2acd65e-3969-4700-88f6-612579891ec6",
			seq_id: 100642537,
			tenant_id: 10001,
			knowledge_id: "012cd98e-3327-4610-aa0c-387073d9747d",
			knowledge_base_id: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
			tag_id: "",
			content: "该图展示了金蝶六大产品线(金蝶云·苍穹、星空、EAS Cloud、K/3 WISE、精斗云、KIS云)的36个精品自学专题。",
			content_revision: 0,
			index_status: "ready",
			last_editor_id: "",
			chunk_index: 0,
			is_enabled: true,
			flags: 1,
			status: 2,
			start_at: 0,
			end_at: 0,
			pre_chunk_id: "",
			next_chunk_id: "",
			chunk_type: "image_caption",
			parent_chunk_id: "04d243d3-9548-4311-8c01-000bffbafbc4",
			relation_chunks: null,
			indirect_relation_chunks: null,
			metadata: null,
			content_hash: "",
			image_info: "[]",
			created_at: "2026-07-12T01:42:15.735889+08:00",
			updated_at: "2026-07-12T01:42:15.960873+08:00",
			deleted_at: null,
		},
		success: true,
	};
}

describe("WeKnoraHttpClient 验收 · getChunkById(AC-14/AC-15)", () => {
	it("真实 200 形态:恰好归一化为 content/knowledgeId/kbId 三字段,多余字段零透传", async () => {
		const { fetchImpl, calls } = capturingFetch(
			() =>
				new Response(JSON.stringify(realProbeBody()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const chunk = await clientWith(fetchImpl).getChunkById("f2acd65e-3969-4700-88f6-612579891ec6");

		// 契约收敛:UI 所需三字段;真实 id/seq_id 等其余字段一概不透传(toEqual 全等)。
		expect(chunk).toEqual({
			content: "该图展示了金蝶六大产品线(金蝶云·苍穹、星空、EAS Cloud、K/3 WISE、精斗云、KIS云)的36个精品自学专题。",
			knowledgeId: "012cd98e-3327-4610-aa0c-387073d9747d",
			kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
		});
		// 只读铁律:整个流程只发一次请求;GET;无 body;只指向 chunks/by-id 读端点。
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/chunks/by-id/f2acd65e-3969-4700-88f6-612579891ec6`);
		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.body).toBeUndefined();
		expect(calls[0]?.url).not.toMatch(/(POST|DELETE|PUT|PATCH)/);
		// 鉴权头携带的是配置的占位 Key(不猜来源)。
		expect((calls[0]?.init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
	});

	it("chunkId 含路径分隔符与空格:encodeURIComponent 收进单段路径,不越出端点", async () => {
		const { fetchImpl, calls } = capturingFetch(
			() => new Response(JSON.stringify({ success: true, data: { content: "c" } }), { status: 200 }),
		);
		await clientWith(fetchImpl).getChunkById("a b/c?d");
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/chunks/by-id/a%20b%2Fc%3Fd`);
	});

	it("403 → capability_missing 且标记缺 retrieve(Key 未来被降级时的弹层失败态前提)", async () => {
		const { fetchImpl } = capturingFetch(() => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
		await expect(clientWith(fetchImpl).getChunkById("c1")).rejects.toMatchObject({
			weknora: { code: "capability_missing", missingCapability: "retrieve", status: 403 },
		});
	});

	it("404 → unknown,detail 携带服务端错误包络 message(数值码不影响归一化)", async () => {
		const { fetchImpl } = capturingFetch(
			() =>
				new Response(
					JSON.stringify({ error: { code: 1003, details: null, message: "chunk not found" }, success: false }),
					{
						status: 404,
					},
				),
		);
		await expect(clientWith(fetchImpl).getChunkById("missing")).rejects.toMatchObject({
			weknora: { code: "unknown", status: 404, detail: expect.stringContaining("chunk not found") },
		});
	});
});
