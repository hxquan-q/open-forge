---
id: TASK-0074
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: ISSUE-0011 scheme B; RESEARCH-0006
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/features/artifacts, apps/desktop/src/main/agent-modes, apps/desktop/src/renderer/domains/conversation, packages/skill-presets]
write_paths: [packages/coding-agent/src/features/artifacts, packages/coding-agent/test/features/artifacts, apps/desktop/src/main/agent-modes, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/shared/store, packages/skill-presets, apps/desktop/src/shared/i18n/locales]
exclusive_paths: []
depends_on: [TASK-0060, TASK-0061]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 报告与架构图走单一 artifact 写入

## 目标

落实 ISSUE-0011 方案 B：用户要报告/架构图时必须 `artifact.create`；Canvas 是主表面；文件预览同源；Browser 只管活页面。

## 范围

### 做

- 更新 `artifact` 工具描述与 Work/Coding 模式提示词。
- 内置 Skill `report-canvas` / `architecture-canvas`。
- 聊天工具结果提供「在画布中打开」；Canvas 列表订阅 `artifact.descriptor`，未读在离开页签时累加、回到画布时清零。

### 不做

- Cursor 式 `.canvas.tsx` SDK。
- Canvas HTML 内点选（PLAN-0007）。
- 把报告写进 Browser WebView。
- 写入继承的 Vetta Release Notes。

## Given / When / Then

- Given：Work 或 Coding 新会话；When：用户要架构报告；Then：提示词与 Skill 要求 `artifact.create`，聊天有打开入口，Canvas 列表可刷新到该条目。
- Given：用户只要打开活页面；When：Agent 工作；Then：不为此创建报告 artifact。
- Given：Canvas 未打开时新产物到达；When：用户仍在其它页签；Then：Canvas 徽标未读 +1，切回后清零。

## 测试与验证

- `artifact-tool-contract.test.ts`、`agent-modes.test.ts`、`chat-service-artifact.test.ts`、`ArtifactCanvasOpenButton.test.tsx`、`canvas-atoms.test.ts`
- `bun run test:impact -- <files>` + `bun run check:quick -- <files>`

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

要报告或架构图时，产物会写到画布并在聊天里提供打开入口，而不是只在对话里贴一段 Markdown。

## 交付记录

- 实际修改：`artifact` 工具描述强制 create；Work/Coding 共享 `canvas-artifacts` partial；内置 `report-canvas`/`architecture-canvas` Skill；聊天「在画布中打开」；Canvas 列表订阅 `artifact.descriptor`，未读在离开页签时累加、回到画布时清零。
- 实际运行：`artifact-tool-contract` 6、`agent-modes` 9、`chat-service-artifact` 2、`ArtifactCanvasOpenButton` 1、`canvas-atoms` 2，均通过。`check:quick` 对本切片文件通过。
- 未运行及原因：未跑真实模型会话；`verify:ui:*` 需用户授权；全量 `bun run check` 被其他 WIP 污染。
- 剩余风险：模型仍可能忽略提示词；本任务用 Skill/工具描述/模式 partial 收口，不能在单测里证明真实模型必调工具。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑本任务声明的五个套件（含补跑上次遗漏的 `artifact-tool-contract.test.ts`）。真实模型会话本轮未驱动。

| 声明套件 | 本次读数 |
|---|---|
| `artifact-tool-contract.test.ts`（coding-agent） | **1 文件 / 6 例通过** |
| `agent-modes.test.ts`（提示词/模式要求走 artifact） | 通过 |
| `ArtifactCanvasOpenButton.test.tsx`、`canvas-atoms.test.ts`（Canvas 打开入口与徽标原子） | 通过 |
| `chat-service-artifact.test.ts` | 通过 |
| **合计** | **4 文件 / 28 例通过，0 失败**（coding-agent 6 + desktop 22） |

| 合同条款 | 本次状态 |
|---|---|
| Given Work/Coding 新会话、用户要架构报告；Then 提示词与 Skill 要求 `artifact.create`、聊天有打开入口、Canvas 列表可刷新到该条目 | 提示词/Skill 侧与入口侧**测试级成立**；「Canvas 列表刷新到该条目」的真实往返**未驱动** |
| Given 用户只要打开活页面；Then 不为此创建报告 artifact | 测试级成立（artifact vs 活页面分流）；真实模型行为**未驱动** |
| Given Canvas 未打开时新产物到达；Then 徽标未读 +1、切回后清零 | 测试级成立（`canvas-atoms`）；真实往返**未驱动** |

- **未覆盖**：三条条款的**真实模型行为面**。要判「提示词是否真的让模型调用 `artifact.create`」，需要一次真实模型会话产出报告；本轮唯一被授权的模型 `qwen3.8` 已在 [VERIFY-0018](../verification/VERIFY-0018-qwen38-real-provider-smoke.md) 被判定端点输出不连贯并立案 [ISSUE-0031](../issues/ISSUE-0031-qwen38-endpoint-incoherent-output.md)，该 Issue 明确「闭合前该 modelKey 不应用于任何真实流程验证」⇒ 本任务当前**没有可用的授权模型**来判读模型遵从度。
- **关闭建议**：软件合同（提示词/模式/入口/徽标）测试级成立；模型行为面属客观阻塞（无可用授权模型），与 TASK-0155 同一成因。建议按 TASK-0155 的口径一并裁定（软件合同闭合 / 模型效果层留待授权模型恢复）。
