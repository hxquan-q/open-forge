// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { WeKnoraHttpClient } from "./http.js";

/**
 * `WeKnoraHttpClient.getFileData` 合同(F3 v2,只读数据面;07-acceptance-fixes.md)。
 *
 * 实测通路:`GET /files?file_path=<minio://…>` 带 `X-API-Key` → 200 image/png。
 * 断言:URL/方法/鉴权头/无 body、data URL 形态、非图片响应降级为归一化错误。
 * baseUrl 为假域名、Key 为占位串(C1/C2:不触真实实例,无 Key 入夹具)。
 */

const BASE_URL = "http://weknora-file.invalid:8083";
const API_KEY = "tenant-api-key-placeholder";
const REF = "minio://images/10001/exports/44cb4d70-8152-4127-beb0-4f31feedf8ef.png";

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

describe("WeKnoraHttpClient · getFileData(F3 v2)", () => {
	it("image/png 响应归一化为 data URL;GET /files?file_path=… 且鉴权头只在请求里", async () => {
		const bytes = new Uint8Array([137, 80, 78, 71]);
		const { fetchImpl, calls } = capturingFetch(
			() => new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }),
		);
		const file = await clientWith(fetchImpl).getFileData(REF);

		expect(file.contentType).toBe("image/png");
		expect(file.dataUrl).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
		// 只读铁律:一次请求、GET、无 body、只指向 /files 读端点。
		expect(calls).toHaveLength(1);
		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.body).toBeUndefined();
		const url = new URL(calls[0]?.url ?? "");
		expect(url.pathname).toBe("/files");
		expect(url.searchParams.get("file_path")).toBe(REF);
		expect((calls[0]?.init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
	});

	it("content-type 带参数时只取媒体类型段", async () => {
		const { fetchImpl } = capturingFetch(
			() =>
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "Content-Type": "image/jpeg; charset=binary" },
				}),
		);
		const file = await clientWith(fetchImpl).getFileData("minio://x/a.jpg");
		expect(file.contentType).toBe("image/jpeg");
		expect(file.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
	});

	it("非图片响应(如 JSON/PDF)→ 归一化错误,不产出 data URL", async () => {
		const { fetchImpl } = capturingFetch(
			() => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
		);
		await expect(clientWith(fetchImpl).getFileData("minio://x/a.pdf")).rejects.toMatchObject({
			weknora: { code: "unknown" },
		});
	});

	it("403 → capability_missing(缺 retrieve)", async () => {
		const { fetchImpl } = capturingFetch(() => new Response("forbidden", { status: 403 }));
		await expect(clientWith(fetchImpl).getFileData(REF)).rejects.toMatchObject({
			weknora: { code: "capability_missing", missingCapability: "retrieve", status: 403 },
		});
	});
});
