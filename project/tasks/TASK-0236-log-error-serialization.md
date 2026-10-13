---
id: TASK-0236
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: BUG-0092（IPC 与巡检日志把抛值序列化为 [object Object]/只记 errorName）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0092]
execution: serial
branch:
worktree:
base_commit: e9e0e31e5
read_paths: [apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts, apps/desktop/src/main/browser-automation/browser-runtime-manager.ts, apps/desktop/src/main/logger/format-error-chain.ts, apps/desktop/src/main/logger.ts, project/bugs/BUG-0092-ipc-error-log-serialization.md]
write_paths: [apps/desktop/src/main/logger/describe-error.ts, apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts, apps/desktop/src/main/browser-automation/browser-runtime-manager.ts, apps/desktop/src/main/logger/describe-error.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0092-ipc-error-log-serialization.md, project/tasks/TASK-0236-log-error-serialization.md, project/tasks/README.md]
---
<!-- Copyright The Open Forge contributors. -->

# 诊断日志统一抛值序列化：新增 describeError 并接入三处丢信息站点

## 目标

任意抛值（Error/带 cause 的 Error/普通对象/string）落到日志时保留 name+message+cause 链或稳定摘要，不再出现 `[object Object]` 或裸 `errorName`。

## 方案

1. **新增** `apps/desktop/src/main/logger/describe-error.ts`：`describeError(error: unknown): string`——Error 输出 `name: message` 并沿 cause 链追加 `caused by:` 单行摘要；string 直通；其余对象 `JSON.stringify` 稳定摘要（循环引用回退 `String`）。
2. **接入三处站点**（BUG-0092 枚举）：`agent-teams.ts` 四处 `error: … : String(error)` 字段、`session-interrupt-monitor.ts` 两处 `errorName` 字段、`browser-runtime-manager.ts` 两处 `errorKind` 字段——字段名保留、取值改 `describeError`（`errorName`/`errorKind` 语义升级为描述串；如需保留 name 字段另加 `error` 字段，按既有日志字段惯例定）。
3. **不重造**：Error 链格式化复用 `logger/format-error-chain.ts` 的 `formatErrorChainJSON` 节点遍历，describeError 只补 `unknown` 入口与单行化。

## 约束

- 仅日志取值，不改抛错/处理路径；字段名不删（兼容既有日志消费）。
- 摘要长度设上限（如 500 字符）防巨型对象撑爆单行日志；不输出密钥/令牌字段（对象摘要仅结构字段，已有约定照抄）。
- 其余 ~9 处雷同 `errorMessage` 私有 helpers 的统一归并属独立 refactor 提交，不在本 Task。

## 验收（Given/When/Then）

- Given：非 Error 对象抛值 → Then：日志含稳定 JSON 摘要而非 `[object Object]`。
- Given：带 cause 的 Error → Then：输出含 `caused by:` 链节点 name+message。
- Given：普通 Error → Then：`name: message`。
- 三处站点日志字段走 describeError；红基线：旧实现三类断言失败。

## 交付记录

- 红基线等效：describeError 对非 Error 对象/带 cause Error 的断言在旧站点实现（`String(error)`/裸 `error.name`）下必然失败。
- 实际修改：新增 `logger/describe-error.ts`（`describeError(unknown)` 单行描述，复用 `formatErrorChainJSON` 链遍历 + `util.inspect` 对象摘要 + 500 字符截断）；`agent-teams.ts` 4 处、`session-interrupt-monitor.ts` 2 处、`browser-runtime-manager.ts` 2 处字段值改走 describeError，字段名保留。
- 测试：`describe-error.test.ts` 5 例全绿。
- 全量：impact（desktop 相关套件）53 例过；2 套件 `window-manager.ts:25` 既有 import 失败（与本改动无关）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 未运行：`bun run check` 全量。
- 遗留：~9 处雷同私有 `errorMessage` helpers 归并、renderer console 侧同类 `[object Object]`——独立 refactor/后续项，已记入 BUG-0092 验证边界。
