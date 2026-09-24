---
id: PLAN-0008
type: plan
status: done
priority: P1
owner: packages/agent-team/apps/desktop
requirement: REQ-0006
source: RESEARCH-0008
created: 2026-09-24
updated: 2026-09-24
related_tasks: [TASK-0069, TASK-0070, TASK-0071]
related_issues: [ISSUE-0012, ISSUE-0013, ISSUE-0014]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent Team 编排协作对齐施工计划

## 目标 Requirement

[`REQ-0006`](../requirements/REQ-0006-agent-team-orchestration-alignment.md)：委派交接结构化、聚合视图成员标注、成员 handle 团队内改名。

## 当前事实与约束

- 证据与差距判定见 [`RESEARCH-0008`](../research/RESEARCH-0008-multi-agent-orchestration-comparison.md)；核心可靠性机制已对齐，不动。
- 提示词合同（`operating-context.ts`）进入 `teamRosterFingerprint`，任何措辞变更都会让既有会话全体成员的提示词一次性重建——预期行为，交付时要写明。
- 聚合视图归属 Runtime 已按行携带（ADR-0111 决策 2），只是 `collectRuntimeItems` 在 model 层丢弃；标注属展示层增强，不触碰按行路由合同。
- `TeamMember.handle` 改名触碰 `UpdateTeamInput` 公共合同与团队存储；名册指纹机制使提示词重建自动生效，无需第二条路径。
- 工作区并行约束：本轮串行执行（本会话主工作区），`packages/agent-team`、`apps/desktop` team 相关路径与在途并行改动无交集；activity-panel 内他人改过的文件（canvas-tab、TaskArtifactPreview、useCanvasTabModel）不得触碰。
- 发布说明门禁：首发版本 `0.1.0` 尚未切入 manifest，用户可感知条目的候选文案留在 Task 交付记录。

## 候选方案与取舍

- 交接结构化走「工具描述 + 团队纪律提示词」而非 objective schema 化字段：零合同变更、可随实践迭代；schema 化被否（RESEARCH-0008）。
- 成员标注走「工作空间携带 runtimeId→显示名映射 + 行级徽标」而非新建跨会话总览面板：复用既有聚合与路由合同，改动最小。
- handle 改名放开 `UpdateTeamInput` 已有成员条目的 `handle` 可选字段，复用 create 侧校验（格式/团队内唯一）；ADR-0109 的「不在范围」清单随之修订，不新建 ADR。

## 阶段与依赖

```text
Phase A  TASK-0069 结构化委派交接与编排纪律（packages/agent-team 纯合同包）
Phase B  TASK-0070 聚合视图成员标注（apps/desktop renderer + 共享工作空间合同）
Phase C  TASK-0071 成员 handle 团队内改名（contracts/validation/store/UI）
决策门   ISSUE-0012 能力收窄交互 / ISSUE-0013 动态增员与子代理边界 / ISSUE-0014 共享 cwd 写防护
         （任一裁决后另拆 Task，形成后续阶段 D+）
```

A/B/C 无相互依赖，但共享同一执行人与验证闭环，本轮按 A→B→C 串行；三者在 `packages/agent-team/src/contracts.ts`、`validation.ts` 上有潜在小交集（B 不碰合同包，C 碰），串行可避免自我冲突。

## 不做什么

- 不改 ADR-0103「subagent 永远不是 Team 成员」契约，不在 Team 会话内引入动态增员或成员子代理；
- 不做能力团队内收窄（等 ISSUE-0012 交互裁决）；
- 不做跨会话任务总览、观察事件消费 UI、任务书模板化/市场分发；
- 不动 `team-session-concurrency.test.ts` 已锁定的并发/恢复语义。

## 验证、回滚与升级信号

- 每个 Task：定向测试（agent-team 包套件 / renderer 组件测试）+ `check:quick`；C 轮完成后跑一次完整 `check` 与 `test:changed`（合同包被多包消费）。
- 回滚单位 = 单 Task 的单 commit（pathspec 限定）；A 的回滚只影响提示词文本，B/C 各自独立。
- 升级信号：用户反馈委派仍不自包含 → 复核工具描述措辞与纪律条目密度；标注信息过噪 → 收窄为仅多成员工作空间显示（首版即如此）；handle 改名引发提及混乱 → 复核唯一性校验与历史消息兼容。

## ADR 评估

- Phase A/B 无架构决策；Phase C 在 ADR-0109「不在本决策范围」清单中把 handle 改名一条改为指向 TASK-0071 的已实现注记（同变更内完成，不改写其余决策）。
