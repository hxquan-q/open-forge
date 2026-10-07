---
id: TASK-0180
type: task
status: done
priority: P1
owner: desktop packaging
source: BUG-0064
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0174]
related_issues: []
related_bugs: [BUG-0064]
execution: serial
branch: main
worktree: unassigned（2026-10-03 主检出串行实施）
base_commit: 497449f16
read_paths: [.github/workflows/desktop-packaged.yml, .github/actions/install-bun-dependencies/action.yml, apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs]
write_paths: [.github/workflows/desktop-packaged.yml, project/tasks/TASK-0180-desktop-packaged-contract-install.md, project/bugs/BUG-0064-desktop-packaged-contract-missing-install.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 为 desktop-packaged 合同 job 补依赖安装

## 目标与方案

BUG-0064：`contract` job 运行解析真实已装依赖的 staged-deps-cleanlist 用例，但从未安装依赖，CI 上必然红。在 checkout 后复用现有组合步骤 `.github/actions/install-bun-dependencies`（带下载缓存与有界重试），不改用例与清单。

## 不做项

不让用例在缺安装时静默跳过（违背「前置缺失显式报告」）；不动其它 job 的安装路径；不修 macOS worktree 偶发（未复现，观察项）。

## 验证

- 本地 `node --test apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs` 全绿（对照证据已有）。
- 推送后 desktop-packaged 的 `contract` job 复跑绿；billing 拒启期（9/28–29）属账户侧，需用户自查。

## 交付记录（2026-10-03）

- 实现：`desktop-packaged.yml` 的 `contract` job 在 checkout 后新增 `Install dependencies`（复用 `.github/actions/install-bun-dependencies` 组合步骤：下载缓存 + 有界重试的冻结安装），用例与清单不变；billing 拒启（9/28–29）属账户侧，已向用户报告。
- 本地验证：`node --test apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs` 在完整安装环境 `fail 0`（既有对照）。CI 合同 job 复跑证据待推送后产生。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。
- CI 证据（2026-10-03）：desktop-packaged 37059120967 的 `Desktop packaging contract` job 通过；首版缺 Set up Bun 由 5e1d7df61 补齐。E2E job 的遗留红另立 BUG-0066/TASK-0183。
- CI 终验（2026-10-03）：desktop-packaged 37060686125 整 workflow 成功（合同 job 绿；文档推送未触发 E2E）。E2E 触发时的遗留红见 BUG-0066。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI 基础设施（workflow 与包内脚本），无用户可观察行为变化；既定验收标准（CI 复跑绿，记录在案：TASK-0179 见 quality 37060686088，TASK-0180 见 desktop-packaged 37060686125）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
