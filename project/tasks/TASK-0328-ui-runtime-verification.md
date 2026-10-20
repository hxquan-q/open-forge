---
id: TASK-0328
type: task
status: verifying
priority: P1
owner: scripts/agents; apps/desktop/scripts
requirement: REQ-0019
plan: PLAN-0019
source: user-request; open-forge-autonomous-dev-plan-v2.md; Magpie engineering review
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0323, TASK-0324, TASK-0325, TASK-0326]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（UI 验证与控制器共享路径，单 Agent 串行）
base_commit: 6c5e94d09
read_paths: [scripts/agents, apps/desktop/scripts, apps/desktop/DESIGN.md, docs/dev, schemas/agents, project/tasks]
write_paths: [scripts/agents/ui-verification.mjs, scripts/agents/ui-verification.test.mjs, scripts/agents/verify.mjs, scripts/agents/adapters.mjs, scripts/agents/runner.test.mjs, scripts/agents/cli.mjs, scripts/agents/cli.test.mjs, apps/desktop/scripts/ui-verification.mjs, apps/desktop/scripts/ui-verification-acceptance.ts, apps/desktop/scripts/ui-verification-acceptance.test.ts, schemas/agents/ui-plan.schema.json, schemas/agents/ui-review.schema.json, schemas/agents/run-contract.schema.json, project/tasks/TASK-0328-ui-runtime-verification.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, scripts/agents/README.md, docs/dev/README.md, docs/dev/agent-rules/autonomy.md, .github/release-notes/v0.1.3.md, schemas/agents/evidence.schema.json]
exclusive_paths: [scripts/agents/ui-verification.mjs, apps/desktop/scripts/ui-verification-acceptance.ts]
depends_on: [TASK-0326]
conflicts_with: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0327, TASK-0329]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# UI 真实运行验证适配

## 2026-10-20 验收延期决策

用户选定 WSL2 作为当前开发执行环境，真实 CI 与真实 UI 验收延后。本 Task 先完成适配代码、候选绑定、断言报告校验及生命周期/故障合同测试；本轮仅记录计划，不修复现有实现草稿，不启动 UI。真实交互、六主题组合和视觉评审仍是后续必需证据，缺失时控制器必须停在待验收，不能跳过 `ui` 或用源码检查代替。完整顺序见 [PLAN-0019](../plans/PLAN-0019-autonomous-development.md)。

## 目标

### 本次实施合同（2026-10-20）

用户已明确要求执行：本次修复原有草稿并实现可调用的 fresh UI 验证接口、固定操作清单、实际断言/截图报告、控制器证据绑定及清理拒绝路径；不启动真实 UI，视觉评审未取得时明确保留未验收。使用 open-forge-testing 的受控进程/报告合同测试，包含旧草稿语法错误基线与无断言报告拒绝。单 Agent 串行 main；原草稿属于本任务，其他 temp 文件保持原位。UI 运行授权必须由调用时显式传入，不从本次编码授权推导。

将已存在的 Desktop fresh Profile、Playwright 验收入口接到控制器 `ui` check，使 UI 改动能够在隔离运行实例中操作代表性用户流程、检查布局断言并保存可核验证据。运行时错误、截图无断言、缺少浏览器或测试未实际执行均不能算通过。`verify:ui:*` 仍须当前任务明确授权，不能因 UI 文件变化自动执行。

## 范围

### 并发评估

- 结论：不支持并行写入；真实 UI 运行需要专属 fresh Profile
- 执行方式：serial
- 可并行 Task：无；与共享控制器及 Desktop scripts 冲突
- 前置依赖：TASK-0326 角色合同
- 冲突文件/独占路径：见 frontmatter
- Branch：`main`
- Worktree：实际运行前固定最终候选；控制器验收脚本仅启动 fresh Profile
- 集成负责人：当前 Agent
- 集成顺序：预检 → fresh 用户流程 → 证据/清理 → verify 接线

### 做

