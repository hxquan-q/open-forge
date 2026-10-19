// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const templateSource = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../src/export-html/assets/template.js"),
	"utf-8",
);

/**
 * 从导出模板资产中按花括号配平提取顶层函数源码并求值。
 * 模板在浏览器中执行，Node 侧无法整段加载；对净化逻辑做行为级断言时
 * 以提取求值代替静态文本匹配，实现回退（如 DOM 版 escapeHtml）会直接红。
 */
function extractTemplateFunction<TFunction>(name: string): TFunction {
	const marker = `function ${name}(`;
	const start = templateSource.indexOf(marker);
	if (start === -1) throw new Error(`Function not found in template.js: ${name}`);
	const openBrace = templateSource.indexOf("{", start);
	let depth = 0;
	for (let index = openBrace; index < templateSource.length; index++) {
		const char = templateSource[index];
		if (char === "{") depth++;
		else if (char === "}") {
			depth--;
			if (depth === 0) {
				const source = templateSource.slice(start, index + 1);
				return new Function(`${source}; return ${name};`)() as TFunction;
			}
		}
	}
	throw new Error(`Unbalanced braces while extracting ${name}`);
}

const escapeHtml = extractTemplateFunction<(text: unknown) => string>("escapeHtml");
const sanitizeMarkdownUrl = extractTemplateFunction<(value: unknown) => string | null>("sanitizeMarkdownUrl");

describe("export-html Markdown URL sanitization (GHSA-7v5m)", () => {
	it("rejects executable schemes even when split by control characters", () => {
		for (const url of [
			"javascript:alert(1)",
			"JavaScript:alert(1)",
			"java\x00script:alert(1)",
			"java\x01script:alert(1)",
			"java\tscript:alert(1)",
			"jav\x7fascript:alert(1)",
			" javascript:alert(1)",
			"\njavascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"DATA:text/html;base64,WFhY",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
			"blob:https://example.com/uuid",
		]) {
			expect(sanitizeMarkdownUrl(url), `expected rejection: ${JSON.stringify(url)}`).toBeNull();
		}
	});

	it("allows allow-listed schemes and scheme-less URLs unchanged", () => {
		for (const url of [
			"https://example.com/a?b=c#d",
			"http://example.com",
			"HTTPS://EXAMPLE.COM/path",
			"mailto:someone@example.com",
			"tel:+1-555-0100",
			"ftp://ftp.example.com/pub",
			"./relative/page.html",
			"/absolute/path",
			"#fragment-only",
			"no-scheme-text",
		]) {
			expect(sanitizeMarkdownUrl(url), `expected pass-through: ${url}`).toBe(url);
		}
	});

	it("renders links and images only through the sanitizer", () => {
		expect(templateSource).toMatch(/link\(token\)\s*\{/);
		expect(templateSource).toMatch(/image\(token\)\s*\{/);
		// link 与 image 两个 renderer 都必须以净化结果决定输出
		expect(templateSource.match(/sanitizeMarkdownUrl\(token\.href\)/g)?.length).toBeGreaterThanOrEqual(2);
	});

	it("escapes quotes so attribute interpolation cannot break out", () => {
		expect(escapeHtml(`a"b'c<d>&e`)).toBe("a&quot;b&#39;c&lt;d&gt;&amp;e");
		expect(escapeHtml(42)).toBe("42");
	});
});
