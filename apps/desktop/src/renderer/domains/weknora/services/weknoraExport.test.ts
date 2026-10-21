// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { WeKnoraMessage } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { beforeAll, describe, expect, it } from "vitest";
import {
	citationToPlainText,
	type LoadMessagesPage,
	loadAllMessages,
	safeFileName,
	toDocxBuffer,
	toExportTurns,
	toMarkdown,
	toTxt,
	uniqueFileNames,
	type WeKnoraExportMessage,
} from "./weknoraExport";

// 夹具拷自 T00 实测真实会话 assistant 消息（v1-real-messages.json），
// 仅含文档名与资源 UUID，不含任何凭据（红线 C2）。

const KB_TAG =
	'<kb doc="超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md" chunk_id="f2acd65e-3969-4700-88f6-612579891ec6" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';
const KB_TAG_ESCAPED_AMP =
	'<kb doc="苍穹&amp;星瀚 社区知识导航.md" chunk_id="87dd2a5b-4b34-4b13-9510-60cfdaad3f85" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';
const REAL_ADJACENT_KB_TAGS =
	'<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="594adadd-7ceb-44f7-b285-c806e627c73d" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" /><kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="9fd26fe3-88a5-4515-947b-f32f458af9ec" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';

/** 真实 assistant 消息节选：覆盖全部 8 个 <kb> 标签（含转义 & 与相邻双标签两种真实形态）。 */
const REAL_EXCERPT = `根据检索到的信息,我为您整理金蝶的主要产品线:

## 金蝶主要产品线

金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求${KB_TAG}:

### 1. **金蝶云·苍穹**
- **定位**:企业级PaaS平台(低代码开发平台)
- **特点**:提供强大的低代码开发能力,支持企业自主开发应用,显著降低开发成本<kb doc="我与金蝶云.苍穹轻报表的故事.md" chunk_id="f7ad4122-3133-453b-937e-c01a1dbfc592" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />
- **适用场景**:大型企业数字化转型、快速应用开发、系统集成

### 2. **金蝶云·星瀚**
- **定位**:面向大型企业的云ERP解决方案
- **主要模块**:财务云、供应链云、税务云、人力资源云、资金云等${KB_TAG_ESCAPED_AMP}
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

/** 严格递增、可唯一比较的时间戳（分页游标用）。 */
function isoAt(index: number): string {
	return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function msg(id: string, role: WeKnoraMessage["role"], content: string, createdAt?: string): WeKnoraExportMessage {
	return { id, role, content, ...(createdAt === undefined ? {} : { created_at: createdAt }) };
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("citationToPlainText · 引用标签转文字（AC-4）", () => {
	it("真实 8 标签消息：全部 kb 转 [来源:文档名]，无标签残留，markdown 逐字保留", () => {
		const text = citationToPlainText(REAL_EXCERPT);
		expect(text).not.toMatch(/<(?:kb|web)\b/);
		expect(text.match(/\[来源:/g)).toHaveLength(8);
		expect(text).toContain("[来源:超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md]");
		expect(text).toContain("[来源:苍穹&星瀚 社区知识导航.md]"); // 转义 &amp; 已反转义
		expect(text).toContain("### 1. **金蝶云·苍穹**");
	});

	it("相邻双标签各转一个 [来源:]，中间正文不丢", () => {
		expect(citationToPlainText('总结<kb doc="a.md" /> <kb doc="b.md" />。')).toBe("总结[来源:a.md] [来源:b.md]。");
	});

	it("web 标签：标题+链接 → [标题](链接)", () => {
		const input = '见 <web url="https://example.com/docs" title="示例文档" /> 详情';
		expect(citationToPlainText(input)).toBe("见 [示例文档](https://example.com/docs) 详情");
	});

	it("web 只有链接 → 链接原文（不臆造标题）", () => {
		expect(citationToPlainText('<web url="https://example.com/only" />')).toBe("https://example.com/only");
	});

	it("kb 缺 doc → [来源]", () => {
		expect(citationToPlainText("<kb />")).toBe("[来源]");
	});

	it("尾部残缺标签丢弃，其前正文保留", () => {
		expect(citationToPlainText('结论<kb doc="x" chunk_id="c1')).toBe("结论");
	});

	it("无标签文本逐字保留（含裸 & 与 markdown 语法）", () => {
		const plain = "x < 5 & **加粗**\n换行 `code`";
		expect(citationToPlainText(plain)).toBe(plain);
	});
});

describe("toExportTurns · 只留问答正文（AC-4）", () => {
	it("跳过 system，只保留 user/assistant，并转换引用", () => {
		const messages = [
			msg("1", "system", "系统提示"),
			msg("2", "user", "问题"),
			msg("3", "assistant", `答<kb doc="手册.md" />`),
		];
		expect(toExportTurns(messages)).toEqual([
			{ role: "user", text: "问题" },
			{ role: "assistant", text: "答[来源:手册.md]" },
		]);
	});
});

describe("toTxt / toMarkdown · 三格式内容（AC-5）", () => {
	const messages = [msg("1", "user", "**问题**"), msg("2", "assistant", "## 小节\n内容")];

	it("txt：角色: 正文，轮次之间空行分隔", () => {
		expect(toTxt(messages)).toBe("我: **问题**\n\n智能客服: ## 小节\n内容");
	});

	it("markdown：角色作二级标题，正文保留 markdown 结构", () => {
		expect(toMarkdown(messages)).toBe("## 我\n\n**问题**\n\n## 智能客服\n\n## 小节\n内容");
	});
});

describe("toDocxBuffer · docx 产物（AC-5）", () => {
	it("动态生成非空 base64，解码为合法 ZIP（docx 即 OOXML/ZIP）", async () => {
		const base64 = await toDocxBuffer([msg("1", "user", "问题"), msg("2", "assistant", "回答")]);
		expect(base64.length).toBeGreaterThan(0);
		const binary = atob(base64);
		expect(binary.startsWith("PK")).toBe(true); // ZIP 魔数
		expect(binary).toContain("word/document.xml"); // 真 OOXML 结构
	});
});

describe("safeFileName · 文件名净化（AC-7）", () => {
	it("非法字符换 _、去首尾空白", () => {
		expect(safeFileName('  a<b>c:d"e/f\\g|h?i*j  ')).toBe("a_b_c_d_e_f_g_h_i_j");
		expect(safeFileName("正常标题")).toBe("正常标题");
	});

	it("空白/空标题 → 回退未命名会话", () => {
		expect(safeFileName("   ")).toBe("未命名会话");
		expect(safeFileName("")).toBe("未命名会话");
	});
});

describe("uniqueFileNames · 批量重名加序号（AC-7）", () => {
	it("同名按出现顺序追加 (2)、(3)…", () => {
		expect(uniqueFileNames(["a", "a", "b", "a"])).toEqual(["a", "a (2)", "b", "a (3)"]);
	});

	it("大小写不敏感（Windows/macOS 不区分大小写，避免互相覆盖）", () => {
		expect(uniqueFileNames(["Report", "report"])).toEqual(["Report", "report (2)"]);
	});
});

describe("loadAllMessages · 分页拉全（AC-6）", () => {
	it("多页拉全（45 条 / 每页 20）：按 before_time 翻取、最早在前、无重复", async () => {
		const all = Array.from({ length: 45 }, (_, i) =>
			msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `c${i}`, isoAt(i)),
		);
		const calls: Array<{ sessionId: string; limit: number; beforeTime?: string }> = [];
		const loadPage: LoadMessagesPage = async (input) => {
			calls.push(input);
			// 模拟服务端：返回严格早于 beforeTime 的最新 limit 条（升序）。
			const upper =
				input.beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === input.beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - input.limit);
			return all.slice(start, end);
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id));
		expect(calls).toHaveLength(3);
		expect(calls[0].beforeTime).toBeUndefined();
		expect(calls[1].beforeTime).toBe(all[25].created_at); // 首页最早一条
		expect(calls[2].beforeTime).toBe(all[5].created_at);
	});

	it("顺序校正：页内为倒序时，最终仍按时间升序", async () => {
		const all = Array.from({ length: 5 }, (_, i) => msg(`m${i}`, "user", `c${i}`, isoAt(i)));
		const loadPage: LoadMessagesPage = async () => [...all].reverse();
		const result = await loadAllMessages("s1", { pageSize: 10, loadPage });
		expect(result.map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
	});

	it("上限保护：游标不前进（重复同一页）时提前停止，不死循环", async () => {
		const page = Array.from({ length: 20 }, (_, i) => msg(`m${i}`, "user", `c${i}`, isoAt(i)));
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return page;
		};
		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });
		expect(calls).toBe(2); // 第二页检测到无新消息即停
		expect(result.map((m) => m.id)).toEqual(page.map((m) => m.id));
	});

	it("上限保护：无限翻页时最多拉 maxPages 页", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			const base = calls * 1000;
			return Array.from({ length: 20 }, (_, i) => msg(`m${base + i}`, "user", "x", isoAt(base + i)));
		};
		const result = await loadAllMessages("s1", { pageSize: 20, maxPages: 3, loadPage });
		expect(calls).toBe(3);
		expect(result).toHaveLength(60);
	});

	it("空会话：单次调用即返回空数组", async () => {
		let calls = 0;
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return [];
		};
		const result = await loadAllMessages("s1", { loadPage });
		expect(result).toEqual([]);
		expect(calls).toBe(1);
	});

	it("不足一页：单次调用即返回", async () => {
		let calls = 0;
		const messages = [msg("m1", "user", "q", isoAt(0))];
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return messages;
		};
		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });
		expect(calls).toBe(1);
		expect(result.map((m) => m.id)).toEqual(["m1"]);
	});

	it("消息无 created_at 时无法推导游标 → 只返回首屏一页（不臆造）", async () => {
		let calls = 0;
		const messages = Array.from({ length: 20 }, (_, i) => msg(`m${i}`, "user", "x"));
		const loadPage: LoadMessagesPage = async () => {
			calls += 1;
			return messages;
		};
		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });
		expect(calls).toBe(1);
		expect(result).toHaveLength(20);
	});
});
