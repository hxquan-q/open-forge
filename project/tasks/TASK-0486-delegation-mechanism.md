---
id: TASK-0486
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0034
source: user-request-2026-11-16
related_requirement: [REQ-0034]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: task/TASK-0486-delegation-mechanism
worktree: unassigned（主工作区串行）
base_commit: 711311f9c
read_paths:
  - packages/coding-agent/src/composition/subagent/
  - packages/agent-team/src/contracts.ts
  - apps/desktop/src/main/conversations/
  - apps/desktop/src/main/agent-teams/
write_paths:
  - packages/runtime-subagents/src/
  - packages/coding-agent/src/composition/
  - packages/agent-team/src/
  - packages/plugins/plugin-sdk/
  - docs/plugin/
  - apps/desktop/src/main/
  - apps/desktop/src/renderer/
  - apps/desktop/src/shared/i18n/locales/
  - .github/release-notes/fragments/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-16
updated: 2026-11-16
---
<!-- Copyright The Open Forge contributors. -->

# 自适应流水线 P2：委任机制（有界内核扩展）

## 合同

- 来源与目标：REQ-0034。四件（roadmap §4 定稿）：件2 生命周期标记（合同层）→ 件3 下拉语义与会话分流 → 件1 内核动态注册与 spawn → 件4 能力标签（降级：LLM 读 responsibility 文本）。
- 输入 → 输出：AgentProfile/blueprint/manifest 增 `lifecycle`（缺省=主控/现状）→ worker 选中时默认会话保持驾驶+按域委派；成员按定义注册子代理类型；常驻成员 spawn 一次+followup 排队，重复 spawn 被拒。
- 做 / 不做：做内核+UI+合同全套与测试；不做跨会话/agent-bus、不动 ap-* 技能正文、不迁移存量预设标记、不做件4 标签、头像不进子代理快照（载荷考量，记 roadmap）。串行执行，无并行冲突。
- Given / When / Then：见 REQ-0034。
- 保留：未标记资产零行为变化；Team 会话链路不动；spawn 契约 v1 槽位不变；恢复降级语义不变；manifest fail-closed + PLUGIN_API_VERSION 推版。
- 验证：件1 合同测试（动态注册/spawn/守卫）、件2 状态转换测试（排队/不重复起实例）、件3 交互测试+i18n 零硬编码；`bun run test:pkg`/`run-vitest.mjs`；改动文件 check:quick → test:impact → 收尾完整 `bun run check`。
- 人工验收：用户手动 `bun run dev` 实机验证（选 worker agent/团队→委派行为、常驻排队、有主控团队不变）。

## 实施切片

1. 件2-合同：agent-team contracts/validation + store + manifest-schema + presets 解析 + reconcile + 插件合同五件套（手册/CHANGELOG/SDK patch/PLUGIN_API_VERSION 2.13.0/合同测试）+ Agent Center 编辑器 UI + i18n。
2. 件3-主进程：session-agent-profile 双态解析（persona 接管 vs 委任束）+ 委任指引构建 + 团队成员解析 + binding 记录 + resolve-session-config 透传。
3. 件3-渲染层：worker 团队目标走普通会话链路（delegationTeamId）+ 下拉文案 i18n + 路由测试。
4. 件1-内核：CodingAgentDelegatedMember 合同 + session options 校验 + per-session 注册表 + spawn 守卫 + displayTitle（runtime-subagents 小改）+ 合同测试。
5. 收尾：发布说明碎片、完整 check、索引同步、roadmap 更新。

## 交付

（完成后回填：实际修改、验证命令与结果、未运行项、发布说明、风险。）
