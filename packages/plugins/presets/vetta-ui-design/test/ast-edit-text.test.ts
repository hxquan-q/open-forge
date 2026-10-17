// Copyright The Open Forge contributors.

/**
 * 文本确定性编辑（TASK-0316）：单行保格式替换、空白保留、无文本插入、
 * 多行拆 <br/>、自闭合展开、JSX 特殊字符转义。
 */
import { describe, expect, it } from "vitest";
import { editText } from "../src/inspector/ast-edit";

function locatorFor(source: string, marker: string): { line: number; column: number } {
	const index = source.indexOf(marker);
	if (index < 0) throw new Error(`marker not found: ${marker}`);
	const line = source.slice(0, index).split("\n").length;
	const column = index - (source.lastIndexOf("\n", index - 1) + 1) + 1;
	return { line, column };
}

describe("editText", () => {
	it("单行替换只动内容区间，首尾空白原样保留", () => {
		const source = 'export default function T() {\n\treturn <p>  旧文案  </p>;\n}\n';
		const result = editText(source, locatorFor(source, "<p"), null, "新文案");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toBe('export default function T() {\n\treturn <p>  新文案  </p>;\n}\n');
	});

	it("中文与标点照常替换", () => {
		const source = 'export default function T() {\n\treturn <h1>你好，世界</h1>;\n}\n';
		const result = editText(source, locatorFor(source, "<h1"), null, "你好，Open Forge");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<h1>你好，Open Forge</h1>");
	});

	it("内容未变 → changed:false、code 等于原文", () => {
		const source = 'export default function T() {\n\treturn <p>相同</p>;\n}\n';
		const result = editText(source, locatorFor(source, "<p"), null, "相同");
		expect(result).toMatchObject({ ok: true, changed: false });
		if (result.ok) expect(result.code).toBe(source);
	});

	it("没有文本子节点时在开标签后插入", () => {
		const source = 'export default function T() {\n\treturn <li><Icon /><Chevron /></li>;\n}\n';
		const result = editText(source, locatorFor(source, "<li"), null, "首页");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<li>首页<Icon /><Chevron /></li>");
	});

	it("多行文本重建子节点为 text + <br/>（Onlook 语义）", () => {
		const source = 'export default function T() {\n\treturn <p>第一行 第二行</p>;\n}\n';
		const result = editText(source, locatorFor(source, "<p"), null, "第一行\n第二行");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<p>第一行<br />第二行</p>");
	});

	it("自闭合元素接到多行文本时展开为配对标签", () => {
		const source = 'export default function T() {\n\treturn <div><Badge /></div>;\n}\n';
		const result = editText(source, locatorFor(source, "<Badge"), null, "a\nb");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<Badge>a<br />b</Badge>");
	});

	it("JSX 特殊字符（{ } < >）转义为实体", () => {
		const source = 'export default function T() {\n\treturn <p>占位</p>;\n}\n';
		const result = editText(source, locatorFor(source, "<p"), null, "a{b}<c>");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<p>a&#123;b&#125;&lt;c&gt;</p>");
	});

	it("locator 打空且无指纹 → locator-miss", () => {
		const result = editText("export default () => <p>x</p>;\n", { line: 40, column: 3 }, null, "y");
		expect(result).toMatchObject({ ok: false, reason: "locator-miss" });
	});
});
