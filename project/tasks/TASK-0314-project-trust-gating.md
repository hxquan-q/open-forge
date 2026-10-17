---
id: TASK-0314
type: task
status: draft
priority: P1
owner: unassigned
requirement:
plan:
source: RESEARCH-0032 / GHSA-mqxh-6gq7-558m（上游修复 89a92207 及 718215bd、ff3e9df5、38f18be4）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit:
read_paths:
  - packages/coding-agent/src/resources/packages/package-source-runtime.ts
  - packages/coding-agent/src/resources/skills/discovery.ts
  - packages/coding-agent/src/resources/runtime/skill-resource-state.ts
  - apps/desktop/src/main/task-activity/tool-approval-broker.ts
write_paths: []
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 工作区信任门禁：项目本地扩展/skills 确认后加载（GHSA-mqxh）

## 目标

打开含 `<cwd>/.vetta`（改名后 `.openforge`）项目级 extensions/packages/skills 的仓库时，必须先经用户信任确认才加载执行；非交互（headless/SSH）模式默认拒绝。对齐上游 pi 0.79.0 project trust 门禁。

## 范围

### 并发评估

- 结论：不支持（未设计完成）
- 执行方式：serial
- 可并行 Task：—
- 前置依赖：UX 决策（见下）
- 冲突文件/独占路径：资源加载链 + desktop 工作区打开流
- Branch：待定
- Worktree：待定
- 集成负责人：待定
- 集成顺序：待定

### 待决策（进入 ready 前必须收敛）

1. 信任载体：扩展 `NodeProjectTrustStore`（`.vetta-local/trust.json`，现用于 L3 工具审批）承载工作区信任，还是独立存储？已信任列表如何迁移/首启不弹窗？
2. 门禁范围：仅项目级 packages/skills，还是同时覆盖项目 `AGENTS.md` 类指令文件（上游 89a92207 覆盖面）？
3. 桌面端 UI：工作区信任对话框的入口（打开工作区时/首次会话启动时）与记住选择粒度（按路径/按指纹）。
4. 非交互默认：headless 与 SSH 远端的默认拒绝语义与显式信任开关（CLI flag/环境变量）。

### 做（草案）

- 资源加载链在 project scope 前查询信任状态；未信任 → 拒绝加载并上报原因。
- desktop 工作区打开流接信任对话框；选择持久化。
- 回归测试：恶意仓库 fixture（带 `.vetta/skills`）在未信任时不执行任何项目级代码；信任后正常加载。

### 不做（草案）

- 不改 user scope 资源加载。
- 不引入目录内容指纹级 diff 提示（v1 按路径记忆）。

## Given / When / Then

- Given：用户打开一个包含项目级扩展/skills 的未信任仓库；
- When：会话启动、资源解析尝试加载 project scope 包；
- Then：弹出信任确认；拒绝时不加载/不执行任何项目级代码并给出可见原因；接受后记住选择，下次直接加载；headless 默认拒绝并记录。

## 必须保持

- user scope 与内建资源不受影响；信任状态不改变 L3/L4 工具审批语义（分层独立）。

## 测试与验证

- 定向测试：待设计
- 用户流程：打开恶意 fixture 仓库 → 拒绝 → 无代码执行；接受 → 正常加载
- 质量检查：待设计

## 验收分层

- 工程验证：待执行
- 技术评审：未执行
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：待验收
- 发布：未授权

## 功能验收包

- 入口与前置条件：desktop 打开含 `.vetta` 项目级资源的工作区
- 操作步骤或 AI 任务输入：打开 → 面对信任对话框 → 拒绝/接受各一次
- 预期行为与最终产物：拒绝零执行；接受后加载且记忆
- 不通过表现与已知限制：—
- 验收反馈及回归案例：

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：
- 剩余风险：
