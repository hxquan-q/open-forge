---
id: TASK-0021
type: task
status: draft
priority: P2
owner: coding-agent/apps-desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/plugins, apps/desktop]
write_paths: [packages/coding-agent, packages/plugins, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0016, TASK-0017]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# Plugin/Skill/MCP/Renderer 生态分层收口（implementation-plan 阶段 6）

## 目标

让 Tool Catalog 按 Mode/Profile/Project Policy 收敛：Profile、Skill、Plugin、MCP
保持职责分层；Renderer Registry 复用 Plugin contribution；外部扩展按信任分级；
Capability Grant 默认拒绝；MCP 沿用已有 generation/deferred/synchronizer 机制。

## 范围

### 并发评估

- 结论：不支持并发（横切 Tool Catalog 与权限策略两个公共面）
- 执行方式：serial
- 前置依赖：TASK-0016（权限/信任分级）、TASK-0017（mode 分流骨架）
- 集成负责人：coordinator

### 做

- Tool Catalog 选择器：mode × profile × project policy 三维收敛；
- Plugin contribution → Renderer Registry 的复用通道；
- 外部扩展信任分级与 Capability Grant 默认拒绝的机械校验；
- MCP 沿用 generation/deferred/synchronizer，不引入第二合同。

### 不做

- Pi Extension 兼容层（阶段 7 专属，且 ISSUE-0002 已裁决暂不启动）；
- 插件市场运营功能（属上游/服务端范畴）。

## Given / When / Then

- Given：同一项目分别用 work 与 coding 模式打开，且项目声明了自定义 policy；
- When：枚举两个模式下的可用 Tool/Skill/MCP；
- Then：集合严格按 mode/profile/policy 收敛，未授权能力默认拒绝，插件贡献的 UI 正常出现在 Registry。

## 必须保持

- 能力授予默认拒绝、最小集合；
- 不为 Pi 引入第二公开扩展合同；
- 既有插件/skill 用户无感迁移。

## 测试与验证

- 定向：Tool Catalog 收敛矩阵测试、grant 默认拒绝守卫测试；
- 用户流程：双模式下能力面差异可见且正确；
- 质量检查：`bun run check:quick`、架构守卫、coding-agent/plugins 全包。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
