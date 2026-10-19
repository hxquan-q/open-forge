// Copyright The Open Forge contributors.

/**
 * Tailwind class 确定性编辑（TASK-0316）：冲突合并、移除、整串替换、插入，
 * 以及「文件其余字节零扰动」与动态 className 只读拒绝。
 */
import { describe, expect, it } from "vitest";
import { editClasses } from "../src/inspector/ast-edit";

function locatorFor(source: string, marker: string): { line: number; column: number } {
	const index = source.indexOf(marker);
	if (index < 0) throw new Error(`marker not found: ${marker}`);
	const line = source.slice(0, index).split("\n").length;
	const column = index - (source.lastIndexOf("\n", index - 1) + 1) + 1;
	return { line, column };
}

const SOURCE = `export default function Card() {
	return (
		<article className="p-2 text-sm /* 注释不在属性里 */">
			{/* 属性之外的注释 */}
			<button className="p-2 text-sm">确认</button>
			<output>{count}</output>
		</article>
	);
}
`;

describe("editClasses", () => {
	it("add 走冲突合并：p-2 + p-4 → p-4 生效（tailwind-merge 的规范序），其余字节零扰动", () => {
		const result = editClasses(SOURCE, locatorFor(SOURCE, "<button"), null, { add: ["p-4"] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const expected = SOURCE.replace('className="p-2 text-sm">确认', 'className="text-sm p-4">确认');
		expect(result.changed).toBe(true);
		expect(result.code).toBe(expected);
	});

	it("remove 精确移除 token", () => {
		const result = editClasses(SOURCE, locatorFor(SOURCE, "<button"), null, { remove: ["text-sm"] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain('className="p-2"');
	});

	it("replace 整串替换", () => {
		const result = editClasses(SOURCE, locatorFor(SOURCE, "<button"), null, { replace: "m-8" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain('className="m-8"');
	});

	it("结果与现状一致 → changed:false 且 code 逐字节等于原文", () => {
		const result = editClasses(SOURCE, locatorFor(SOURCE, "<button"), null, { add: ["p-2"] });
		expect(result).toMatchObject({ ok: true, changed: false });
		if (result.ok) expect(result.code).toBe(SOURCE);
	});

	it("元素没有 className 时紧跟标签名插入", () => {
		const result = editClasses(SOURCE, locatorFor(SOURCE, "<output"), null, { add: ["mt-2"] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("<output className=\"mt-2\">{count}</output>");
	});

	it("动态 className（条件表达式）→ 只读拒绝 dynamic-class", () => {
		const dynamic = `export default function T({ big }: { big: boolean }) {
	return <div className={big ? "p-2" : "p-4"}>x</div>;
}
`;
		const result = editClasses(dynamic, locatorFor(dynamic, "<div"), null, { add: ["m-2"] });
		expect(result).toMatchObject({ ok: false, reason: "dynamic-class" });
	});

	it("动态 className（模板串）→ 只读拒绝 dynamic-class", () => {
		const dynamic = 'export default function T() {\n\treturn <div className={`p-2 ${tone}`}>x</div>;\n}\n';
		const result = editClasses(dynamic, locatorFor(dynamic, "<div"), null, { add: ["m-2"] });
		expect(result).toMatchObject({ ok: false, reason: "dynamic-class" });
	});

	it("行漂移后凭指纹仍改到同一元素", () => {
		const located = editClasses(SOURCE, locatorFor(SOURCE, "<button"), null, { add: ["p-2"] });
		if (!located.ok) throw new Error("precondition failed");
		const drifted = `// pad1\n// pad2\n${SOURCE}`;
		const retry = editClasses(drifted, locatorFor(SOURCE, "<button"), located.fingerprint, { add: ["p-4"] });
		expect(retry.ok).toBe(true);
		if (!retry.ok) return;
		expect(retry.code).toContain('className="text-sm p-4">确认');
		// 漂移填充行原样保留。
		expect(retry.code.startsWith("// pad1\n// pad2\nexport default")).toBe(true);
	});

	it("解析失败 → parse-error 且 message 带位置", () => {
		const result = editClasses("const x = {", { line: 1, column: 1 }, null, { add: ["a"] });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("parse-error");
			expect(result.message ?? "").toMatch(/1:1|\d+:\d+/);
		}
	});
});
