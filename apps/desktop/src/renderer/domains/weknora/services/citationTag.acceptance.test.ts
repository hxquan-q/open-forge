// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { parseCitationSpans, parseCitationTags, stripCitationTags } from "./citationTag";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-7/AC-13/AC-4 解析侧)。
 *
 * 与实现者用例(citationTag.test.ts)的差异:夹具用 T00 实测真实会话的**完整 8 标签消息全文**
 * (v1-real-messages.json 的 assistant 消息 304a5703,逐字拷贝;仅文档名与资源 UUID,无凭据,C2),
 * 断言角度从"逐段点查"换为**全文不变量**(区间无缝/无重叠/原文无损回放)——任何解析器改动
 * 只要丢字、吞段、区间错位,这里直接炸。残缺标签(AC-7)用流中断的真实形态逐字符核对。
 */

/** 真实 8 标签消息全文(t00-run 实测;8 个 <kb>,0 个 <web>,含 &amp; 转义文档名与相邻双标签)。 */
const REAL_MESSAGE = `根据检索到的信息,我为您整理金蝶的主要产品线:

## 金蝶主要产品线

金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求<kb doc="超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md" chunk_id="f2acd65e-3969-4700-88f6-612579891ec6" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />:

### 1. **金蝶云·苍穹**
- **定位**:企业级PaaS平台(低代码开发平台)
- **特点**:提供强大的低代码开发能力,支持企业自主开发应用,显著降低开发成本<kb doc="我与金蝶云.苍穹轻报表的故事.md" chunk_id="f7ad4122-3133-453b-937e-c01a1dbfc592" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />
- **适用场景**:大型企业数字化转型、快速应用开发、系统集成

### 2. **金蝶云·星瀚**
- **定位**:面向大型企业的云ERP解决方案
- **主要模块**:财务云、供应链云、税务云、人力资源云、资金云等<kb doc="苍穹&amp;星瀚 社区知识导航.md" chunk_id="87dd2a5b-4b34-4b13-9510-60cfdaad3f85" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />
- **特色功能**:人人费用管理、智能核算、银企服务等

### 3. **金蝶云·星空**
- **定位**:面向成长型企业的云ERP
- **版本**:旗舰版、企业版、标准版<kb doc="我与金蝶云.苍穹轻报表的故事.md" chunk_id="faf9f9ca-7b70-437f-913b-d2f35f7354ab" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />
- **核心功能**:
  - 财务管理
  - 供应链管理
  - 生产制造
  - 人力资源管理
  - 餐饮行业解决方案
  - PLM产品生命周期管理

### 4. **金蝶云·星辰**
- **定位**:面向小微企业的云服务
- **特点**:轻量级、易用性强,适合初创和小微企业使用

### 5. **EAS Cloud**
- **定位**:面向集团型企业的高端ERP系统
- **适用场景**:多组织、多业态的大型集团企业管理

### 6. **K/3 WISE & KIS云**
- **定位**:传统ERP产品的云化版本
- **适用场景**:中小企业的基础业务管理

---

## 其他配套产品

### **云之家**
- 金蝶系的协同办公产品,支持移动端审批、沟通协作<kb doc="苍穹学习开发使用平台.md" chunk_id="1c4d5b07-03c4-4122-9fa2-511322fdbf16" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />

### **KDesign企业级产品设计系统**
- 提供设计规范、组件库,支撑金蝶全系产品的UI/UX标准化<kb doc="苍穹学习开发使用平台.md" chunk_id="1c4d5b07-03c4-4122-9fa2-511322fdbf16" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />

---

## 如何选择?

- **大型企业/集团**:推荐**金蝶云·星瀚**或**EAS Cloud**
- **成长型企业**:推荐**金蝶云·星空**(旗舰版/企业版/标准版)
- **小微企业**:推荐**金蝶云·星辰**或**KIS云**
- **需要定制开发**:推荐基于**金蝶云·苍穹**平台进行二次开发

所有产品线都提供免费的学习资源和认证考试服务,帮助企业用户快速掌握产品使用方法<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="594adadd-7ceb-44f7-b285-c806e627c73d" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" /><kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="9fd26fe3-88a5-4515-947b-f32f458af9ec" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />。`;

