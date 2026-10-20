// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { inflateRawSync } from "node:zlib";
import type { DesktopApi, WeKnoraMessage } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { stripCitationTags } from "./citationTag";
import {
	citationToPlainText,
	exportFileName,
	exportFileNames,
	type LoadMessagesPage,
	loadAllMessages,
	safeFileName,
	serializeExport,
	toDocxBuffer,
	toExportTurns,
	toMarkdown,
	toTxt,
	uniqueFileNames,
	type WeKnoraExportMessage,
} from "./weknoraExport";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-4 / AC-5 / AC-6 / AC-7 / AC-12）。
 *
 * 与实现者用例（weknoraExport.test.ts）的差异：
 * - AC-4 夹具用 T00 实测真实会话的**完整 8 标签消息全文**（v1-real-messages.json 的 assistant 消息
 *   304a5703，逐字拷贝；仅文档名与资源 UUID，无凭据，C2），断言角度是**内容级不变量**：
 *   8 个标签的转换结果按原文顺序逐条对上、markdown 逐字保留、剥离引用后与解析器自身的
 *   `stripCitationTags` 结果**逐字一致**（任何丢字/吞段/错序直接炸）。
 * - AC-5 对 docx 做**结构级**断言：解 base64 → 解析 ZIP 条目 → 解压 `word/document.xml`
 *   → 提取 `<w:t>` 文本序列，验证「角色标题 + 逐行正文」的段落顺序（不是只看 `PK` 魔数）。
 * - AC-6 额外走**缺省拉页路径**（真经 `window.vetta.weknora.loadMessages`），证明 IPC 合同侧
 *   翻页可用；并补「相邻页重叠去重」「空 id 消息不被吞」两个真空区。
 */

/** 真实 8 标签 assistant 消息全文（t00-run 实测；8 个 <kb>，含 &amp; 转义与相邻双标签）。 */
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

/** 原文中 8 个 <kb> 的文档名，按出现顺序（用于断言转换结果与原文顺序逐条对齐）。 */
const EXPECTED_DOCS = [
	"超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
	"我与金蝶云.苍穹轻报表的故事.md",
	"苍穹&星瀚 社区知识导航.md",
	"我与金蝶云.苍穹轻报表的故事.md",
	"苍穹学习开发使用平台.md",
	"苍穹学习开发使用平台.md",
	"三分钟了解金蝶客户认证服务.md",
	"三分钟了解金蝶客户认证服务.md",
];

function isoAt(index: number): string {
	return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function msg(id: string, role: WeKnoraMessage["role"], content: string, createdAt?: string): WeKnoraExportMessage {
	return { id, role, content, ...(createdAt === undefined ? {} : { created_at: createdAt }) };
}

/** 解 docx base64 → 定位 ZIP 条目并按需解压（docx = OOXML/ZIP；条目名不压缩存于本地头）。 */
function readZipEntry(buffer: Buffer, target: string): Buffer | undefined {
	let offset = 0;
	while (offset + 30 <= buffer.length) {
		if (buffer.readUInt32LE(offset) !== 0x04034b50) break; // local file header 签名
		const method = buffer.readUInt16LE(offset + 8);
		const compSize = buffer.readUInt32LE(offset + 18);
		const nameLen = buffer.readUInt16LE(offset + 26);
		const extraLen = buffer.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const name = buffer.subarray(nameStart, nameStart + nameLen).toString("utf8");
		const dataStart = nameStart + nameLen + extraLen;
		if (name === target) {
			const data = buffer.subarray(dataStart, dataStart + compSize);
			return method === 8 ? inflateRawSync(data) : data;
		}
		offset = dataStart + compSize;
	}
	return undefined;
}

/** 列出 docx 内全部 ZIP 条目名。 */
function listZipEntries(buffer: Buffer): string[] {
	const names: string[] = [];
	let offset = 0;
	while (offset + 30 <= buffer.length) {
		if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
		const compSize = buffer.readUInt32LE(offset + 18);
		const nameLen = buffer.readUInt16LE(offset + 26);
		const extraLen = buffer.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		names.push(buffer.subarray(nameStart, nameStart + nameLen).toString("utf8"));
		offset = nameStart + nameLen + extraLen + compSize;
	}
	return names;
}

/** 提取 `word/document.xml` 里 `<w:t>` 的文本序列（文档正文段落顺序）。 */
function docxTextRuns(buffer: Buffer): string[] {
	const xml = readZipEntry(buffer, "word/document.xml")?.toString("utf8") ?? "";
	return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1] ?? "");
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(async () => {
	await i18n.changeLanguage("zh");
});

