---
id: TASK-0156
type: task
status: verifying
priority: P2
owner: coding-agent + runtime-core + desktop
source: user-request; upstream 4f7cb6199, 685427410, b7b5e0b9f, 42c8a4c82
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0152, TASK-0155]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/coding-agent/src/features, packages/coding-agent/src/session-extensions, packages/runtime-core/src, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main/agent-runtime]
write_paths: [packages/coding-agent/src/features, packages/coding-agent/src/session-extensions, packages/runtime-core/src, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main/agent-runtime, project/tasks/TASK-0156-session-goal-mode.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/coding-agent/src/features]
depends_on: [TASK-0152, TASK-0155]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 持久化目标模式与输入栏适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：4f7cb6199, 685427410, b7b5e0b9f, 42c8a4c82。

目标作为会话扩展接入既有消息入口；输入栏复用、不再独立表单；支持暂停/恢复/清除、无进展受阻、用量状态；保留本仓预算/重试/取消和未完成会话提醒。重启后禁止静默续跑。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

新建/已有会话目标流、三轮无进展、预算/取消、恢复不重复轮次、持久化迁移；renderer 不引入 Provider；新增 ADR 对照既有无人值守计划。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0152, TASK-0155。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次）

- 实际修改（适配上游 4f7cb6199/685427410/b7b5e0b9f/42c8a4c82 与 RESEARCH-0022 §7 的 bc1b7812d/5da5286b8）：
  - coding-agent：features/goal/ 全量（contracts/extension/runtime/tools/snapshot/instructions/continuation-source 与 ADR-0144）；peripheral-assembly 装配、public-api 导出、model-tool-order 工具位；42c8 的续跑保护与工具收敛；bc1b 的 Gemini 空请求归类 INVALID_REQUEST、目标启动临时上下文、恢复态防旧写盘覆盖。
  - desktop：DesktopGoalController + session IPC 五通道；preload 类型与实现；useGoalModeModel（含 5da5 迟到回执竞态保护：请求期间目标被实时观察变更时回执不覆盖）、GoalModeDialog、输入栏动作入口、goal-atoms、控制器观察投影与中英文案。
  - 与上游分歧：42c8 的输入栏收敛 UI（主输入框直发目标、目标/待办紧凑状态行、删除对话框）未整体移植——本仓输入栏已深度分叉，保留对话框入口与 6854 交互；收敛留待后续按本仓设计规则实施。
- 实际运行：coding-agent goal 族 43/43（含 goal-execution 新套件与 google-adapters）；desktop goal 族 16/16 与竞态 3/3；test:impact 与完整 check 通过。
- 未运行及原因：真实模型的目标达成/无进展判定效果属 AI 质量层，未获 Provider 授权；不做视觉/实机验证。
- 剩余风险：无进展阈值沿用上游默认未实测调参；输入栏收敛未移植（功能路径完整）。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：隔离 Debug profile `04987e4e` 真实 UI 驱动 + 会话 JSONL 的 `goal_snapshot` 自定义条目（`<vettaHome>/conversation/.vetta/sessions/*.conversation.jsonl`）+ 夹具 provider 出站请求日志（含 `/control/empty` 空回合注入）。判据为验证合同六条。原始读数存档 `0156-goal-evidence-2026-10-08.txt`。

| 子句 | 实测结果 |
|---|---|
| 新建/已有会话目标流 | **成立**。技能/场景 → 目标模式 → 对话框只要求「目标」一个字段（`textarea[aria-label="目标"]`）+ 取消/开始执行；提交后输入栏出现胶囊 `button[title="目标模式 · 点击移除"]`，回合结束即自动续跑（实测 65 s / 60 次续跑）。在**已有会话**（`FAULT_MOCK_OK：`）上走同一入口同样成立。截图 `0156-goal-create-dialog.png`、`0156-goal-active-capsule.png`。 |
| 三轮无进展 → 受阻 | **成立**（本次触发的是「连续执行失败」计数分支）。夹具新增 `GET /control/empty?n=6` 注入空回合后，循环发出 6 个请求、呈 3 对（21:46:31.009/31.360、42.732/43.088、58.902/59.231Z，输入条目数 891/892，即上下文未重放），随后 `status: "blocked"`，`statusDetail`＝「Execution failed for three consecutive goal turns; review the failure before resuming」（revision 1347）；UI 状态栏读「受阻」并给出 继续目标/清除目标；其后 12 分钟零 provider 请求 ⇒ 循环确实停止。会话内三轮回合各有可见失败卡（「本次回复中断了／可以重新发送试试；反复出现的话把详情复制给我们／查看详情」）⇒ 失败可见。平行分支「连续无可观察进展」本轮未在 UI 构造（空回合被运行时判为回合失败），由单测覆盖：`packages/coding-agent/test/features/goal/goal-session-extension.test.ts:251`。 |
| 预算/取消 | **成立（按 ADR 口径）**。ADR-0144 明确「目标模式本身不设置 Token 预算」，实测确无上限续跑（前一目标累计 442 次续跑 / 6675 Token），属设计事实而非缺陷。取消侧：输入栏「停止生成」→ 当前回合中断、目标状态转为**已暂停**、请求立即停止（21:56:44.407Z 与 21:59:12.223Z 各一次，其后 12 分钟零请求），对话框随即给出「继续目标」。截图 `0156-goal-paused-dialog.png`。 |
| 恢复不重复轮次 | **成立**。受阻态点「继续目标」→ 状态回「执行中」，用量与续跑次数**原地接续**（6675 Token / 442 次，未清零、未重放）；随后只发出 6 个请求（3 轮 × 2）即再次受阻，输入条目数仍为 891/892 ⇒ 恢复没有重复既有轮次。单测另证：`packages/coding-agent/test/composition/continuation-orchestration.test.ts:351` 断言活跃目标恰好产生 1 条 `[ephemeral:goal]`，多一条即抛 `Unexpected extra goal continuation`。 |
| 持久化迁移/重启不静默续跑 | **成立**（沿用本组前段读数）。活跃目标下重启实例 → 状态自动转「已暂停」、`statusDetail`＝「Restored after the session stopped; resume explicitly to continue」、用量与次数原样（3930 Token / 261 次），重启后约 110 s 内零 provider 请求 ⇒ 未静默续跑。 |
| renderer 不引入 Provider | **成立（静态）**。`useGoalModeModel.ts` / `GoalModeDialog.tsx` 的 import 只有 react / jotai / i18n、shared atoms 与 UI，以及 `@vetta/coding-agent/session-extensions` 的**类型**；无 provider SDK、无 `@vetta/ai` 运行时依赖。 |
| 清除目标 | **成立**。清除后对话框关闭、输入栏胶囊消失、会话文档追加一条 `data: null` 的 `goal_snapshot`（revision 1603）；再次进入目标模式回到「目标 / 取消 / 开始执行」创建态。 |

- 未观测/未覆盖：①「连续无可观察进展」分支未在真实应用单独构造（需回合**成功**但无 assistant 活动；空回合被运行时归为失败），仅单测级证据；②每轮两个请求的成因未定论（观察为同一上下文 891→892 条目，疑似运行时对空回合的重试），本记录只作事实描述，不解释机制。
- 关闭建议：六条子句均有真实应用读数，倾向闭合为 `done`；按 VERIFY-0017 约定等用户裁定。