describe("citationTag 验收 · 真实消息全文不变量(AC-13)", () => {
	it("真实 8 标签消息:区间首尾相接、无缝隙无重叠,原文逐字符无损", () => {
		const spans = parseCitationSpans(REAL_MESSAGE);
		expect(spans.length).toBeGreaterThan(0);
		for (let index = 0; index < spans.length; index += 1) {
			const span = spans[index];
			if (!span) throw new Error(`missing span ${index}`);
			// 相邻区间必须首尾相接:上一段 end === 本段 start。
			if (index > 0) {
				const previous = spans[index - 1];
				if (!previous) throw new Error("unreachable");
				expect(span.start).toBe(previous.end);
			}
			// 每段切片必须落在原文边界内。
			expect(span.end).toBeGreaterThan(span.start);
			expect(span.end).toBeLessThanOrEqual(REAL_MESSAGE.length);
		}
		// 首段从 0 起、末段到全文止。
		expect(spans[0]?.start).toBe(0);
		expect(spans.at(-1)?.end).toBe(REAL_MESSAGE.length);
		// 不变量:各段原文切片按序拼接 === 原文(丢字/吞段/错位都会在此暴露)。
		const rejoined = spans.map((span) => REAL_MESSAGE.slice(span.start, span.end)).join("");
		expect(rejoined).toBe(REAL_MESSAGE);
	});

	it("真实消息解析出恰好 8 个 kb 标签段,属性结构与顺序与消息一致(升级缝,AC-13)", () => {
		const tagSegments = parseCitationTags(REAL_MESSAGE).filter((segment) => segment.type === "tag");
		expect(tagSegments).toHaveLength(8);
		const docs = tagSegments.map((segment) =>
			segment.type === "tag" && segment.tag.kind === "kb" ? segment.tag.doc : "?",
		);
		// 第 3 个标签的文档名含 &amp; 转义:反转义后必须是单个 &。
		expect(docs[2]).toBe("苍穹&星瀚 社区知识导航.md");
		// 7、8 号标签原文相邻(<kb/><kb/> 无间隔),顺序保持。
		expect(docs[6]).toBe("三分钟了解金蝶客户认证服务.md");
		expect(docs[7]).toBe("三分钟了解金蝶客户认证服务.md");
		// 每个 kb 段的 chunk_id/kb_id 齐全(缺失即结构化输出破了升级缝)。
		for (const segment of tagSegments) {
			if (segment.type !== "tag" || segment.tag.kind !== "kb") continue;
			expect(segment.tag.chunkId).toMatch(/^[0-9a-f-]{36}$/);
			expect(segment.tag.kbId).toBe("78c47382-49f4-41bb-a11a-bc9c6f06f3a9");
		}
		// 同名不同 chunk(2 号与 4 号同名异 chunk)不得被去重。
		const chunkIds = tagSegments.map((segment) =>
			segment.type === "tag" && segment.tag.kind === "kb" ? segment.tag.chunkId : "?",
		);
		expect(new Set(chunkIds)).toHaveLength(7);
	});
});

describe("citationTag 验收 · 转义反转义(AC-13)", () => {
	it("Go html.EscapeString 五种实体全部反转义;表外实体原样保留", () => {
		const [segment] = parseCitationTags(
			'<kb doc="a&amp;b&#39;c&lt;d&gt;e&#34;f&quot;g&apos;h&unknown; i" chunk_id="c1" />',
		);
		if (segment?.type !== "tag" || segment.tag.kind !== "kb") throw new Error("expected kb tag");
		expect(segment.tag.doc).toBe(`a&b'c<d>e"f"g'h&unknown; i`);
	});

	it("双重转义只解一层:&amp;lt; 解到 &lt; 为止,不会被二次解开成 <", () => {
		const [segment] = parseCitationTags('<kb doc="x&amp;lt;y" chunk_id="c1" />');
		if (segment?.type !== "tag" || segment.tag.kind !== "kb") throw new Error("expected kb tag");
		expect(segment.tag.doc).toBe("x&lt;y");
	});

	it("web 标签:url/title 均反转义(含 query 里的 &amp;)", () => {
		const [segment] = parseCitationTags('<web url="https://e.com/a?x=1&amp;y=2" title="题&amp;目" />');
		if (segment?.type !== "tag" || segment.tag.kind !== "web") throw new Error("expected web tag");
		expect(segment.tag.url).toBe("https://e.com/a?x=1&y=2");
		expect(segment.tag.title).toBe("题&目");
	});
});

describe("citationTag 验收 · 残缺尾部与 fail-open(AC-7)", () => {
	it("流中断的真实形态:半截 kb 标签进 incomplete 段,其前正文含尾随空格逐字保留", () => {
		const segments = parseCitationTags('回答如下。 <kb doc="截断处');
		expect(segments).toEqual([
			{ type: "text", text: "回答如下。 " },
			{ type: "incomplete", raw: '<kb doc="截断处' },
		]);
	});

	it("stripCitationTags 剥完整标签与残缺尾部,普通文本零改动(AC-7/AC-5 解析侧)", () => {
		expect(
			stripCitationTags('前 <kb doc="a" chunk_id="c" kb_id="b" /> 中 <web url="https://e.com" /> 尾 <web url='),
		).toBe("前  中  尾 ");
	});

	it("非引用尖括号字面量 fail-open:数学比较与泛型写法不剥、不当标签", () => {
		const literals = ["x < 5 且 y > 3", "list<int> 是泛型", "a<b 与 c>d", "K/3 WISE & KIS云"];
		for (const text of literals) {
			expect(stripCitationTags(text)).toBe(text);
			expect(parseCitationTags(text)).toEqual([{ type: "text", text }]);
		}
	});

	it("孤悬 < 剥除;<kb/(只到斜杠未出 >)按官方口径不算残缺,维持文本(T01 OQ-1 备察行为锁定)", () => {
		// 官方口径含孤悬 "<":算残缺前缀,剥除。
		expect(parseCitationTags("结论 <")).toEqual([
			{ type: "text", text: "结论 " },
			{ type: "incomplete", raw: "<" },
		]);
		// `<kb/` 未构成官方前缀正则的残缺形态(<kb 后须是空白):不算残缺、不当标签,整体留为文本。
		// 流式瞬间会闪一下明文——与官方前端一致,用户已备察"建议维持"(T01 OQ-1)。
		expect(parseCitationTags("结论 <kb/")).toEqual([{ type: "text", text: "结论 <kb/" }]);
		// 大小写敏感:<KB> 不是引用标签(与上游一致)。
		expect(stripCitationTags("a <KB doc=x /> b")).toBe("a <KB doc=x /> b");
	});
});
