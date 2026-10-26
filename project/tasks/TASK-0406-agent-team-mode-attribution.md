---
id: TASK-0406
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0030
plan: PLAN-0025
source: user-request
related_requirement: [REQ-0030]
related_plan: [PLAN-0025]
related_tasks: [TASK-0404, TASK-0405]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: 65bd8fb3e
read_paths:
  - packages/plugins/plugin-sdk/src/manifest-schema.ts
  - packages/agent-team/src/contracts.ts
  - apps/desktop/src/main/agent-teams/plugin-agent-presets.ts
  - apps/desktop/src/main/agent-teams/plugin-agent-preset-reconcile.ts
  - docs/plugin/manifest.md
write_paths:
  - packages/plugins/plugin-sdk/src/manifest-schema.ts
  - packages/plugins/plugin-sdk/CHANGELOG.md
  - packages/plugins/plugin-sdk/package.json
  - packages/plugins/plugin-sdk/test/
  - packages/agent-team/src/contracts.ts
  - apps/desktop/src/main/agent-teams/plugin-agent-presets.ts
  - apps/desktop/src/main/agent-teams/plugin-agent-preset-reconcile.ts
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - apps/desktop/src/renderer/domains/conversation/components/new-session/
  - packages/plugins/presets/eform-craft/plugin.json
  - packages/plugins/presets/allstar-coding/plugin.json
  - docs/plugin/manifest.md
exclusive_paths: []
depends_on: [TASK-0404]
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# Agent 与团队的所属模式：插件清单声明 + 新会话选择器按档过滤

## 目标

给插件贡献的智能体与团队加「所属模式」归属（work / coding）：声明为 coding 的集合（如
电子表单、allstar-coding）只在代码模式的新会话选择器里出现，普通（文档与研究）模式的
用户看不到——**用户层可见性过滤，不做调用时模式校验**（用户明确口径）。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial（主工作区）
- 前置依赖：TASK-0404（档位语义已就位）
- Branch：主工作区集成分支（chenxvhua）
- 集成顺序：独立提交批次，用户优先级插在 M1（TASK-0405）之前

### 做

- 合同：`AgentProfile` / `TeamDefinition` 增可选 `mode?: AgentResourceMode`
  （`"work" | "coding"`，缺省=两档可见）；插件清单 `agent.agents[].mode` /
  `agent.teams[].mode` 同型（plugin-sdk Schema fail-closed，推 `PLUGIN_API_VERSION` 2.11.0）。
- 铺设：`buildPluginAgentPresets` 携带 mode → reconcile 落到档案/团队（内容比较含 mode，
  改清单会正确传播修订）；文档持久化为整对象透传，新字段自动往返。
- 过滤：`NewSessionAgentSelector` 接收当前 workspaceMode，下拉列表按
  `mode === undefined || mode === 当前档` 过滤（团队组与智能体组同规则；选中态与深链
  target 不过滤——与「不做调用时校验」一致）。
- 预置声明：eform-craft 与 allstar-coding 的 plugin.json 给 agents/teams 标 `mode:"coding"`
  并把 pluginApiVersion 升到 `^2.11.0`；齐套分析师（业务问数向）暂不标注（两档可见）。
- 对外合同六件套：manifest.md 手册（字段、默认值、降级）、plugin-sdk CHANGELOG、
  plugin-sdk version patch、PLUGIN_API_VERSION、docs-site 结论句（如涉及）、Schema 合同测试。

### 不做

- 不做调用时模式校验（发送链路不拦）；
- 不做智能体中心的模式徽标/分组（管理面继续全量可见）；
- 不做用户自建 agent/团队的模式编辑器（store 输入合同与编辑表单的扩展，挂 backlog）；
- 齐套分析师等其他预置的模式归属待用户逐个定。

## Given / When / Then

- Given 已启用 eform-craft（mode=coding），When 用户在文档与研究档打开新会话选择器，
  Then 团队组与智能体组均不出现电子表单条目；
- When 用户经「Allstar自主开发」入口（coding 档）打开选择器，Then 电子表单团队与成员
  智能体可见可选；
