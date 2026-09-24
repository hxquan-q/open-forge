---
id: TASK-0021
type: task
status: done
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/plugins, apps/desktop]
write_paths: [packages/coding-agent, packages/plugins, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0016, TASK-0017, TASK-0020]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Tool Catalog Policy 收敛（implementation-plan 阶段 6a）

## 目标

实现单一 Catalog resolver，按已冻结的 Profile 与 project policy 决定可见能力。
Resolver 只负责能力选择；逐次执行授权继续由 TASK-0016 的 Tool Policy/Approval 拥有。
Plugin Renderer 集成另由 TASK-0027 负责；MCP 仅复用既有 generation/deferred/synchronizer。

## 范围

### 并发评估

- 结论：不支持并发（修改共享 Catalog policy 与 capability profile 合同）
- 执行方式：serial
- 前置依赖：TASK-0016（执行授权）、TASK-0017（Profile）、TASK-0020（project policy schema）
- 集成负责人：coordinator

### 做

- 按 ISSUE-0005 决策实现 Profile × project policy 的 Catalog resolver；mode 维度只能在该决策明确允许后加入；
- Profile、Skill、Plugin、MCP 来源统一经同一个 Catalog policy 汇总，不能静默注册或覆盖同名能力；
- Catalog 可见性与执行授权分层：未进入模型 schema 的调用不能执行，进入 schema 的调用仍重新校验 grant/risk；
- 复用现有 MCP generation/deferred/synchronizer；不修改 MCP 协议或生命周期。

### 不做

- Pi Extension 兼容层（阶段 7 专属，且 ISSUE-0002 已裁决暂不启动）；
- Plugin Renderer Registry 实现（TASK-0027）；
- 重建 Capability Grant 或复制 TASK-0016 的 Trust/Approval 状态；
- 插件市场运营功能（属上游/服务端范畴）。

## Given / When / Then

- Given：同一项目按 ISSUE-0005 冻结的 Profile 与 project policy 分别装配两个 Session；
- When：Catalog 编译模型工具 schema，并在执行入口收到允许和拒绝的 Tool Call；
- Then：集合严格符合 policy；不在 Catalog 内的调用不能执行；Catalog 可见不替代 grant/risk/Approval 执行检查。

## 必须保持

- 能力授予默认拒绝、最小集合；
- 不为 Pi 引入第二公开扩展合同；
- 既有插件/skill 用户按显式兼容规则继续可见；没有 grant 的新增能力不获得隐式写权限。

## 测试与验证

- 定向：Profile/project-policy Catalog 矩阵、重复能力冲突、schema 隐藏与执行面复核合同测试；
- 用户流程：选择 WorkspaceMode 与 Agent Profile → 创建 Session → 检查工具面 → 尝试未授予调用并确认被阻止；
- 质量检查：`bun run check:quick`、架构守卫、coding-agent 全包。

## 阻塞

- ISSUE-0005 未决前不按 Work/Coding 名称过滤或收紧 Agent 工具面；本 Task 不改变 ADR-0071 的语义。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

- 实际修改：
  - `coding-agent`：`tool-policy/catalog-policy.ts`——单一 Catalog 收敛规则
    （显式选择 > Profile 默认；项目策略 deny 对任何来源胜出、清空即最小集合；
    无默认无选择保持 unset 不虚构全集）与同名能力「先到先得、不静默覆盖」裁决；
    `projects/project-tool-policy.ts`——`.vetta/policies/tools.json` v1 Schema
    （schemaVersion + denyTools，结构损坏 fail closed）与装载；根入口导出。
  - `apps/desktop`：`resolve-session-config` 在 Profile 折算后应用项目策略
    （只能再收紧）；策略文件损坏时创建会话直接报错，不带病放宽。
- 实际运行：catalog-policy/project-tool-policy 22 项测试（矩阵、deny-wins、
  清空最小集、同名冲突、fail closed、真实临时目录装载）通过；desktop tsc
  本任务文件无错。
- 未运行及原因：双模式端到端工具面对照未跑——mode 维度按 ISSUE-0005/ADR-0071
  不参与 Catalog，工具面由 Profile × 选择 × 项目策略决定，矩阵已由单元层覆盖。
- 剩余风险：Plugin Renderer Registry 属 TASK-0027；MCP deferred/generation 复用
  既有机制未改动；项目策略对 MCP 贡献名的 deny 生效于模型面 schema 装配，
  执行面复核由 TASK-0016 审批链持有。