- 实现 `ui-verification-acceptance`：从真实 fresh Desktop 窗口执行固定验收清单，断言页头、主内容、导航与改动区域可见且可交互；截图之外保存断言结果。
- 拒绝 dev/debug 共享 Profile、真实用户数据、缺失 Playwright/浏览器、运行超时、未完成清理和没有断言的结果。
- 在 `verify` 中为 `ui` 生成固定命令并校验验收 JSON；不把源审计或单测算运行验证。`run-contract` 能携带授权的验收清单，CLI 提供明确的授权参数。
- 测试验收 JSON 的拒绝路径、运行器命令约束、控制器证据接线和 Desktop 验收脚本的纯逻辑合同；不默认启动 Electron。

### 不做

- 不读取真实用户 home、模型凭据或生产配置；不启动真实 Provider 会话。
- 不声称截图本身通过了六主题、视觉品质或真实用户接受；仅保存命中清单与证据。
- 不修改产品 UI，不绕过 DOM 交互断言，不改变“用户明确授权才运行 verify:ui”规则。

## Given / When / Then

- Given 当前 Task 明确授权 UI 运行且 fresh Profile 引擎可用，When 控制器执行 `ui`，Then 启动独立 Profile，通过真实用户流程并将带候选绑定的验收摘要记为通过。
- Given 只生成截图或验收退出码成功但没有断言，When 校验，Then `ui` 失败。
- Given 需要 dev/debug 真实账号或缺少浏览器，When 预检，Then 明确拒绝或停止，不谎报通过。
- Given 验收进程失联，When 超时/取消，Then fresh host 与浏览器被清理；无法确认清理则暂停并保留阻塞。

## 必须保持

D01–D11 源审计边界、现有 fresh Profile 生命周期与 `verify:ui:*` 授权要求、运行进程无宿主凭据、候选代码绑定、失败可恢复、未运行项如实报告。截图不是断言，界面未实机运行的绿色测试不能成为 UI 验收。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run scripts/agents/ui-verification.test.mjs scripts/agents/runner.test.mjs apps/desktop/scripts/ui-verification-acceptance.test.ts`
- 用户流程：有明确环境和授权时运行 `bun scripts/agents/ui-verification.mjs`；当前只做夹具预检和单测。
- 质量检查：`bun run check:quick` 后完整 `bun run check`。
- 本机实际 UI：仅本次任务用户明确允许，且在隔离 fresh 环境可启动时执行。

## 验收分层

- 工程验证：软件接口与合同验证完成，WSL2 控制器 107 例、Desktop 直接/关联各 3 例及完整 check 通过；真实 UI/视觉验收延期。
- 技术评审：自审；未配置独立 ui-reviewer。
- 集成：已随 `a2e846e70` 原子提交到本地 main；未 push，真实 UI 验收延期。
- 人工功能验收：待真实用户流程。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：显式授权的 fresh Profile、Playwright 运行能力和改动验收清单。
- 操作步骤或 AI 任务输入：启动隔离实例，执行代表性交互，读取结构化验收结果。
- 预期行为与最终产物：断言结果、运行错误摘要、证据绑定和清理状态可复核。
- 不通过表现与已知限制：只截图、测试仅准备状态、共享 Profile、未清理或缺失断言均不通过；真实视觉质量仍需人工/独立评审。
- 验收反馈及回归案例：待收集。

## 交付记录

- 实际修改：修复原脚本语法及缺失模块；增加闭合操作清单、六主题断言/布局/截图采集、候选和计划绑定、专属 fresh 运行与清理、独立视觉评审接线。无独立视觉证据停在 awaiting-ui-review；同候选可复核原截图后续接，不重跑并错配截图。Desktop 消费端自校验输入，避免从应用模块 import 仓库控制器。CLI plan 支持显式 --ui-plan/--authorize-ui true；生成合同不启动 UI。
- 实际运行：UI 报告/程序合同、控制器的 runtime→等待视觉→独立评审→缓存复核，以及语法修复基线已验证；最终测试/检查结果汇总见 VERIFY-0019。
- 未运行及原因：本机未见完整 Playwright Chromium 缓存，未获当前任务 UI 启动授权，未启用真实 Provider。
- Worktree：main 串行。
- 剩余风险：浏览器缺失、Electron 驱动兼容性和六主题人工视觉仍属后续验收。
