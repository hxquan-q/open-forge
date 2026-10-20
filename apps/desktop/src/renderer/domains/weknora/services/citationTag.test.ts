// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import type { CitationSegment } from "./citationTag";
import { parseCitationTags, stripCitationTags } from "./citationTag";

// 夹具拷自 T00 实测真实会话 assistant 消息 304a5703(v1-real-messages.json),
// 仅含文档名与资源 UUID,不含任何凭据(红线 C2)。

const REAL_KB_TAG =
	'<kb doc="超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md" chunk_id="f2acd65e-3969-4700-88f6-612579891ec6" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';

const REAL_KB_TAG_ESCAPED_AMP =
	'<kb doc="苍穹&amp;星瀚 社区知识导航.md" chunk_id="87dd2a5b-4b34-4b13-9510-60cfdaad3f85" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';

const REAL_ADJACENT_KB_TAGS =
	'<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="594adadd-7ceb-44f7-b285-c806e627c73d" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" /><kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="9fd26fe3-88a5-4515-947b-f32f458af9ec" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';

// 真实消息节选(覆盖全部 8 个 <kb> 标签,含转义 & 与相邻双标签两种真实形态)。
const REAL_EXCERPT = `根据检索到的信息,我为您整理金蝶的主要产品线:

## 金蝶主要产品线

金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求${REAL_KB_TAG}:

### 1. **金蝶云·苍穹**
- **定位**:企业级PaaS平台(低代码开发平台)
- **特点**:提供强大的低代码开发能力,支持企业自主开发应用,显著降低开发成本<kb doc="我与金蝶云.苍穹轻报表的故事.md" chunk_id="f7ad4122-3133-453b-937e-c01a1dbfc592" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />
- **适用场景**:大型企业数字化转型、快速应用开发、系统集成

### 2. **金蝶云·星瀚**
- **定位**:面向大型企业的云ERP解决方案
- **主要模块**:财务云、供应链云、税务云、人力资源云、资金云等${REAL_KB_TAG_ESCAPED_AMP}
- **特色功能**:人人费用管理、智能核算、银企服务等

### 3. **金蝶云·星空**
- **定位**:面向成长型企业的云ERP
- **版本**:旗舰版、企业版、标准版<kb doc="我与金蝶云.苍穹轻报表的故事.md" chunk_id="faf9f9ca-7b70-437f-913b-d2f35f7354ab" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />

### 6. **K/3 WISE & KIS云**
- **定位**:传统ERP产品的云化版本
- **适用场景**:中小企业的基础业务管理

---

## 其他配套产品

### **云之家**
- 金蝶系的协同办公产品,支持移动端审批、沟通协作<kb doc="苍穹学习开发使用平台.md" chunk_id="1c4d5b07-03c4-4122-9fa2-511322fdbf16" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />

### **KDesign企业级产品设计系统**
- 提供设计规范、组件库,支撑金蝶全系产品的UI/UX标准化<kb doc="苍穹学习开发使用平台.md" chunk_id="1c4d5b07-03c4-4122-9fa2-511322fdbf16" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />

所有产品线都提供免费的学习资源和认证考试服务,帮助企业用户快速掌握产品使用方法${REAL_ADJACENT_KB_TAGS}。`;

/** 与 stripCitationTags 不同的实现路径拼接 text 段,用于两者一致性断言。 */
function joinTextSegments(segments: readonly CitationSegment[]): string {
	return segments.reduce((acc, segment) => (segment.type === "text" ? acc + segment.text : acc), "");
}

