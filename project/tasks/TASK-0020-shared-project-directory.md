---
id: TASK-0020
type: task
status: draft
priority: P2
owner: coding-agent/runtime-storage
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-storage]
write_paths: [packages/coding-agent, packages/runtime-storage]
exclusive_paths: []
depends_on: [TASK-0015]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# 共享项目目录约定（implementation-plan 阶段 5）

## 目标

固化可随 Git 共享的项目级约定：`.vetta/agents/`、`.vetta/skills/`、
`.vetta/task-templates/`、`.vetta/policies/`、`.vetta/artifacts/` 引用，
`.vetta-local/` 忽略规则，配置 Schema/版本与迁移器，Git 共享合同文档。

## 范围

### 并发评估

- 结论：条件支持（与阶段 1-4 无写路径重叠，可与 TASK-0017+ 并行，
  但依赖 Task/Artifact 合同已接线以定义 task-templates/artifacts 引用格式）
- 执行方式：serial 或并行（独立 worktree）
- 前置依赖：TASK-0015
- 集成负责人：coordinator

### 做

- `.vetta/` 子目录约定落地与装载顺序；
- `.vetta-local/` 默认忽略清单与 gitignore 引导；
- 配置 Schema + 版本号 + 迁移器；
- Git 共享合同文档（哪些目录入库、哪些本地）。

### 不做

- 远端同步/云端配置；
- 改动 `~/.openforge` 用户根的既有布局。

## Given / When / Then

- Given：团队把含 `.vetta/` 约定的仓库克隆到新机器；
- When：在 Open Forge 打开该项目；
- Then：agents/skills/task-templates/policies 按约定装载，`.vetta-local/` 内容不被共享，旧版目录可迁移。

## 必须保持

- 项目内 `.vetta/` 与 home 根 `~/.openforge` 边界不混（ISSUE-0001 决策）；
- 目录约定有版本号，缺省行为向后兼容；
- `.vettapkg` 生态路径不变。

## 测试与验证

- 定向：目录装载/迁移器/忽略规则单元测试；
- 用户流程：克隆含约定的仓库 → 打开即用；
- 质量检查：`bun run check:quick`、相关包测试。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
