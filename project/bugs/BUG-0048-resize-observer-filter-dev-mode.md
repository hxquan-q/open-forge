---
id: BUG-0048
type: bug
status: verifying
priority: P3
owner: desktop
requirement:
plan:
source: dev 日志巡检（~/.openforge-dev render log 2026-09-28）
related_requirement: []
related_plan: []
related_tasks: [TASK-0132]
related_issues: []
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# ResizeObserver 噪音过滤器在 dev 下失效，渲染器错误日志被淹没

## 用户流程

- Given：dev 模式运行的 Desktop，用户在分屏布局间拖动或 resize 窗口。
- When：Chromium 把分屏连续 resize 期间延迟投递的 ResizeObserver 回调以内部 console error 上报。
- Then：该已知无害诊断应被过滤器丢弃；实际 dev 下全部落盘，单日 render 日志 349 行中 214 条是 `ResizeObserver loop completed with undelivered notifications.`。

## 实际行为

过滤器 `isChromiumResizeObserverDiagnostic` 要求 `sourceId === ""`，但 dev 下 Chromium 上报的 sourceId 是页面 URL（如 `http://127.0.0.1:3020/#/agent-teams/...`），条件不满足，噪音全部写入 render 日志。

## 期望行为

dev 与 packaged 下该诊断都被稳定过滤；真实渲染器 error 不被噪音稀释。

## 环境与失败证据

- Open Forge dev（main @ `aaf85f02e`）/ Windows 11。
- `~/.openforge-dev/desktop-app/logs/render/2026-09-28.log`：214/349 行为该噪音，sourceId 形如 `http://127.0.0.1:3020/#/agent-teams/<uuid>/sessions/<uuid>`、行号恒为 0。

## 最小复现

1. dev 启动 Desktop，打开含分屏的页面（如 agent-teams 会话页）。
2. 拖动分屏分隔条或调整窗口大小。
3. render 日志持续追加 ResizeObserver error 行。

## 影响

仅日志信噪比问题，无功能影响；但 render 日志中真实错误（如今日的 browser-view attach 失败）被噪音包围，排查成本上升。

## 根因证据

[`window-manager.ts`](../../apps/desktop/src/main/window-manager.ts) `isChromiumResizeObserverDiagnostic` 的 `sourceId === ""` 假设只在 packaged 下成立；dev server URL 使 Chromium 填了 sourceId。消息文本与行号 0 在两个形态下都稳定。

## 回归测试

旧实现下：sourceId 为 dev 页面 URL、行号 0、消息匹配时过滤器返回 false；修复后返回 true 且不落盘。

## 修复与验证

- 修复：见 [TASK-0132](../tasks/TASK-0132-resize-observer-filter-dev-sourceid.md)（集成提交 `94d07c6df`，merge `02c13a461`）。判定下沉到 `logger/renderer-console-policy.ts`，条件收窄为「消息精确匹配 + 行号 0」，sourceId 不参与判定。
- 测试：`renderer-console-policy.test.ts` 新增 3 例——任意 sourceId 形态命中、同消息行号非 0 不误杀、其他消息不误杀。
- 检查：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/logger/renderer-console-policy.test.ts`（7 passed）；批次 `test:changed --base origin/dev` 与 `check` 由 Coordinator 统一执行。
- 未运行及原因：dev 下拖分屏看 render 日志的人工冒烟未执行，保持 verifying。
