---
id: TASK-0396
type: task
status: done
priority: P1
owner: apps/desktop/agent-teams
requirement: REQ-0002
plan: PLAN-0024
source: user-request / pendingContinuations 收尾时序假设
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0395]
related_issues: []
related_bugs: [BUG-0151]
execution: parallel
branch: task/TASK-0396-team-notification-drain
worktree: unassigned（已集成，待推送后清理）
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop/src/main/agent-teams/, packages/agent-team/]
write_paths: [apps/desktop/src/main/agent-teams/team-turn-coordinator.ts, apps/desktop/src/main/agent-teams/team-turn-coordinator.test.ts, apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts]
exclusive_paths: [apps/desktop/src/main/agent-teams/team-turn-coordinator.ts]
depends_on: []
conflicts_with: [TASK-0395, TASK-0154]
integration_status: integrated
created: 2026-10-23
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Team 通知消费期间的新通知及时续跑

## 目标与范围

验证「首通知处理中第二成员完成」是否依赖 30 秒恢复扫描；若成立登记 Bug、写先红回归后修复，若不成立记录反证并保留有价值的时序测试。归类 Upstreamable。

条件支持并行，但本批代码串行以免基准争抢；Task 独立 Worktree、同成员通道由既有调度器拥有，不新增运行时。输入来自真实内部组装与受控外部 Runtime；输出为稳定测试及必要的收尾重检查。无需依赖 0395 代码，集成排在其后。

## Given / When / Then

- Given 主控正在消费 A 的完成通知，When B 完成并持久通知、随后主控释放，Then B 可及时进入下一准入且每个 notificationId 只消费一次，无需周期扫描推动正常路径。
- Given 通知处理失败/无可续跑任务，When 释放，Then 保留恢复退避而不忙循环。
- Given 中途 stop/delete/新 stop generation，When 旧 continuation 结束，Then 不复活团队或覆盖新一代标记。

## 必须保持

通知 journal 与 receiving workItem notificationIds 是持久准入凭据；取消、权限、任务所有权和成员串行性不变；开始前重读当前状态；不以缩短恢复扫描或反复模型轮询改善延迟。

## 测试与验证

先显式 gate/可控时钟复现，禁止 sleep 猜时序；定向 coordinator/concurrency/notification/waiter；用户流程分派→完成→继续分派→停止→恢复。走仓库 Node runner、test:impact、check:quick 与最终 check。性能工具如需另立指标必须与 0395 分开，不能用假 CPU 分数保留正确性修复。

## 验收分层

工程验证：通过；独立新上下文审查 actor `71cf618b-afce-498` 首轮发现 P2（业务失败正常返回被误判成功），已先红后绿修正并续审接受，无剩余明确 P1/P2；集成 pending（主检出有他人未提交改动，不强行集成）；人工功能验收待接受；真实 Provider/UI 未运行，发布未授权。

## 功能验收包

两成员错峰完成时主控连续汇总且无重复，停止后保持停止。已完成任务不能因通知恢复被重新执行。

## 交付记录

- 实现：pending Set 改为带 owner 身份与 rerunRequested 的 Map；执行期间新调度请求标记下一次 drain。仅在本轮仍拥有该 key 且接收任务持久状态为 completed 时重新经过原成员通道准入；无计划/预算拒绝/中断/业务失败均不即时重调，结构性异常留给已有扫描。
- 基线红：新增连续分派流程期望 A/B 两通知、实际仅 A；同文件其余 56 例通过。排除 journal 提前领取：B 通知已持久化、尚无接收凭据。修复后立即可见两个发布结果，不重跑两个成员任务。
- 审查修正：最初按 Promise fulfilled 判断成功，审查推演发现会绕过 nextRetryAt；新增 retryable-failure/no-result 两例确实红，改读持久 completed 后绿。新增 persisted-failure（void 返回但历史有错误）也通过；999ms 无新执行，1000ms 由既有 timer 恢复，初始重试预算未提前消费。
- 完整场景：成功/停止/存储失败/抛错可恢复失败/持久失败/无结果六形态，加 stop→新用户 send→新 owner→旧 owner 迟到收尾→再到一条通知的连续交错。成功与存储恢复后两次扫描不重复模型续跑，最新工作项中通知回执恰好两个且唯一。未宣称该新 owner 测试单独能杀死身份比较行的 mutation。
- 实测（Windows Node v26.3.1 / Bun 1.4.2 / Vitest 4.1.11）：
  - `bun run test:impact -- apps/desktop/src/main/agent-teams/team-turn-coordinator.ts apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts`：直接 62 例、related 12 文件 158 例通过（追加 stop/resume 用例后再跑完整目录）。
  - 包 cwd：`bun ../../scripts/quality/run-vitest.mjs --run src/main/agent-teams --maxWorkers=2 --reporter=dot`：36 文件 **277 例通过**，无 worker 终止警告。
  - 最终代码版本 `bun run check`：lint、全部 types（含 Desktop/CLI/docs/mobile）、guards、mobile lint 全通过。
  - 目标 `worktree:check --task TASK-0396` 通过；本地计划/研究链接核对通过。
- 环境失败如实记录：首次测试因 fresh worktree 未构建 action-rpc 收集失败，impact 准备依赖后解除；扩面首次从根 cwd 启动导致既有 preset 测试按 process.cwd 找错路径，且与全量 check 并发造成 worker 终止告警；改用包 cwd/2 workers 后 277 例全绿，未删断言或改生产代码规避。
- Worktree：CLI 从 main@ea67d951e 创建 `../open-forge-wt/task-0396-team-notification-drain`，独立 frozen-lockfile 安装；规划/研究提交 `6dfcac576`，修复提交由承载本记录的提交绑定。未操作 TASK-0392 的实验配置，未跑性能自动提交。
- 发布说明：0.1.3 为无 tag、无碎片的历史手写正文，按其兼容规则补修复与内部研究条目，未发布。
- 未运行：真实 Provider/UI、跨平台行为与真实团队耗时；本片是正确性修复，不把 0ms fake-clock 进展当实际吞吐收益。更深的重启交错、二次 provider 失败后的计时链由后续回归扩展，本轮已保留既有恢复测试。
- 集成：主检出脏，候选分支保留，不推送/发布、不清理他人工作树。0395 的自动实验仍需独立 session cwd 或协调共享配置占用者。

### 集成记录（2026-10-24）

集成提交 e78cad175；agent-teams 37 文件 291 例通过。