describe("AC-4 · 真实 8 标签消息的内容级转换", () => {
	it("8 个 kb 标签按原文顺序逐条转 [来源:文档名]，无标签残留", () => {
		const text = citationToPlainText(REAL_MESSAGE);
		expect(text).not.toMatch(/<(?:kb|web)\b/);
		const found = [...text.matchAll(/\[来源:([^\]]*)\]/g)].map((match) => match[1]);
		expect(found).toHaveLength(8);
		expect(found).toEqual(EXPECTED_DOCS); // 顺序 + 内容 + &amp; 反转义
	});

	it("剥离全部 [来源:…] 后与解析器 stripCitationTags 结果逐字一致（丢字/吞段即失败）", () => {
		const text = citationToPlainText(REAL_MESSAGE);
		expect(text.replace(/\[来源:[^\]]*\]/g, "")).toBe(stripCitationTags(REAL_MESSAGE));
	});

	it("markdown 结构逐字保留（标题层级 / 加粗 / 列表 / 分隔线）", () => {
		const text = citationToPlainText(REAL_MESSAGE);
		expect(text).toContain("## 金蝶主要产品线");
		expect(text).toContain("### 1. **金蝶云·苍穹**");
		expect(text).toContain("**六大核心产品线**");
		expect(text).toContain("  - PLM产品生命周期管理");
		expect(text).toContain("---");
	});

	it("toExportTurns 只留 user/assistant（思考/系统不进导出）", () => {
		const turns = toExportTurns([
			msg("s", "system", "系统提示不应出现"),
			msg("u", "user", "金蝶云星空如何新增采购价目表和调价表？"),
			msg("a", "assistant", REAL_MESSAGE),
		]);
		expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
		expect(turns[0]?.text).toBe("金蝶云星空如何新增采购价目表和调价表？");
		expect(turns[1]?.text).not.toContain("系统提示");
	});

	it("角色标签走 i18n：zh = 我 / 智能客服，en 镜像 = You / Customer Service", async () => {
		const messages = [msg("u", "user", "问"), msg("a", "assistant", "答")];
		expect(toTxt(messages)).toBe("我: 问\n\n智能客服: 答");
		await i18n.changeLanguage("en");
		expect(toTxt(messages)).toBe("You: 问\n\nCustomer Service: 答");
		// 引用来源前缀也走 en 镜像。
		expect(citationToPlainText('<kb doc="a.md" />')).toBe("[Source:a.md]");
	});

	it("web 标签转 [标题](链接)；无标签正文逐字保留", () => {
		expect(citationToPlainText('见 <web url="https://x/y" title="标题" /> 详情')).toBe("见 [标题](https://x/y) 详情");
		const plain = "纯文本 < 5 & 100% **加粗**";
		expect(citationToPlainText(plain)).toBe(plain);
	});
});

describe("AC-5 · 三种格式的结构级正确性", () => {
	const messages = [msg("u", "user", "**问题**"), msg("a", "assistant", "## 小节\n- 列表项\n\n尾段")];

	it("txt：`角色: 正文`，轮次之间空行分隔，正文原样", () => {
		expect(toTxt(messages)).toBe("我: **问题**\n\n智能客服: ## 小节\n- 列表项\n\n尾段");
	});

	it("markdown：角色作二级标题（## ），正文保留 markdown 结构", () => {
		expect(toMarkdown(messages)).toBe("## 我\n\n**问题**\n\n## 智能客服\n\n## 小节\n- 列表项\n\n尾段");
	});

	it("docx：产物是合法 OOXML ZIP（含 [Content_Types].xml / word/document.xml / _rels/.rels）", async () => {
		const base64 = await toDocxBuffer(messages);
		const buffer = Buffer.from(base64, "base64");
		expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
		const entries = listZipEntries(buffer);
		expect(entries).toContain("[Content_Types].xml");
		expect(entries).toContain("word/document.xml");
		expect(entries).toContain("_rels/.rels");
	});

	it("docx：正文段落顺序 = 角色标题 + 逐行正文（含多行答案逐行成段）", async () => {
		const base64 = await toDocxBuffer(messages);
		const runs = docxTextRuns(Buffer.from(base64, "base64"));
		// 我 / **问题** / 智能客服 / ## 小节 / - 列表项 / (空行成段，空文本) / 尾段
		expect(runs).toEqual(["我", "**问题**", "智能客服", "## 小节", "- 列表项", "", "尾段"]);
	});

	it("serializeExport：txt/md 走 utf8，docx 走 base64", async () => {
		expect(await serializeExport(messages, "txt")).toEqual({ content: toTxt(messages), encoding: "utf8" });
		expect(await serializeExport(messages, "md")).toEqual({ content: toMarkdown(messages), encoding: "utf8" });
		const docx = await serializeExport(messages, "docx");
		expect(docx.encoding).toBe("base64");
		expect(Buffer.from(docx.content, "base64").subarray(0, 2).toString("latin1")).toBe("PK");
	});
});

