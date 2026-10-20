// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { MessageList } from "./MessageList";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-6 历史回看同管道)。
 *
 * 实现者的 MessageList 用例用 1~2 个手造标签;本文件把 T00 实测**真实会话的完整 8 标签
 * 消息**作为 loadMessages 载入形态(status=complete)整体渲染,数量守恒(恰好 8 枚角标、
 * 5 个不同文档名)与零残留是比点查强一档的断言。用户真实会话的实机目验留用户验收清单,
 * 代码层证明"历史路径与终态同管道"。夹具仅文档名与资源 UUID,无凭据(C2)。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
	// 历史回看渲染角标即具备点击取数能力:装假 IPC(不触真实实例,C1)。
	const pending: Array<{ resolve: (c: WeKnoraChunk) => void }> = [];
	const getChunk = vi.fn(
		() =>
			new Promise<WeKnoraChunk>((resolve) => {
				pending.push({ resolve });
			}),
	);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getChunk } } as unknown as DesktopApi,
	});
});

afterEach(cleanup);

/** 真实 8 标签消息全文(v1-real-messages.json 的 assistant 消息,逐字拷贝)。 */
const REAL_ANSWER = `根据检索到的信息,我为您整理金蝶的主要产品线:

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

/** 5 个不同文档名(8 标签去重后)。 */
const UNIQUE_DOCS = [
	"超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md",
	"我与金蝶云.苍穹轻报表的故事.md",
	"苍穹&星瀚 社区知识导航.md",
	"苍穹学习开发使用平台.md",
	"三分钟了解金蝶客户认证服务.md",
];

describe("MessageList 验收 · 历史回看同管道(AC-6)", () => {
	it("真实 8 标签历史消息:恰好 8 枚角标、title 集合恰为 5 个真实文档名、零 raw 残留", () => {
		const messages: WeKnoraChatMessage[] = [
			{ id: "u1", role: "user", text: "金蝶产品线有哪些?", thinking: "", status: "complete" },
			{ id: "a1", role: "assistant", text: REAL_ANSWER, thinking: "", status: "complete" },
		];
		const { container } = render(<MessageList messages={messages} />);

		// 数量守恒:8 个 kb 标签 → 恰好 8 枚角标按钮(无思考块,列表内按钮只有角标)。
		const badges = screen.getAllByRole("button");
		expect(badges).toHaveLength(8);
		// 每枚角标 title 都是完整真实文档名(全名不截断)。
		const titles = badges.map((badge) => badge.getAttribute("title") ?? "");
		expect(new Set(titles)).toEqual(new Set(UNIQUE_DOCS));
		for (const badge of badges) {
			expect(badge.getAttribute("aria-label")).toMatch(/^引用资料:/);
		}
		// 正文零残留:标签文本、属性名、uuid 一概不可见;转义实体也不外泄。
		expect(container.textContent).not.toContain("<kb");
		expect(container.textContent).not.toContain("chunk_id");
		expect(container.textContent).not.toContain("78c47382");
		expect(container.textContent).not.toContain("&amp;");
		// 正文 markdown 结构仍在(标题/加粗没有被标签处理破坏)。
		expect(container.querySelector("h2")?.textContent).toContain("金蝶主要产品线");
		expect(container.querySelector("strong")?.textContent).toContain("六大核心产品线");
	});

	it("用户消息分支不动:用户粘贴的标签原文保留(不做项,与助手消息同屏对照)", () => {
		const pasted = '我看不懂 <kb doc="u.md" chunk_id="cu" kb_id="bu" /> 这个';
		const messages: WeKnoraChatMessage[] = [
			{ id: "u1", role: "user", text: pasted, thinking: "", status: "complete" },
			{ id: "a1", role: "assistant", text: '见 <kb doc="a.md" chunk_id="ca" kb_id="ba" />。', thinking: "", status: "complete" },
		];
		const { container } = render(<MessageList messages={messages} />);

		// 用户消息:原样(含标签文本);助手消息:角标化。
		expect(container.textContent).toContain(pasted);
		const badges = screen.getAllByRole("button");
		expect(badges).toHaveLength(1);
		expect(badges[0]?.getAttribute("title")).toBe("a.md");
	});
});
