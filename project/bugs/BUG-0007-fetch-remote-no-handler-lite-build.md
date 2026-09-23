---
id: BUG-0007
type: bug
status: done
priority: P2
owner: apps/desktop
source: main-process log monitoring; lite dev session
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Lite 构建下模型目录每 ~90s 调一次未注册的 `vetta:models:fetch-remote` IPC

## 用户流程

- Given：用户运行 lite 构建（默认源码检出产物，无 cloud 模块）。
- When：打开应用并保持模型目录 store 存活。
- Then：主进程日志每 ~90s 出现一次 `Error occurred in handler` / `No handler registered for 'vetta:models:fetch-remote'`，renderer 的定时刷新持续打到一个不存在的 handler。

## 实际行为

`model-catalog.ts` 的 `loadRemote` 无条件调用 `window.vetta.models.fetchRemote()`；lite 构建中 cloud 模块被常量折叠，`registerCloudAuthIpc` 里的 handler 从不注册，每次轮询都在主进程抛错并刷日志。

## 期望行为

lite 构建下模型目录只加载本地模型配置，不发起 remote fetch，也不产生远端刷新告警。

## 最小复现

`model-catalog.test.tsx` 的 lite 场景：在 `isCloudBuildEnabled() === false` 下加载 store —— 旧实现会调用 `window.vetta.models.fetchRemote`（mock 断言被调用），新实现断言该函数从未被调用且本地配置照常加载。

## 根因证据

- `vetta:models:fetch-remote` 只在 `startCloudMain()` 路径（`registerCloudAuthIpc`）注册；lite 构建不执行该路径。
- renderer 侧 `loadRemote` 没有构建形态门控，直接打 IPC。
- 置信度：高。日志报错节奏与 store 轮询周期一致，且 handler 注册点只存在于 cloud 入口。

## 修复与验证

- 修复：`model-catalog.ts` 的 `loadRemote` 入口加 `isCloudBuildEnabled()` 门控，lite 构建直接返回 `null`，本地模型配置路径不变。
- 测试：`bun scripts/quality/run-vitest.mjs --run`（desktop 包内）`src/renderer/shared/store/model-catalog.test.tsx` 6/6 通过，含新增 lite 用例「本地配置加载、remote fetch 零调用、无远端刷新告警」；`src/cloud-boundary.test.ts` 通过。
- 检查：`bun run check:quick` 通过。
- 未运行及原因：impact 相关测试批次中 30 个失败经基线对照确认为既有失败（无 `window.vetta.config` 的测试环境等），与本改动无关；真实 cloud 构建行为未变（门控仅拦截 lite 路径）。

## 剩余风险

- 若未来 lite 构建也提供本地 remote 目录源，需要把门控改成能力探测而非构建形态判断。

## 发布说明候选（待 Open Forge 首发版本切入后转入）

- **修复**：lite 构建不再每约 90 秒向未注册的模型目录远端接口发起 IPC，主进程日志中的周期性 `No handler registered` 报错消失。