describe("parseCitationTags · 完整标签", () => {
	it("完整 kb 标签(真实形态:尾部带空格斜杠、全角引号文档名)切成 text/tag/text 三段", () => {
		expect(parseCitationTags(`前文${REAL_KB_TAG}:后文`)).toEqual([
			{ type: "text", text: "前文" },
			{
				type: "tag",
				tag: {
					kind: "kb",
					doc: "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
					chunkId: "f2acd65e-3969-4700-88f6-612579891ec6",
					kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
				},
			},
			{ type: "text", text: ":后文" },
		]);
	});

	it("全角引号文档名原样保留,不参与反转义", () => {
		const segments = parseCitationTags(REAL_KB_TAG);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toEqual({
			type: "tag",
			tag: {
				kind: "kb",
				doc: "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
				chunkId: "f2acd65e-3969-4700-88f6-612579891ec6",
				kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
			},
		});
	});

	it("紧凑自闭合与未自闭合的 <kb> 都识别为标签(官方正则两种都收)", () => {
		expect(parseCitationTags('<kb doc="a.md" chunk_id="c1" kb_id="b1"/>')).toEqual([
			{ type: "tag", tag: { kind: "kb", doc: "a.md", chunkId: "c1", kbId: "b1" } },
		]);
		expect(parseCitationTags('<kb doc="a.md" chunk_id="c1" kb_id="b1">')).toEqual([
			{ type: "tag", tag: { kind: "kb", doc: "a.md", chunkId: "c1", kbId: "b1" } },
		]);
	});

	it("缺属性/零属性的 <kb> 仍是 tag 段(缺字段为 undefined,交 UI 降级)", () => {
		expect(parseCitationTags('<kb doc="x" />')).toEqual([{ type: "tag", tag: { kind: "kb", doc: "x" } }]);
		expect(parseCitationTags("<kb>")).toEqual([{ type: "tag", tag: { kind: "kb" } }]);
	});

	it("完整 web 标签:url/title 齐全,url 内转义 & 反解码", () => {
		const input =
			'见 <web url="https://developer.kingdee.com/article/454700048043812608?productLineId=29&amp;lang=zh" title="单点登录说明" /> 详情';
		expect(parseCitationTags(input)).toEqual([
			{ type: "text", text: "见 " },
			{
				type: "tag",
				tag: {
					kind: "web",
					url: "https://developer.kingdee.com/article/454700048043812608?productLineId=29&lang=zh",
					title: "单点登录说明",
				},
			},
			{ type: "text", text: " 详情" },
		]);
	});

	it("相邻两个标签(真实消息尾部形态)切成两个连续 tag 段,其后正文不丢", () => {
		const segments = parseCitationTags(`总结${REAL_ADJACENT_KB_TAGS}。`);
		expect(segments).toHaveLength(4);
		expect(segments[0]).toEqual({ type: "text", text: "总结" });
		expect(segments[1]).toEqual({
			type: "tag",
			tag: {
				kind: "kb",
				doc: "三分钟了解金蝶客户认证服务.md",
				chunkId: "594adadd-7ceb-44f7-b285-c806e627c73d",
				kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
			},
		});
		expect(segments[2]).toEqual({
			type: "tag",
			tag: {
				kind: "kb",
				doc: "三分钟了解金蝶客户认证服务.md",
				chunkId: "9fd26fe3-88a5-4515-947b-f32f458af9ec",
				kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
			},
		});
		expect(segments[3]).toEqual({ type: "text", text: "。" });
	});
});

describe("parseCitationTags · 属性转义反转义", () => {
	it("Go html.EscapeString 五种实体全部反转义", () => {
		const input = '<kb doc="A &amp; B &lt;C&gt; &#39;q&#39; &#34;d&#34;" chunk_id="c1" />';
		expect(parseCitationTags(input)).toEqual([
			{ type: "tag", tag: { kind: "kb", doc: "A & B <C> 'q' \"d\"", chunkId: "c1" } },
		]);
	});

	it("命名实体 quot/apos 也反转义(双保险口径)", () => {
		const input = '<web url="https://example.com/a?x=1&quot;y=2" title="It&apos;s" />';
		expect(parseCitationTags(input)).toEqual([
			{ type: "tag", tag: { kind: "web", url: 'https://example.com/a?x=1"y=2', title: "It's" } },
		]);
	});

	it("单遍解码:&amp;lt; 只解到 &lt;,不会被二次解开", () => {
		expect(parseCitationTags('<kb doc="&amp;lt;" />')).toEqual([{ type: "tag", tag: { kind: "kb", doc: "&lt;" } }]);
	});

	it("不在解码表内的实体原样保留(不臆造)", () => {
		expect(parseCitationTags('<kb doc="a&nbsp;b" />')).toEqual([
			{ type: "tag", tag: { kind: "kb", doc: "a&nbsp;b" } },
		]);
	});

	it("真实消息的转义文档名:苍穹&amp;星瀚 → 苍穹&星瀚", () => {
		expect(parseCitationTags(REAL_KB_TAG_ESCAPED_AMP)).toEqual([
			{
				type: "tag",
				tag: {
					kind: "kb",
					doc: "苍穹&星瀚 社区知识导航.md",
					chunkId: "87dd2a5b-4b34-4b13-9510-60cfdaad3f85",
					kbId: "78c47382-49f4-41bb-a11a-bc9c6f06f3a9",
				},
			},
		]);
	});
});

describe("parseCitationTags · 尾部残缺容忍", () => {
	it("文本末尾的半截 kb 前缀识别为 incomplete 段,其前正文完整保留", () => {
		expect(parseCitationTags('流式中<kb doc="x" chunk_id="c1')).toEqual([
			{ type: "text", text: "流式中" },
			{ type: "incomplete", raw: '<kb doc="x" chunk_id="c1' },
		]);
	});

	it("半截 web 前缀与孤悬 < 同样识别为 incomplete(官方同款口径)", () => {
		expect(parseCitationTags('<web url="ht')).toEqual([{ type: "incomplete", raw: '<web url="ht' }]);
		expect(parseCitationTags("5 <")).toEqual([
			{ type: "text", text: "5 " },
			{ type: "incomplete", raw: "<" },
		]);
	});

	it("完整标签之后跟半截前缀:tag 段与 incomplete 段共存", () => {
		const input = '<kb doc="a.md" /> 尾随<kb';
		expect(parseCitationTags(input)).toEqual([
			{ type: "tag", tag: { kind: "kb", doc: "a.md" } },
			{ type: "text", text: " 尾随" },
			{ type: "incomplete", raw: "<kb" },
		]);
	});

	it("正文中间的非引用尖括号字面量不误伤(fail-open 当普通文本)", () => {
		const literals = ["a <k b c", "x < 5", "list<int>", '<kbx doc="y"/>', "a<b>c"];
		for (const text of literals) {
			expect(parseCitationTags(text)).toEqual([{ type: "text", text }]);
		}
	});
});

