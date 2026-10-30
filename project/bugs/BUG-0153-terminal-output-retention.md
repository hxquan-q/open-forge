---
id: BUG-0153
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: TASK-0407 / code-mode-audit-2026-10-30 §六 M01
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0409]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 终端输出摘要的 2048 字符截断不约束实际保留内存

## 用户流程

- Given：AI 执行 shell 命令产生大输出（或任一工具 end 携带大文本块），When：事件泵写入终端 feed 的输出摘要（≤2048 字符），Then：只应保留摘要量级的内存。

## 实际行为

`readContentText` 把完整文本块整串放进 parts，`join().slice(0, 2048)` 产生的 SlicedString 把母字符串整个钉在堆上。独立 Node/V8 探针（显式 GC）：3×16MiB 输入只保留 6144 字符摘要，堆增约 48.01MiB；100×50KiB 输入保留 204800 字符，堆增约 4.91MiB；复制短字符串对照仅 0.01MiB。另外两个事件泵对每个 tool.end 无条件提取摘要，非 shell 工具（如 read 整文件）也白付一次拼接。

## 环境与失败证据

- 基线 `dea8d55bf`（切片 1 后），Node --expose-gc 探针 `code-mode-audit-evidence/terminal-output-memory-probe.mts` 本轮复跑：production-output-retention deltaMiB=48（3×16MiB）、4.91（100×50KiB）；copied-small-summary-control deltaMiB=0.01。
- 根因：V8 SlicedString 保留母串（`ai-terminal-atoms.ts:58-77`）；泵侧 `useSessionEventController.ts:510`、`useTeamChatModel.ts:389-392` 无条件调用提取。

## 最小复现

1. 运行探针（见上），对比复制对照与生产函数的堆增量。

## 影响

Feed 单条摘要 2KB 的合同名义下，每条可能实际钉住最高至整个输出文本；与 M02（OOM 根因未闭环）相关但互不证明。属确定性的额外保留，不据此宣称此前 OOM 已定位。

## 根因证据

探针三组对照 + 释放摘要后堆回落（9.3MiB 级），支持「摘要引用保留母串」判断；报告 §六 M01 与 §11.1 复核一致。

## 回归测试

- 行为等价（单测）：多块预算边界、超大单块内容正确、预算后块不读取、输出与旧实现逐字符一致；惰性提取（未知 key 不调用提取器）。
- 内存证据（探针，工作区）：修复后 production 路径 deltaMiB 回到对照量级（≤0.1MiB）。

## 修复与验证

- 修复：`readContentText` 逐块计入剩余预算（含 join 分隔符），单块超预算经 `copyIndependentPrefix` 逐字符复制独立前缀，不再产生保留母串的 SlicedString；`markAiTerminalEntryDone` 支持惰性提取回调，两处泵（`useSessionEventController.ts`、`useTeamChatModel.ts`）改为命中 running 条目才执行摘要拼接。100 条/2048 字符合同与输出文本逐字符不变。
- 测试：定向 `ai-terminal-atoms.test.ts` 惰性提取红 1→绿，12/12 通过（含多块边界、单块超预算内容、预算后跳过的等价用例）。
- 检查：`check:quick` 通过（首轮 Biome 格式 2 文件已按仓库 `bun run fix` 入口修正后复检）。探针修复后：3×16MiB deltaMiB 48→0.01（对照量级）、100×50KiB 4.91→0.22。
- 未运行及原因：完整 `bun run check` 留批次收尾；真实进程堆快照不在本片（探针为独立 Node/V8 显式 GC 对照，已证明保留差异）。
