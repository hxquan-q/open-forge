---
id: BUG-0064
type: bug
status: verifying
priority: P1
owner: desktop packaging
source: CI desktop-packaged workflow failures (36901450713 / 37001967274 / 37054315647 / 37055033329)
related_requirement: [REQ-0004]
related_plan: [PLAN-0014]
related_tasks: [TASK-0180]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# desktop-packaged 合同 job 缺依赖安装导致 cleanlist 必红

## 用户流程与实际行为

Given：push 触发 desktop-packaged workflow；When：`contract` job（ubuntu）执行 `node --test … staged-deps-cleanlist.node-test.mjs`；Then：「已安装的真实依赖在三个目标平台上都不触碰运行时入口」与「异平台专属的 required 依赖在构建主机缺席时不误报」两例失败，报 `declared external dependency is not installed: electron-updater / ws / ssh2 / uiohook-napi / @lydell/node-pty / @silvia-odwyer/photon-node / builder-util-runtime`。

## 环境与证据

- 该 job 步骤只有 checkout → `verify-packaging-contract.mjs`（✓）→ `node --test`（✗），**没有 Install dependencies 步骤**；staged-deps-cleanlist 按设计解析真实已装 node_modules（`resolveInstalledPackageRoot` → `require.resolve(dep, { paths: [desktopRoot] })`），冷检出上必然解析失败。
- 本机（完整 node_modules）同命令 `fail 0` 全绿——纯环境缺步骤，不是清洗逻辑回归。
- 历史触发该 workflow 的推送连续红（36901450713 35m28s、37001967274 15s、37054315647 16s、37055033329 53s 的合同 job 均含此失败）。
- 附注：2026-09-28/29 的多次 4–6s「秒失败」是 **GitHub 账户 billing 拒绝启动 job**（"recent account payments have failed or your spending limit needs to be increased"），与仓库无关，需用户在账户侧确认。

## 根因与置信度

`22efdca00`（打包清洗合同）把依赖真实安装的用例加入 `node --test` 清单，但 `contract` job 一直未配套依赖安装步骤；billing 拒启期掩盖了这一点。源码级因果置信度高。

## 回归与修复

归入 [TASK-0180](../tasks/TASK-0180-desktop-packaged-contract-install.md)：为 `contract` job 复用 `.github/actions/install-bun-dependencies` 组合步骤；CI 合同 job 复跑绿为修复证据。macOS `scripts/worktree/git.test.mjs` 一例失败（37053825133）在后续运行未复现，暂记偶发观察项，不并入本 Bug。
