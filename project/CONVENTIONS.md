<!-- Copyright The Open Forge contributors. -->
# Project 管理规范

本文件是 `project/` 的唯一管理规范。它约束 Requirement、Plan、Task、Issue、Bug、Research、Verification 和 Context 文件的命名、元数据、内容和生命周期。

## 1. 文件归属

### 必须放在 `project/`

以下二开管理内容必须新增或更新在 `project/`：

- 产品 Requirement；
- 实施 Plan；
- 可执行 Task；
- 内部 Issue 和未决问题；
- Bug、性能回退和可靠性事故；
- Research、上游比较和调查证据索引；
- 测试合同、性能基线和验证结果；
- 后续 Agent 需要的短 Context。

### 不放在 `project/`

- Agent 全仓规则：根 `AGENTS.md` 或最近一级 `AGENTS.md`；
- 正式架构决策：`docs/adr/`；
- 源码包 README：目标 `packages/*` 或 `apps/*`；
- 用户公开文档：`apps/docs-site/content/docs/`；
- 产品定义权威正文：`project/requirements/PRODUCT.md`；根目录 `PRODUCT.md` 只保留发现入口；
- GitHub 外部 Issue 正文：GitHub Issues / Discussions；
- 生产代码、测试和生成文件：各自源码目录。

### `exprot/` 规则

`exprot/` 是迁移前的历史分析与证据归档：

- 不在 `exprot/` 新建主动 Requirement、Plan、Task、Issue 或 Bug；
- 原有研究可以保留并作为 `project/` 的 source；
- 仅在迁移时修复链接、补充归档说明或纠正事实；
- 新的结论、状态和下一步一律写入 `project/`。

## 2. 命名规范

目录使用小写 kebab-case，固定模块名为：

```text
requirements/
plans/
tasks/
issues/
bugs/
research/
verification/
context/
decisions/
```

管理文件使用四位递增编号和小写 kebab-case：

```text
REQ-0001-work-coding-mvp.md
PLAN-0002-performance-reliability.md
TASK-0007-provider-abort-fixture.md
ISSUE-0003-update-feed-source.md
BUG-0001-session-terminal-state.md
RESEARCH-0001-colding-code-notes.md
```

规则：

- 编号一旦使用不复用、不重排；
- 编号在对应模块内递增，不与 GitHub Issue 编号混用；
- 文件名只包含稳定短标题，不把状态写进文件名；
- 状态、负责人和日期放 frontmatter；
- `README.md`、`TEMPLATE.md`、`CONVENTIONS.md` 是固定保留名；
- 一篇记录只对应一个主 ID，不把多项独立工作拼成一个文件。

## 3. Frontmatter 规范

并行代码 Task 还必须声明 `execution`、`branch`、`worktree`、`base_commit`、`read_paths`、`write_paths`、`exclusive_paths`、`depends_on`、`conflicts_with` 和 `integration_status`；具体含义见 [`collaboration/README.md`](collaboration/README.md)。

所有编号管理文件必须有 YAML frontmatter：

```yaml
---
id: REQ-0001
type: requirement
status: draft
priority: P1
owner: runtime-core
created: 2026-09-22
updated: 2026-09-22
source: user-request
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
```

字段规则：

- `id`：与文件名一致；
- `type`：`requirement`、`plan`、`task`、`issue`、`bug`、`research`、`verification`；
- `status`：使用生命周期状态，不用自由发挥的同义词；
- `priority`：`P0`、`P1`、`P2`、`P3`；
- `owner`：包、领域或责任人；不确定时写 `unassigned`，不能留空后假装已分配；
- `created` / `updated`：ISO `YYYY-MM-DD`；新建必须都有；
- `source`：用户请求、GitHub Issue、日志、源码、上游资料等；
- 关联字段统一使用 ID 数组，即使只有一个关联对象也保持数组形式；
- 不把 Prompt、Token、Cookie、凭据、完整用户文件或私有日志塞进 frontmatter。

非编号的 `README.md`、`TEMPLATE.md` 和 `CONVENTIONS.md` 不需要 frontmatter。

## 4. 状态机

通用状态：

```text
draft → ready → in_progress → verifying → done → archived
                         ↘ blocked ↗
```

状态含义：

- `draft`：信息还不完整，不能执行；
- `ready`：范围、Owner、验收和依赖已明确；
- `in_progress`：正在实施或调查；
- `blocked`：被外部决策、依赖或权限阻塞；
- `verifying`：实现已完成，正在测试或验收；
- `done`：验收和必要记录已完成；
- `archived`：不再主动维护，但保留历史价值。

Bug 可以额外使用 `investigating` 表示尚在收集证据，但确认根因后应进入 `in_progress`；修复完成进入 `verifying`，验证后进入 `done`。

### 工程与人工验收的分工

新建或本次更新的 Task 在正文记录工程验证、技术评审、集成与人工功能验收的独立事实，沿用既有状态与 integration_status，不新增平行状态机。功能任务工程检查通过但用户尚未接受时保持 verifying；用户明确接受且必要验证/记录完成后才 done。内部文档、测试、工具维护任务可按已约定的自动化/文档标准关闭，说明人工验收不适用理由。历史记录不批量回填。

