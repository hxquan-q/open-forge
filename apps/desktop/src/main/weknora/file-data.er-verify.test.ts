// Copyright The Open Forge contributors.

import { describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, WeKnoraHttpClient } from "./http.js";

/**
 * ER 轮独立复验（F1：getFileData 体积上限）。
 *
 * 独立角度（不照抄实现者用例）：
 * - 核心命题是「**预检**而非读完再判」——用 arrayBuffer spy 断言超限时它**从未被调用**；
 * - 边界：content-length **恰好等于**上限须放行（不误拒）；
 * - 兜底：无 content-length 头时按实际 byteLength 拒超限体；
 * - 不误拒：content-length 是垃圾串（NaN）/ 负值时不当作超限；
 * - 既有语义：非图片响应即使 content-length 超限，仍按「坏响应」拒（体积闸不越权改写）。
 *
 * 全部用手搓响应对象（可注入任意 content-length、可监视 arrayBuffer），不真造 20MB 传输。
 * 假域名 + 占位 Key，不触真实实例（C1/C2）。
 */

const BASE_URL = "http://weknora-file.invalid:8083";
const API_KEY = "verify-placeholder-key";
const REF = "minio://images/verify/1.png";

function clientWith(fetchImpl: typeof fetch): WeKnoraHttpClient {
	return new WeKnoraHttpClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
}

interface FakeResponseOptions {
	/** 传 `null` 表示**不设**该响应头。 */
	readonly contentType?: string | null;
	readonly contentLength?: string | null;
	readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

function fakeResponse(options: FakeResponseOptions): { response: Response; arrayBuffer: ReturnType<typeof vi.fn> } {
	const headers = new Headers();
	if (options.contentType !== null && options.contentType !== undefined) {
		headers.set("Content-Type", options.contentType);
	}
	if (options.contentLength !== null && options.contentLength !== undefined) {
		headers.set("Content-Length", options.contentLength);
	}
	const arrayBuffer = vi.fn(options.arrayBuffer);
	const response = { ok: true, headers, arrayBuffer } as unknown as Response;
	return { response, arrayBuffer };
}

function fetchOf(response: Response): typeof fetch {
	return (async () => response) as unknown as typeof fetch;
}

describe("getFileData 体积上限 · ER 独立复验（F1）", () => {
	it("content-length 超限：arrayBuffer **从未被调用**（预检，不是读完再判）", async () => {
		const { response, arrayBuffer } = fakeResponse({
			contentType: "image/png",
			contentLength: String(MAX_FILE_BYTES + 1),
			arrayBuffer: async () => {
				throw new Error("arrayBuffer 不该被调用：超限体不应读进内存");
			},
		});

		await expect(clientWith(fetchOf(response)).getFileData(REF)).rejects.toMatchObject({
			weknora: {
				code: "unknown",
				detail: `getFileData: content-length ${MAX_FILE_BYTES + 1} exceeds ${MAX_FILE_BYTES}`,
			},
		});
		// 本修复的核心：拒绝发生在 arrayBuffer 之前。
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	it("content-length 恰好等于上限：不误拒，两道闸均放行（含 byteLength 边界）", async () => {
		// 真造一份恰好 MAX 字节的体：同时压 content-length 闸（== 上限）与 byteLength 闸（== 上限）。
		const body = new Uint8Array(MAX_FILE_BYTES);
		const { response, arrayBuffer } = fakeResponse({
			contentType: "image/png",
			contentLength: String(MAX_FILE_BYTES),
			arrayBuffer: async () => body.buffer,
		});

		const file = await clientWith(fetchOf(response)).getFileData(REF);

		expect(arrayBuffer).toHaveBeenCalledTimes(1);
		expect(file.contentType).toBe("image/png");
		const base64 = file.dataUrl.slice("data:image/png;base64,".length);
		expect(Buffer.from(base64, "base64").byteLength).toBe(MAX_FILE_BYTES);
	});

	it("无 content-length 头 + 超限 body：byteLength 兜底拒（chunked 场景）", async () => {
		const { response, arrayBuffer } = fakeResponse({
			contentType: "image/png",
			contentLength: null,
			arrayBuffer: async () => new ArrayBuffer(MAX_FILE_BYTES + 1),
		});

		await expect(clientWith(fetchOf(response)).getFileData(REF)).rejects.toMatchObject({
			weknora: {
				code: "unknown",
				detail: `getFileData: response body ${MAX_FILE_BYTES + 1} exceeds ${MAX_FILE_BYTES}`,
			},
		});
		expect(arrayBuffer).toHaveBeenCalledTimes(1);
	});

	it("content-length 是垃圾串（解析为 NaN）→ 不误拒，走 byteLength 兜底放行小图", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const { response, arrayBuffer } = fakeResponse({
			contentType: "image/png",
			contentLength: "not-a-number",
			arrayBuffer: async () => bytes.buffer,
		});

		const file = await clientWith(fetchOf(response)).getFileData(REF);
		expect(arrayBuffer).toHaveBeenCalledTimes(1);
		expect(file.dataUrl).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
	});

	it("content-length 是负值 → 不误拒（负值不大于上限）", async () => {
		const bytes = new Uint8Array([7, 8, 9, 10]);
		const { response, arrayBuffer } = fakeResponse({
			contentType: "image/png",
			contentLength: "-1",
			arrayBuffer: async () => bytes.buffer,
		});

		const file = await clientWith(fetchOf(response)).getFileData(REF);
		expect(arrayBuffer).toHaveBeenCalledTimes(1);
		expect(file.dataUrl).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
	});

	it("非图片响应即使 content-length 超限，仍按「坏响应」拒（体积闸不越权改写既有语义）", async () => {
		const { response, arrayBuffer } = fakeResponse({
			contentType: "application/pdf",
			contentLength: String(MAX_FILE_BYTES + 100),
			arrayBuffer: async () => {
				throw new Error("arrayBuffer 不该被调用：非图片先被拒");
			},
		});

		await expect(clientWith(fetchOf(response)).getFileData(REF)).rejects.toMatchObject({
			weknora: { code: "unknown", detail: "getFileData: response is not an image" },
		});
		expect(arrayBuffer).not.toHaveBeenCalled();
	});
});
