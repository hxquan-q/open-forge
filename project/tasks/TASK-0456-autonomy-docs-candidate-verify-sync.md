---
id: TASK-0456
type: task
status: ready
priority: P3
owner: docs
requirement: []
plan: []
source: TASK-0452
related_requirement: []
related_plan: []
related_tasks: [TASK-0451, TASK-0452]
related_issues: []
related_bugs: []
execution: parallel
branch:
worktree:
base_commit:
read_paths:
  - scripts/agents/README.md
  - project/autonomy-policy.json
write_paths:
  - docs/dev/agent-rules/autonomy.md
  - project/tasks/TASK-0456-autonomy-docs-candidate-verify-sync.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# autonomy 文档同步推送后候选核验

## 目标

[自主研发协议](../../docs/dev/agent-rules/autonomy.md)「执行顺序」第 4 条仍止于"前进本地 main"，未反映 TASK-0451 落地的推送后候选核验回路。本任务把该条同步为完整事实：本地 main 集成后推送 `main:dev`，远端 CI 通过后由操作者导入 Ed25519 签名的 CI 服务证明，`candidate-verify` 记录候选验证，store 中 `integration.candidateVerification` 是权威绑定。

## 范围

### 并发评估

- 结论：纯文档单文件修改，控制器独立 Worktree 执行（execution: parallel），无并行诉求。

### 做

- 修改「执行顺序」第 4 条（或紧随其后补一句），覆盖：推送 `main:dev` → 远端 CI → 操作者签名 CI 证明 → `candidate-verify`；说明检查名按策略逻辑名由证明签发方映射、`candidateVerification` 为权威记录。
- 保持扩展文档定位：只述协议约束与顺序，不复述 [运行工具](../../scripts/agents/README.md) 的命令细节。
- 在「交付记录」如实填写实际修改与验证结果。

### 不做

- 不修改 scripts/agents 代码、schema 或 README。
- 不改动「闸门与信任」的信任模型表述（trusted-services 属命令层细节，保留在 README）。
- 不改其它 agent-rules 扩展文件。

## Given / When / Then

- Given autonomy.md 第 4 条未提及推送后候选核验 / When 按本任务同步 / Then 该条完整描述"本地集成 → 推送 main:dev → CI → 操作者证明 → candidate-verify"回路，且与 scripts/agents/README 的推送后候选核验节一致；`bun run check`（含 agent-guide 守卫）通过。

## 测试与验证

- 契约绑定 `scripts/agents/integrate.test.mjs`（覆盖 candidate-verify 绑定行为，操作者在运行契约中选择）。
- `bun run check`（agent-guide 守卫校验本扩展的链接与长度约束）。
- `bun run test:impact -- docs/dev/agent-rules/autonomy.md`。

## 交付记录

- 待实现时填写。
