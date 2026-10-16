// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import {
	createErrorDeduplicator,
	normalizeHttpError,
	normalizeStreamError,
	normalizeThrownError,
	streamInterruptedError,
	WeKnoraRequestError,
} from "./errors.js";

describe("normalizeHttpError", () => {
	it("401 → unauthorized", () => {
		expect(normalizeHttpError(401, { message: "no" })).toEqual({ code: "unauthorized", status: 401 });
	});

	it("403 → capability_missing，并按上下文标记缺失的能力", () => {
		expect(normalizeHttpError(403, {}, { capability: "read_agents" })).toEqual({
			code: "capability_missing",
			status: 403,
			missingCapability: "read_agents",
		});
		expect(normalizeHttpError(403, {}, { capability: "chat" })).toEqual({
			code: "capability_missing",
			status: 403,
			missingCapability: "chat",
		});
	});

	it("409 + TENANT_REQUIRED → tenant_required", () => {
		expect(normalizeHttpError(409, { code: "TENANT_REQUIRED" })).toEqual({ code: "tenant_required", status: 409 });
		expect(normalizeHttpError(409, '{"error":"TENANT_REQUIRED"}')).toEqual({ code: "tenant_required", status: 409 });
	});

	it("409 非 TENANT_REQUIRED → unknown（带 status）", () => {
		expect(normalizeHttpError(409, { code: "OTHER" })).toEqual({
			code: "unknown",
			status: 409,
			detail: '{"code":"OTHER"}',
		});
	});
});

describe("normalizeThrownError", () => {
	it("超时控制器触发 → timeout", () => {
		expect(normalizeThrownError(new Error("boom"), { timedOut: true })).toEqual({ code: "timeout" });
	});

	it("其它抛错 → network，保留原始信息", () => {
		expect(normalizeThrownError(new TypeError("fetch failed"), { timedOut: false })).toEqual({
			code: "network",
			detail: "fetch failed",
		});
	});
});

describe("normalizeStreamError / streamInterruptedError", () => {
	it("带 detail 的 stream_error", () => {
		expect(normalizeStreamError("bad")).toEqual({ code: "stream_error", detail: "bad" });
		expect(normalizeStreamError()).toEqual({ code: "stream_error" });
	});

	it("stream_interrupted 无附加字段", () => {
		expect(streamInterruptedError()).toEqual({ code: "stream_interrupted" });
	});
});

describe("createErrorDeduplicator", () => {
	it("同码只报一次", () => {
		const dedupe = createErrorDeduplicator();
		expect(dedupe.shouldReport({ code: "stream_error" })).toBe(true);
		expect(dedupe.shouldReport({ code: "stream_error", detail: "再次" })).toBe(false);
		expect(dedupe.shouldReport({ code: "timeout" })).toBe(true);
	});
});

describe("WeKnoraRequestError", () => {
	it("message 只放错误码，不含凭据/中文", () => {
		const error = new WeKnoraRequestError({ code: "unauthorized", status: 401 });
		expect(error.message).toBe("unauthorized");
		expect(error.weknora).toEqual({ code: "unauthorized", status: 401 });
	});
});
