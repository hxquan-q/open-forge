---
id: BUG-0092
type: bug
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main/render 2026-10-09 至 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087, BUG-0091]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# IPC 与巡检日志把抛值序列化为 `[object Object]`/只记 `errorName`，一线诊断信息全丢

## 用户流程

- Given：IPC handler 或主进程后台巡检捕获错误（可能是非 Error 的普通对象或带 cause 的包装错误）。
- When：落日志时以 `String(error)` 或只记 `error.name`。
- Then：日志应保留 message/stack/关键字段；实际输出 `error: '[object Object]'` 或 `errorName: 'Error'`，真实原因不可读。

## 实际行为

- `team send-message failed … error: '[object Object]'`（main 日志 3 次）——秒败的真实原因完全丢失；renderer 侧 `[agent-team] send attempted [object Object]` 同理。
- `Session interrupt scan failed { errorName: 'Error' }`——每 15 秒一条、持续整天，只有 error.name 没有 message/stack，扫描到底哪里挂无从判断。
- `browser runtime check failed { errorKind: 'Error' }`——同理只有名字；大概率是 `agent-browser` 未安装 spawn ENOENT，但日志无法证实。

## 期望行为

所有面向诊断的日志对任意抛值做统一序列化：Error 记 name+message+（可选）stack 摘要/cause 链；非 Error 对象记稳定 JSON 摘要；敏感字段按既有约定裁剪。

## 环境与失败证据

- Open Forge 0.1.1/0.1.3 打包版，Windows。
- `temp/log/main/2026-10-09.log`：`agent-teams-ipc team send-message failed … error: '[object Object]'`；`session-interrupt-monitor Session interrupt scan failed errorName: 'Error'` 数十条；`browser-runtime-manager browser runtime check failed errorKind: 'Error'`。
- `temp/log/render/2026-10-09.log`：`[agent-team] send attempted … [object Object]` 多条。

## 最小复现

1. 让 team `send-message` 的 service 抛一个非 Error 对象（如 `{code, message}`）。
2. 观察 main 日志输出 `error: '[object Object]'`。
3. 同理，让 session interrupt scan 抛 Error，日志只有 `errorName`。

## 影响

观测性缺陷——BUG-0087/0091 这类需要首因的问题被迫靠猜；巡检类故障（interrupt scan、browser runtime）长期处于「知道在挂、不知道挂哪」的状态。

## 根因证据

- [`apps/desktop/src/main/ipc/agent-teams.ts`](../../apps/desktop/src/main/ipc/agent-teams.ts)（约 362 行）：`error: error instanceof Error ? error.message : String(error)`——非 Error 抛值直接 `String()` 得到 `[object Object]`。
- [`session-interrupt-monitor.ts`](../../apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts)（约 97 行）：只记 `errorName: error.name`。
- [`browser-runtime-manager.ts`](../../apps/desktop/src/main/browser-automation/browser-runtime-manager.ts)（约 44 行）：只记 `errorKind: error.name`。
- 置信度：高（三处代码与日志签名逐字对应）。

## 回归测试

分别注入：非 Error 对象抛值、带 cause 的 Error、普通 Error——断言日志输出可读 message 与关键字段而非 `[object Object]`/裸 `errorName`。旧实现下三类断言均失败。

## 修复与验证

- 修复：见 [TASK-0236](../tasks/TASK-0236-log-error-serialization.md)。新增 `logger/describe-error.ts` `describeError(unknown)`——Error 输出 `name: message` 并沿 cause 链追加 `; caused by:`（code/errno/address/port 元数据随链）、string 直通、其余值 `util.inspect` 摘要并截断 500 字符；Error 链遍历复用 `format-error-chain.ts` 的 `formatErrorChainJSON`，不重造。
- 站点：`agent-teams.ts` 四处 `String(error)`、`session-interrupt-monitor.ts` 两处 `errorName`、`browser-runtime-manager.ts` 两处 `errorKind` 全部改走 describeError——字段名保留兼容既有日志消费。
- 测试：`describe-error.test.ts` 5 例——普通 Error、带 cause+元数据的 Error、非 Error 对象（断言非 `[object Object]`）、string 直通/循环引用不崩、500 字符截断。
- 全量：impact（desktop 相关套件）53 例过；2 套件 `window-manager.ts:25` `process.resourcesPath` 既有 import 失败（与本改动无关）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 验证边界：其余 ~9 处雷同私有 `errorMessage` helpers（同样对非 Error 输出 `[object Object]`）未在本 Task 归并，属独立 refactor；renderer 侧 `[agent-team] send attempted [object Object]` 走另一条 console 路径，未覆盖。
