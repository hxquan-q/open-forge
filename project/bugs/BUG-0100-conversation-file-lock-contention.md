---
id: BUG-0100
type: bug
status: verifying
priority: P2
owner: packages/runtime-node
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（WRITE_LOCK_TIMEOUT → restore rolled back / bootstrap warm 连环失败）；BUG-0087/0091/0093 修复记录的共同上游
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087, BUG-0091, BUG-0093]
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 会话文件锁对跨实例竞争无容忍：1s 重试预算过紧、stale 判定无心跳、超时无持有者信息

## 用户流程

- Given：同机存在第二个 Open Forge 实例（实机为 0.1.1 与 0.1.3 双安装共享 `~/.openforge`），其流式写入循环持锁。
- When：本实例对同一 member 会话执行 restore/warm/send/append——`acquireConversationFileLock` 以 `open(path,"wx")` 抢锁。
- Then：对方每把锁只持有毫秒级但释放即重抢；本侧 100×10ms ≈ 1s 预算内只要对方不松手就超时 `WRITE_LOCK_TIMEOUT` → member restore rolled back、终态 append 失败转 `recovery_required`、协调文件写坏成僵尸会话。

## 实际行为

- `acquireConversationFileLock`（`conversation-file-lock.ts`）：`FILE_LOCK_RETRY_COUNT=100` × `FILE_LOCK_RETRY_DELAY_MS=10` 恒定轮询，总预算 ≈1s。
- `isStaleLock` 只看 lockfile mtime ≥5min；锁文件内容仅为 token，**持有期间 mtime 不刷新**——单次持锁操作若真超 5 分钟会被误判 stale 被抢删，锁形同虚设。
- 超时错误只带 sessionId，不带锁持有者任何信息——日志里无法区分「他实例活跃持有」与「残留锁」。
- 日志证据（0.1.3 实机）：`team session runtime restore rolled back error: 'Timed out acquiring conversation file lock: c52b3043-…'` + `failed to warm team session after bootstrap` 每分钟三连；member turn `non-retryable-failure` 下游连环。

## 期望行为

- 重试带退避且总预算显著放宽（秒级而非 1s），跨实例短持锁的公平竞争不再必然超时。
- 持锁期间周期性刷新 lockfile mtime（心跳），活锁永不被误判 stale。
- 超时错误携带可读的持有者信息（pid + 获取时间），让「他实例持有」与「死锁残留」在日志里可直接区分。

## 根因证据

- [`conversation-file-lock.ts`](../../packages/runtime-node/src/conversation/conversation-file-lock.ts) 8-10 行：三个常量即全部策略；12-42 行：重试循环 + stale 抢删 + 纯 token 内容。
- `withFileLock`（`file-conversation-repository.ts` 697-704 行）：按次操作持锁，锁竞争面覆盖 read/append/delete/purge 全路径。
- `requestSingleInstanceLock`（`main.ts` 382 行）：GUI 单实例锁存在但 `isCliMode` 直通，且不覆盖不同安装版本共享 userData 的场景——双安装并行成立。
- 置信度：高（常量与循环逻辑确定；「对方实例持续持锁」为日志最合理解释）。

## 回归测试

- 持有者信息：预制新格式锁文件 → 竞争者超时错误含 pid/时间字段。
- 心跳：持锁超过 staleMs 阈值仍不被竞争者抢删（假时钟或注入小 staleMs 断言锁仍在）。
- 退避：竞争者面对持续短持锁时等待时长显著大于旧 1s 上限（可注入 options 断言 delay 序列）。

## 修复与验证

- 修复：见 [TASK-0235](../tasks/TASK-0235-conversation-file-lock-hardening.md)。`conversation-file-lock.ts` 三处强化——退避恒定 10ms 改指数封顶 100ms（60 次预算 ≈5.7s，旧 ≈1s）；持锁期每 60s 心跳刷新 mtime（内容仍是本持有者 token 才刷，崩溃进程心跳随进程终止、stale 兜底不受影响）；锁文件内容扩为 `token
pid
isoTime`、release 首行校验兼容旧格式、超时错误带 `held by pid N since T`/`another process` 持有者信息。常量收敛为 `ConversationFileLockOptions` 可选注入。
- 测试：`conversation-file-lock.test.ts` 新增 6 例——退避序列纯函数断言、获取/释放往返与内容格式、新/旧格式超时持有者信息、心跳防 stale 抢删（旧实现会被抢删）、竞争者超时后持有者正常释放。
- 全量：impact（runtime-node）22 套件 105 例过。
- 检查：desktop `tsc --noEmit` 绿（desktop 侧零改动，此处跑的是整仓 lint 与 runtime-node tsgo 构建）；`check:lint` 绿。
- 验证边界：心跳周期 60s——持锁在 60s 内完成正常操作无额外 IO；锁文件格式扩展为行内追加，旧实例读纯 token 场景兼容，但 0.1.1 旧实例仍按旧协议（无心跳/1s 预算）与其自身文件竞争——本修复只保证新版行为，双实例并存时老版本仍是弱方。
