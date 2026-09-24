---
id: BUG-0024
type: bug
status: done
priority: P0
owner: apps/desktop
source: 用户报告「页面空白」+ 本地复现 `bun run --cwd apps/desktop build:renderer` 失败
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: [TASK-0116, TASK-0118]
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# Renderer 引入 coding-agent Node 入口导致空白页与 renderer 构建失败

## 用户操作流程

1. 用 `bun run --cwd apps/desktop dev`（隔离档同）启动开发版 Desktop；
2. 打开主窗口。

## 实际行为与期望行为

- 实际：窗口**整页空白**（Renderer 初始化在第一帧前就抛错）；同时
  `bun run --cwd apps/desktop build:renderer` 直接失败，打包/发布链路（`build:pack` → `dist:*`）连带不可用。
- 期望：窗口正常渲染工作台；renderer 构建通过。

## 最小复现

```powershell
bun run --cwd apps/desktop build:renderer
# error during build:
# ../../packages/coding-agent/dist/features/scheduled-tasks/automation-package/canonical.js (2:9):
# "createHash" is not exported by "__vite-browser-external", imported by ".../canonical.js"
```

dev 档窗口右上角报同一根因：

```
Failed to initialize renderer Error: Module "node:crypto" has been externalized for browser
compatibility. Cannot access "node:crypto.createHash" in client code.
```

## 版本、平台与相关环境

- 提交区间：`a8f8bffaf`（TASK-0116~0118 自动化线）引入，`c16e34d99`/`6452318ee` 仍在同一链路。
- 平台无关（dev 与打包都受影响，因为 renderer 构建产物里会留下 externalized 桩/直接构建失败）。

## 影响与严重度

开发版不可用（空白页），且**任何 renderer 构建都失败**——包含发布流水线。P0。

## 根因证据与置信度

- 证据（高置信度）：`apps/desktop/src/renderer/domains/scheduler/hooks/useSchedulerPermissionTiersModel.ts:4`
  从 `@vetta/coding-agent/runtime` 取两个纯符号；该入口 re-export
  `features/scheduled-tasks/index.js`，其 barrel 又 re-export `automation-package/index.js` →
  `canonical.js` → `import { createHash } from "node:crypto"`。浏览器解析该模块即抛错。
- 证据（高置信度）：Vite 构建日志的 importer 链与 `Select-String` 得到的
  `dist 里 public-api/runtime.js → features/scheduled-tasks/index.js → automation-package/index.js`
  完全一致。
- 对照：`dist/public-api/{function-extensions,session-extensions}.js` 里 `node:` 引用数为 0，
  即 renderer 现用的入口本身是浏览器安全的。

## 修复

- `packages/coding-agent/src/public-api/function-extensions.ts` 从 `features/scheduled-tasks/
  unattended-permission-tiers.js`（纯模块：只用常量与纯函数、仅 `import type`）直接导出
  `UNATTENDED_PERMISSION_TIER_KEYS`、`enableAllUnattendedPermissionTiers` 与两个类型，并写明
  「不要走 barrel，会牵出 node:crypto」的原因。
- `useSchedulerPermissionTiersModel.ts` 改从 `@vetta/coding-agent/function-extensions` 取这两个符号。
- 未新增 package 导出条目/未改基线，避免触碰 `check-coding-agent-architecture` 的 manifest exports 计数。
- 提交：`72115109a`。（`a8f8bffaf`/`c16e34d99`/`6452318ee` 是引入缺陷的提交，不是修复。）

## 验证与剩余风险

- 验证：`bun run --cwd apps/desktop build:renderer` → `✓ built in 42.97s`（修复前 exit 1）；
  `bun run --cwd apps/desktop test .../useSchedulerPermissionTiersModel.test.tsx` → 2/2 通过；
  重启隔离 dev 实例后 `verify:ui:status:dev` 报 `running/ready/reachable`，`pw:dev -- snapshot`
  能读到真实工作台 DOM（标题、搜索、侧栏导航），renderer 日志不再出现 externalized 报错。
- 剩余风险：renderer 仍能通过 `@vetta/coding-agent/runtime` 这类 Node 入口误引其它模块——
  目前只靠人工审查与构建报错兜底，尚无机械守卫；后续可加「renderer 构建不得出现
  `externalized for browser compatibility` 的 node:* 警告」门禁（建议并入 packaged smoke）。
- 未验证：打包产物（asar）内的 renderer 实测启动；用 `build:renderer` 已能证明产物可生成，
  真实启动由 CI packaged smoke 覆盖。
