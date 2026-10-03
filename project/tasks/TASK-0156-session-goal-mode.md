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
updated: 2026-10-03
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
