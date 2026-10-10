---
id: TASK-0162
type: task
status: done
priority: P1
owner: desktop knowledge + coding-agent
source: user-request; upstream c419c6ef7
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148, TASK-0170]
related_issues: []
related_bugs: [BUG-0055]
execution: parallel
branch: task/TASK-0162-knowledge-prompt-source
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/main/knowledge/processing-session-factory.ts, apps/desktop/src/main/knowledge/processing-session-factory.test.ts, packages/coding-agent/src/composition/knowledge-processing-session.ts, packages/coding-agent/test/knowledge-processing-session.test.ts, packages/coding-agent/test/knowledge-processing-batches.test.ts]
write_paths: [packages/coding-agent/README.md, packages/coding-agent/test/fixtures/prompt-runtime-sources.ts, apps/desktop/src/main/knowledge/processing-session-factory.ts, apps/desktop/src/main/knowledge/processing-session-factory.test.ts, packages/coding-agent/src/composition/knowledge-processing-session.ts, packages/coding-agent/test/knowledge-processing-session.test.ts, packages/coding-agent/test/knowledge-processing-batches.test.ts, project/tasks/TASK-0162-knowledge-prompt-source.md]
exclusive_paths: [apps/desktop/src/main/knowledge/processing-session-factory.ts]
depends_on: [TASK-0148, TASK-0170]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-09
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

本仓生产工厂确实遗漏来源，而测试包装器通过 resolveSystemPromptOptions 提供了替代默认值。新增失败断言同时守住 Desktop 注入与产品工厂转发，再以真实知识会话/批处理和假 Provider 验证。早期候选将回调设为必填；后续兼容评审已否决这一点，最终为可选的新输入，Desktop 默认组合仍显式提供它。README 已记录两种宿主路径，无持久化迁移。定向 1 个 Desktop 装配测试和 3 个 Coding Agent 用户流程测试通过，完整影响面/检查待完成。

## 隔离与兼容评审后的合同

从 main 创建 Worktree，先装配已验证 TASK-0148（1020b7c59）作为依赖，再复制本 Task 候选，不带其他主树修改。源码自审发现：上游将新回调无条件设为必填，会破坏既有 custom createComposition 自行提供提示词的合法用法。隔离版本改为向后兼容的可选输入；Desktop 默认组合必须显式注入，并以装配回归守住；保留自定义组合器不传独立回调的原流程。不是通过忽略错误补默认宿主，也不引入新的持久化路径。

继续覆盖旧的自定义组合器+取消流程，以及新的来源注入/转发和真实批处理。共享导航和 release notes 由 Coordinator 在主检出维护，本 Worker 不修改共享文档；候选文案：修复知识库加工提示词来源装配，同时保留自定义组合器兼容路径。

## 兼容性 red/green

复核旧 custom createComposition 用法后，移除该分支测试中新加的冗余回调；`bun x tsgo --noEmit` 在早期必填候选上以 TS2741 失败，证明它会破坏已合法的宿主调用。最终选用可选的新字段，默认 Desktop 路径仍由装配测试强制验证来源注入；缺模型原错误与不调用 Provider 的合同同时保留。

## CLI 前置项装配与最终复核

已快进装配 TASK-0170 的验证提交 769f31bc3，合入前后本 Task 8 个候选文件 SHA-256 全部一致；没有覆盖自身代码或主树 WIP。此依赖只调整测试文件调度，CLI 产品代码不变。此前 test:changed 的 Coding Agent/Runtime Desktop/Desktop 全包均已通过，CLI 为唯一失败面；现按标准入口重新执行完整 CLI 包与完整 check，保留首次失败日志，不伪造其退出码。

## 最终隔离交付

- 生产工厂注入与产品工厂转发均有旧实现失败测试；保留 custom createComposition 不提供额外回调的合法用法，先以 TS2741 复现必填候选的兼容破坏，再通过可选新增字段修正。
- test:impact：Coding Agent 直接 3/相关 14 测试、Desktop 装配 1/相关 3 测试通过。
- test:changed 已执行所有受影响包：Coding Agent 244 文件/1534 测试通过（3 既有跳过）、Runtime Desktop 13 文件/51 测试通过、Desktop 876 文件/4624 测试通过（29 既有跳过）。原 CLI 并发失败日志保留。
- 装配已验证 TASK-0170 后，在本 Task 完整源码上通过标准 `bun run --cwd apps/cli-host test` 重跑完整 CLI：50 文件/226 测试通过（1 文件/14 测试既有跳过），非仅重跑失败子集。此前其余包生产源码未变化，保留同一固定版本的通过证据。
- 最新完整 `bun run check` 全部通过。结果与退出标记保存在本机临时目录 openforge-task0162-final-verification-20261002.log(.exit)。
- 源码自审完成；仅补装配来源，不引入本地文件系统到产品层，不修改会话/知识持久化、工具权限或取消路径。
- Coordinator 已追加主检出发布说明。工程验证通过，真实知识加工模型效果未验收；保持 verifying，集成 pending、未推送未发布。

## 已提交隔离结果

