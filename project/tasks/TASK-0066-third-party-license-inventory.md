---
id: TASK-0066
type: task
status: done
priority: P0
owner: release/compliance
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0008
execution: serial
branch: forge/dev
worktree: unassigned
read_paths: [apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, NOTICE, LICENSE]
write_paths: [project/verification/, NOTICE]
exclusive_paths: [project/verification/]
depends_on: []
conflicts_with: [TASK-0058]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 发行物第三方组件许可证清单审计

## 目标

按 ISSUE-0008 决策，对照 `prepare-pack.js` 实际打进 Desktop 发行物的 sidecar、模型、运行时与依赖，生成完整的第三方组件许可证清单草案（含每项来源、许可证、对应 NOTICE/归属文本），交用户终审批准；确认清单与现有 `NOTICE` 一致或提出修订。

## 范围

### 做

- 枚举打包脚本实际纳入发行物的第三方组件（二进制 sidecar、模型权重、bubblewrap、Node 运行时、bundled 依赖等）。
- 每项标注许可证与归属，交叉核对现有 `NOTICE` 条目是否覆盖、是否与实际打包内容一致。
- 产出清单草案至 `project/verification/`，标注「待用户终审」。

### 不做

- 不替用户批准清单；批准记录由用户确认后写入本 Task 交付记录。
- 不修改第三方组件本身的许可证文本。
- 不处理源码文件的 §4(b) 声明（属 TASK-0058）。

## Given / When / Then

- Given：首发 Preview 打包路径确定；When：对照 staging 布局生成清单；Then：每个随发行物分发的第三方组件均有许可证与归属条目，`NOTICE` 覆盖缺口被显式列出。

## 测试与验证

- 清单与 `desktop-packaging-layout.mjs`/`prepare-pack.js` 的文件集合交叉比对；`NOTICE` 条目逐项对应检查。

## 交付记录

- 实际修改：新增 `project/verification/VERIFY-0005-desktop-third-party-license-inventory.md`（清单草案）。
- 实际运行：对照 `prepare-pack.js` extraResources/staged 依赖、`fetch-vendor-runtimes.mjs`、`fetch-speech-models.mjs` 的 `model-manifest.json` 逐项枚举；许可证经 `package.json`/`npm view` 核实。
- 清单结论：7 项独立分发的第三方二进制/模型中 5 项已在 NOTICE；**Sherpa-ONNX 模型与 sherpa-onnx-win-x64 原生库两项缺失**，已在草案中给出待批准的 NOTICE 增补文本；npm 依赖组按现行「随包 LICENSE + 兜底段」粒度列出。
- 终审批准（VERIFY-0005 approved 2026-09-23 by 用户）：
  - (1) Sherpa-ONNX NOTICE 段批准，按终审修订稿入库（模型+原生库同段、注明 Windows+语音输入条件分发）；
  - (2) B 组接受随包 LICENSE + NOTICE 兜底段，不逐项列名；
  - (3) 无外部法务审核，内部 release/compliance 终审为首发合规生效依据。
- 实际落地：`NOTICE` 增补 Sherpa-ONNX 节（终审修订稿原文）；VERIFY-0005 转 approved 并写入终审结论（含版本钉死说明与非阻塞确认项）。
- 未运行及原因：无真实打包验证（未构建安装包）；NOTICE 增补按终审稿执行。
- 剩余风险：`electron-liquid-glass` 为 macOS 原生依赖（MIT，经 npm view 核实），本机 Windows 未安装、未读包内 LICENSE 原文；脚本升级 Node/Python/模型版本时须同步 NOTICE 与 VERIFY-0005。
