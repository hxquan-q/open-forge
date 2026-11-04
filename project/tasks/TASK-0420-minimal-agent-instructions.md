---
id: TASK-0420
type: task
status: done
priority: P2
owner: project/agent-workflow
requirement: REQ-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0140, TASK-0143]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行文档维护）
base_commit: 5b8347d653ab3cc1323c53dbeddd4c009b330d96
read_paths: [AGENTS.md, CLAUDE.md, docs/dev/agent-rules, .agents/skills/open-forge-task-intake, project, scripts/quality]
write_paths: [AGENTS.md, CLAUDE.md, docs/dev/agent-rules/engineering.md, docs/dev/agent-rules/governance.md, project/tasks/TASK-0420-minimal-agent-instructions.md, project/tasks/README.md]
exclusive_paths: [AGENTS.md, CLAUDE.md, docs/dev/agent-rules/engineering.md, docs/dev/agent-rules/governance.md]
depends_on: []
conflicts_with: []
integration_status: integrated（本地 main 串行，随本 Task 原子提交绑定）
created: 2026-11-04
updated: 2026-11-04
---
<!-- Copyright The Open Forge contributors. -->

# 精简 Agent 入口并明确编码纪律

## 目标与范围

Open-Forge-only。将根 AGENTS/CLAUDE 收敛为最小约束、任务入口和硬边界，明确边界校验与内部互信；复用 REQ-0004，新建 Task 承载本次独立优化，不重开已完成的 TASK-0140/0143。

- 输入：用户给出的六项优化方向、当前根文件与规则扩展、既有体积/链接守卫。
- 输出：缩短的两个入口；工程扩展去除重复开工步骤；治理分类与新标题一致。
- 不做：产品代码、测试框架、包级规则批量改写、Task 状态机或 intake 全面重写、真实模型/UI 验证、推送与发布。
- 并发结论：共享规则互相约束，串行修改并自审；本地 main 主工作区，无需新 Worktree，无其他写入者。

## 事实与取舍

- 初始工作区干净；AGENTS 为 8,074 字节，CLAUDE 为 1,702 字节。
- 图谱 `.ua` 停在 2026-10-12 / `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`；当前入口及协作/交付扩展有增量，已回读当前文件。图谱只作导航，不刷新。
- [Anthropic 最佳实践](https://code.claude.com/docs/en/best-practices)：精简常驻指令，保留代码无法表达的约定，其他内容按需读取。
- [Codex AGENTS 指南](https://developers.openai.com/codex/guides/agents-md)：按目录作用域组织指令；本次保留根入口与最近一级规则，沿用现有 Markdown 指针。
- 直接精简现有文件即可；不新增规则文档、抽象或机械断言。安全、授权、协议和既有测试要求保持；内部互信仅适用于已校验且类型契约完整的数据。

## Given / When / Then

- Given 新开发会话，When 读取 AGENTS，Then 只执行四步入口，按任务条件读取扩展，一次完成一个可验证切片。
- Given 内部调用的输入已由边界校验且类型保证，When 修改代码，Then 直接使用合同，不为假想输入新增 null 分支、空 catch、fallback、抽象或测试。
- Given 外部输入、权限、数据库或既有生命周期合同，When 应用最小改动，Then 保留对应边界校验、授权、错误/取消/恢复语义；不以精简为由删掉已有保护。
- Given Claude 入口，When 开发或提交，Then 共享 AGENTS；提交时按专属补充执行，不维护第二份通用政策。

## 必须保持与规则迁移

- 安全、凭证、真实环境访问、Git 破坏性操作、上游只读、发布授权、协议语义保持在根硬边界。
- 包依赖、TypeScript/UI 硬条款与生成文件规则保持；提交格式/动作顺序、验证细则和交付状态继续由原扩展负责。
- 删除根文件中可从 README 发现的技术栈介绍及与扩展重复的流程；六份必需扩展和 Claude 专属补充的链接保持。
- 不减小现有验证要求，不新增为满足文档形式而写的测试；已有 8 KiB / 4 KiB 守卫保持原样。

## 验证与验收分层

- 文档检查：`node scripts/quality/check-agent-guide.mjs`、`node scripts/quality/workflow-skills.mjs`、`node scripts/quality/check-project-indexes.mjs`、`node scripts/quality/check-task-worktrees.mjs`、`git diff --check`。
- 手工核对：逐条保留映射、相对链接、命令来源、文件字节/行数、无新增全量加载要求。
- 工程验证：上述四项文档守卫与 `git diff --check` 已通过。技术评审：自审，纯文档维护不另派 Agent。
- 人工功能验收：文档工程完成不依赖产品实机；未来真实开发任务可观察模型是否减少过度防御，本轮不宣称该效果已获验证。
- 集成：本地 main 串行，随承载本记录的原子提交绑定；不推送。发布：不执行。

## 交付记录

- 实际修改：AGENTS 从 73 行 / 8,074 字节缩至 65 行 / 6,826 字节；CLAUDE 从 21 行 / 1,702 字节缩至 8 行 / 653 字节，合计字节数减少约 24%。工程扩展移除重复开工步骤并收窄重构触发条件；治理扩展按约束内容分级，按用户要求将证据真实性列为不可豁免边界。
- 实际运行：`check-agent-guide.mjs` 体积/引用通过；`workflow-skills.mjs` 权威正文与共享入口链接通过；`check-project-indexes.mjs` 状态索引通过；`check-task-worktrees.mjs` 412 个 Task、0 warning；`git diff --check` 通过。
- 文本自审：外部配置进入边界时仍校验；内部已校验数据可直接使用；错误恢复与资源释放保留；公共合同检查生产者/消费者继续由工程扩展维护；文档按最低充分检查；Claude 提交仍能路由到原专属规则。逐项对照旧根文件，硬边界保留，流程细则已有对应正文。
- 未运行：无产品代码或运行时行为变化，按测试政策不新增单测、不运行 `test:impact`、`test:changed`、完整 `bun run check`、构建或 UI；未调用真实 Provider，也未声称独立模型审查或真实模型效果通过。
- 剩余限制：静态检查只能证明文档路径、预算与记录合同；是否减少实际模型的过度防御，留待后续正常开发任务观察。intake 的详细准入及 Task 流程未在本次重写。
- 当前 Desktop 版本 0.1.4 已有 `v0.1.4` tag，发布说明只读；不改版本或已发布正文。下一开发版本切入时迁入下列候选条目：
  - 其他：精简开发 Agent 的共享指令入口，明确最小改动、边界校验与内部互信约定。
