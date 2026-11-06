---
id: TASK-0448
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3179282c470bdb2ccab8d9bdbfb7ff836b5eb66a
read_paths:
  - project/research/RESEARCH-0044-desktop-startup-resource-audit.md
  - project/research/RESEARCH-0049-desktop-host-and-controller-refactor-references.md
  - apps/desktop/src/main
  - scripts/quality
write_paths:
  - scripts/perf
  - project/verification
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 分进程资源基线测量脚本与基线记录（PLAN-0029 Phase 0.2）

## 目标

补齐 RESEARCH-0044 指出的分进程基线缺口，为 PLAN-0029 后续每个阶段（Host 出进程、原生 sidecar 替换、Tauri 决策门）提供可复算的对照数据。

## 范围

### 并发评估

- 结论：支持；与 TASK-0449/0450 无共享写域。
- 执行方式：serial（主工作区）
- 前置依赖：无

### 做

- 可重复运行的测量脚本，输出 JSON：分进程（main/renderer/GPU/utility）启动耗时、空闲内存、N 个会话下的内存、主进程事件循环延迟 p50/p95。
- 大仓扫描与搜索耗时 p95（固定样本仓库或本仓），供 PLAN-0029 Phase 5 Rust 决策使用。
- 一份 `project/verification/VERIFY-xxxx` 基线记录：机器、版本、提交、命令和数值。

### 不做

- 不做任何性能优化；不修改 Desktop 运行时代码（如需埋点，另拆 Task）。
- 不把单机单次数值写成承诺指标。

## Given / When / Then

- Given：已构建的 Desktop（dev 或 packaged，记录形态）与固定样本仓库。
- When：运行测量脚本 N 次（≥3）。
- Then：产出结构化 JSON 与汇总，同条件重复运行波动在记录范围内；VERIFY 记录可被后续阶段直接复跑对照。

## 必须保持

- 不读取或输出用户真实状态目录与凭证；使用隔离的测试数据目录。
- 启动 Desktop 用于测量属于 UI/真实运行验证，实施前须取得当前任务授权。

## 测试与验证

- 定向测试：脚本的解析与汇总逻辑单元测试（走仓库 Node runner）。
- 质量检查：`bun run check:quick -- <file...>`，完成时 `bun run check`。

## 验收分层

- 工程验证：待执行
- 技术评审：未执行
- 集成：pending
- 人工功能验收：不适用（内部度量工具）
- 发布：未授权
