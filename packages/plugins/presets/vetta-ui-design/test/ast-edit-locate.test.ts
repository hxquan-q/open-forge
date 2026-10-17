// Copyright The Open Forge contributors.

/**
 * 目标定位与指纹重定位（TASK-0316）：
 * 行列精确命中 → 行漂移后指纹找回 → 同构兄弟并列拒绝。
 */
import { describe, expect, it } from "vitest";
import { locateElement } from "../src/inspector/ast-edit/locate";
import { parseTsx } from "../src/inspector/ast-edit/parse";

function locatorFor(source: string, marker: string): { line: number; column: number } {
	const index = source.indexOf(marker);
	if (index < 0) throw new Error(`marker not found: ${marker}`);
	const line = source.slice(0, index).split("\n").length;
	const column = index - (source.lastIndexOf("\n", index - 1) + 1) + 1;
	return { line, column };
}

const SOURCE = `export default function Page() {
	return (
		<section className="p-4">
			<header>标题</header>
			<button className="p-2 text-sm">确认</button>
		</section>
	);
}
`;

describe("locateElement", () => {
	it("行列精确命中（1-based，指向元素开标签的 <）", () => {
		const result = locateElement(parseTsx(SOURCE).ast, locatorFor(SOURCE, "<button"), null);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tag).toBe("button");
			expect(result.fingerprint.ancestors[0]).toBe("section");
			expect(result.fingerprint.textDigest).toBe("确认");
		}
	});

	it("行列打空且无指纹 → locator-miss，不做猜测", () => {
		const result = locateElement(parseTsx(SOURCE).ast, { line: 99, column: 1 }, null);
		expect(result).toMatchObject({ ok: false, reason: "locator-miss" });
	});

	it("行漂移后指纹重定位仍能找回同一元素", () => {
		const located = locateElement(parseTsx(SOURCE).ast, locatorFor(SOURCE, "<button"), null);
		if (!located.ok) throw new Error("precondition failed");
		// 上方插入 3 行：原 locator 必然打空，指纹应命中同一 button。
		const drifted = `// a\n// b\n// c\n${SOURCE}`;
		const retry = locateElement(parseTsx(drifted).ast, locatorFor(SOURCE, "<button"), located.fingerprint);
		expect(retry.ok).toBe(true);
		if (retry.ok) {
			expect(retry.tag).toBe("button");
			expect(retry.fingerprint.textDigest).toBe("确认");
		}
	});

	it("同构兄弟文本也一致时打分并列 → ambiguous 拒绝", () => {
		const twinSource = `export default function Page() {
	return (
		<ul>
			<li className="x">星</li>
			<li className="y">星</li>
		</ul>
	);
}
`;
		const located = locateElement(parseTsx(twinSource).ast, locatorFor(twinSource, "<li"), null);
		if (!located.ok) throw new Error("precondition failed");
		const drifted = `// pad\n${twinSource}`;
		const retry = locateElement(parseTsx(drifted).ast, { line: 99, column: 1 }, located.fingerprint);
		expect(retry).toMatchObject({ ok: false, reason: "ambiguous", candidates: 2 });
	});

	it("指纹文本可区分时漂移后仍唯一定位", () => {
		const twins = `export default function Page() {
	return (
		<ul>
			<li className="x">首页</li>
			<li className="y">设置</li>
		</ul>
	);
}
`;
		const located = locateElement(parseTsx(twins).ast, locatorFor(twins, "<li"), null);
		if (!located.ok) throw new Error("precondition failed");
		expect(located.fingerprint.textDigest).toBe("首页");
		const drifted = `// pad\n${twins}`;
		const retry = locateElement(parseTsx(drifted).ast, { line: 99, column: 1 }, located.fingerprint);
		expect(retry.ok).toBe(true);
		if (retry.ok) expect(retry.fingerprint.textDigest).toBe("首页");
	});
});
