---
id: BUG-0132
type: bug
status: verifying
priority: P1
owner: apps/cli-host
requirement: REQ-0019
plan: PLAN-0019
source: TASK-0322 full test:changed
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0325]
related_issues: []
created: 2026-10-19
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 独立 CLI 编译仍从旧依赖所有者寻找 Photon

## 用户流程

Given 冻结安装后的干净 Task Worktree，When 构建并运行独立 CLI/Agent 制品，Then 编译应找到实际依赖所有者提供的 Photon JS/WASM 并通过离线制品流程。

## 实际行为与证据

`test/agent-print-mode.test.ts` 与 `test/installed-artifact-runtime.test.ts` 在编译阶段报 Could not resolve `packages/coding-agent/node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm` 及 `photon_rs.js`。日志：系统临时目录 `open-forge-task-0322-test-changed-v2-20261019.log`。

`apps/cli-host/scripts/compile-standalone-entry.mjs` 生成两处上述旧物理路径；Photon 当前由 packages/runtime-node/package.json 声明，coding-agent 已无该依赖（TASK-0244）。尚未改变实现。

## 期望与复现

冻结安装后执行 CLI 的 installed-artifact/print-mode 测试；制品使用真实声明依赖，不能依靠旧工作区残留 node_modules 或恢复错误依赖声明维持绿灯。

## 根因、回归与验证

候选根因是生成入口保留旧依赖路径；需在正确生成入口上建立失败回归，并运行实际编译/离线制品验证。现有测试只检查 HTML 注入字符串，没有覆盖生成 import 的可解析性。具体修复与结果随 TASK-0325 回填；未执行真实 Provider。

TASK-0325 已将两处生成 import 指向声明依赖的 runtime-node。新回归在旧路径实际文件读取时 ENOENT，修后生成入口/bootstrap 2 文件 / 3 例通过。真实独立制品复验 14 例全通过（95.85 秒），日志 `open-forge-task-0325-artifact-v2-20261019.log`；动态 Skill 的临时可信项目条件通过既有 TrustStore 补齐，产品安全逻辑未改。TASK-0325 已集成 main `80ad98655`；组合 test:changed 的 CLI 51 文件通过 / 1 跳过、238 例通过 / 14 跳过，独立制品 14/14 保持通过。最终合并前完整 check exit 0；未调用真实 Provider 或发布。
