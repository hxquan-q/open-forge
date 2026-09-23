import { describe, expect, it } from "vitest";
import { HighlightHtmlCache } from "./syntax-highlight-cache";

describe("HighlightHtmlCache", () => {
	it("超出字符预算时按插入序淘汰最旧条目（条数远未达上限）", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 100, maxBytes: 50 });
		cache.put("k1", "x".repeat(45)); // 成本 47
		cache.put("k2", "a"); // 50
		cache.put("k3", "b"); // 52 > 50 → 淘汰 k1
		expect(cache.get("k1")).toBeUndefined();
		expect(cache.get("k2")).toBe("a");
		expect(cache.get("k3")).toBe("b");
		expect(cache.size).toBe(2);
	});

	it("按插入序依次淘汰直到回到预算内", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 100, maxBytes: 6 });
		cache.put("a", "aaaa"); // 5
		cache.put("b", "bbbb"); // 10 > 6 → 淘汰 a
		cache.put("c", "cccc"); // 10 > 6 → 淘汰 b
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("c")).toBe("cccc");
	});

	it("重复 put 同一 key 只按最新值计费并刷新新近度", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 100, maxBytes: 30 });
		cache.put("k1", "x".repeat(25)); // 27
		cache.put("k2", "a"); // 30
		cache.put("k1", "y".repeat(25)); // 重插到最新，仍 30
		expect(cache.get("k1")).toBe("y".repeat(25));
		expect(cache.get("k2")).toBe("a");
		cache.put("k3", "b"); // 33 > 30 → 淘汰最旧的 k2
		expect(cache.get("k2")).toBeUndefined();
		expect(cache.get("k1")).toBe("y".repeat(25));
		expect(cache.get("k3")).toBe("b");
	});

	it("单条超过整个预算时仍保留该条目", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 100, maxBytes: 10 });
		cache.put("key", "x".repeat(40));
		expect(cache.has("key")).toBe(true);
		expect(cache.size).toBe(1);
	});

	it("shiki 失败路径的空串值同样计入预算并可被淘汰", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 100, maxBytes: 20 });
		const bigKey = "k".repeat(18); // 18 + 0
		cache.put(bigKey, "");
		expect(cache.has(bigKey)).toBe(true);
		expect(cache.get(bigKey)).toBe("");
		cache.put("k2", "ab"); // 22 > 20 → bigKey 被淘汰
		expect(cache.has(bigKey)).toBe(false);
		expect(cache.get("k2")).toBe("ab");
	});

	it("字符预算充足时条数上限仍然生效", () => {
		const cache = new HighlightHtmlCache({ maxEntries: 2, maxBytes: 1_000_000 });
		cache.put("a", "1");
		cache.put("b", "2");
		cache.put("c", "3");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
		expect(cache.get("c")).toBe("3");
		expect(cache.size).toBe(2);
	});

	it("构造参数必须为正整数", () => {
		expect(() => new HighlightHtmlCache({ maxEntries: 0 })).toThrow();
		expect(() => new HighlightHtmlCache({ maxBytes: -1 })).toThrow();
		expect(() => new HighlightHtmlCache({ maxEntries: 1.5 })).toThrow();
		expect(() => new HighlightHtmlCache({ maxBytes: Number.NaN })).toThrow();
	});
});
