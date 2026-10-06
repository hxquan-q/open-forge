---
id: TASK-0132
type: task
status: done
priority: P3
owner: desktop
requirement:
plan:
source: dev 日志巡检
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0048]
execution: parallel
branch: task/TASK-0132-resize-observer-filter-dev-sourceid
worktree: unassigned（已集成，待推送后清理）
base_commit: cdb15bb905f0eece45e870291a867065d29b0cac
read_paths: [apps/desktop/src/main/window-manager.ts]
write_paths: [apps/desktop/src/main/window-manager.ts, apps/desktop/src/main/logger/renderer-console-policy.ts, apps/desktop/src/main/logger/renderer-console-policy.test.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0132-resize-observer-filter-dev-sourceid.md, project/tasks/README.md, project/bugs/BUG-0048-resize-observer-filter-dev-mode.md, project/bugs/README.md]
exclusive_paths: [apps/desktop/src/main/window-manager.ts, apps/desktop/src/main/logger/renderer-console-policy.ts]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0130, TASK-0131]
integration_status: integrated
created: 2026-09-28
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# ResizeObserver 噪音过滤器放宽 sourceId 限制，覆盖 dev 形态

## 目标

修复 [BUG-0048](../bugs/BUG-0048-resize-observer-filter-dev-mode.md)：dev 下 Chromium 上报的 `ResizeObserver loop completed with undelivered notifications.` 带页面 URL 作为 sourceId，现有 `sourceId === ""` 条件失配，噪音全部落盘（单日 render 日志 214/349 行）。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 Worktree）
- 可并行 Task：TASK-0130、TASK-0131（写路径不相交）
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/main/window-manager.ts`
- Branch：task/TASK-0132-resize-observer-filter-dev-sourceid
- Worktree：`../open-forge-wt/task-0132-resize-observer-filter-dev-sourceid`
- 集成负责人：Coordinator
- 集成顺序：与 TASK-0130 / TASK-0131 任意顺序

### 做

- `isChromiumResizeObserverDiagnostic` 放宽为「消息精确匹配 + 行号为 0」，去掉 `sourceId === ""` 限制（消息文本本身足够特异，行号 0 保留以区别真实业务 throw）。
- 补回归测试：sourceId 为 dev 页面 URL 时过滤命中；packaged 空 sourceId 形态仍命中；真实错误（同消息但行号非 0，或不同消息）不被误杀。
- 发布说明写入当前版本 `.github/release-notes/v0.1.3.md`（「其他」一节一句话即可，无用户可感知影响）。

### 不做

- 不调整 `shouldPersistRendererConsoleMessage` 的其他过滤规则；不改 render 日志级别与滚动策略；不处理 iframe sandbox / CSP 等 dev 固有警告。

## Given / When / Then

- Given：dev 模式 Desktop，页面含分屏布局。
- When：用户拖动分屏或 resize 窗口，Chromium 上报 ResizeObserver 内部诊断。
- Then：该诊断被过滤不落盘；render 日志只保留真实错误。

## 必须保持

- 真实渲染器错误（含行号非 0 的同名消息）仍正常落盘。
- console-message 其他级别与持久化路径不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/window-manager.test.ts`（若无现成文件则就近新建，覆盖 dev/packaged 两种 sourceId 形态与误杀边界）。
- 用户流程：dev 下拖动分屏后 render 日志无新增 ResizeObserver 行（任务收尾人工确认一次）。
- 质量检查：`bun run check:quick`，收尾 `bun run check`。

## 交付记录

- 实际修改：`isChromiumResizeObserverDiagnostic` 下沉到 `logger/renderer-console-policy.ts` 纯策略模块（零依赖、可单测），签名收窄为 `(message, line)`——sourceId 不参与判定，dev URL 与 packaged 空串两种形态结构性覆盖；`window-manager.ts` 改为引用该导出。write_paths 相应修订（判定下沉属本任务必要重构：私有函数挂在 Electron 壳内无法稳定测试）。
- 测试：`renderer-console-policy.test.ts` 新增 3 例：行号 0 + 消息精确匹配命中（任意 sourceId 形态）、同消息行号非 0 不误杀、行号 0 的其他消息不误杀。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/logger/renderer-console-policy.test.ts`（7 passed）；集成后重跑通过；pre-commit biome+guards 通过。
- 未运行及原因：`check`/`test:changed` 由 Coordinator 在批次验收统一跑；「dev 下拖动分屏后 render 日志无新增 ResizeObserver 行」人工冒烟未执行，保持 verifying。
- Worktree：`task-0132-resize-observer-filter-dev-sourceid`（branch `task/TASK-0132-resize-observer-filter-dev-sourceid`，集成提交 `94d07c6df` + merge `02c13a461`）。
- 剩余风险：判定下沉后源日志行仍含 `[sourceId:line]` 前缀，排查侧仍可定位来源；若未来 Chromium 对真实业务错误也报行号 0，存在误杀窗口（消息文本特异度兜底）。

- 2026-10-06 人工 dev 冒烟（隔离 Debug Profile）：拖动分屏分隔条并连续 3 次改动窗口尺寸后，main/render 当日日志中 ResizeObserver 诊断命中 0（EPIPE 命中 0）；配合定向 7 例回归，验收项「dev 下拖动分屏后 render 日志无新增 ResizeObserver 行」已实证，记为 done。
