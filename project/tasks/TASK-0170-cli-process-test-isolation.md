---
id: TASK-0170
type: task
status: done
priority: P1
owner: cli-host tests
source: BUG-0059; TASK-0162 validation
related_requirement: [REQ-0002, REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148, TASK-0162]
related_issues: []
related_bugs: [BUG-0059]
execution: parallel
branch: task/TASK-0170-cli-process-test-isolation
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/cli-host/package.json, apps/cli-host/test, apps/cli-host/vitest.config.ts]
write_paths: [apps/cli-host/package.json, apps/cli-host/README.md, apps/cli-host/test/test-runner-contract.test.ts, project/tasks/TASK-0170-cli-process-test-isolation.md]
exclusive_paths: [apps/cli-host/package.json]
depends_on: [TASK-0148]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# CLI 进程型回归的调度隔离

## 目标与保留合同

只调整 CLI 包的标准 test 入口为已有 Node runner 的显式 --maxWorkers=1，不改生产运行时、RPC、测试断言、超时、skip 或 include/exclude。保留测试内部多个进程争用会话所有权的场景，不以文件级并发替代产品并发测试。单 worker 会降低跨文件并发吞吐，这是为可重复验证做的明确取舍。

## Given / When / Then

Given：固定 worktree，包含真实 CLI 子进程/安装制品的测试；When：通过标准 CLI test 入口运行；Then：完整集合通过，JSONL、取消、所有权和恢复断言不变，其他包仍沿用 TASK-0148 的资源策略。

## 实施与验证

从 main 创建 worktree，先快进 TASK-0148（1020b7c59）。写入 package 入口合同测试后修改脚本，并跑完整 CLI 包、test:impact、完整 check。原始失败证据与单 worker 31/31 对照见 BUG-0059；不宣称只凭对照已完成。

当前单 Agent、独立 Worktree。导航与发布说明由 Coordinator 维护，本 Worker 不修改主树共享文件。工程/集成待验证；内部测试工具无需人工产品验收；真实 Provider/UI、推送和发布均未授权。

## 隔离验收与交付

- Red：标准 test 入口合同在原脚本上失败；此前同一五文件以 2 worker 复跑为 16 失败，显式单 worker 则 31/31 通过。
- 仅改变 test 脚本调度并新增合同测试；不修改任何生产入口、RPC、超时、断言、skip 或测试集合。
- `bun run test:impact -- apps/cli-host/package.json apps/cli-host/test/test-runner-contract.test.ts` 按既有规则回退完整 CLI + Desktop：CLI 50 文件/226 测试通过（1 文件/14 测试既有跳过），Desktop 876 文件/4624 测试通过（6 文件/29 测试既有跳过），退出 0。
- `bun run check` 所有子检查通过。日志与退出标记为本机临时目录 openforge-task0170-validation-20261002.log(.exit)。
- 源码自审确认真实并发所有权/取消仍在用例内部验证。这里只证明当前固定环境下的完整回归通过，不声称已定位所有底层资源争用。
- 内部测试工具无人工产品验收项；工程完成，集成 pending、未推送未发布。Coordinator 已追加主检出 release notes，Worker 不提交共享发布文件。

## 隔离提交回写

提交 769f31bc360624973750a739113aa0ab3e4220e6。完整影响面 CLI 226 测试和 Desktop 4624 测试通过（均保留既有 skip），完整 check 通过。仅改变测试文件调度，产品并发用例内部不变；内部测试工具无人工产品验收项。 发布文案由 Coordinator 追加主检出；集成 pending，未合入 main、未推送或发布。


## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0170-cli-process-test-isolation；来源提交：769f31bc360624973750a739113aa0ab3e4220e6。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0170。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。
