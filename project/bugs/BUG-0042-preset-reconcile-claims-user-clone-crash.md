---
id: BUG-0042
type: bug
status: verifying
priority: P1
owner: apps/desktop main (agent-teams preset reconcile)
requirement:
plan:
source: dev 重启后主进程日志持续刷 `Duplicate library agent handle: master`，agent-teams:list IPC 全部失败
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-27
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# 用户从预设蓝图新建的智能体被预设调和抢走，撞 handle 判废整份配置

## 用户流程

- Given：用户从某个预设蓝图（如主控/master）新建了自建智能体，或库中已存在该预设的提供方档案
- When：应用启动或任意时刻读取智能体配置（`installPresets` 每次读都跑调和）
- Then：自建档案原样保留，预设档案正常就位，列表可用

## 实际行为

主进程日志周期性抛 `Duplicate library agent handle: master`，`vetta:agent-teams:list` 处理器持续失败，智能体中心列表整体不可用；调和产出的文档过不了 `parseAgentTeamDocument` 的 handle 唯一性校验，写盘从未发生，于是每次读取都重犯。

## 期望行为

用户自建档案即使与预设共享 blueprintId 也不被预设认领改写；调和产出的文档始终满足 handle 唯一性不变量。

## 环境与失败证据

- `main` @ dev 重启（commit 7968cbaef 之后），数据目录 `~/.openforge-dev`
- 库中 6 份档案 `blueprintId: plugin:preset-agent:master`：1 份已盖章的 `主控`（source=plugin/preset-agent，id=确定性 id）+ 5 份用户自建（馆长/守界人/采编/史官/工匠，source 缺省）
- `readAgents` 按目录名 localeCompare 排序，`新智能体--*`（拼音 xin）排在 `主控--*`（zhu）之前

## 根因

`matchesAgentPreset` 用 `agent.blueprintId === preset.blueprint.id` 认领档案，无法区分「待接管的老档案」与「用户从蓝图新建的自建档案」——两者都是 `source` 缺省 + 当前 blueprintId。`findPresetAgent` 命中排序在前的克隆后，`presetAgentProfile` 把它改写成预设 handle，与真身并存即撞库。

## 修复与验证

- 修复：`matchesAgentPreset` 改为分层认领——确定性 id 命中、提供方戳回认（pluginId + blueprint/legacy id）优先；未盖章档案只按历史 blueprint id 认领，当前 blueprintId 不再构成认领依据。
- 测试：`plugin-agent-preset-reconcile.test.ts` 新增两条——共享蓝图的用户档案不被认领且预设照常落确定性档案；已盖章实例与克隆共存不产生重复 handle。旧实现下两条均红。
- 未运行及原因：`verify:ui:*` 实机验收未跑（需用户明确授权）。
