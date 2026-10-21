// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { rehypeCitationTags } from "./citationMarkdown";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-1/AC-7/AC-8 的 hast 层)。
 *
 * 实现者的插件用例(citationMarkdown.test.ts)用手搭最小树逐例点查;本文件换角度:
 * 把 T00 实测**真实 8 标签消息全文**整个塞进一个 raw 节点跑变换(CommonMark HTML 块吞行
 * 的最不利形态),断言端到端的数量守恒与序列形态——真实消息里任何标签被漏转/误剥都会暴露。
 * 夹具仅文档名与资源 UUID,无凭据(C2)。
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
type Child = TextNode | RawNode | ElementNode;

function run(children: Child[]): Child[] {
	const root = { type: "root" as const, children };
	rehypeCitationTags()(root);
	return root.children;
}

function isElement(node: Child | undefined): node is ElementNode {
	return node !== undefined && node.type === "element";
}

/** 真实消息首段(含第 1 个 kb 标签,doc 名 43 字符含全角引号)。 */
const REAL_EXCERPT =
	'金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求<kb doc="超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md" chunk_id="f2acd65e-3969-4700-88f6-612579891ec6" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />:';

/** 真实消息尾段(相邻双标签 + 句号)。 */
const REAL_TAIL =
	'所有产品线都提供免费的学习资源和认证考试服务,帮助企业用户快速掌握产品使用方法<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="594adadd-7ceb-44f7-b285-c806e627c73d" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" /><kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="9fd26fe3-88a5-4515-947b-f32f458af9ec" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />。';

describe("rehypeCitationTags 验收 · 真实消息全文(AC-1/AC-8 hast 侧)", () => {
	it("真实首段塞进一个 raw 节点:kb 标签转 weknora-citation,doc 属性带反转义全文,正文零丢失", () => {
		const children = run([raw(REAL_EXCERPT)]);
		// 形态:正文文本 + 角标元素 + 尾部冒号文本,顺序保持。
		expect(children).toHaveLength(3);
		expect(children[0]).toEqual({ type: "text", value: "金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求" });
		expect(isElement(children[1]) ? children[1].tagName : "").toBe("weknora-citation");
		expect(isElement(children[1]) ? children[1].properties : null).toEqual({
			doc: "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
			chunkId: "f2acd65e-3969-4700-88f6-612579891ec6",
			kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
		});
		expect(children[2]).toEqual({ type: "text", value: ":" });
	});

	it("相邻双标签(真实形态 <kb/><kb/> 紧贴):产出两个紧邻角标元素,后随句号保留(AC-8)", () => {
		const children = run([raw(REAL_TAIL)]);
		expect(children).toHaveLength(4);
		const [lead, first, second, tail] = children;
		expect(lead).toEqual({
			type: "text",
			value: "所有产品线都提供免费的学习资源和认证考试服务,帮助企业用户快速掌握产品使用方法",
		});
		expect(isElement(first) ? first.tagName : "").toBe("weknora-citation");
		expect(isElement(second) ? second.tagName : "").toBe("weknora-citation");
		// 两个角标 chunkId 不同(同名文档的两个不同分块),不得合并或串位。
		expect(isElement(first) ? first.properties?.chunkId : "").toBe("594adadd-7ceb-44f7-b285-c806e627c73d");
		expect(isElement(second) ? second.properties?.chunkId : "").toBe("9fd26fe3-88a5-4515-947b-f32f458af9ec");
		expect(tail).toEqual({ type: "text", value: "。" });
	});

	it("kb+web+markdown 三方混排:角标/链接/加粗文本同段共存,精确序列断言(AC-8)", () => {
		const children = run([
			raw(
				'参照 **加粗**、<kb doc="文档甲.md" chunk_id="c-mix-1" kb_id="b" /> 与 <web url="https://developer.kingdee.com/article/1?x=1&amp;y=2" title="说明" /> 以及句尾。',
			),
		]);
		expect(children.map((child) => (child.type === "element" ? `[[${child.tagName}]]` : child.value))).toEqual([
			"参照 **加粗**、",
			"[[weknora-citation]]",
			" 与 ",
			"[[a]]",
			" 以及句尾。",
		]);
		// web 链接 href 反转义,链接文本是域名。
		const link = children[3];
		if (!isElement(link)) throw new Error("expected link");
		expect(link.properties).toEqual({ href: "https://developer.kingdee.com/article/1?x=1&y=2", title: "说明" });
	});
});

describe("rehypeCitationTags 验收 · 残缺与退化(AC-7 hast 侧)", () => {
	it('text 宿主流中断残缺(<kb doc="x" chunk_id="c1 无闭引号无 >):整段剥除,前文含标点完整', () => {
		const children = run([text('结论见上。<kb doc="x" chunk_id="c1')]);
		expect(children).toEqual([{ type: "text", value: "结论见上。" }]);
	});

	it("裸 < 字面量不是标签:节点原样透传(fail-open,AC-4 hast 侧)", () => {
		const plain = text("比较式 x < 5 与泛型 list<int> 都不是引用");
		const children = run([plain]);
		expect(children[0]).toBe(plain);
	});
});

function text(value: string): TextNode {
	return { type: "text", value };
}
function raw(value: string): RawNode {
	return { type: "raw", value };
}
