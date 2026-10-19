// Copyright The Open Forge contributors.
/**
 * 元素上下文包（TASK-0315 F2 数据层）：outerHTML 截断与白名单样式摘要。
 * 纯函数、注入 getComputedStyle——不在测试里依赖真实布局。
 */
import { describe, expect, it } from "vitest";
import { outerHtmlSnippet, styleSummaryFor } from "../engine/src/source-payload";

function elementWith(outerHTML: string): Element {
	const host = document.createElement("div");
	host.innerHTML = outerHTML;
	const el = host.firstElementChild;
	if (!el) throw new Error("fixture element missing");
	return el;
}

function styleStub(values: Record<string, string>): (element: Element) => CSSStyleDeclaration {
	return () => values as unknown as CSSStyleDeclaration;
}

describe("outerHtmlSnippet", () => {
	it("短元素原样返回", () => {
		expect(outerHtmlSnippet(elementWith('<button class="go">Go</button>'))).toBe(
			'<button class="go">Go</button>',
		);
	});

	it("超限截断到 2KB 并带截断标记", () => {
		const el = elementWith(`<div>${"x".repeat(5000)}</div>`);
		const snippet = outerHtmlSnippet(el);
		expect(snippet.length).toBeLessThanOrEqual(2048 + 64);
		expect(snippet).toContain("[truncated ");
	});
});

describe("styleSummaryFor", () => {
	it("只保留白名单里非空的键", () => {
		const el = elementWith("<div>hi</div>");
		const summary = styleSummaryFor(el, styleStub({ display: "flex", flexDirection: "row", color: "", zIndex: "10" }));
		expect(summary).toEqual({ display: "flex", flexDirection: "row" });
	});

	it("白名单全集都透传（布局/排版键）", () => {
		const el = elementWith("<span>a</span>");
		const summary = styleSummaryFor(el, styleStub({
			display: "grid",
			flexDirection: "column",
			gap: "8px",
			fontSize: "14px",
			fontWeight: "600",
			color: "rgb(15, 23, 42)",
			backgroundColor: "rgba(0, 0, 0, 0)",
			borderRadius: "12px",
			width: "390px",
			height: "844px",
		}));
		expect(Object.keys(summary)).toHaveLength(10);
	});
});
