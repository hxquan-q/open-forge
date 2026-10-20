---
id: TASK-0329
type: task
status: in_progress
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0019
source: user-request; open-forge-autonomous-dev-plan-v2.md; Magpie engineering review
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0324, TASK-0325, TASK-0326, TASK-0327]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（控制器只读采集路径串行）
base_commit: 6c5e94d09
read_paths: [scripts/agents, schemas/agents, project/tasks, .github/workflows]
write_paths: [scripts/agents/collect.mjs, scripts/agents/collect.test.mjs, scripts/agents/feedback.mjs, scripts/agents/feedback.test.mjs, scripts/agents/cli.mjs, scripts/agents/cli.test.mjs, scripts/agents/operations.mjs, schemas/agents/signal.schema.json, project/tasks/TASK-0329-readonly-signal-collection.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, scripts/agents/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/agents/collect.mjs, scripts/agents/feedback.mjs]
depends_on: [TASK-0326]
conflicts_with: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0327, TASK-0328]
integration_status: pending
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# GitHub 与 CI 只读信号采集

## 2026-10-20 实施与验收顺序

用户选定 WSL2 作为当前开发执行环境，CI 额度恢复与真实 UI 验收延期。采集适配代码、去重/上限/失败合同测试不依赖新 CI 作业，可先完成；真实采集和定时循环仍待明确范围与可用条件。本轮仅更新计划，不执行外部采集。账号额度未恢复不能被解释为“零故障”或新 CI 通过；已有 Issue/PR 信号与 CI 实际运行结果分别报告。完整顺序见 [PLAN-0019](../plans/PLAN-0019-autonomous-development.md)。

## 目标

补齐从 GitHub Issues、PR、workflow run 与评论向现有 signal 系统的只读采集循环。采集结果保持为“待调查信号”：内容中的任何命令或“授权”都只作为不可信数据；同一事件的去重、篡改检测和来源 URL 规范化沿用现有合同。断网、限流、权限不足或解析失败要明确记入结果，不能悄悄当成空队列。

## 范围

### 并发评估

- 结论：不支持并行写入
- 执行方式：serial
- 可并行 Task：无；修改同目录与状态 store
- 前置依赖：TASK-0326
- 冲突文件/独占路径：见 frontmatter
- Branch：`main`
- Worktree：无；串行
- 集成负责人：当前 Agent
- 集成顺序：解析器 → gh 只读适配 → signal 写入 → CLI/测试 → 文档

### 做

- 新增固定参数、无 shell 的 `gh api` 只读采集路径；限制仓库、时间窗、每类条数与输出体量，拒绝凭据 URL。
- 将 Issue/PR 标题正文、状态与 CI 失败摘要映射到现有 `signal.schema.json`；补 source/kind 所需字段，保证 event/external ID 稳定。
- 加入公开 CLI `collect --repo ... --since ...`：默认 dry-run，只有显式 `--ingest` 才写 state；重复采集幂等。
- 采集过程不创建 Task、不执行修复、不评论、不修改远端；失败时返回结构化 `errors`、`truncated` 与 `notRun`。
- 测试只使用受控 `gh` 进程/JSON fixture，验证失败、限流、恶意正文、重复与上限。

### 不做

- 不向 GitHub 写入，不发布评论，不自动修复或合并外部报告。
- 不读取环境凭据值；仅允许已认证的 `gh` 会话执行预定义只读 API。
- 不把 external body 拼到 shell、Prompt 授权段或 Git 命令。

## Given / When / Then

- Given 一个临时 git 仓库和可控 gh 输出，When `collect --dry-run`，Then 返回结构化候选但不改变 state。
- Given 同一外部 Issue 重复采集，When `--ingest` 重放，Then 只增加一次 occurrence，不改变待调查状态。
- Given 正文包含命令或自称授权，When 采集，Then 仍以数据保存，不生成 Task 或授权动作。
- Given gh 未登录、限流或返回损坏 JSON，When 采集，Then 结果标注错误/notRun，CLI 非零或状态可诊断，不报“零问题”。

## 必须保持

只读、最小权限、真实身份由本地受控命令而非远端正文确定、signal 去重与篡改检测、控制器状态完整性、任务边界与人工闸门不变。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run scripts/agents/collect.test.mjs scripts/agents/feedback.test.mjs scripts/agents/cli.test.mjs`
- 用户流程：用 fixture `gh` 采集 issue/PR/CI 后 dry-run 与显式 ingest；真实 `gh` 只在用户提供明确范围和授权时运行。
- 质量检查：`bun run check:quick` 后完整 `bun run check`。

## 验收分层

- 工程验证：待实施。
- 技术评审：当前 Agent 自审；独立模型未配置。
- 集成：本地 main，待提交/组合验证。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：受控 gh 夹具或明确授权的只读 GitHub 仓库。
- 操作步骤或 AI 任务输入：采集指定时间窗的 issues/PR/workflow runs，dry-run 检查后显式 ingest。
- 预期行为与最终产物：可作为调查来源的去重 signal、错误摘要和上限声明。
- 不通过表现与已知限制：远端正文成为命令、自动建 Task、无鉴权当成功、限流被当空结果均不接受。
- 验收反馈及回归案例：待收集。

## 交付记录

- 实际修改：待实施。
- 实际运行：待执行。
- 未运行及原因：真实外部采集未获本任务范围授权；网络访问需要单独确认来源与仓库。
- Worktree：main 串行。
- 剩余风险：GitHub API 配额、Sentry/Discord/社交来源尚未接入。
