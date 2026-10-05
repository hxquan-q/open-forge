---
id: TASK-0161
type: task
status: verifying
priority: P2
owner: desktop notifications
source: user-request; upstream 1794ef9db, 0afb42331
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0151]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/main/config, apps/desktop/src/main, apps/desktop/src/renderer/domains/settings, apps/desktop/src/shared/i18n]
write_paths: [apps/desktop/src/main/config, apps/desktop/src/main, apps/desktop/src/renderer/domains/settings, apps/desktop/src/shared/i18n, project/tasks/TASK-0161-desktop-notification-preferences.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/main/config]
depends_on: [TASK-0151]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Agent 通知与提示音适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：1794ef9db, 0afb42331。

只适配桌面通知/提示音，不引入手机通知、配对或中继；通知默认值须兼容本仓当前配置及用户选择，接现有事件去重和前后台行为。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

旧配置迁移、开关保存/重开、完成/等待/错误只提示一次、静音不影响业务事件。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0151。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次）

- 范围裁决：按用户决策绕开 TASK-0151 依赖直接实施——通知偏好只是 desktop-config 上的新字段组，读写走既有原子写路径；0187 批落地配置事务后自然兼容。采纳上游 0afb42331 终态（单一提示音开关+时机），不移植 1794ef9db 的逐事件音色中间态。
- 实际修改：SessionTurnNotificationController（终结状态折叠，failed 映射回本仓 notify 的 error）；notification-policy 按事件/时机判定投放；notification-service 偏好抑制+提示音命令；notification-sound-player（Audio 单例、内置 base64 WAV）；desktop-config schemaVersion 迁移框架（versioned-config future-fields）+notificationPreferences 规范化；preload 类型与 onSound；设置页通知分节与中英文案；root-layout onSound 播放接线。
- 实际运行：定向 580/580；test:impact 646+7skip；完整 check 通过。
- 未运行及原因：真实系统横幅/音频实机播放不做实机验证。
- 剩余风险：内置音色听感未人工评审；配置事务并发窗口为既有通用风险（0151 主题）。
