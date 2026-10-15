---
id: TASK-0150
type: task
status: done
priority: P1
owner: toolkit
source: user-request; upstream b936056f7, 93bfc01ad（仅 toolkit 增量）
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: [BUG-0054]
execution: parallel
branch: task/TASK-0150-atomic-write-lock-retry
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts]
write_paths: [packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts, project/tasks/TASK-0150-atomic-write-lock-retry.md]
exclusive_paths: [packages/toolkit/src/atomic-write.ts]
depends_on: [TASK-0148]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 原子写入占用重试与 fork 队列保留

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：b936056f7, 93bfc01ad（仅 toolkit 增量）。

在现有唯一临时路径和同路径异步队列上补有界 rename 重试；永久失败清理自身临时文件但不覆盖原始错误。不引入删除目标再重命名。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

注入 EPERM/EBUSY/非重试错误；有界耗尽、最终内容、队列失败后恢复、不同路径不互锁。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：无。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 独立验证与协调者边界

从 main 创建 Worktree 后快进装配已验证的 TASK-0148（1020b7c59），再只复制本 Task 的原子写实现、测试和记录。绝不替换主树现有修改。共享导航索引与发布说明由 Coordinator 在主检出维护，本 Worker 不写这些公共文件；候选文案：临时文件占用时有界重试原子写入，保留同路径串行队列和原始失败原因。

已有候选通过 7 个定向和 Toolkit 全包 22 测试；隔离复验后才交付。复核永久错误、重试耗尽、失败后队列释放和独立临时路径，不以 Mock 调用替代实际最终文件内容断言。

## 隔离交付证据

- 在 fork 原有 asyncWriteTails 队列与唯一临时名上增加重命名重试，没有换成上游不带队列的整文件实现。同步最多 10 次、异步最多 30 次，仅 EPERM/EACCES/EBUSY 可重试；最终错误保持原实例，临时清理失败不覆盖它。
- 旧实现新增回归 6 例失败；隔离树扩充同步预算耗尽与异步清理失败后，Toolkit 全包 3 文件 24 测试通过，实际文件内容/临时文件/队列恢复均有断言。
- `bun run test:impact -- packages/toolkit/src/atomic-write.ts packages/toolkit/test/atomic-write.test.ts`：直接 9 测试、相关 2 文件 11 测试通过。
- 最新 `bun run check` 全部通过；只做源码自审，没有真实系统索引器或生产目录验收。
- Coordinator 已追加主检出当前开发版发布说明；Worker 不提交共享发布文件。保留 verifying 等待集成/功能接受，不宣称主树所有改动已验收。

## 已提交隔离结果

提交 222de8813fe3ce248f3d0c5ecf7911f4263ac8a7，依赖 TASK-0148，未合入主树。Toolkit 全包 3 文件 24 测试、影响面直接 9/相关 11 测试与完整 check 通过。保留 fork 队列、唯一临时文件和原始异常；发布文案由 Coordinator 追加主检出。源码自审完成，尚未进行真实系统索引器/用户数据验收，保持 verifying。


## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0150-atomic-write-lock-retry；来源提交：222de8813fe3ce248f3d0c5ecf7911f4263ac8a7。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0150。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
