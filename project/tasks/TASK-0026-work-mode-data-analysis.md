---
id: TASK-0026
type: task
status: verifying
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024, TASK-0028]
conflicts_with: [TASK-0018, TASK-0025]
integration_status: integrated
created: 2026-09-22
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# Work 数据分析最小纵向切片

## 目标

在 Work Profile 上交付一条可审查的数据分析流程：导入 CSV、Excel 或 JSON，完成一种明确的清洗/统计请求，预览结果并生成可追溯的 `dataset`/`analysis` Artifact。

## 范围

### 并发评估

- 结论：条件支持；与 TASK-0018/TASK-0025 共用 Work Panel 前先冻结 descriptor/Activity 合同。
- 执行方式：serial（默认）；拆分 Worker 前限定各自的分析器、解析器与 UI 路径。
- 前置依赖：TASK-0015、TASK-0016、TASK-0017、TASK-0024、TASK-0028。
- 集成负责人：coordinator。

### 做

- 校验导入格式、列类型和有问题的行；保留原始输入引用，不静默覆盖；
- 结果先预览，Review 通过后导出清洗数据与带指标/图表引用的分析 Artifact；
- 对缺列、非法值、超限数据和取消明确报告影响行/已完成步骤。

### 不做

- 自研通用图表引擎（复用现有预览能力）；
- 静默修复无法判定的数据、覆盖来源文件或执行云端分析；
- 把所有统计/可视化算法打包成一个无限制的分析器 Tool。

## Given / When / Then

- Given：用户在 Work 数据分析入口导入一个 CSV、Excel 或 JSON 文件；
- When：请求按明确规则清洗数据、计算一项指标并预览结果；
- Then：无效输入和被排除记录可见，原文件未被覆盖，Review 后产出 dataset/analysis Artifact，重开会话可检查输入来源与结果版本。

## 必须保持

- `dataset`/`analysis` descriptor 引用真实文件和输入来源；
- 数据写入与外部导出经过 TASK-0016 的 Tool Policy；
- 用户拒绝/取消不会发生未预览的覆盖写入。

## 测试与验证

- 定向：CSV/Excel/JSON 解析边界、行级校验、取消/部分失败与 Artifact 版本合同测试；
- 用户流程：导入 → 请求分析 → 查看校验/预览 → Review → 导出 → 重开会话查看来源；
- 质量检查：`bun run check:quick`、相关数据/Runtime 包影响测试和 Desktop 组件测试。

## 阻塞

- TASK-0028 已 done。本 Task 与 TASK-0025 共享 Work Panel 写路径并互相冲突，当前必须串行，由 coordinator 选定下一项。数据写入授权不由 WorkspaceMode 控制。

## 交付记录

- 实际修改：
  - `packages/runtime-node/src/dataset/`：数据集剖析实现（合同 `dataset-contracts.ts`、RFC4180 CSV/TSV 解析 `csv-parse.ts`、纯函数表格画像 `tabular.ts`、IO 编排 `dataset-profile.ts`）；支持 .csv/.tsv/.json/.jsonl/.ndjson/.xlsx/.xlsm，按行画像列类型/空值/非法值/参差行/空行，超限截断，`AbortSignal` 取消；只读不写源文件、不联网。xlsx 依赖（SheetJS 0.20.3 CDN tgz）登记进 runtime-node。
  - `packages/coding-agent/src/features/dataset/`：`CodingAgentDatasetOperations` 宿主注入 Port + `dataset_profile` 工具（绝对路径校验、expectedColumns 缺列上报、指纹 uri/mtime 输出供 `vetta-research-sources` 清单照抄）；housekeeping 登记内置名/READ_ONLY 风险档/model order 1_960/Work Profile 默认工具。
  - `packages/coding-agent/src/composition/`：`datasetProfile` 可选注入，缺省不注册该工具；经 runtime-tool-surface 条件注册。
  - `apps/desktop/src/main/agent-runtime/composition.ts`：注入 `profileDatasetFile`。
  - `WorkDocumentSections.tsx`：抽出共享 `useStartTaskWithSources`（建任务+全局消息通道）；新增 Dataset 节（selectFiles 选数据文件 + 分析目标）；产物来源复查白名单扩为 `research-evidence`/`dataset`/`analysis`（document 不触发）。
  - i18n：`workspace.work.dataset.*` zh/en 四键。
- 实际运行：
  - `runtime-node` dataset 合同测试 12 用例（CSV/JSON/XLSX 解析边界、行级校验、类型推断、问题行、缺列、大小上限、取消信号）全绿；
  - `coding-agent` dataset_profile 工具测试（绝对路径拒绝、缺省不注册、错误映射、画像输出含指纹、issues 截断）全绿；
  - Desktop `WorkDocumentSections` 19 用例（数据集选文件→发任务→消息走同通道、dataset/analysis 产物触发来源复查、document 不触发）全绿；
  - `bun run check:quick`、`bun run check`（lint/types/guards 全量）绿。
- 未运行及原因：真实 Desktop 端到端（选真实 xlsx → 分析 → 产物复查）需实机冒烟，登记 VERIFY-0012。
- 剩余风险：xlsx 懒加载在 Electron 打包产物中的解析需实机确认；`dataset`/`analysis` 产物由模型按 prompt 合同写 manifest，manifest 缺失时复查返回 no-manifest（不阻断）；Excel 只取第一工作表。

### 人工验收实测（2026-10-08，VERIFY-0017 组四；保持 verifying 待裁定）

方法：复跑本任务交付记录点名的三组套件（主检出 HEAD `18a7bf7b4`）。合同的用户流程（导入 CSV/Excel/JSON → 请求分析 → 看校验/预览 → Review → 重开会话查来源）需要一次真实模型回合，本轮未驱动。

| 合同条款 | 本次读数 |
|---|---|
| CSV/TSV/JSON/JSONL/NDJSON/XLSX 解析边界、行级校验、类型推断、问题行、缺列、大小上限、取消信号 | `packages/runtime-node/src/dataset/dataset-profile.test.ts` **1 文件 / 7 例通过**（**交付记录写「12 用例」，本轮该文件实测 7 例**——只否证当下读数，不追认当时是否有别的计数口径） |
| `dataset_profile` 工具（绝对路径校验、缺省不注册、错误映射、画像输出含指纹、issues 截断） | `packages/coding-agent/test/features/dataset-profile-tool.test.ts` **1 文件 / 5 例通过** |
| 数据集选文件 → 发任务 → 消息走同通道；`dataset`/`analysis` 产物触发来源复查；`document` 不触发 | `WorkDocumentSections.test.tsx` **1 文件 / 19 例通过**（与交付记录「19 用例」一致） |
| **合计** | **3 文件 / 31 例通过，0 失败** |

- **未覆盖**：合同里需要模型参与的部分——「请求按明确规则清洗数据、计算一项指标并预览结果」「Review 后产出 dataset/analysis Artifact」「重开会话可检查输入来源与结果版本」。解析/校验/画像/复查这些**确定性**环节已单测级覆盖，但「模型按 prompt 合同写 manifest 并给出指标」这条链本轮未驱动，原因同上（无可用授权模型，ISSUE-0031）。
- 交付记录自认的两条剩余风险本轮**未复诊**：① xlsx 懒加载在 Electron 打包产物中的解析需实机确认；② `dataset`/`analysis` 产物由模型按 prompt 合同写 manifest，manifest 缺失时复查返回 `no-manifest`。
- **关闭建议**：确定性软件面测试级成立；模型参与面属**客观阻塞**。建议与 TASK-0025/0074/0155 一并裁定。请用户裁定。
