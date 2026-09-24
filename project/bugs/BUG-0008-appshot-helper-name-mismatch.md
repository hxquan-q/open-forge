---
id: BUG-0008
type: bug
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0003
plan: PLAN-0003
source: code-inspection（rebrand 阶段 B 改名遗漏）
related_issue: ISSUE-0001
related_tasks: [TASK-0076]
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# appshot helper 解析名与构建产物名不一致（macOS 打包态失效）

## 用户流程

- Given：macOS 打包版 Open Forge；When：用户触发应用快照（appshot）或进入 Computer Use 授权引导；Then：主进程解析随包携带的 helper `.app` 并启动它。

## 实际行为

`scripts/build-appshot-helper.js` 已在 rebrand 阶段 B 改为产出 `Open Forge Computer Use.app`（`APP_NAME = "Open Forge Computer Use"`，`BUNDLE_ID = "io.github.hxquanq.openforge.computer-use"`，`prepare-pack.js` 经 extraResources 带入 `Resources/appshot/`），但 `src/main/appshot/helper-resolver.ts` 仍按旧名解析：

- `APP_BUNDLE_NAME = "Vetta Computer Use.app"`
- `EXECUTABLE_NAME = "Vetta Computer Use"`

`resolveAppshotHelperBinary()` 在打包态查找 `Resources/appshot/Vetta Computer Use.app/Contents/MacOS/Vetta Computer Use`，路径不存在即抛 `appshot helper binary not found`；dev 态同样找不到（build 脚本输出到 `resources/appshot/bin/Open Forge Computer Use.app`）。

## 期望行为

resolver 与构建产物使用同一品牌事实源，两端名称永远一致。

## 最小复现

代码级证据（Windows host 无法运行 macOS 打包链路）：

1. `build-appshot-helper.js:25` `APP_NAME = "Open Forge Computer Use"` → 产物 `Open Forge Computer Use.app`；
2. `helper-resolver.ts:6-7` 仍硬编码 `Vetta Computer Use.app` / `Vetta Computer Use`；
3. `existsSync(fullPath)` 必为 false → 抛出 not found。

## 影响与严重度

- macOS 打包版 appshot/Computer Use 功能整体不可用（P1，平台限定 + lite 构建默认功能）。
- 不影响 Windows/Linux（appshot 仅 macOS）。

## 根因

rebrand 阶段 B 修改了构建脚本产物名与 bundle id，遗漏主进程 resolver 常量；两端各持一份字面量，缺少共享事实源与一致性校验。置信度：高（源码直接证据）。

## 回归测试（旧实现会失败）

`desktop-brand.test.ts` 新增合同断言：`helper-resolver.ts` 与 `build-appshot-helper.js` 必须引用 `desktop-brand.json` 的 `appshotHelperName`/`appshotHelperBundleId`，且不再包含 `Vetta Computer Use` 字面量。旧实现下该断言失败。

## 修复与验证

- `desktop-brand.json` 新增 `appshotHelperName` / `appshotHelperBundleId`；`desktop-brand.ts` 导出。
- `build-appshot-helper.js` 改为 `require("../src/shared/desktop-brand.json")` 取值；`helper-resolver.ts` 从 `DESKTOP_BRAND` 派生 bundle/executable 名。
- 同步更新 `ipc/onboarding.ts`、`ipc/permissions.ts`、`onboarding-window.ts`、`shared/onboarding-ipc.ts` 中的过期注释。
- 验证：合同测试 + `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/shared/desktop-brand.test.ts`；macOS 实机拖拽授权未验证（本机为 Windows，记入剩余风险）。

## 剩余风险

- 真实 macOS 打包产物 + TCC 拖拽授权链路未在本机验证；`Open Forge Computer Use` 的权限提示文案由 i18n postprocessor 呈现，与新 bundle 名一致。

## 修复记录

- 2026-09-24：合同断言在 `desktop-brand.test.ts` 通过（8/8），双端改由 `desktop-brand.json` 单一事实源驱动，`Vetta Computer Use` 字面量已清零；旧实现下断言失败已验证。macOS 实机链路验证留待打包环境复核。

