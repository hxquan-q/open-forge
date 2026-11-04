---
id: RESEARCH-0048
type: research
status: done
priority: P2
owner: project/agent-workflow
source: user-request and primary-source-research
created: 2026-11-04
updated: 2026-11-04
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0420]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent 指令、决策记录与开发范式优化研究

## 问题与范围

对照 Open Forge 现有开发入口、Project/ADR/质量门禁及产品架构，研究 DeepSeek 官方原型、社区笔记技能、Claude/Codex/Zed/Cursor/Windsurf/Continue 官方文档及社区真实使用反馈。仅调研并提出候选，不修改规则、代码、权限或发布状态；不建立第二套 notes 台账。

## 事实来源

官方网页于 2026-11-04 检索并提取正文；GitHub 使用 connector 读文件、只读 Git/gh 固定版本。搜索工具不支持直接打开页面，已改用 Tavily 提取实际正文；不将搜索摘要当全文证据。`done` 仅表示本轮研究完成，建议均未实施。

| 编号 | 第一方资料 | 核对重点 |
|---|---|---|
| O1 | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) | 短常驻上下文、重复错误、机械强制与模型判断 |
| O2 | [Claude Code memory / AGENTS.md](https://code.claude.com/docs/en/memory#agents-md) | 文件发现、原生导入、路径规则与版本条件 |
| O3 | [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) | root→cwd、override/fallback、组合字节预算 |
| O4 | [Zed Instructions](https://zed.dev/docs/ai/instructions) | 首个匹配文件及外部 Agent 的独立加载器 |
| O5 | [Cursor Rules](https://cursor.com/docs/rules) | `.mdc`、条件应用、嵌套 AGENTS |
| O6 | [Cursor Rules help](https://cursor.com/help/customization/rules) | CLAUDE 兼容与规则生效范围 |
| O7 | [Windsurf 旧地址：AGENTS.md](https://docs.windsurf.com/windsurf/cascade/agents-md) | 根目录常驻、子目录自动按路径作用；当前正文使用 Devin Desktop 名称 |
| O8 | [Windsurf 旧地址：Memories & Rules](https://docs.windsurf.com/windsurf/cascade/memories) | 触发模式、字符预算；当前正文列 `.devin/` 优先与 `.windsurf/` 兼容 |
| O9 | [Continue Rules deep dive](https://docs.continue.dev/customize/deep-dives/rules) | `globs`、`regex`、`alwaysApply` 与默认行为 |
| O10 | [OpenAI Practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) | 单 Agent 优先、真实风险驱动 guardrails、人类介入条件 |
| O11 | [Anthropic Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | 简单可组合方案、workflow/agent 分工；当前页面提示部分工具背景已变化 |

补充一手来源：

- **D1：DeepSeek 新原型**，`deepseek-ai/dsh-superagent-prototype@8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。[README](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/README.md) 自述是研究原型、非正式产品，公开版本不等同内部版本，文章部分方向尚未实现；不是旧 Harness 仓库的别名。
- **D2：注意力与职责**：[Philosophy](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/000-philosophy.md)、[Domain model](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/001-domain.md)、[Architecture](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/007-architecture.md)。
- **D3：授权与执行**：[Authorization](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/002-authorization.md)、[Execution](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/003-execution.md)。
- **D4：模型实际输入合同**：[Prompts](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/docs/004-prompts.md)、[model-surface.spec.ts](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/tests/model-surface.spec.ts)。
- **D5：当前官方 Harness 笔记制度**，`deepseek-ai/deepseek-harness@8bd073392eef6f54e921a093b95076248eb08cbb`：[Notes README](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/.agents/notes/README.md)、[Notes AGENTS](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/.agents/notes/AGENTS.md)、[根 AGENTS](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/AGENTS.md)。
- **D6：社区技能**，`czm15053/write-notes-like-deepseek@72573a5b179de7798bbb7c4aeacdc0df6bf62439`：[SKILL](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/SKILL.md)、[when-to-write](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/references/when-to-write.md)、[archiving](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/references/archiving.md)。本机安装版本含同类广泛触发、确认门与目录规则，未宣称全文件 hash 相同。
- **E1：独立实证研究**：[Evaluating AGENTS.md，arXiv v3 正文](https://arxiv.org/html/2602.11988v3)。其所测环境中，加入上下文文件没有普遍改善成功率，平均推理成本增加超过 20%；不能把该数字移植为本仓收益预测，也不能据此删掉必要安全与非标准约定。这里只借鉴“用真实任务比较规则效果”。

## 当前结论

### 优先顺序：先减少任务进入成本，再增强可观测性

Open Forge 已有明确的包所有权、任务合同、风险驱动测试、生成文件守卫、原生协作和产品运行时分层。主要机会是降低这些机制的使用成本、确认规则实际加载与生效；不需要替换内核或叠加新的开发框架。以下均为本轮研究推论，优先级针对本仓，不是来源原文的统一要求。

| 优先级 | 当前证据 | 建议的最小切片 | 验证与保留边界 |
|---|---|---|---|
| P0 | 根 AGENTS 已缩至 6.8 KB，但 intake 13.2 KB、管理规范 15.1 KB；入口仍要求图谱调查、来源/Task、协作与交付等多跳读取 | 让 intake 保留分流和执行入口；分清只读研究、轻量维护、行为/合同变化，只有陌生跨模块问题才要求图谱辅助 | 比较同类任务首次有效修改前的读取量与时间；权限、事实源、Task 准入和必需验证不变，真实政策调整单独说明 |
| P0 | `project/tasks/README.md` 318 行却约 80 KB，含大量已结束任务；Task 模板 90 行，已经允许简写但缺少短范本 | 查询 Task ID/主题后只读命中记录；把操作说明和活动导航与历史明细分开，优先查询而非全读。给串行轻量任务提供约 15–30 行正文示例，公共元数据照旧 | 一小任务仍有来源、目标、验证与结果；并行/跨包/迁移才展开对应合同。若拆索引，联动既有索引守卫，不再维护两份手写状态 |
| P0 | 当前 CLAUDE 是 Markdown 链接，官方区分链接与原生导入 | 在实际 Claude 版本上验证 `@AGENTS.md` 薄入口；仅共享根正文自动导入，其余保持按需 | 查加载来源与重复注入；保持现有 Markdown 守卫兼容或给其补导入解析测试，不把文件链接通过等同运行时加载通过 |
| P1 | 已有 Task/Plan/ADR；外部 notes 技能仍含更广的必写与确认条款 | 把笔记方法适配到原记录：实施事实留 Task，阶段取舍留 Plan，满足既有三项条件才建 ADR；新增笔记前先找所有者 | 一项决定一个正文；真实备选、理由与验证缺口可追溯；不新增 `.agents/notes`、重复确认或 npm 工具链 |
| P1 | 文件守卫只量两个入口；产品已有分块预算、来源、工具投影与缓存测试 | 开发侧增加代表任务的读取清单/体积报告；产品侧复用 `SystemPromptDiagnostics`，在现有测试补角色/能力组合的引用一致性案例 | 区分字节、字符、估计 token；不复制诊断器，不用整段文字快照锁死文案，不静默截断规则 |
| P1 | intake 已有场景表，但静态检查不证明模型执行质量；社区存在短规则也失效的案例 | 把现有场景中 5–8 个高价值案例变成可重复的旧/新规则对照，先准备脱敏输入和判据 | 同模型/仓库快照/权限/预算，先判正确性与安全，再比较重复读取、无关抽象、人工追问和验证成本；真实模型另获授权 |
| P2 | 自主控制器已有策略/租约/证据；开发会话与产品 Agent Team 是不同体系 | 借鉴“上下文不授予权限、按影响升级、只在需要决定时突出提示”，映射到现有所有者 | 不新建 Ticket/Mandate 状态机，不启动后台循环，不直接套用原型自动合并、模型选择与消息频率 |

这里的 P0 表示本次优化先做，不表示生产故障。建议第一批只处理前两项及 Claude 导入验证；其余按真实摩擦和评测结果推进。

### DeepSeek 原型：值得借鉴的是责任边界与注意力成本

D2 以人的注意力成本评价问题、配置、通知和文档，并强调少概念、少设置、状态单一写入者、窄接口。它将接入事件、授权工作和执行会话区分开。对本仓的对应是：继续让 Runtime 管生命周期、coding-agent 管产品策略、Host 管 I/O；任务资料按使用者和需要披露，而非把整个目录注入。现有架构方向与这些原则一致，无需为使用新术语再拆一层包。

D3 将订阅消息作为上下文，授权仍由已有范围限制；推断式工作默认 `observe`，只记录本会怎样行动。恢复先核对目录、Git 和外部实际结果，再重复外部操作。可迁移到自主控制器的离线准入评估和恢复案例；不能由网页、CI 消息或同主题讨论自动扩大本次用户授权。

D4 用角色实际看到的提示词、Schema、技能和输入做合同检查：引用的工具、枚举、变量及资源应真实存在，同时限制总体大小。这比继续增加说明段更值得借鉴。但其 orchestrator/worker 的字符预算是该原型的基线，不是通用数值；本仓已有相关基础，应补组合缺口而非重建。

其提示词版本在每次模型请求生效，与本仓 **Turn admission 固定 generation** 的合同不同。保留本仓下一 Turn 生效及显式 hard revoke 路径，不能照搬热更新时点。原型让路由会话不读代码、不等待，面向无人值守部署；不能据此限制当前负责实现和集成的开发 Coordinator，或取消宿主要求的进度沟通。

### DeepSeek Notes：保留决策理由，避免新增一套记录制度

| 议题 | 一手差异与本仓取舍 |
|---|---|
| 什么值得记 | D5 当前官方以代码、测试、现有文档解释不了的长期理由为门槛，允许机械及局部 UI/交互修改免写 Note；D6 的“行为变化即非平凡必写”更宽。免写 Note 不等于免掉本仓 Task 或回归测试 |
| 写到哪里 | 本仓已把执行、阶段路线、正式架构决策分别交给 Task/Plan/ADR。吸收 D5 的先更新既有归属，不新建第二套 notes 树 |
| 决定翻转 | 原因与方案翻转时另记并互链；部分取代保留仍成立部分；完全取代先接管独特理由、备选与验证缺口。保持现有编号和链接稳定，不按状态移动旧 ADR |
| 什么是权威 | D6 的部分参考把 Note 称作现行规则，本仓以源码/类型/Schema/测试为当前事实。记录维护意图和适用条件，不能用旧笔记压过实际实现 |
| 确认与校验 | D6 的通用确认门、目录状态、归档封印和 npm/npx 脚本是社区方案，不是应覆盖本仓的授权。记录质量要看理由是否真实，不能用存在一个 Alternatives 标题替代审查 |
| 内部互信 | D5 根规则限定在类型完整的同进程直接调用；配置、模型 JSON、队列、持久化、worker/process/wire 仍是边界。不要以“内部模块”为由删掉跨时间、跨进程的校验 |

建议给已有记录补充的最小信息仅是：**为什么这样做、真实考虑过什么、用什么证据判断、何时应重新考虑**。只有前三种记录都没有合理归属时，才讨论新增记录类型。这是当前版本的差异对照，未审计社区技能的完整演进史，不能反推其历史转述一定错误。

### 官方依据：短入口是方向，100–150 行是本仓预算

O1 建议常驻文件只保留代码不能直接说明的约定，优先用明确命令和真实纠错经验；O2 的建议是每份 CLAUDE 少于 200 行。O5 给 Rules 的建议是少于 500 行。O3 的默认 32 KiB 是组合发现预算，不能当作最佳长度。故“100–150 行”可作为本仓更严格的维护目标，不宜写成各家共同规定；行数也不能替代中文字节、导入正文和任务实际读取量。

“第二次犯错后加规则”确有 O1/O2 对应建议，但不是安全约束只能在第二次事故后建立的要求。O2 同时列出 code review 发现、反复解释和团队必要上下文等触发条件。可迁移原则是用实际纠错证据控制经验规则增长，保留事先明确的权限与安全边界。

### 官方依据：文件名相同，不代表加载合同相同

| 宿主 | 已核实的加载合同 | 对本仓的含义（研究建议） |
|---|---|---|
| Claude Code | O2：v2.1.277 起具备原生 AGENTS 支持；默认有祖先/当前目录的 CLAUDE 或 CLAUDE.local 时优先 CLAUDE。`@AGENTS.md` 是导入，文字要求或 Markdown 链接仍靠模型主动读取；`paths` 规则按匹配文件加载 | 保留 Claude 专属差异时，优先验证 `@AGENTS.md` 薄入口；Windows 优先导入而非新增符号链接。导入增加可达性，不减少被导入正文的上下文成本 |
| Codex | O3：每次运行沿项目根到 cwd 发现；每层最多一个文件，override 优先于 AGENTS，再选配置的 fallback；组合默认上限 32 KiB | 从根目录启动不能假定启动时已加载所有包级 AGENTS；保留“访问目标前读最近规则”的入口，并用实际加载来源核验 |
| Zed Agent | O4：按固定顺序取第一个项目文件，`.rules`、`.cursorrules` 等排在 AGENTS 前；外部 Agent/Terminal 的加载依各自宿主 | 检查旧兼容文件是否遮蔽共享入口；不能把 Zed 窗口等同于 Zed 原生 Agent |
| Cursor | O5/O6：项目规则使用 `.cursor/rules/*.mdc`；支持常驻、按描述、按 glob、手动触发；嵌套 AGENTS 与父层组合；CLAUDE 也兼容且始终应用 | 共享内容维持一处；只在实际使用 Cursor 且有明确路径需求时添加薄适配，避免复制通用正文 |
| Windsurf/Cascade | O7/O8：根 AGENTS 常驻，子目录按路径触发；Rules 提供 always_on/glob/model_decision/manual。当前旧网址正文已改用 Devin Desktop 命名与兼容路径 | 采用位置作用域的原则；在目标版本确认前不据新网页批量迁移 `.windsurf/` 或恢复本仓已移除的 Devin 镜像 |
| Continue | O9：规则放 `.continue/rules`；`alwaysApply: true` 常驻；false 可由匹配 glob 或描述触发；未设时没有 glob 就常驻，有 glob 则匹配才应用 | 只拆文件而不设触发条件仍会常驻。本次读到的现行 Rules 正文未说明 AGENTS 自动发现，不能用搜索摘要代替该合同 |

O4 的首个匹配顺序为 `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → `.github/copilot-instructions.md` → `AGENT.md` → `AGENTS.md` → `CLAUDE.md` → `GEMINI.md`。这是一条特定宿主规则，不是跨工具优先级。

O8 的 6,000/12,000 字符分别用于全局 Rules 和单个 workspace rule；不能移作 AGENTS 通用预算。当前本机实际工具版本与用户级配置未读取，本研究不声称已完成跨宿主实测。

### 本仓可立即验证的候选：Claude 入口的确定可达性

当前 [CLAUDE.md](../../CLAUDE.md) 采用“先完整读取 AGENTS”的文字加 Markdown 链接。O2 专门说明这种写法仍依赖模型决定是否打开文件，并建议改为原生导入或直接使用 AGENTS。因此，下一轮可将入口第一项改为 `@AGENTS.md`，保留专属提交补充的条件指针；其它扩展继续按需加载，不能全部改成 `@` 导入。

这是加载可靠性候选，不是已经观察到本仓漏读的 Bug，也未在本轮实施。验证应在获授权的目标 Claude 会话中核对 `/context` 的来源、共享规则是否只出现一次，以及包级规则是否按目标读取。若现有宿主已经显式注入两份文件，先核对其去重行为再改；不要只用 Markdown 链接守卫宣称原生加载通过。

### 官方依据：硬约束交给机制，流程复杂度交给证据

O1 区分提示词中的非确定性指导和宿主可强制执行的 hooks、deny rules、managed settings。对 Open Forge 的建议是优先复用已有 Git/Schema/包边界/测试守卫，仅给真实缺口补检查；不要为每句风格建议创建 hook，也不要让每次编辑都触发完整测试。

O10 建议先发挥单 Agent 的能力，仅在复杂逻辑或工具重叠持续影响效果时拆分；guardrails 从已知风险出发，再依据真实失败增加；超过失败阈值或高风险动作需要人类介入。这支持“按风险选择流程”的方向，并不要求给内部每层函数增加校验，或撤掉已有多 Agent/权限边界。

O11 支持简单、可组合的实现，区分预定义 workflow 与模型自主选择路径的 agent。对本仓应保留确定的权限、提交与发布门禁，让普通开发任务的检索、切片和必要重构由当前事实决定；具体流程减法仍需与本仓现有合同逐条对照。

## 被否决的方案

- 重写 Agent 内核、搬入 DSH 全部领域模型或给已有 Task 再包一层 Goal/Ticket：现有所有权和能力已有证据，收益尚不足以支付迁移成本。
- 新增 `.agents/notes` 状态机、全历史笔记审计、双语副本与封印门禁：会复制既有 Project/ADR；只吸收真实理由与取代关系。
- 将“最少改动”写成最多三个文件、零测试、零新接口等绝对限制：跨包消费者、迁移、取消与安全合同可能需要它们。
- 用原型每次 model request 读最新 Prompt 替换 Turn generation：会改变本仓在途一致性与撤销合同。
- 为适配所有工具复制 AGENTS 正文到多份 Rules：容易漂移，且触发语义并不相同。
- 把全部扩展改成 Claude `@` 导入：只移动文本位置，不能降低上下文成本。
- 把 100–150 行、500 行或 32 KiB 混成统一最佳实践：来源、对象与单位不同。
- 以“不要过度防御”为由关闭边界保护，或把 guardrails 泛化成所有内部函数的兜底：均超出官方来源能支持的结论。

## 代码/测试/指标锚点

仓库基线：`d66b2127fb4a1d8523cc3ec307ec8c47ef98557e`，TASK-0420 后的本地 main。只读源码与文档，未运行产品测试；“已有测试”表示读到对应合同，不是本轮运行通过。

| 文件 | 实测 UTF-8 字节 | 行数 | 含义 |
|---|---:|---:|---|
| [AGENTS](../../AGENTS.md) | 6,826 | 65 | 根文件已短，但行数掩盖长行内容 |
| [CLAUDE](../../CLAUDE.md) | 653 | 8 | 薄入口；Markdown 指针不是原生导入 |
| [task-intake](../../.agents/skills/open-forge-task-intake/SKILL.md) | 13,196 | 94 | 实际开工流程的更大正文 |
| [管理规范](../CONVENTIONS.md) | 15,121 | 306 | 记录路由与元数据等，不宜每次全文重读 |
| [Task 导航](../tasks/README.md) | 79,993 | 318 | 大量历史摘要，按 ID/主题检索更合适 |
| [Task 模板](../tasks/templates/task.md) | 1,766 | 90 | 可为串行小任务提供更短正文示例 |
| [原生协作](../../.agents/skills/open-forge-task-intake/references/session-coordination.md) | 6,978 | 56 | 按实际委派/集成需要加载 |
| [测试技能](../../.agents/skills/open-forge-testing/SKILL.md) | 12,271 | 160 | 仅行为/测试任务读取；已有分层验证原则 |

上述是文件大小，不是每次会话实际注入量或 tokenizer 的 token 数；本轮未测量这些文件对延迟/成本的因果影响。

已经具备、无需重复立项的能力：

- [Prompt document](../../packages/coding-agent/src/model-context/prompt-document.ts) 有分块 `source`、字符/估计 token 诊断、`overBudget` 与稳定缓存区；[测试](../../packages/coding-agent/test/system-prompt-document.test.ts) 覆盖不截断、来源不可伪造和缓存边界。
- [工具与 Prompt 组合测试](../../packages/coding-agent/test/runtime-core/model-call-and-prompt-runtime.test.ts) 验证最终工具 Schema 与执行输入映射；[系统提示测试](../../packages/coding-agent/test/system-prompt.test.ts) 已防止重复渲染工具清单。因此新增建议限于角色/能力组合与开发规则读取路径的缺口。
- [上下文加载器](../../packages/coding-agent/src/resources/runtime/context-resources.ts) 按目录读 CLAUDE、AGENTS；[渲染器](../../packages/coding-agent/src/model-context/system-prompt-policy.ts) 明确目录/文件优先级；[合同测试](../../packages/coding-agent/test/context-resources-port.test.ts) 已覆盖双读、次序和不可读文件。文件正文汇入 `core.context`，产品该合同不能等同外部 Codex/Claude/Zed 的加载规则。
- [工具执行器](../../packages/agent/src/engine/tool-executor.ts) 已有 `parallel-safe` 连续批次、逐工具授权、取消与未启动调用的 steering 处理。早期 [RESEARCH-0021](RESEARCH-0021-pi-deepseek-harness-absorption.md) 中串行差距描述不是当前事实，不重开“从零做工具并发”。
- [coding-agent 规则](../../packages/coding-agent/AGENTS.md) 已明确产品/Runtime/Host 责任及 Turn generation；[自主工具](../../scripts/agents/README.md) 已区分策略、执行、证据、发布和真实模型验收。产品 Agent Team、开发会话协作与独立控制器仍分开。
- [.cursor 薄规则](../../.cursor/rules/00-agents.mdc) 已常驻指向共享 AGENTS；不必再生成一套 Cursor 正文。[LESSONS](../../LESSONS.md) 已有真实证据、不同日期观察与人工晋升，不能声称缺少经验闭环。

### 社区：把痛点转成案例，不把吐槽当技术规范

下列原帖在 2026-11-04 取得公开正文。帖子描述的是个人报告或观点，无受控对照时不推断某模型的普遍行为、发生率或因果机制。

| 原帖与日期 | 可核验信号 | 对本仓的启发与限制 |
|---|---|---|
| [Reddit：over-engineer / ignore rules](https://www.reddit.com/r/codex/comments/1ve9nxe/why_does_codex_constantly_overengineer_code_and/)，页面显示约 3 月前，精确日未独立核验 | 作者报告小应用被加入多层抽象、道歉后重犯 | 评价实际 diff；不能据此证明加强措辞或减少所有测试会改善 |
| [HN：是否仍维护 CLAUDE/AGENTS](https://news.ycombinator.com/item?id=48160604)，2026-05-16；日期由 [HN API](https://hacker-news.firebaseio.com/v0/item/48160604.json) 核对 | 主帖报告不足 100 行也可能不遵循；评论有分歧，包含真实回归单句约束、短索引与数据对照建议 | 短不是充分条件；不能把评论者的加载机制说法当官方事实 |
| [Linux.do：codex 写代码很冗长](https://linux.do/t/topic/2496023)，页面 Jun 29，检索年份 2026 | 有过多兼容层、检查与抽象的使用报告 | 审查保护的是哪种实际输入/旧数据；本仓有持久化兼容，不能照搬“开发期直接破坏旧数据” |
| [Linux.do：精简 AGENTS](https://linux.do/t/topic/2315292)，页面 Jun 6，检索年份 2026 | 作者报告自动演进规则增加 token，个人感受精简后更收敛 | 候选需实测；其全方法注释/普遍确认等个别条款不适合本仓 |
| [X：Wes Winder](https://x.com/weswinder/status/2115140848895590804)，2026-10-27 | 主张短入口，回复提出按需文件/Skill | 无通用 400 行阈值的实验，作为组织方式案例 |
| [X：Hash](https://x.com/0xhashlol/status/2115760488063627602)，2026-10-29 | 作者称两个文件重复导致规则混乱，统一来源比删字有效 | 查冲突与重复；“最后加载胜出”只是其观察，不是宿主统一优先级 |
| [X：Addy Osmani](https://x.com/addyosmani/status/2026172457233829922)，2026-02-24 | 主张减少可从代码发现的缓存事实，保留目录级非显然约定 | 是“全部删规则”的反例；其转述研究数字不作为本轮数字证据，另读 E1 原文 |

另两条 Reddit 搜索命中未能提取正文，未采用其中细节：[同一规则被忽略](https://www.reddit.com/r/codex/comments/1x7ms4i/codex_ignored_the_same_agentsmd_instruction/)、[overengineering](https://www.reddit.com/r/codex/comments/1xj1e8x/gpt_61_constantly_overengineering_solutions/)。未登录站点或绕过访问限制。

### 可复用的 5 组验证场景（设计，未执行）

1. **小任务**：在已有 Task 修正文档链接，完成结果正确且只核对相关路径，不新建整套计划或运行时测试。当前必需记录保持，候选 Policy 改动先明确。
2. **成对输入**：A 是已校验且类型完整的同进程值，B 是同形状的外部 JSON/IPC；A 不加不可达兜底，B 入域校验仍在。两者共同满足才算改进。
3. **生命周期例外**：异步取消/资源回收 Bug，保留清理、错误传播、真正可失败回归；“代码更短但丢保护”判失败。
4. **多入口与嵌套**：根、包级 AGENTS、Claude/Cursor 薄入口以及过期冲突说明；按实际宿主核对来源和生效范围，无关包不全读。背出规则不等于产物遵循。
5. **中断续接**：既有 Task、已通过证据与一个实际新失败；复用无变化的证据、只重验受影响面，既不全部重来也不忽略新失败。

对照组始终保留相同硬边界。固定模型/配置、仓库与案例版本、工具权限和预算，重复执行后记录完成率、实际越界/回归、首次有效编辑前读取量、无关抽象/文件、人工追问、重复验证及费用。先看正确性/安全，再看成本；不预设必须减少多少行，不把模型自评当唯一判据。

## 失效条件与置信度

本仓字节/行数和所读源码合同置信度高；官方宿主加载结论仅针对此次取得的文档，目标安装版本与用户级配置未探测；优化效果尚无本仓模型对照，属于待验证推论。社区只作案例证据，未审计原作者完整运行轨迹。工具版本、上游 SHA、入口/模板/加载器或架构变动时，重查对应范围；不批量重写历史研究。

本轮使用原生子任务分工检索官方文档、笔记方法和社区证据，主会话核对仓库并整合、自审。研究分工不等于实施后的独立代码评审。只新增本 Research 与索引；未修改规则、技能、产品代码、依赖或用户配置，未启动 UI 或后台控制器，未做真实 Provider 评测，未推送或发布。

## 下一步触发信号

优先选择“任务入口按需化 + 轻量 Task 示例/历史索引查询 + Claude 导入验证”作为第一批；使用既有 REQ-0004，实施前另建相应 Task，避免把研究状态当实施授权。Notes 适配可作为同主题后续，角色输入组合检查与真实模型评估在出现对应需求/授权后进行。

本轮验证：使用既有 `brokenFileLinks` 核对本记录与 Research README，相对链接均通过；`node scripts/quality/check-project-indexes.mjs` 与 `git diff --check` 均通过。不运行产品测试或用机械检查声称模型行为已优化。研究结论不是发布说明或新强制规范。
