---
id: TASK-0162
type: task
status: verifying
priority: P1
owner: desktop knowledge + coding-agent
source: user-request; upstream c419c6ef7
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: [BUG-0055]
execution: parallel
branch: task/TASK-0162-knowledge-prompt-source
worktree: ../open-forge-wt/task-0162-knowledge-prompt-source
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/main/knowledge/processing-session-factory.ts, apps/desktop/src/main/knowledge/processing-session-factory.test.ts, packages/coding-agent/src/composition/knowledge-processing-session.ts, packages/coding-agent/test/knowledge-processing-session.test.ts, packages/coding-agent/test/knowledge-processing-batches.test.ts]
write_paths: [packages/coding-agent/README.md, packages/coding-agent/test/fixtures/prompt-runtime-sources.ts, apps/desktop/src/main/knowledge/processing-session-factory.ts, apps/desktop/src/main/knowledge/processing-session-factory.test.ts, packages/coding-agent/src/composition/knowledge-processing-session.ts, packages/coding-agent/test/knowledge-processing-session.test.ts, packages/coding-agent/test/knowledge-processing-batches.test.ts, project/tasks/TASK-0162-knowledge-prompt-source.md]
exclusive_paths: [apps/desktop/src/main/knowledge/processing-session-factory.ts]
depends_on: [TASK-0148, TASK-0170]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 知识库加工提示词来源适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：c419c6ef7。

先核对本仓是否已提供 createPromptRuntimeSources；若已有等价修复，仅补证据不回退。缺失时从 Desktop 正常装配注入，保留知识库取消、批处理和会话隔离。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

手动整理与后台轮询使用真实工厂+假Provider、多批处理、暂停/取消；不以现有全量超时直接认定缺少来源。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：无。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 当前适配证据

本仓生产工厂确实遗漏来源，而测试包装器通过 resolveSystemPromptOptions 提供了替代默认值。新增失败断言同时守住 Desktop 注入与产品工厂转发，再以真实知识会话/批处理和假 Provider 验证。早期候选曾将回调设为必填；最终隔离版本保留可选输入以兼容已有 custom createComposition，Desktop 默认路径仍显式注入；无持久化迁移。定向 1 个 Desktop 装配测试和 3 个 Coding Agent 用户流程测试通过，完整影响面/检查待完成。

## 隔离与兼容评审后的合同

从 main 创建 Worktree，先装配已验证 TASK-0148（1020b7c59）作为依赖，再复制本 Task 候选，不带其他主树修改。源码自审发现：上游将新回调无条件设为必填，会破坏既有 custom createComposition 自行提供提示词的合法用法。隔离版本改为向后兼容的可选输入；Desktop 默认组合必须显式注入，并以装配回归守住；保留自定义组合器不传独立回调的原流程。不是通过忽略错误补默认宿主，也不引入新的持久化路径。

继续覆盖旧的自定义组合器+取消流程，以及新的来源注入/转发和真实批处理。共享导航和 release notes 由 Coordinator 在主检出维护，本 Worker 不修改共享文档；候选文案：修复知识库加工提示词来源装配，同时保留自定义组合器兼容路径。

## CLI 验证阻断分离

Coding Agent 全包 244 文件/1534 测试通过（3 既有跳过），Runtime Desktop 13 文件/51 测试通过，Desktop 876 文件/4624 测试通过（29 既有跳过）。CLI 默认并发回归失败，单 worker 的同一五文件 31 测试通过。另立 TASK-0170/BUG-0059 收口测试调度，不在知识库功能里更改 CLI 协议；完成前不宣称整体工程验收通过。

## 已提交隔离结果

提交 6cb373dde0ff25d60c322cbf153362896554471f，父依赖 TASK-0170/0148，未合入 main。定向与相关测试通过；影响面 Coding Agent 1534、Runtime Desktop 51、Desktop 4624 测试通过。CLI 初次并发失败未掩盖，经独立 TASK-0170 修正测试调度后，本 Task 标准 CLI 全包重跑 226 测试通过（14 既有跳过），最终完整 check 通过。各包证据和历史失败详见分支 Task，日志有退出标记。源码自审与发布文案完成，真实模型效果/用户验收未执行，保持 verifying。
