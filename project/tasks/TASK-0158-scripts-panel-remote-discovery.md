---
id: TASK-0158
type: task
status: draft
priority: P2
owner: plugins + capability-sdk + desktop filesystem + ssh-helper
source: user-request; upstream 8c6872ac8, bb3a23ef8, 7a7af9cea, 1e7071c0e, 7fdc02a06, 7910ce57f
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0148, TASK-0167]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport, apps/ssh-helper, packages/capability-sdk, packages/plugins, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/preload, apps/desktop/src/renderer/domains/plugins]
write_paths: [packages/ssh-transport, apps/ssh-helper, packages/capability-sdk, packages/plugins, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/preload, apps/desktop/src/renderer/domains/plugins, project/tasks/TASK-0158-scripts-panel-remote-discovery.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/ssh-transport]
depends_on: [TASK-0153, TASK-0148, TASK-0167]
conflicts_with: []
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 脚本面板与远端文件名筛选

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：8c6872ac8, bb3a23ef8, 7a7af9cea, 1e7071c0e, 7fdc02a06, 7910ce57f。

names 在远端截断前过滤，兼容旧 helper；全链路 schema/IPC/SDK 接线后接脚本面板与终端权限。保留远端 cwd、脚本展示/授权、现有插件品牌与打包方式；重开不自动重跑。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

大仓库 limit 后 manifest、旧 helper/fallback、非法名字；本地/SSH 正常插件入口；同脚本不重复启动、权限拒绝、重新打开只恢复布局。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0153, TASK-0148。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## SSH 专项拆分

远端 names/ignoredDirectories 底层与公共接线单独归 TASK-0167，本 Task 等待其交付后消费，不重复实现该能力。这里原有宽 write_paths 是 draft 候选，正式开工缩为脚本面板实际消费者。
