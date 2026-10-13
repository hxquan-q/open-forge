---
id: TASK-0235
type: task
status: verifying
priority: P2
owner: packages/runtime-node
requirement:
plan:
source: BUG-0100（会话文件锁跨实例竞争无容忍——0087/0091/0093 的共同上游）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0100]
execution: serial
branch:
worktree:
base_commit: e9e0e31e5
read_paths: [packages/runtime-node/src/conversation/conversation-file-lock.ts, packages/runtime-node/src/conversation/file-conversation-repository.ts, packages/runtime-storage/src/conversation/errors.ts, project/bugs/BUG-0100-conversation-file-lock-contention.md]
write_paths: [packages/runtime-node/src/conversation/conversation-file-lock.ts, packages/runtime-node/test/conversation/conversation-file-lock.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0100-conversation-file-lock-contention.md, project/tasks/TASK-0235-conversation-file-lock-hardening.md, project/tasks/README.md]
---

# 会话文件锁协议强化：退避放宽、持有期心跳、超时携带持有者信息

## 目标

让跨实例（双安装/CLI 并行）共享 `~/.openforge` 的会话文件锁竞争不再秒级超时、活锁不被误判 stale 抢删、超时日志可直接归因。

## 方案

1. **退避**：`retryDelay` 由恒定 10ms 改为指数退避封顶 100ms，总预算 ≈5.7s（≈6 倍放宽；`retryCount` 降至 60 控制尾长）。
2. **心跳**：持锁期间每 `FILE_LOCK_HEARTBEAT_MS`（60s，远低于 5min stale 阈值）在「锁文件内容仍为本持有者 token」前提下 `utimes` 刷新 mtime；`unref` 不阻塞进程退出，release 时清除。
3. **持有者信息**：锁文件内容由纯 token 扩为 `token\npid\nisoTime`；release 校验首行（兼容旧格式文件）；超时抛错前读锁文件拼 `held by pid N since T` 或「held by another process」。
4. **可注入**：常量收敛为 `ConversationFileLockOptions` 可选参数（生产调用方不传），测试以小值确定性覆盖。

## 约束

- `WRITE_LOCK_TIMEOUT` 错误码不变、release 语义不变（token 不匹配不删他人锁）；`withFileLock` 调用方零改动。
- 旧版本实例写的纯 token 锁文件：新代码读首行仍 token ✓、持有者信息降级为「another process」；新版本锁文件被旧版本 release：旧代码 `readFile===token` 不匹配 → 不删（本就不是它的锁）✓。
- runtime-node AGENTS：Node 实现需对应协议合同测试覆盖；不改 `ConversationStorageError` 形状。

## 验收（Given/When/Then）

- Given：他方持锁且持续短持/重抢 → When：本侧 acquire → Then：等待预算 ≈5.7s（旧 ≈1s），期间退避递增。
- Given：本侧持锁超 staleMs → Then：心跳刷新 mtime，竞争者不判 stale 抢删。
- Given：竞争者超时 → Then：`WRITE_LOCK_TIMEOUT` message 含 `held by pid … since …`（旧格式锁文件 → `another process` 降级文案）。
- Given：新格式锁文件给旧语义 release → Then：首行 token 校验通过正常释放。

## 交付记录

- 红基线等效：心跳用例（持锁超 staleMs 竞争者仍超时、锁不被抢删）在旧实现下必被抢删；持有者信息用例旧实现 message 无任何 holder 字段。
- 实际修改：`conversation-file-lock.ts`——退避 `conversationFileLockRetryDelayMs`（10ms 指数至 100ms 封顶，60 次 ≈5.7s）；持锁 `setInterval` 心跳（60s，`unref`，release 时 `clearInterval`，内容校验仍为本 token 才 `utimes`）；`lockFileContent` 扩为 `token\npid\nisoTime`、release/心跳均按首行 token 校验（旧格式兼容）；`describeLockHolder` 超时带 pid+时间/another process/released/unreadable 四态；全部常量收敛 `ConversationFileLockOptions` 可选注入。
- 测试：`conversation-file-lock.test.ts` 6 例全绿（tmpdir 真 fs + 小 options，无假时钟）。
- 全量：impact（runtime-node）22 套件 105 例过。
- 检查：`check:lint` 绿（4801 文件）；runtime-node `tsgo` 构建过（impact 内）。
- 未运行：`bun run check` 全量（`.ua/` 已由他人提交入库，guard 残留与本批无关的其他项需另核）。
