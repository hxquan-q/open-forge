---
id: TASK-0071
type: task
status: done
priority: P1
owner: packages/agent-team + apps/desktop
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008 差距表「成员 handle 队内改名」（ADR-0109「不在本决策范围」第 2 项的落地）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/agent-team/src, apps/desktop/src/main/agent-teams, apps/desktop/src/renderer/domains/agent-teams, docs/adr/0109]
write_paths: [packages/agent-team/src/contracts.ts, packages/agent-team/src/validation.ts, apps/desktop/src/main/agent-teams/agent-team-store.ts, apps/desktop/src/renderer/domains/agent-teams, apps/desktop/src/shared/i18n/locales, docs/adr/0109]
exclusive_paths: []
depends_on: [TASK-0070]
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 团队成员 handle 的队内改名

## 目标

ADR-0109 落地任务书时把「成员 handle 队内改名」留在决策范围外（只在入团时确定）。同一位 Agent 被拉进多支团队时 handle 只能沿用本体 mentionHandle，两支团队同成员撞名只能靠 `-2` 后缀，用户无法按团队语境起有意义的称呼（对齐 pi/Cursor 的 worker 命名自由度）。本任务把 `UpdateTeamInput` 既有成员变体放开可选 `handle`，store 侧复用 `assertTeamInvariants` 的非空与队内唯一校验，团队设置抽屉提供成员行编辑入口。

## 范围

### 并发评估

- 结论：不支持（协议、Store 与 UI 串行耦合；与并行会话不共占 agent-teams 域文件）
- 集成顺序：PLAN-0008 Phase C，依赖 TASK-0070 已合入

### 做

1. 协议：`UpdateTeamMemberInput` existing 变体新增 `readonly handle?: string`（省略 = 本次没碰，语义与 assignment 省略一致）；`validation.ts` 对应变体加 `handle: Type.Optional(id)`。
2. Store：`agent-team-store.updateTeam` existing 分支 `handle: memberInput.handle?.trim() ?? member.handle`；非空与队内唯一（normalizeMentionHandle 归一化比较、排除自身）由既有 `assertTeamInvariants` 兜底拒绝。
3. 提示词联动：handle 渲染进共享名册 → `teamRosterFingerprint` 自动翻动 → 成员提示词按既有指纹机制重建，不需要新代码（交付记录注明依据）。
4. UI：`TeamAssemblyDraft` 增加 `handles`（agentId → 队内称呼）；`assemblyDraftFromTeam` 读回；`buildUpdateTeamInput` 仅在草稿值与现值不同（trim 后）时携带 handle；`TeamSettingsSheet` 成员卡片显示当前 `@handle` 并提供行内编辑（空值/队内撞名即时提示，应用按钮禁用），dirty 判定纳入 handles。
5. i18n：`agent-teams.json` zh/en 新增队内称呼相关文案。
6. ADR-0109：「不在本决策范围」第 2 项标注已由本任务落地。
7. 测试：validation 接受/拒绝 handle；store 改名成功（revision bump）与撞名拒绝；team-assembly 只在变更时携带 handle；TeamSettingsSheet 编辑 handle → 保存输入带新 handle。

### 不做

- 不改 `CreateTeamInput`（新建时 handle 仍取本体 mentionHandle + unique 后缀）；
- 不做跨团队 handle 全局唯一（队内唯一即协议要求）；
- 不改 mention 解析、共享历史与消息投递的 handle 匹配（全部走 `resolveMemberByHandle` 的归一化比较，改名后旧 @mention 文本不再命中属预期）；
- 不做成员视图路由兼容（`memberViewId` 是 memberId，与 handle 无关）。

## Given / When / Then

- Given 用户已拥有一支团队且某成员 handle 为默认本体名，
  When 在团队设置抽屉把该成员队内称呼改为新值并保存，
  Then 保存请求携带新 handle，团队修订 +1，共享名册与全体成员提示词随 roster 指纹重建，再次打开抽屉显示新称呼。
- Given 队内已有 handle `coder`，
  When 把另一成员改成 `coder`（大小写变体同算），
  Then 前端编辑器即时提示撞名且应用被禁用；绕过前端直发协议时 store 以 `Duplicate team member handle` 拒绝。
- Given 用户未改某成员的队内称呼，
  When 保存团队其他改动，
  Then 该成员的更新输入不携带 handle 字段，落盘 handle 保持原值。
- Given 提供方维护的团队（team.source 存在），
  When 打开设置抽屉，
  Then 只显示 handle 不可编辑（沿用既有 readOnly 路径）。

## 必须保持

- `UpdateTeamInput` 的省略语义：不带 handle 的既有成员提交与现状行为逐字节一致；
- leader 唯一性、任务书替换、copy 绑定清理等 updateTeam 既有行为不变；
- handle 校验仍走 `assertTeamInvariants` 单点（不在 UI 重复实现第二套持久化校验，前端仅做即时体验反馈）。