describe("parseCitationTags · 混排与无标签", () => {
	it("kb+web+markdown 混排互不干扰,角标前后空格/标点不被吞(AC-8)", () => {
		const input = `参照 <kb doc="a.md" chunk_id="c1" kb_id="b1" /> 与 <web url="https://example.com/docs" title="示例" /> 以及 **加粗**、\`code\`:
- 项目一 <kb doc="b.md" chunk_id="c2" kb_id="b1" /> 结尾`;
		expect(parseCitationTags(input)).toEqual([
			{ type: "text", text: "参照 " },
			{ type: "tag", tag: { kind: "kb", doc: "a.md", chunkId: "c1", kbId: "b1" } },
			{ type: "text", text: " 与 " },
			{ type: "tag", tag: { kind: "web", url: "https://example.com/docs", title: "示例" } },
			{
				type: "text",
				text: " 以及 **加粗**、`code`:\n- 项目一 ",
			},
			{ type: "tag", tag: { kind: "kb", doc: "b.md", chunkId: "c2", kbId: "b1" } },
			{ type: "text", text: " 结尾" },
		]);
	});

	it("无标签文本逐字符原样(含正文裸 & 与 markdown 语法)", () => {
		const plain = `### 1. **金蝶云·苍穹**
- K/3 WISE & KIS云 是传统ERP产品的云化版本
- 列表与 **加粗**、\`代码\` 共存`;
		expect(parseCitationTags(plain)).toEqual([{ type: "text", text: plain }]);
		expect(stripCitationTags(plain)).toBe(plain);
	});

	it("空串返回空段序列;纯标签文本剥除后为空串", () => {
		expect(parseCitationTags("")).toEqual([]);
		expect(stripCitationTags("")).toBe("");
		expect(stripCitationTags(REAL_KB_TAG)).toBe("");
	});
});

describe("parseCitationTags · T00 真实消息(8 标签)", () => {
	it("8 个真实 <kb> 标签全部解析,doc 列表与原文一致(含反转义)", () => {
		const segments = parseCitationTags(REAL_EXCERPT);
		const docs = segments.flatMap((segment) =>
			segment.type === "tag" && segment.tag.kind === "kb" ? [segment.tag.doc] : [],
		);
		expect(docs).toEqual([
			"超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
			"我与金蝶云.苍穹轻报表的故事.md",
			"苍穹&星瀚 社区知识导航.md",
			"我与金蝶云.苍穹轻报表的故事.md",
			"苍穹学习开发使用平台.md",
			"苍穹学习开发使用平台.md",
			"三分钟了解金蝶客户认证服务.md",
			"三分钟了解金蝶客户认证服务.md",
		]);
		expect(segments.every((segment) => segment.type !== "incomplete")).toBe(true);
	});
});

describe("stripCitationTags", () => {
	it("真实消息剥除后无任何 kb/web 标签残留,markdown 正文逐字保留", () => {
		const stripped = stripCitationTags(REAL_EXCERPT);
		expect(stripped).not.toMatch(/<(?:kb|web)\b/);
		expect(stripped).toContain("数字化需求:");
		expect(stripped).toContain("### 1. **金蝶云·苍穹**");
		expect(stripped).toContain("K/3 WISE & KIS云");
		expect(stripped.endsWith("快速掌握产品使用方法。")).toBe(true);
	});

	it("半截尾部标签一并剥除,其前正文不动(AC-7)", () => {
		expect(stripCitationTags('结论如上。<kb doc="x" chunk_id="c1')).toBe("结论如上。");
		expect(stripCitationTags("正文 <web url=")).toBe("正文 ");
	});

	it("strip 与 parse 的 text 段拼接逐字符一致(全夹具)", () => {
		const fixtures = [
			REAL_KB_TAG,
			REAL_KB_TAG_ESCAPED_AMP,
			REAL_ADJACENT_KB_TAGS,
			REAL_EXCERPT,
			'混合 <kb doc="a.md" /> 与 <web url="https://e.com" title="t" /> 与 **md**',
			'半截 <kb doc="x"',
			"无标签正文 x < 5 & **加粗**",
			"",
		];
		for (const fixture of fixtures) {
			expect(stripCitationTags(fixture)).toBe(joinTextSegments(parseCitationTags(fixture)));
		}
	});
});
