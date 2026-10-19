---
id: TASK-0323
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0322]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0323-autonomous-integration
worktree: ../open-forge-wt/task-0323-autonomous-integration
base_commit: cf79dd5043db2e17a17bc1d3b0e90e80cf308ea7
read_paths: [scripts/worktree, scripts/agents, schemas/agents, project, docs/dev, apps/desktop/DESIGN.md, apps/desktop/AGENTS.md]
write_paths: [scripts/agents, schemas/agents, scripts/quality/autonomy-entrypoints.test.mjs, scripts/quality/check-autonomy.mjs, scripts/quality/check-guards.mjs, scripts/quality/check-modified-file-notices.mjs, scripts/quality/quality-gates.test.mjs, package.json, AGENTS.md, GEMINI.md, .cursor/rules/00-agents.mdc, docs/dev/agent-rules/autonomy.md, apps/desktop/DESIGN.md, docs/adr, .github/release-notes/v0.1.3.md, project/tasks/TASK-0323-autonomous-integration.md]
exclusive_paths: [scripts/agents, schemas/agents]
depends_on: [TASK-0322]
conflicts_with: [TASK-0322, TASK-0130, TASK-0153, TASK-0154, TASK-0197, TASK-0218, TASK-0223, TASK-0276]
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发调度、闸门与集成

## 目标与范围

续接 TASK-0322 的已提交执行核心，实现现有 Task 队列调度、运行环境绑定、签名人工批准、合并候选重新评审/验证、UI 合规检查及规则路由。父计划的信号/复盘/发布与最终演练继续实施，不把本任务当最终交付。

采用直接扩展当前运行器，避免增加平行任务状态机。控制器状态与实际发布权限隔离；签名批准只批准绑定的具体变更，不扩大能力。新实现不得仅凭配置字符串把工作目录称为沙箱。

## 并发评估

条件支持：使用独立 Task Worktree，基于 TASK-0322 提交串行接续；不派发子 Agent，不在共享目录并行写入。共享 scripts/agents、Schema、版本说明与规则路径已登记冲突；Coordinator 最终按依赖集成。

## Given / When / Then

- Given ready Task 与已完成依赖，When 调度，Then 按优先级确定性选择并领取，路径冲突和轮次/并发上限拒绝执行。
- Given 七类闸门或未分类变更，When 验证/集成，Then 仅接受受信公钥对当前代码/策略/合同的有效签名；篡改、过期、错对象均拒绝。
- Given Worker 已通过，When 组合进新的集成基线，Then 对最终合并提交重新评审与验证；基线前进或候选变化时不复用旧证据。
- Given UI 变更，When 合规审计，Then 输出具体规则发现及未覆盖项；缺失视觉/行为验证不得宣称自动验收。

## 必须保持

不调用真实模型、不读取用户会话、不启动真实 Desktop、不执行发布。自动集成只作用于明确配置的目标与已验证提交；主工作区脏、归属不清或授权缺失时停止。用户附件中的历史授权不成为新授权。

## 测试与验证

真实临时 Git 仓库/Worktree 与受控子进程连续流程，覆盖重放/取消/崩溃恢复、签名篡改/过期、组合提交证据失效、UI 违规与覆盖空白。定向 Node runner → test:impact → check:quick → 完整 check；最终父计划统一完成 test:changed。独立模型与实际 UI 验证待明确运行环境和授权。

## 验收分层

- 工程验证：质量套件 51 文件 / 584 例通过，完整 `bun run check` exit 0；技术评审：自审，未调用独立模型。
- 集成：pending；人工功能验收：内部工具以既定软件合同验证，实际模型质量另列。
- 发布：未授权；本任务只提供控制入口与审计证据。

## 交付记录

- Task Worktree 串行续接 `cf79dd5043db2e17a17bc1d3b0e90e80cf308ea7`；`bun install --frozen-lockfile` 成功（3044 包，86.73 秒），未修改锁文件。
- 已实现 ready 队列与已集成依赖判定、标准 Worktree 准备与已提交 in_progress 基线、有界执行循环、外部签名人工闸门、最终合并候选重验与基线前进拒绝、增量 DESIGN 源审计与跨工具规则入口。
- 真实临时 Git 连续流程验证：实现/跨家族评审/实际断言→合并后清空旧证据→重新评审/验证→另一提交前进 main 后拒绝旧候选→重建/重验后保留另一贡献并集成；发布始终为 false。
- 回归证据：删除网络调用前的检查原先未命中安全闸门，新测试先失败后修复；终止未确认和父进程已死亡时原先能回收租约，新测试先失败后修复。无法确认清理时进入 cleanup-required、暂停控制器并拒绝直接 resume。
- `bun run test:quality`：最初 51 文件 / 583 例通过；补齐 mdc 声明检查后 `test:impact` 实际重跑质量套件 51 文件 / 584 例通过，日志为系统临时目录 `open-forge-task-0323-impact-20261019.log`。`check:quick` 最终版通过（`open-forge-task-0323-quick-v2-20261019.log`）。`bun run check`：exit 0，日志 `open-forge-task-0323-check-20261019.log`；真实 lint 覆盖实现/Schema/配置，根指南仍小于 8 KiB。
- 初次暂存 Cursor 入口后，声明守卫如实报 mdc 未归类；新增失败测试后将 mdc 按 Markdown 注释风格检查，未豁免声明或放宽基线。
- 最终暂存入口并完成 mdc 支持后，再次完整 `bun run check` exit 0；最终日志为 `open-forge-task-0323-check-v2-20261019.log`。
- 父计划的完整 `test:changed` 已跑完：46 工作区中 43 通过，runtime-node/CLI/Desktop 失败。runtime-node 两例独立复验通过；Desktop 的 resourcesPath 导入错误在未改动的 main `399fdf1ff` 同样复现。CLI 的 wasm 路径、空技能诊断和部分 RPC 超时仍待后续审计，不以其他检查通过冲销。
- UI 当前只完成可解析的增量源检查；真实布局/交互/六套主题与独立视觉运行适配仍未验收。用户已明确答复没有 VM/runner、签名和监控环境；没有调用真实模型或扩大权限，策略仍 level=0。
- `.cursor` 被现有忽略规则覆盖，只显式暂存本任务新建的 `00-agents.mdc` 入口；未改写或提交任何个人 Cursor 设置。
- ADR-0146 记录已实施软件合同和真实部署边界。后续信号/复盘/发布控制、基线失败修复及最终审计按 PLAN-0019 继续，不把本提交当全目标完成。