提交 6cb373dde0ff25d60c322cbf153362896554471f，父依赖 TASK-0170/0148，未合入 main。定向与相关测试通过；影响面 Coding Agent 1534、Runtime Desktop 51、Desktop 4624 测试通过。CLI 初次并发失败未掩盖，经独立 TASK-0170 修正测试调度后，本 Task 标准 CLI 全包重跑 226 测试通过（14 既有跳过），最终完整 check 通过。各包证据和历史失败详见分支 Task，日志有退出标记。源码自审与发布文案完成，真实模型效果/用户验收未执行，保持 verifying。


## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0162-knowledge-prompt-source；来源提交：6cb373dde0ff25d60c322cbf153362896554471f。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0162。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：验证合同写的是「手动整理与后台轮询使用**真实工厂 + 假 Provider**、多批处理、暂停/取消」，全部可在本机以假 Provider 完成，故本轮在主检出把这条链的装配面与用户流程面都跑了一遍，并核对「可选字段」的兼容取舍确实落在最终代码里。

| 子句 | 覆盖用例与本次读数 |
|---|---|
| 真实工厂 + 假 Provider | `apps/desktop` 装配测试 `src/main/knowledge/processing-session-factory.test.ts` **1 例通过**：断言 `createKnowledgeProcessingSessionFactory` 被调用时 **`createPromptRuntimeSources` 等于 `createDesktopPromptRuntimeSources`**——旧实现漏传时为 `undefined`，该断言必然红，即这是一条真的 red/green 守卫。 |
| 手动整理 / 后台轮询 | 本轮追加复跑 `apps/desktop` 的 `knowledge-round-controller.test.ts` + `poller.test.ts` **2 文件 5 例全绿**：「runs real multi-batch knowledge operations and records successful side effects」「uses the shared model service for Knowledge processing」。 |
| 多批处理 | `packages/coding-agent` 的 `knowledge-processing-batches.test.ts` **通过**（「matches the existing writer baseline while concurrent sessions share one write session」）；另 desktop 轮询控制器的「preserves partial writes but skips final reconciliation after a batch failure」同属该面。 |
| 暂停 / 取消 | desktop 轮询控制器「**aborts the active session**, skips queued batches, and completes cleanup without failure accounting」与「stops scheduling once, waits for the active round, and unlocks raws idempotently」；coding-agent 会话测试的 disposal 段。 |
| 会话隔离与缺模型原错误 | `knowledge-processing-session.test.ts` **通过**：「keeps custom-composition hosts **without** a separate source callback and preserves missing-model errors」「preserves model refresh, locked todos, injected writer, usage, and disposal」。 |

- 源码核对（本轮独立复核交付记录的两条关键取舍）：① **兼容路径成立**——`packages/coding-agent/src/composition/knowledge-processing-session.ts:31` 的 `createPromptRuntimeSources?` 是**可选**属性，`:67` 仅做透传，自定义 `createComposition` 宿主不传独立回调的合法用法未被破坏（交付记录称必填候选会以 TS2741 破坏宿主调用，最终改回可选——代码现状与之一致）。② **生产路径确实注入**——`apps/desktop/src/main/knowledge/processing-session-factory.ts:34` 显式传 `createDesktopPromptRuntimeSources: createDesktopPromptRuntimeSources`。即「不靠忽略错误补默认宿主」这一点在代码级可验。
- 未复跑（不宣称通过）：交付记录里的全量影响面数字（Coding Agent 1534、Runtime Desktop 51、Desktop 4624、CLI 226）不追平，本轮只跑覆盖本合同的 4 个定向文件（4 例）+ 追加的 2 个知识域文件（5 例）；`test:changed` 与完整 `check` 未重跑。
- 未运行及原因：**真实知识加工模型效果**——合同明令「只 Mock 外部边界，不访问真实用户状态或付费服务」，且需真实 Provider；用户验收面。
- 关闭建议：合同四条（真实工厂+假Provider、多批处理、暂停/取消、不以全量超时归因）在测试级全部成立，且兼容取舍与注入路径都能在源码里指认 ⇒ **倾向闭合 `done`**，模型效果另属 AI 质量评估层。按 VERIFY-0017 约定等用户裁定。

### 用户裁定闭合（2026-10-09，VERIFY-0017 分档口径）

按用户「**按未覆盖成因分档**」口径裁定：本 Task 的验收层级**由合同自身限定**，据此闭合。

- 验证合同原文写明「使用**真实工厂 + 假 Provider**」「只 Mock 外部边界，**不访问真实用户状态或付费服务**」⇒ 真实知识加工的模型效果被合同明确排除，不属本任务的验收对象（另属 AI 质量评估层）。
- 可及范围内证据：合同四条全部在测试级成立——装配守卫 `processing-session-factory.test.ts:1`（漏传必红）、知识域轮询/批处理/暂停取消 7 例、会话隔离与缺模型原错误；且两条关键取舍在源码指认（可选字段兼容路径 `knowledge-processing-session.ts:31/:67`、生产显式注入 `processing-session-factory.ts:34`）。
- 如实标注：交付记录的全量影响面数字（1534/51/4624/226）本轮不追平，只跑覆盖本合同的定向面；`test:changed` 与完整 `check` 未重跑。
