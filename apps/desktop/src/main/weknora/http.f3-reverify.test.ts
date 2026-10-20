// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { WeKnoraHttpClient } from "./http.js";

/**
 * flow-tester 独立复验 · `WeKnoraHttpClient.getFileData`(F3 v2 数据面第 1 层:主进程 HTTP 客户端)。
 *
 * 与实现者用例(`file-data.test.ts`)的角度差异:
 * - 用**已知字节序列**断言 data URL 的 base64 精确值(非 startsWith 点查);
 * - 失败路径**逐状态码枚举**(200 非图片 / 403 / 404 / 500 / fetch 抛错),并对全部路径做
 *   **C2 扫描**:归一化错误 message 与整条错误对象序列化后都不得出现 API Key;
 * - 断言 URL 只指向 `/files` 读端点、参数集合恰为 `{file_path}`、无 body(只读铁律)。
 *
 * baseUrl 为假域名、Key 为占位串(C1/C2:不触真实实例,无 Key 字面量入夹具)。
 */

const BASE_URL = "http://weknora-f3-reverify.invalid:8083";
/** C2:占位串,绝非真实 Key。 */
const API_KEY = "f3-reverify-placeholder-key";
const REF = "minio://images/10001/exports/44cb4d70-8152-4127-beb0-4f31feedf8ef.png";

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function clientWith(fetchImpl: typeof fetch): WeKnoraHttpClient {
	return new WeKnoraHttpClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
}

function capturingFetch(respond: () => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return respond();
	}) as typeof fetch;
	return { fetchImpl, calls };
}

/** 跑一次 getFileData 并返回归一化错误视图(永不自造成功)。 */
async function failureOf(respond: () => Response | Promise<Response>): Promise<{
	code?: string;
	missingCapability?: string;
	status?: number;
	message: string;
	raw: string;
}> {
	const { fetchImpl } = capturingFetch(respond);
	try {
		await clientWith(fetchImpl).getFileData(REF);
	} catch (error) {
		const view = error as {
			message?: string;
			weknora?: { code?: string; missingCapability?: string; status?: number };
		};
		return {
			code: view.weknora?.code,
			missingCapability: view.weknora?.missingCapability,
			status: view.weknora?.status,
			message: view.message ?? "",
			raw: JSON.stringify(view.weknora ?? {}),
		};
	}
	throw new Error("expected getFileData to reject");
}

describe("getFileData 复验 · GET 断言与归一化(F3 v2)", () => {
	it("恰好一次 GET /files?file_path=…;无 body;鉴权头 X-API-Key 只在请求里", async () => {
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		const { fetchImpl, calls } = capturingFetch(
			() => new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }),
		);
		await clientWith(fetchImpl).getFileData(REF);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.body).toBeUndefined();
		const url = new URL(calls[0]?.url ?? "");
		expect(url.origin).toBe(BASE_URL);
		expect(url.pathname).toBe("/files");
		// 只读铁律:查询参数恰为 file_path(不多传资源改写类参数)。
		expect([...url.searchParams.keys()]).toEqual(["file_path"]);
		expect(url.searchParams.get("file_path")).toBe(REF);
		const headers = calls[0]?.init?.headers as Record<string, string>;
		expect(headers["X-API-Key"]).toBe(API_KEY);
		// 鉴权头只在请求侧:返回体里没有 Key。
		const file = await clientWith(fetchImpl).getFileData(REF);
		expect(JSON.stringify(file)).not.toContain(API_KEY);
	});

	it("归一化:data URL = data:<mime>;base64,<精确字节 base64>,contentType 为纯媒体类型", async () => {
		const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
		const { fetchImpl } = capturingFetch(
			() => new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }),
		);
		const file = await clientWith(fetchImpl).getFileData(REF);

		expect(file.dataUrl).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
		expect(file.contentType).toBe("image/png");
	});

	it("content-type 带 charset 参数时只取媒体类型段,data URL 前缀同步", async () => {
		const { fetchImpl } = capturingFetch(
			() =>
				new Response(new Uint8Array([1]), {
					status: 200,
					headers: { "Content-Type": "image/webp; charset=binary" },
				}),
		);
		const file = await clientWith(fetchImpl).getFileData("minio://x/a.webp");
		expect(file.contentType).toBe("image/webp");
		expect(file.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
	});
});

describe("getFileData 复验 · 失败路径与 C2(F3 v2)", () => {
	it("200 但非图片(application/json)→ unknown,不产出 data URL", async () => {
		const r = await failureOf(
			() => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
		);
		expect(r.code).toBe("unknown");
	});

	it("403 → capability_missing(retrieve)", async () => {
		const r = await failureOf(() => new Response("forbidden", { status: 403 }));
		expect(r.code).toBe("capability_missing");
		expect(r.missingCapability).toBe("retrieve");
		expect(r.status).toBe(403);
	});

	it("404 → unknown(带 status)", async () => {
		const r = await failureOf(() => new Response("not found", { status: 404 }));
		expect(r.code).toBe("unknown");
		expect(r.status).toBe(404);
	});

	it("500 → unknown(带 status)", async () => {
		const r = await failureOf(() => new Response("boom", { status: 500 }));
		expect(r.code).toBe("unknown");
		expect(r.status).toBe(500);
	});

	it("fetch 抛错 → network(归一化,不裸抛原始异常)", async () => {
		const r = await failureOf(() => {
			throw new Error("socket hang up");
		});
		expect(r.code).toBe("network");
	});

	it("C2 扫描:全部失败路径的 message 与归一化错误体都不含 API Key", async () => {
		const responders: Array<() => Response | Promise<Response>> = [
			() => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
			() => new Response("forbidden", { status: 403 }),
			() => new Response("not found", { status: 404 }),
			() => new Response("boom", { status: 500 }),
			() => {
				throw new Error("socket hang up");
			},
		];
		for (const respond of responders) {
			const r = await failureOf(respond);
			expect(r.message).not.toContain(API_KEY);
			expect(r.raw).not.toContain(API_KEY);
		}
	});
});
