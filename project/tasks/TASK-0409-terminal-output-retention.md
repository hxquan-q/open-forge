---
id: TASK-0409
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: BUG-0153（TASK-0407 报告 M01）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0407]
related_issues: []
related_bugs: [BUG-0153]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: dea8d55bf
read_paths:
  - apps/desktop/src/renderer/shared/store/ai-terminal-atoms.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
  - project/bugs/BUG-0153-terminal-output-retention.md
write_paths:
  - apps/desktop/src/renderer/shared/store/ai-terminal-atoms.ts
  - apps/desktop/src/renderer/shared/store/ai-terminal-atoms.test.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
  - project/tasks/TASK-0409-terminal-output-retention.md
  - project/tasks/README.md
  - project/bugs/BUG-0153-terminal-output-retention.md
  - project/bugs/README.md
  - project/plans/PLAN-0026-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0153-terminal-output-retention.md
exclusive_paths:
  - apps/desktop/src/renderer/shared/store/ai-terminal-atoms.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 修复终端输出摘要内存保留（BUG-0153）

## 目标

feed 单条摘要 ≤2048 字符的合同同时约束实际保留内存：单块超大输出不再把母串钉在堆上；非跟踪条目的 tool.end 不再无条件提取摘要。输出文本与现有行为逐字符一致。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0026 第 2 片，主检出串行。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`ai-terminal-atoms.ts` 为本 Task 独占；两个事件泵与后续 F06/§11.3 切片共享但串行，本片只改 tool.end 一行的调用形态。
- Branch：主检出 chenxvhua。
- Worktree：不拆。
- 集成负责人：当前 Coordinator。
- 集成顺序：PLAN-0026 第 2 片。

### 做

1. `readContentText`：逐块计入剩余预算（含 join 分隔符）；单块超预算时按字符复制出独立前缀，不产生保留母串的 SlicedString。
2. `markAiTerminalEntryDone` 接受惰性提取回调；两处泵把 `aiTerminalOutputFromResult(...)` 包进回调，未命中 running 条目时不提取。
3. 行为等价单测（多块边界/超大单块/预算后跳过/惰性提取）；工作区 V8 探针复跑取修复后对照。

### 不做

- 不改 feed 条数上限（100）与摘要长度（2048 字符）合同；
- 不做 tool.update 流式合并（F07 另议）；
- 不宣称修复 OOM（M02 未闭环）；
- 不把探针并入仓库测试发现范围。

## Given / When / Then

- Given 多块文本总量超预算，When 提取，Then 输出与旧实现整串 join 后截断逐字符一致。
- Given 单块 16MiB 文本，When 提取 2048 字符摘要，Then 摘要是独立字符串，探针显式 GC 后堆增量回到对照量级。
- Given tool.end 的 key 不在 running feed 中（非 shell 工具或已淘汰），When 事件到达，Then 不执行摘要提取。
- Given 命中 running 条目，When 事件到达，Then 照常写入输出并置 running=false。

## 必须保持

- feed push/mark 的幂等与超限淘汰行为；
- 输出摘要文本与现行实现完全一致（含 trim/slice 顺序）；
- 聊天流/审批/取消等事件语义不动。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/shared/store/ai-terminal-atoms.test.ts`。
- 泵影响面：`bun run test:impact -- <atoms 与两个泵文件>`。
- 内存证据：工作区探针 `node --expose-gc --experimental-strip-types .../terminal-output-memory-probe.mts` 修复后 deltaMiB ≤ 对照量级。
- `bun run check:quick`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：不适用（无用户可见行为变化，内存边界由探针证明）。
- 发布：未授权。

## 功能验收包

- 不适用（纯内部内存行为；发布说明在「改进」留内部条目）。

## 交付记录

- 实际修改：`ai-terminal-atoms.ts`（`readContentText` 预算含分隔符逐块累加、超预算块经 `copyIndependentPrefix` 逐字符复制独立前缀、`markAiTerminalEntryDone` 增惰性提取回调）；`useSessionEventController.ts` / `useTeamChatModel.ts` 两处 end 调用改惰性；`ai-terminal-atoms.test.ts` 增 5 用例（单块超预算内容、多块等价、预算后跳过、惰性提取红基线）；BUG-0153/本 Task/索引与 v0.1.4 fragment。
- 实际运行：定向 `ai-terminal-atoms.test.ts` 惰性提取红 1→绿，12/12；直接相关面（导入本片三文件的 8 个测试文件）72/72 通过；`test:impact` 选中面仅 `weknora-background-flow.test.tsx` AC-20 一例失败（该轮唯一失败；weknora 域与本片文件无导入关联，隔离复跑仍红，属本批范围外既有失败，待用户分诊）；探针修复后 3×16MiB deltaMiB 48→0.01、100×50KiB 4.91→0.22（对照量级）；`check:quick` 通过（首轮 Biome 格式差异经仓库 `bun run fix` 修正，仅触及本片 2 文件）。
- 未运行及原因：完整 `bun run check` 留 PLAN-0026 批次收尾统一执行；真实 Electron 进程堆快照不在本片（独立 Node/V8 显式 GC 探针已证明保留差异）。
- Worktree：未拆出（主检出串行）。
- 剩余风险：`copyIndependentPrefix` 对超大首块逐字符读 ≤2048 次，开销可忽略；weknora AC-20 失败为范围外发现，不在本片处理。
