import { describe, expect, it } from "vitest";
import { describeError } from "./describe-error.js";

describe("describeError", () => {
	it("普通 Error → name: message", () => {
		expect(describeError(new TypeError("bad input"))).toBe("TypeError: bad input");
	});

	it("带 cause 的 Error → 沿链追加 caused by 与元数据", () => {
		const cause = Object.assign(new Error("connect refused"), { code: "ECONNREFUSED", port: 443 });
		const error = new Error("request failed", { cause });
		expect(describeError(error)).toBe(
			"Error: request failed; caused by: Error: connect refused [code=ECONNREFUSED, port=443]",
		);
	});

	it("非 Error 对象抛值 → 可读摘要而非 [object Object]", () => {
		const text = describeError({ code: "WRITE_LOCK_TIMEOUT", sessionId: "abc" });
		expect(text).not.toBe("[object Object]");
		expect(text).toContain("WRITE_LOCK_TIMEOUT");
		expect(text).toContain("abc");
	});

	it("string 抛值直通；循环引用对象不崩", () => {
		expect(describeError("plain failure")).toBe("plain failure");
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() => describeError(cyclic)).not.toThrow();
	});

	it("超长值截断到 500 字符", () => {
		const text = describeError(new Error("x".repeat(1000)));
		expect(text.length).toBeLessThanOrEqual(501);
		expect(text.endsWith("…")).toBe(true);
	});
});
