---
id: TASK-0228
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0093（单成员 runtime 恢复失败回滚全部已恢复成员，team 会话跨实例锁竞争下整体打不开）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0093]
execution: serial
branch:
worktree:
base_commit: 91596a60e
read_paths: [apps/desktop/src/main/agent-teams/team-runtime-restorer.ts, apps/desktop/src/main/agent-teams/team-runtime-restorer.test.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.ts, packages/agent-team/src/validation.ts, project/bugs/BUG-0093-team-member-restore-rollback-all.md]
write_paths: [apps/desktop/src/main/agent-teams/team-runtime-restorer.ts, apps/desktop/src/main/agent-teams/team-runtime-restorer.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0093-team-member-restore-rollback-all.md, project/tasks/TASK-0228-team-member-restore-isolation.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-runtime-restorer.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# team 成员 runtime 恢复按成员隔离失败：成功保留、失败留旧条目、自身半成品回收

## 目标

`restoreTeamMemberRuntimes` 成员恢复失败不再整体回滚（BUG-0093）：

1. **成员级隔离**：任一成员 `resolveConfig`/`createSession`/路径校验失败只影响该成员——保留其旧 `memberRuntime` 条目（与重启未恢复同语义），记成员级 error 日志，不 throw。
2. **半成品回收**：该成员自身 `createSession` 成功后、校验失败前留下的 runtime 由该成员分支自行 `disposeSession`（替代原全局回滚）。
3. **成功路径不变**：已恢复成员写回新 sessionId/指纹，`changed` 仅由成功成员决定，`persist` 语义保留。
4. **边界**：协调 runtime（`ensureCoordinationRuntime`）失败仍整体失败——协调会话是 team 消息脊柱，不做降级。

## 约束

- `assertTeamSessionInvariants` 要求 `memberRuntime` 数量与 `activeMemberIds` 一致（`runtimeStatus` 非 preparing/failed 时）：失败成员只能保留旧条目，不能删条目、不能置空。
- 失败成员的 stale sessionId 后续 turn 会单独失败（与现状一致），下次冷加载 restore 自动重试。
- 不改 `TeamRuntimeResumeHost` 接口形状与 IPC；日志仍走既有 `info`/`error` 双级 logger。
- 锁预算本身（~1s）不在本任务调整；竞争诱因属环境（双安装共享数据目录），记录为已知边界。

## 验收（Given/When/Then）

- Given：两成员会话，成员 A 恢复成功、成员 B `createSession` 抛锁超时 → When：`restoreTeamMemberRuntimes` → Then：resolve（不 reject），A 写回新 runtimeState，B 保留旧条目，成员级 error 日志落盘，不调用整批 dispose。
- Given：成员 B `createSession` 成功但 sessionPath 校验失败 → Then：B 该次创建的 sessionId 被 `disposeSession` 回收，B 保留旧条目，其余成员不受影响。
- Given：全部成员成功 → Then：行为与旧实现一致（新 sessionId 落盘、persist 一次）。
- Given：全部成员失败 → Then：resolve 返回原文档（changed=false，不 persist），不抛错，会话可打开。
- Given：旧实现 → When：成员 B 失败 → Then：整体 reject 且已恢复成员被 dispose（红基线）。

## 交付记录

- 红基线：3 例新合同断言在旧实现下失败（整体 reject `locked`/`Timed out acquiring conversation file lock`、persist 未被调用即 reject）。
- 实际修改：`team-runtime-restorer.ts` 去全局 try/rollback——成员分支内 `createSession` 后的校验失败由本分支 dispose 自身半成品；`allSettled` 后逐成员处理，rejected 记成员级 error 并保留旧条目，`changed` 仅由成功成员决定；`persist` 语义不变。
- 测试：`team-runtime-restorer.test.ts` 6/6 过（改写 rollback 用例为隔离断言 + 新增半成品回收、全失败两例）。
- impact：desktop 190 例过；4 个套件（file-protocol、desktop-conversation-service、cli-runtime-canary、ipc/browser-view）因 `window-manager.ts:25` `process.resourcesPath` 在 Node 下 undefined 挂 import——已提交代码的既有环境问题，与本改动无关。
- 检查：desktop `typecheck:incremental` 绿；改动文件 biome 绿；`check:quick` 被 `.ua/` 既有 guard 残留阻断（非本改动，已上报）。
- 未运行：完整 `bun run check`（`.ua/` 阻断同一 guards 链路）；人工实机验收未做。