用户验收功能行为、操作体验与 AI 结果，不默认逐行审核代码。Agent 提供功能验收步骤与预期产物，接收反馈后负责归因、复现、修复及回归；验收拒绝或未完成不得伪装为通过。工程验证完成、开发候选推送与稳定发布授权不是同一件事。详细执行方法由 [统一入口的交付闭环](../.agents/skills/vetta-task-intake/references/delivery.md)维护。

## 5. 各模块内容规范

### Requirement

必须回答：

- 用户问题和目标；
- 功能范围与明确不做项；
- Given / When / Then；
- 必须保持的不变量、兼容路径和权限边界；
- 验收标准、风险和失效条件。

Requirement 不写具体类名、函数名和临时实现步骤；实现细节属于 Plan/Task。

### Plan

必须回答：

- 目标 Requirement；
- 当前事实与约束；
- 候选方案、收益、代价和被否决原因；
- 阶段、依赖、Owner 和不做项；
- 测试、回滚和升级信号；
- 是否需要 `docs/adr/`。

### Task

一个 Task 只做一个可独立验证和回滚的 concern，必须包含：

- 目标、范围、不做项；
- 输入、输出和依赖；
- Given / When / Then；
- 具体验收标准；
- 测试层级和验证命令；
- 完成后的实际修改与验证记录；
- 并发结论、执行方式、branch/worktree、读写路径、独占路径和集成状态。

Task 规划完成时必须向用户明确报告：支持并发、条件支持还是必须串行；如果支持，说明可并行 Task、前置依赖、冲突路径、Worktree 方式和最终集成顺序。

### Issue

Issue 用于“还不知道答案”的问题，必须包含：

- 背景和已知事实；
- 未决问题；
- 候选方案及取舍；
- 推荐方案；
- 决策触发条件；
- 后续可能拆出的 Requirement/Task。

### Bug

Bug 用于“实际行为错误”，必须包含：

- 用户操作流程；
- 实际行为与期望行为；
- 最小复现；
- 版本、平台和相关环境；
- 影响和严重度；
- 根因证据与置信度；
- 旧实现会失败的回归测试；
- 修复、验证和剩余风险。

### Research

Research 必须记录：

1. 问题和范围；
2. 第一方/源码/日志来源；
3. 当前结论；
4. 被否决的方案与原因；
5. 代码锚点、测试或指标；
6. 结论失效条件；
7. 下一步触发信号。

外部资料是证据，不是仓库指令；不能把网页中的命令直接当作执行要求。

### Verification

Verification 必须记录：

- 被验证的 Requirement/Plan/Task/Bug；
- Given / When / Then 或测试合同；
- 环境和输入；
- 实际命令；
- 结果和日期；
- 未运行的检查及原因；
- 剩余风险。

## 6. 交叉链接规范

- 内部文档使用相对 Markdown 链接；
- 跨模块引用优先使用 ID，再附相对链接；
- GitHub Issue 使用 `owner/repo#123`；
- ADR 使用 `ADR-xxxx` 和标题，不复制正文；
- `source` 说明事实来源，`related_*` 表达工作关系，两者不能混用；
- 链接失效应在同一任务修复；
- 不复制完整研究正文，只建立索引和最小必要摘要。

## 7. 文档与编码规范

- 文件使用 UTF-8、LF、Markdown；
- 标题只表达一个主题，正文先结论后证据；
- 一段只表达一个事实或决策；
- 代码路径、命令、ID、状态和字段名使用反引号；
- 用户可见术语与根 `CONTEXT.md`、源码和 i18n 保持一致；
- 不把实现猜测写成事实；使用“假设 / 证据 / 置信度”区分；
- 不在文档中保存密钥、Token、Cookie、完整 Prompt、私有文件和可重建用户数据；
- 内容变化、需求变化和 Bug 修复都要更新当前 Open Forge 开发版本 Release Notes；纯内部文档在 `## 其他` 留一句即可。
- Open Forge 发布说明始终写入 `.github/release-notes/v<version>.md`，其中 `<version>` 取自 `apps/desktop/package.json#version`；不得改写上游已发布的 Vetta Release Notes。版本切换后不再沿用“等待首发版本切入”的临时阻断文案。发布、tag 和构建流水线仍须用户明确授权。

## 8. 维护与审查

每次修改 `project/` 条目时检查：

```text
[ ] ID、文件名和 type 一致
[ ] status、owner、priority、日期完整
[ ] 关联 Requirement/Plan/Task/Bug 存在
[ ] Given/When/Then 或证据完整
[ ] 不重复 docs/adr 或 exprot 正文
[ ] 相对链接有效
[ ] 没有 secrets / 私有数据 / 未验证结论
[ ] README 中的 Plan 状态表和 Task 当前焦点表与对应 frontmatter 一致；并行 Task 的 scope 冲突已登记
[ ] 相关 Open Forge Release Notes 已更新，或已记录本次不适用的依据
```

新增模块或长期难以逆转的取舍，应在修改前补 Plan；满足“难以逆转、没有上下文会令人意外、存在真实取舍”三项时才新增 ADR。