describe("AC-6 · 全量分页拉取", () => {
	it("45 条 / 每页 20：3 次调用、before_time 游标逐页推进、最早在前、无重复无丢失", async () => {
		const all = Array.from({ length: 45 }, (_, i) =>
			msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `c${i}`, isoAt(i)),
		);
		const calls: Array<{ sessionId: string; limit: number; beforeTime?: string }> = [];
		const loadPage: LoadMessagesPage = async (input) => {
			calls.push(input);
			const upper =
				input.beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === input.beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - input.limit);
			return all.slice(start, end);
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });

		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id));
		expect(new Set(result.map((m) => m.id)).size).toBe(45); // 无重复
		expect(calls).toHaveLength(3);
		expect(calls[0]?.beforeTime).toBeUndefined();
		expect(calls[1]?.beforeTime).toBe(all[25]?.created_at);
		expect(calls[2]?.beforeTime).toBe(all[5]?.created_at);
	});

	it("相邻页边界重叠 5 条：按 id 去重后既不重复也不丢失", async () => {
		const all = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, "user", `c${i}`, isoAt(i)));
		const loadPage: LoadMessagesPage = async (input) => {
			// 每次多回 5 条（与上一页尾部重叠），模拟服务端边界含端点。
			const upper =
				input.beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === input.beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - input.limit);
			const overlap = Math.max(0, start - 5);
			return all.slice(overlap, end);
		};

		const result = await loadAllMessages("s1", { pageSize: 20, loadPage });
		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id));
	});

	it("空 id 消息不被去重吞掉（toMessage 允许缺 id，正文必须保留）", async () => {
		const page = [msg("", "user", "甲", isoAt(0)), msg("", "assistant", "乙", isoAt(1))];
		const result = await loadAllMessages("s1", { pageSize: 20, loadPage: async () => page });
		expect(result.map((m) => m.content)).toEqual(["甲", "乙"]);
	});

	it("缺省拉页真经 window.vetta.weknora.loadMessages：翻页游标与最终顺序正确", async () => {
		// 缺省页大小 = 50，用 120 条逼出 3 页（50 / 50 / 20），验证缺省路径真会翻页。
		const all = Array.from({ length: 120 }, (_, i) => msg(`m${i}`, "user", `c${i}`, isoAt(i)));
		const calls: Array<{ sessionId: string; limit: number; beforeTime?: string }> = [];
		const loadMessages = async (input: { sessionId: string; limit: number; beforeTime?: string }) => {
			calls.push(input);
			const upper =
				input.beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === input.beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - input.limit);
			return all.slice(start, end);
		};
		Object.defineProperty(window, "vetta", {
			configurable: true,
			writable: true,
			value: { weknora: { loadMessages } } as unknown as DesktopApi,
		});

		const result = await loadAllMessages("sess-x");

		expect(result.map((m) => m.id)).toEqual(all.map((m) => m.id));
		expect(calls.map((call) => call.limit)).toEqual([50, 50, 50]);
		expect(calls.map((call) => call.beforeTime)).toEqual([undefined, all[70]?.created_at, all[20]?.created_at]);
		expect(calls.every((call) => call.sessionId === "sess-x")).toBe(true);
	});
});

describe("AC-7 · 文件名净化与批量重名", () => {
	it("非法字符换 _、去首尾空白、扩展名由格式决定", () => {
		expect(safeFileName('  a<b>c:d"e/f\\g|h?i*j  ')).toBe("a_b_c_d_e_f_g_h_i_j");
		expect(exportFileName("报告:Q1/Q2", "txt")).toBe("报告_Q1_Q2.txt");
		expect(exportFileName("正常标题", "docx")).toBe("正常标题.docx");
	});

	it("空 / 纯空白标题回退「未命名会话」", () => {
		expect(safeFileName("   ")).toBe("未命名会话");
		expect(exportFileName("", "md")).toBe("未命名会话.md");
	});

	it("unicode 标题保留（中文 / emoji / 全角符号不被净化）", () => {
		expect(safeFileName("会话·2026 ✅【重要】")).toBe("会话·2026 ✅【重要】");
	});

	it("超长标题不崩溃且内容保留（AC 未要求截断；>255 字节为已知风险，见 notes）", () => {
		const long = "长".repeat(300);
		const name = safeFileName(long);
		expect(name).toBe(long);
		expect(exportFileName(long, "txt")).toBe(`${long}.txt`);
	});

	it("重名加序号且大小写不敏感（避免 Windows/macOS 互相覆盖）", () => {
		expect(uniqueFileNames(["a", "a", "b", "a"])).toEqual(["a", "a (2)", "b", "a (3)"]);
		expect(uniqueFileNames(["Report", "report", "REPORT"])).toEqual(["Report", "report (2)", "REPORT (3)"]);
	});

	it("exportFileNames：先按基名去重再加扩展名，序号与会话一一对应", () => {
		expect(exportFileNames(["同名", "同名", "另一个"], "txt")).toEqual(["同名.txt", "同名 (2).txt", "另一个.txt"]);
		expect(exportFileNames(["a/b", "a:b"], "md")).toEqual(["a_b.md", "a_b (2).md"]);
	});
});

describe("AC-12 · 导出内容不含凭据（C2）", () => {
	it("真实夹具消息导出的正文不含任何 Key 形态", () => {
		const text = toTxt([msg("u", "user", "问题"), msg("a", "assistant", REAL_MESSAGE)]);
		expect(text).not.toMatch(/X-API-Key|Bearer |sk-[A-Za-z0-9]{10,}|api[_-]?key["'\s:=]/i);
	});
});
