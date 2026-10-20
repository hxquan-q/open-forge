// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { rehypeCitationTags } from "./citationMarkdown";

/**
 * 插件层单元测试:手搭最小 hast 树直接跑变换,聚焦节点级契约(AC-7/AC-8 与跳过规则)。
 * 端到端(react-markdown 全管线 + 既有 a 渲染/打开通道)在 WeKnoraMarkdownProvider.test.tsx。
 */

interface TextNode {
	type: "text";
	value: string;
}
interface RawNode {
	type: "raw";
	value: string;
}
interface ElementNode {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children: Array<TextNode | RawNode | ElementNode>;
}

function text(value: string): TextNode {
	return { type: "text", value };
}
function raw(value: string): RawNode {
	return { type: "raw", value };
}
function element(tagName: string, children: Array<TextNode | RawNode | ElementNode>): ElementNode {
	return { type: "element", tagName, children };
}
function run(children: Array<TextNode | RawNode | ElementNode>): Array<TextNode | RawNode | ElementNode> {
	const root = { type: "root" as const, children };
	rehypeCitationTags()(root);
	return root.children;
}

const WEB_TAG =
	'<web url="https://developer.kingdee.com/article/1?productLineId=29&amp;lang=zh" title="单点登录说明" />';
const KB_TAG =
	'<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="594adadd-7ceb-44f7-b285-c806e627c73d" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';

describe("rehypeCitationTags · web 标签 → 标准 link 节点", () => {
	it("raw 宿主:替换为 a 元素,href 为反转义后的 url,children 为域名(去端口/userinfo)", () => {
		const [node] = run([raw(WEB_TAG)]);
		expect(node).toEqual({
			type: "element",
			tagName: "a",
			properties: {
				href: "https://developer.kingdee.com/article/1?productLineId=29&lang=zh",
				title: "单点登录说明",
			},
			children: [{ type: "text", value: "developer.kingdee.com" }],
		});
	});

	it("域名提取:userinfo 与端口剥除,无协议时回退整串(fail-open)", () => {
		const [withUser] = run([raw('<web url="https://user:pw@example.com:8443/a" />')]);
		expect(withUser.type === "element" && withUser.children[0].type === "text" && withUser.children[0].value).toBe(
			"example.com",
		);
		const [noScheme] = run([raw('<web url="example.com/a" />')]);
		expect(noScheme.type === "element" && noScheme.children[0].type === "text" && noScheme.children[0].value).toBe(
			"example.com/a",
		);
	});

	it("无 url 的 web 标签造不出链接:整段剥除,不显示 raw(D5 fail-open)", () => {
		expect(run([raw('<web title="只有标题" />')])).toEqual([]);
	});

	it("HTML 块吞进来的后续行:与标签同一 raw 节点时按段展开,link 与正文并存", () => {
		const children = run([raw(`${WEB_TAG}\n后续正文`)]);
		expect(children).toHaveLength(2);
		expect(children[0].type === "element" && children[0].tagName).toBe("a");
		expect(children[1]).toEqual({ type: "text", value: "\n后续正文" });
	});
});

describe("rehypeCitationTags · kb 标签本票维持现状文本", () => {
	it("raw 宿主:按原文区间逐字符回放为文本节点(不做任何加工)", () => {
		expect(run([raw(KB_TAG)])).toEqual([{ type: "text", value: KB_TAG }]);
	});

	it("text 宿主(官方正则命中但非合法 HTML 的写法):同样原文回放,前后正文不动", () => {
		const children = run([text(`前文<kb doc=x/>后文`)]);
		expect(children).toEqual([
			{ type: "text", value: "前文" },
			{ type: "text", value: "<kb doc=x/>" },
			{ type: "text", value: "后文" },
		]);
	});
});

describe("rehypeCitationTags · 残缺尾部剥除(AC-7)", () => {
	it("text 节点尾部半截 kb/web 前缀剥除,其前正文保留", () => {
		expect(run([text('结论如上。<kb doc="x" chunk_id="c1')])).toEqual([{ type: "text", value: "结论如上。" }]);
		expect(run([text("正文 <web url=")])).toEqual([{ type: "text", value: "正文 " }]);
	});

	it("完整 web 标签后跟半截前缀:link 照常产出,残缺不产出", () => {
		const children = run([raw(`${WEB_TAG}尾巴<kb do`)]);
		expect(children).toHaveLength(2);
		expect(children[0].type === "element" && children[0].tagName).toBe("a");
		expect(children[1]).toEqual({ type: "text", value: "尾巴" });
	});
});

describe("rehypeCitationTags · 零改动路径(AC-4)与跳过规则", () => {
	it("无标签文本节点原对象透传(引用同一,不重建)", () => {
		const plain = text("K/3 WISE & KIS云 是传统ERP产品的云化版本");
		const children = run([plain]);
		expect(children).toHaveLength(1);
		expect(children[0]).toBe(plain);
	});

	it("非引用类 raw 节点原样保留(交给 react-markdown 既有的 raw→文本收尾,维持现状)", () => {
		const foreign = raw("<div>不是引用标签</div>");
		const children = run([foreign]);
		expect(children[0]).toBe(foreign);
	});

	it("code/pre/a 内的标签文本不处理(同仓 rehypeInlineTokens 先例口径)", () => {
		const inCode = text(WEB_TAG);
		const inPre = text(KB_TAG);
		const inLink = text(WEB_TAG);
		const children = run([
			element("p", [
				text("外层 "),
				element("code", [inCode]),
				element("pre", [inPre]),
				element("a", [inLink]),
				text(" 收尾"),
			]),
		]);
		const paragraph = children[0];
		if (paragraph.type !== "element") throw new Error("expected element");
		expect(paragraph.children[1].type === "element" && paragraph.children[1].children[0]).toBe(inCode);
		expect(paragraph.children[2].type === "element" && paragraph.children[2].children[0]).toBe(inPre);
		expect(paragraph.children[3].type === "element" && paragraph.children[3].children[0]).toBe(inLink);
		expect(paragraph.children[0]).toEqual({ type: "text", value: "外层 " });
		expect(paragraph.children[4]).toEqual({ type: "text", value: " 收尾" });
	});

	it("混排:同段内 kb 原文回放 + web 转 link,空格与标点不被吞(AC-8)", () => {
		const source = `参照 ${KB_TAG} 与 ${WEB_TAG} 以及句尾。`;
		const children = run([raw(source)]);
		expect(children.map((child) => (child.type === "element" ? `[[${child.tagName}]]` : child.value))).toEqual([
			"参照 ",
			KB_TAG,
			" 与 ",
			"[[a]]",
			" 以及句尾。",
		]);
	});
});
