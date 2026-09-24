---
id: TASK-0082
type: task
status: done
priority: P1
owner: apps/desktop main/browser-automation
requirement: REQ-0003
plan: PLAN-0006
source: code review 修复批（3 个 finder 独立命中；修复 TASK-0075 的面积启发式过宽）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/browser-automation/webview-picker-target.ts, apps/desktop/src/main/browser-automation/webview-picker-target.test.ts, project/tasks/TASK-0075-browser-picker-root-element.md]
write_paths: [apps/desktop/src/main/browser-automation/webview-picker-target.ts, apps/desktop/src/main/browser-automation/webview-picker-target.test.ts]
exclusive_paths: [apps/desktop/src/main/browser-automation/webview-picker-target.ts]
depends_on: [TASK-0075]
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# webview 选取器面积启发式只拒祖先不拒点击目标

## 根因（finder 交叉确认）

oversized（≥80% viewport 非交互）拒绝同时作用于物理点击的 `event.target`：`interactiveRoles` 白名单无 grid/tree/table，全屏自定义表格/虚拟列表/canvas 编辑器/带 onclick 的全屏容器被拒；walk 爬到 html/body 失败 → 双 pass 均返回 null，点击静默忽略、picker 看似冻结——恰恰断掉选取器存在的目标页面类。BUG-0006 的真因（空白点击落到 html/body 文档根）`isDocumentRoot` 已单独覆盖，面积启发式对 event.target 是误伤。另：容器间空白点击改前 `stack.find()` 会选容器，改后 null。

## 做

1. 面积启发式只作用于 stack-walk 的祖先链；`event.target`（用户物理点击的元素）直接进入候选，不做面积拒绝。
2. 保留 `isDocumentRoot` 拒绝（BUG-0006 修复本体不动）。
3. 空白容器区域：恢复「最深非 overlay 元素」语义（含 oversized 容器），不再静默 null——若与 BUG-0006 修复冲突，以文档根拒绝兜底并在测试里锁死两种场景的边界。

## Given / When / Then

- Given 全屏自定义 grid（无 role、有 onclick），When 用户点击单元格区域，Then 选中该 grid（合法 pick）。
- Given 页面空白处，When 点击，Then 不选 html/body（文档根仍拒）。
- Given 透明全屏点击捕获层下的按钮，When 点击，Then 选取结果与用户视觉意图一致（既有 pass-1 行为保持）。

## 测试与验证

- `webview-picker-target.test.ts` 补：全屏无 role 有 handler 容器、canvas 应用、容器间空白、透明遮罩下按钮、html/body 拒绝保持。
- 命令：`cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run src/main/browser-automation/webview-picker-target.test.ts`；tsc 定向。

## 交付记录

- 实际修改：
  - `webview-picker-target.ts`：删除聚合式 `accept()`，拆为按角色区分的两条路径——物理点击目标 `clickTarget` 豁免面积拒绝（只拒 overlay 与文档根）；`walk()` 祖先链上 oversized 元素跳过并继续向上（不致死链），文档根/overlay 拒绝保持（BUG-0006 本体不动）；pass-1 与栈构建逐字未动。函数保持自包含（`.toString()` 注入合同不破）。
  - `webview-picker-target.test.ts`：抽 `stubRect`/`stubViewportRect` 辅助；原「满屏容器空白处拒绝」期望翻转为回落选中容器；新增 6 测试（文档根拒、遮罩下按钮 pass-1、全屏无 role grid、canvas 应用、容器间空白、面积启发式只拒 walk 链）。
- 实际运行：`webview-picker-target.test.ts` 10/10、`webview-picker-guest.test.ts` 3/3（注入合同）、Biome 通过、tsc 定向零错误（主线已复跑确认）。
- 未运行及原因：全量 `bun run check` / desktop 全量 tsc——并行修复批 agent 正在同工作区改其他文件，全量会混入他人半成品；真实 WebView 坐标 E2E 需 `verify:ui:*` 授权（TASK-0075 已注明留给定向 Electron 验证）。
- 剩余风险：空白点击现在回落到 oversized 容器本身，TASK-0075「不收满屏容器」的原始意图部分让位于「不静默 null」——两种场景边界已由测试锁死；面积启发式实际触发面变窄（主要防 walk 从非 clickTarget 的满屏装饰元素起步时误选），防御价值保留；同目录 `webview-agent-guest.ts` 的 6 个既有 tsc 错误非本任务文件，留待其所有权会话处理。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】页面元素选取器在全屏表格/画布类应用上不再失灵，空白点击也不会误选页面根。
