---
id: BUG-0040
type: bug
status: verifying
priority: P1
owner: apps/desktop renderer (agent-teams domain)
requirement:
plan:
source: 实机验收中通过 UI 新建智能体后观察到能力为 0/83
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 新建智能体未打开「能力」tab 时静默落盘为零能力（custom + 空清单）

## 用户流程

- Given：用户在智能体中心点「创建智能体」
- When：只填写名称 / 提示词后直接保存，从未打开「能力」tab
- Then：新智能体应获得与所选蓝图一致的能力（preset-agent 系蓝图默认为 `selectionMode: "all"`）

## 实际行为

落盘的 `agent.json` 为 `abilities: { selectionMode: "custom", skills: [], mcpServers: [], plugins: [] }`——能力面板显示「已启用 0/83」，该智能体运行时没有任何工具可用。界面上无任何提示说明零能力的后果。

## 期望行为

创建草稿的能力初始值应跟随所选蓝图默认（对 preset-agent 系即 `selectionMode: "all"`），或在保存时提示用户当前为「未启用任何能力」。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：`main` @ `ef35dcf1b`（Desktop dev 构建，profile `openforge-dev-04987e4e`）；Windows 11
- 观察路径：智能体中心 → 创建智能体 → 填名称+提示词 → 保存 → 编辑器能力 tab 显示 `0/83`，磁盘 `agent.json` 为 `custom`+空清单

## 最小复现

1. 智能体中心点「创建智能体」，填名称后保存（不打开能力 tab）
2. 查看 `~/.openforge-dev/agent-teams/agents/<name>--<id>/agent.json` 的 `abilities` 字段

## 影响

用户按直觉路径创建的智能体是「无手」状态：能被入队、能被 @，但会话中调不出任何工具/Skill/MCP。无任何 UI 信号，用户很难归因。

## 根因证据

- `AgentProfileSheet.tsx` `buildDraftAgent()` 把草稿能力写死为 `{ selectionMode: "custom", skills: [], mcpServers: [], plugins: [] }`。
- `useAgentCenterModel.createAgentFromDraft`：先 `createAgent()`（蓝图默认 `all`），随后无条件 `updateAgent(abilities: input.abilities)` 用草稿空选择覆盖蓝图默认。
- `agent-team-store.ts` `createAgentAbilities` 本身语义正确（`input` 缺省时回退蓝图默认）；问题完全在 renderer 草稿种子 + 无条件回写。

## 回归测试

- 组件层：构造「创建智能体」表单，保存时断言 `updateAgent` 收到的 `abilities.selectionMode === "all"`（或对蓝图非 `all` 默认时跟蓝图），覆盖「未触碰能力 tab」路径。
- 若改为「触碰后才有 selectionMode」，可加一例：用户在能力 tab 勾掉一项后保存仍为 `custom`。

## 修复与验证

- 修复：采用方案（a）——`buildDraftAgent` 以 `blueprint.defaultAbilities` 播种草稿能力（克隆数组与 extensions），用户未碰能力 tab 时保存即落盘蓝图默认；`useAgentCenterModel.createAgentFromDraft` 的回写链路不变。
- 测试：`AgentProfileSheet.test.tsx` 新增两条组件用例——「未打开能力 tab 直接保存 → `onCreate` 收到 `selectionMode: "all"`」（旧实现收到 `custom`+空清单，红色确认）；「能力 tab 中取消勾选一项后保存 → `custom` 且该项缺席」。同领域 44 个测试文件 307 用例全绿。
- 检查：定向 vitest 通过；`check:quick`/`check` 待随提交前执行。
- 未运行及原因：实机复验未跑（需 `verify:ui:*`，待用户授权）。
