---
id: TASK-0331
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0326, TASK-0327, TASK-0328, TASK-0330]
execution: serial
branch: main
worktree: unassigned（共享控制器，单 Agent 串行）
base_commit: 82ad8e525
read_paths: [scripts/agents, scripts/worktree, project, schemas/agents]
write_paths: [scripts/agents/orchestrate.mjs, scripts/agents/orchestrate.test.mjs, scripts/agents/integrate.test.mjs, scripts/agents/runner.test.mjs, scripts/agents/runner.mjs, scripts/agents/prepare.mjs, scripts/agents/cli.mjs, scripts/agents/cli.test.mjs, scripts/agents/README.md, project/tasks/TASK-0331-local-development-cycle.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/agents/orchestrate.mjs]
depends_on: [TASK-0326, TASK-0327]
conflicts_with: [TASK-0326, TASK-0327, TASK-0328, TASK-0329, TASK-0330]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# WSL2 本地任务执行闭环

## 目标与范围

兑现用户明确执行请求，复用现有 Task/Worktree/cycle，不另造调度或自动发布。修正验证失败后直接退出的问题，使已确认的 verification-failed 在实现/评审轮次上限内继续修复；租约/权限/候选/清理未知等前置失败必须停止。外部问题采集暂不实施，任务由用户给定。planner/triage/lessons 自动建任务不是本次范围。

本 Task 为 Open-Forge-only 开发控制器，单 Agent 串行 main，不与共享目录并发。输入为明确 Task、受控执行器和实际测试文件；输出为版本绑定证据与可诊断停止原因，不写真实用户状态。现有实现者、不同家族评审、代码/策略/合同绑定、七类闸门、取消和 generation 不变。

## Given / When / Then

- Given 实现后的实际断言失败，When cycle 续接，Then 将失败原因交回实现者，重新评审和验证，通过后才返回 verified；实现/评审次数耗尽则保留失败现场。
- Given 审批缺失、候选变化、清理未知或取消，When 执行，Then 停止且不越过相应门槛、不继续领取工作。
- Given 临时 Git 和不同家族的受控进程，When 公开 cycle 到 integrate，Then 对实际合并提交重新评审/验证再前进 main，目标前进会拒绝旧证据。

## 验证和验收

先建立失败回归，再修复；运行 `bun scripts/quality/run-vitest.mjs --run scripts/agents/integrate.test.mjs scripts/agents/orchestrate.test.mjs scripts/agents/runner.test.mjs`、impact 与完整 `bun run check`。WSL2 内使用独立任务测试副本和 Linux 工具链，实际模型缺配置时只跑受控进程，不把它算模型质量验收。CI/真实 UI/签名发布延期，真实模型保持 disabled。该任务的工程证据与人工接受分开记录。

## 交付记录

已随 `a2e846e70` 提交到本地 main，三个共享控制器的 Task 作为一套自洽合同串行实施并提交。工程验证与集成分开记录；保持 verifying 等待用户接受。七个他人 temp 文件仍未跟踪，按干净工作区要求未推送 dev，也未发布。

已修正 verification-failed 的有界续接，只有实际执行且清理确认的验证失败才重试；审批、租约、配置或清理未知仍停止。扩展真实 Git 回归先复现 needs-action，再证明第二轮实现/独立评审/验证成功，随后保持合并重验和 main 前进拒绝。该新扩展用例包含两轮实际进程，单例验证时限为 15 秒；产品限时和原有其他用例时限未改。最终命令/结果和提交事实见 VERIFY-0019。

Windows 首次影响测试因 WSL 安装后系统 bash 优先、以及并发进程用例超时而失败；明确使用已安装 Git Bash 并将测试单 worker 串行后，最终同一质量集合 58 文件 / 635 例通过，未删断言或改变产品阈值。WSL2 最终 20 文件 / 107 例通过，完整 `bun run check` exit 0；验证为独立最小依赖副本，不复制 Windows node_modules，不代表完整产品 Linux 构建或真实模型质量。真实 CI/UI、模型与签名发布未运行。