## 测试与验证

- 层级：合同测试（validation）+ 集成测试（store）+ 单元测试（team-assembly 纯函数）+ 组件测试（TeamSettingsSheet 接线）。
- 命令：`bun scripts/quality/run-vitest.mjs --run <相关测试文件>`（agent-team 包从仓库根、desktop 包从 apps/desktop 目录）；`bun run test:pkg agent-team`；`bun run check:quick -- <files>`；`bun x tsc --noEmit -p apps/desktop/tsconfig.json`。

## 交付记录

- 实际修改：
  - `packages/agent-team/src/contracts.ts`：`UpdateTeamMemberInput` existing 变体新增 `handle?: string`（注释写明省略保持现值）。
  - `packages/agent-team/src/validation.ts`：existing 变体加 `handle: Type.Optional(id)`（非空、≤256、无首尾空白，复用 `id` schema）。
  - `apps/desktop/src/main/agent-teams/agent-team-store.ts`：updateTeam existing 分支 `handle: memberInput.handle?.trim() || member.handle`（trim 后空白同样回退现值），非空/队内唯一仍由 `assertTeamInvariants` 单点裁决。
  - `apps/desktop/src/renderer/domains/agent-teams/lib/team-assembly.ts`：`TeamAssemblyDraft.handles`；`assemblyDraftFromTeam` 读回全部成员现值；`buildUpdateTeamInput` 经 `handleInput` 仅在 trim 后与现值不同时携带。
  - `apps/desktop/src/renderer/domains/agent-teams/components/TeamSettingsSheet.tsx`：成员卡片新增 `@handle` 行与改名按钮；`MemberHandleEditor` 行内编辑器（空值/队内撞名即时提示并禁用应用，`normalizeMentionHandle` 归一化比较）；`sameDraft` 纳入 `sameHandles`。
  - `apps/desktop/src/shared/i18n/locales/{zh,en}/agent-teams.json`：settings 段新增 `memberHandle`、`memberHandleRename`（aria 带 {{name}}）、`memberHandleRenameAction`、`memberHandleEmpty`、`memberHandleTaken`、`memberHandleHint`、`memberHandleApply`、`memberHandleCancel`。
  - `docs/adr/0109-team-member-assignment-as-increment.md`：「不在本决策范围」第 2 项标注已由本任务落地及语义。
  - 测试：`packages/agent-team/test/validation.test.ts`（existing 接受/省略/空白拒绝/new 变体拒绝）；`agent-team-store.test.ts`（改名成功 + revision +1、省略保持、归一化撞名拒绝）；`team-assembly.test.ts`（fromTeam 读回 handles、仅变更时携带）；`TeamSettingsSheet.test.tsx`（编辑→校验→应用→保存草稿携带新 handle）。
- 提示词联动依据：handle 渲染进 `buildTeamSharedOperatingContext` 的共享名册，`teamRosterFingerprint` 随之翻动，成员提示词按既有指纹机制自动重建——本任务未新增联动代码。
- 实际运行：
  - `bun run test:pkg agent-team`：12 文件 / 83 测试全过（含新增 1 条 validation）。
  - `cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run`（agent-team-store + team-assembly + TeamSettingsSheet）：3 文件 / 40 测试全过（新增 3 条）。
  - `bun x tsc --noEmit -p apps/desktop/tsconfig.json`：本任务文件零错误（仓库现存 13 个错误全部位于并行会话在途文件 browser-automation/webview-agent-guest、conversation 导出文案、PluginPermissionVisual、date-picker.test，均非本任务 write_paths）。
  - `bun run check:quick -- <files>`：除已知 `build-agent-modes`（并行会话 agent-modes markdown 在途未 regenerate，同 TASK-0069/0070 交付记录归属）外全部 guard 通过；Biome 对任务文件 check 干净（2 处格式化已 `--write` 修复并复跑测试确认）。
- 未运行及原因：
  - `bun run build:desktop` / `verify:ui:*`：任务未要求构建产物，UI 验收需用户明确授权（AGENTS.md）。
  - `bun run check` 全量：desktop tsc 被并行会话在途错误阻断，与本任务无关，定向 tsc 已覆盖。
- 剩余风险：
  - 改名后旧 @mention 文本不再命中属预期（resolveMemberByHandle 归一化比较），共享历史里的旧称呼仅作展示；`memberHandles` 会话快照随团队修订在既有 reconcile 流程刷新。
  - 新加入成员行的 `@handle` 展示回退本体 mentionHandle（未入队无现值），展示值与创建时 uniqueHandle 后缀可能不同，仅影响预览文案。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【新增】团队设置里现在可以给每位成员改队内称呼（@handle）：同一智能体在不同团队可用不同称呼，撞名与空值会被即时提示并拒绝，保存后全体成员的名册与协作提示词自动按新称呼重建。
