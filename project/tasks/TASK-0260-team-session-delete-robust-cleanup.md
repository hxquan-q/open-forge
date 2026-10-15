---
id: TASK-0260
type: task
status: verifying
priority: P1
owner: apps/desktop + packages/runtime-core
requirement:
plan:
source: BUG-0108（用户实机日志 2026-10-14(2).log）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0108]
execution: serial
branch: main
worktree:
base_commit: 9801e62fc
read_paths: [apps/desktop/src/main/agent-teams/team-session-service.ts, apps/desktop/src/main/agent-teams/team-turn-coordinator.ts, apps/desktop/src/main/agent-teams/team-notification-journal.ts, apps/desktop/src/main/agent-teams/team-collaboration-store.ts, packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts, packages/runtime-core/src/runtime-host/runtime-host-session-lifecycle.ts, packages/runtime-core/src/session-extensions/composition.ts]
write_paths: [apps/desktop/src/main/agent-teams/team-turn-coordinator.ts, apps/desktop/src/main/agent-teams/team-turn-coordinator.test.ts, packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts, packages/runtime-core/src/runtime-host/runtime-host-session-lifecycle.ts, packages/runtime-core/test/runtime-host/runtime-host-catalog-facade.test.ts, packages/runtime-core/test/runtime-host/runtime-host-dynamic-agent-lifecycle.test.ts, packages/runtime-core/src/session-extensions/composition.ts, packages/runtime-core/test/session-extensions/composition.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0108-team-session-delete-blocked-by-cleanup-failures.md, project/bugs/README.md, project/tasks/TASK-0260-team-session-delete-robust-cleanup.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话删除改为删除优先：清理失败降级记录、不再掀翻删除

## 目标

用户删除团队会话时，任何单一成员 runtime 的释放失败或协调文档不可达都不再让删除整体失败；会话确实消失，失败按 best-effort 记录且可定位到具体扩展。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（与 TASK-0257/0255 的文件面不重叠，但同在 main 串行实施以保持 check 全绿）
- 前置依赖：无
- 冲突文件/独占路径：无
- Branch：main
- Worktree：未拆出（串行小改）
- 集成负责人：Coordinator
- 集成顺序：本 Task 与其他两个修复串行提交

### 做

- `team-turn-coordinator.abort()`：把 `notificationJournal.stop(session)` 降为 best-effort（失败记 warn），与同函数 `abortRuntimes` 的既有注释原则一致——协调会话不可达时 STOP 标记本就写不进去，内存 latch 已保证本进程不再恢复。
- `RuntimeHostCatalogFacade.deleteSession`：`disposeSession` 失败时记录后继续删除文件产物；所有权/能力冲突等非 dispose 错误仍严格抛错。
- `RuntimeHostSessionLifecycle.disposeSessionHandle`：dispose 失败时仍注销目录条目与所有权，避免会话变成「每次删除都重复同一失败」的僵尸。
- `SessionExtensionComposition.dispose`：AggregateError 携带失败扩展 id 与 cause，使下一次发生时可定位。

### 不做

- 不改团队索引三件套（repository / sessionState / residency）的必达语义——它们失败仍应真实报错。
- 不调整 `RetryableCleanup` 的重试语义。
- 不处理 BUG-0110（压缩版本冲突）与 ac-fence 插件 hook 超时。

## Given / When / Then

- Given：团队成员 runtime 的会话扩展释放会抛错，或协调会话已被删除。
- When：用户删除该团队会话。
- Then：删除完成、会话从列表消失；释放失败以 warn 与带扩展 id 的 AggregateError 记录；所有权/能力冲突仍让删除失败。

## 必须保持

- 团队索引三件套必达语义。
- 非 dispose 类错误（`assertCapability`、所有权冲突）仍向上传播，既有严格语义测试保持通过。
- `disposeAllSessions` 收集失败并抛出的语义不变。

## 测试与验证

- 定向测试：`bun run test:pkg runtime-core`；desktop `team-turn-coordinator.test.ts`、`team-session-delete.test.ts`。
- 用户流程：删除团队会话（含成员 runtime 释放失败、协调文档不可读两种前置）。
- 质量检查：`bun run check` + `test:impact`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行。
- 人工功能验收：不适用（需真实损坏的成员 runtime 才能构造，以确定性测试替代）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：侧栏团队会话右键「删除会话」。
- 操作步骤或 AI 任务输入：删除一个成员 runtime 已停止的团队会话。
- 预期行为与最终产物：会话消失，无错误弹窗；日志中释放失败为 warn。
- 不通过表现与已知限制：删除报错、会话仍在列表，或产物残留。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：`team-turn-coordinator.ts`（STOP 标记降为 best-effort：`stopSessionNotices` 捕获 journal 持久化失败、warn 后仍走 `taskControl.stopTeam`）、`runtime-host-session-lifecycle.ts`（`disposeSession` 新增 `releaseOnDisposeFailure` 选项——释放失败也注销目录条目并继续；缺省保留「抛出+保留注册可重试」旧语义，只有删除路径启用）、`runtime-host-catalog-facade.ts`（delete 以「会话文件消失」为准，吞 dispose 失败）、`session-extensions/composition.ts`（释放失败聚合为带扩展 id 的 AggregateError）。
- 评审修正（2026-10-15 收编）：「释放失败也注销」原稿误扩散到关闭/空闲逐出/创建回滚全部调用方，已收敛为删除路径专属选项；`failure !== undefined` 判空改为 failed 布尔（reject(undefined) 不再被当成功）；注销三步包进 try 并经 reportDisposeFailure 报告。
- 实际运行：定向 `runtime-host-session-lifecycle.test.ts` 3 例（新增「普通调用方保持可重试」回归）、`runtime-host-catalog-facade.test.ts`、`composition.test.ts`、`team-turn-coordinator.test.ts` 全绿；批内合计 runtime-core 7 文件 96 例。
- 未运行及原因：真实插件释放卡死场景未实机复现（需真实扩展）；影响面批跑含 BUG-0107 存量 4 文件收集失败（非本批）。
- 已知缺口：释放失败的扩展 id 只到达错误对象 message，observation 层仍只落 errorName、facade catch 静默——诊断出口未打通（评审发现 #6，待后续切片）。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：`stopSessionNotices` 对 journal 失败的吞掉比「已删除会话」场景更宽（瞬时失败→停止闩不落盘，重启后可能自动恢复）；已被 stopTeam 内部吞掉兜住，登记备查。
