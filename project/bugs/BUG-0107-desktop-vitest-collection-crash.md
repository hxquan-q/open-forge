---
id: BUG-0107
type: bug
status: verifying
priority: P2
owner: Desktop 测试环境
requirement:
plan:
source: TASK-0249 影响面复跑（2026-10-14）发现的 desktop 收集期失败
related_requirement: []
related_plan: []
related_tasks: [TASK-0325]
related_issues: []
created: 2026-10-14
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 四个 desktop 测试文件在 vitest 下收集期崩溃（0 用例执行）

## 用户流程

- Given：开发者在 `apps/desktop` 包内运行完整测试套件。
- When：套件加载 `src/main/file-protocol.test.ts`、`src/main/ipc/browser-view.test.ts`、`src/main/conversations/desktop-conversation-service.test.ts`、`src/main/app-debug/conversation/cli-runtime-canary.test.ts`。
- Then：四个文件在收集阶段直接失败（`0 test`），其中的用例一条都不执行。

## 实际行为

```
TypeError: The "path" argument must be of type string. Received undefined
 ❯ src/main/window-manager.ts:25:21
     25|  packagedDirectory: join(process.resourcesPath, "build"),
```

导入链分别经 `src/main/quickpanel-window.ts:9`、`src/main/ipc/browser-view.ts:21`、`src/main/notifications/notification-service.ts:7` 抵达 `window-manager.ts`。

## 期望行为

这些文件应在测试进程里正常收集并执行用例（`process.resourcesPath` 由测试环境提供或由代码在非打包环境降级取值）。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：仓库 `main`（HEAD `9801e62fc`）、Windows 11、Bun + 仓库统一 vitest runner（`apps/desktop` 包内）。
- 失败测试/CI 用例与命令（若适用）：`apps/desktop` 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/main/app-debug/conversation/cli-runtime-canary.test.ts`（其余三个同型）。
- 基线对照或重跑结果：把 TASK-0249 的两处改动（`resource-runtime.ts` 的品牌注入 import 与返回值）临时回退后重跑，同一文件以完全相同的栈失败 ⇒ 与本轮品牌改动无关，属存量红。整套全量：`Test Files 7 failed | 921 passed`，其中四个为收集期失败。

## 最小复现

1. 在 `apps/desktop` 包内运行上述任一文件。
2. 观察收集期 `TypeError`，用例数显示 `0 test`。

## 影响

四个文件（含会话服务、内置浏览器视图、CLI 运行时 canary 与文件协议）在本地与统一 runner 下不提供任何覆盖；相关改动的回归证据只能靠其他层间接获得。真实 Electron 主进程下 `process.resourcesPath` 有值，打包产物不受影响。

## 根因证据

`src/main/window-manager.ts:25` 在模块加载期执行 `join(process.resourcesPath, "build")`；测试进程不是 Electron 主进程，Node 的 `process.resourcesPath` 为 `undefined`，而 `src/test/electron-stub.ts` 未提供该字段（`grep resourcesPath apps/desktop/src/test/electron-stub.ts` 无命中）。任一测试文件只要间接 import 到 `window-manager`，就会在收集阶段抛出。

## 回归测试

修后四个文件应能收集并执行；建议在测试环境补齐 `process.resourcesPath`（或让 `window-manager` 在非打包环境降级）后，以「四个文件收集成功且用例数 > 0」为回归判据。

## 修复与验证

- 修复：TASK-0325 在非打包分支延迟计算 resourcesPath；相邻图标解析合同允许 dev 不提供暂存路径，打包态缺少路径明确拒绝。未修改 Electron 桩来掩盖实际接线。
- 测试：新实际 window-manager 导入回归在旧实现精确复现 undefined 路径错误；修复后含原四个失败文件共 6 文件 / 29 例通过，品牌与打包路径断言保留。日志：系统临时目录 `open-forge-task-0325-desktop-baseline-20261019.log`。
- 检查：TASK-0325 已集成 main `80ad98655`；组合 test:changed 的 Desktop 973 文件通过 / 4 跳过、5278 例通过 / 17 跳过，原四个收集期失败文件均实际执行。最终合并前完整 check exit 0；未运行真实 Desktop/UI。
- 未运行及原因：真实用户 Desktop 与 UI 验证未获本任务授权；该问题属于非打包模块求值，Node 实际入口回归可验证。