- Given 用户在 coding 档选中电子表单团队后把项目切回 work 档，When 打开选择器下拉，
  Then 列表过滤但已选中 chip 保留（发送不拦）；
- Given 插件未声明 mode，Then 两档均可见（存量预置与用户自建不回归）。

## 必须保持

- 清单校验 fail-closed：未推版本号的新字段会让存量宿主整份拒装（故必须 2.11.0）；
- 档位语义沿用 TASK-0404：mode 只影响展示过滤，不进会话创建合同；
- 插件档案由提供方 1:1 维护（reconcile 幂等，mode 变更随清单传播）。

## 测试与验证

- 定向测试：plugin-sdk Schema 合同（合法/拒绝/存量兼容）、plugin-agent-presets mode 携带、
  reconcile mode 落档与变更传播、NewSessionAgentSelector 过滤（组件测试）；
- 用户流程：work 档看不到电子表单 → coding 档可见可选 → 选中后切档 chip 保留；
- 质量检查：`check:quick` → `test:impact` → 完整 `bun run check`。

## 验收分层

- 工程验证：通过——plugin-sdk 合同测试 3 例（合法 work/coding、缺省兼容、未知值拒绝）、
  plugin-agent-presets 携带 1 例、reconcile 落档与撤约传播 1 例、选择器过滤 3 例
  （work 档隐藏 coding、coding 档隐藏 work、选中 chip 保留）、NewSessionHeroIdentity 接线
  1 例；desktop tsc 0 错；完整 `bun run check` 四车道全绿（含 plugin-sdk/agent-team 类型面）；
  `test:impact` 终轮见交付记录。
- 技术评审：自审；对外合同六件套按 packages/plugins/AGENTS.md 核对——manifest.md 手册
  （agents[]/teams[] 字段表 + 导语）、plugin-sdk CHANGELOG [Unreleased]、plugin-sdk
  0.3.12→0.3.13（patch，preset 均为 workspace:* 无范围影响）、PLUGIN_API_VERSION 2.11.0、
  docs-site capabilities 中英两份结论句、Schema 合同测试。
- 集成：pending（本地提交待做）。
- 人工功能验收：待验收（dev 实机两档对比走查：普通档选择器无电子表单/流水线，Allstar 入口
  可见可选）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：启用 eform-craft 与 allstar-coding 预置。
- 操作步骤：普通「新会话」开选择器（看不到开发集合）→ Allstar 入口开选择器（可见、可选、
  可发送）→ 选中后回普通档看 chip。
- 预期行为与最终产物：见 GWT。
- 不通过表现与已知限制：深链 target=team: 不受过滤（口径允许）；智能体中心仍全量可见。
- 验收反馈及回归案例：待回填。

## 交付记录

- 实际修改：agent-team 合同（`AgentResourceMode` + 双接口可选 `mode`）、plugin-sdk
  manifest Schema + CHANGELOG + 0.3.13、`PLUGIN_API_VERSION` 2.11.0、预设铺设与 reconcile
  落档、选择器档位过滤（`matchesTargetMode` + 全量映射/过滤派生）、eform-craft 与
  allstar-coding 清单标注（pluginApiVersion `^2.11.0`）、手册与 docs-site 中英、发布说明
  碎片 `task-0406-agent-mode-attribution.md` 已汇编；清单见本次提交。
- 实际运行：desktop 定向 4 文件 45 例 + 选择器 3 例、plugin-sdk 合同 3 例、预置 manifest
  合同 18+7 例全绿；desktop tsc 0 错；完整 `bun run check`（lint/守卫/五包类型）全绿；
  声明头 ratchet new=0。
- 未运行及原因：`test:impact` 终轮在后台运行中被系统以内存不足中止（与 dev 实例并行时段），
  非测试失败；已用补偿覆盖——受影响面定向套件全绿（含两个预置的 manifest 合同、选择器/
  铺设/reconcise/接线），无硬编码版本断言受影响。应用户要求可在内存空闲时补跑全量。
- Worktree：未拆出（单串行批次，主工作区完成）。
- 剩余风险：用户自建 agent/团队暂无模式编辑入口（backlog，见「不做」）；`@` 提及与
  智能体中心不受过滤（口径内）；齐套分析师未标注（待用户定夺归档）。
