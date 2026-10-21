---
id: TASK-0339
type: task
status: verifying
priority: P1
owner: coding-agent
requirement:
plan:
source: RESEARCH-0034; BUG-0134
related_requirement: []
related_plan: []
related_tasks: [TASK-0207, TASK-0218, TASK-0123]
related_issues: [ISSUE-0026]
related_bugs: [BUG-0134, BUG-0078]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 74877ddef
read_paths:
  - packages/coding-agent/src/features/browser-tab
  - packages/coding-agent/test/features/browser-tab
  - packages/agent/src/engine
  - packages/agent/test
  - packages/ai/src/utils
  - apps/desktop/src/main/agent-runtime
  - apps/desktop/src/main/browser-automation
  - project
write_paths:
  - packages/coding-agent/src/features/browser-tab/browser-tab-tool.ts
  - packages/coding-agent/src/features/browser-tab/browser-tab-tool-contract.ts
  - packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts
  - packages/coding-agent/test/features/browser-tab/browser-tab-tool.test.ts
  - packages/agent/src/engine/tool-failure-guard.ts
  - packages/agent/src/engine/tool-executor.ts
  - packages/agent/src/engine/run-agent-turn.ts
  - packages/agent/src/engine/index.ts
  - packages/agent/test/tool-failure-guard.test.ts
  - project/tasks/TASK-0339-browser-tab-correctable-errors-stop-loss.md
  - project/tasks/README.md
  - project/bugs/BUG-0134-browser-tab-generic-error-repeat-loop.md
  - project/bugs/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/agent/src/engine/tool-failure-guard.ts
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# browser_tab 可纠正错误与有界止损

## 目标

把 `browser_tab` 的校验失败从一条读不懂的泛化文案，改成模型可以据此改正的结构化反馈；并在通用工具执行链路增加「相同工具 + 相同参数 + 相同确定性错误」连续 3 次的有界止损，阻止一次错误在单回合内膨胀成上百次重复调用。严格 Schema 校验保持不变。

## 范围

### 并发评估

- 结论：不支持并行；`packages/agent` 执行链路与 `packages/coding-agent` 工具合同同时改动，且与本轮 TASK-0340/0341 共享 Tasks 索引与 Release Notes。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`packages/agent/src/engine/tool-failure-guard.ts` 为本 Task 新增独占；`tool-executor.ts` / `run-agent-turn.ts` 与 TASK-0340/0341 无交叉。
- Branch：`main`。
- Worktree：不拆出；错误文案与止损共享同一批测试夹具，串行修改避免半成品。
- 集成负责人：当前 Coordinator。
- 集成顺序：本轮第一项，先于 TASK-0340、TASK-0341。

### 做

1. 在 `browser-tab-tool-contract.ts` 新增可纠正的问题描述：区分「不是对象或为空」「缺 `action`」「`action` 不在 9 个合法动作内」「动作字段不合法或存在多余字段（点名合法字段）」「`elementRef` 形态不对（提示先 snapshot）」「`navigate` 非 http(s)（提示本地文件走文件预览）」；每条都带最小合法示例，缺 `action` 时列出全部合法动作。
2. `readBrowserTabToolInput` 保留单一判定入口，新增一个返回「规范化结果或具体问题」的读取函数供 `validateInput` 与 `execute` 共用；严格 `Value.Check` 与 `isAllowedBrowserTabUrl` 不变。
3. `browser-tab-tool.ts` 的 `validateInput` 与 `execute` 兜底分支改用上述可纠正文案；`unimplemented`、`no_browser_session` 的格式化文本补上恢复步骤（无会话要求在当前工作区打开内置 Browser 页）。
4. 新增 `packages/agent/src/engine/tool-failure-guard.ts`：按「工具名 + 规范化参数 JSON + 确定性错误码」计数，连续 3 次后把该「工具 + 参数」标记为已止损；止损后的调用不再执行，直接返回终止性错误结果并要求修改入参；参数变化、出现其他结果或新回合自然恢复。
5. `executeRuntimeToolCalls` 接受可选的失败守卫：执行前检查是否已止损，执行后按结果记录；`run-agent-turn.ts` 的每回合 `RunState` 持有一个新守卫，保证新回合重置。
6. 确定性错误白名单：`AGENT_TOOL_INPUT_INVALID`、`AGENT_TOOL_NOT_FOUND`，以及工具结果 `details.code` 为 `invalid_input`、`policy_denied`、`unimplemented`。`stale_reference`、`no_browser_session`、`cancelled`、网络/执行类错误不进白名单。
7. 测试：合同层覆盖四类可纠正错误与严格校验不回退；引擎层覆盖连续 3 次止损、第 4 次不执行、参数变化恢复、非白名单错误不触发、新回合重置。
8. 更新 Tasks/Bugs 索引、本 Task 交付记录与当前版本发布说明。

### 不做

- 不改 Provider 适配器、`parseStreamingJson` 或模型配置；空对象入参的原始流式片段定位需要离线夹具，另立后续范围。
- 不放宽 Schema、不把 `{}` 猜成 `snapshot`、不为 `file://` 放开 `navigate`、不抢救畸形工具名。
- 不改团队成员会话的工具收窄（ISSUE-0026 / TASK-0123 保持现状）。
- 不启动 Desktop、不运行 `verify:ui:*`、不连接真实 Provider。

## Given / When / Then

- Given 模型发出 `{}`（无 `action`），When 校验失败，Then 错误文本列出 9 个合法动作并给出 `{"action":"snapshot"}` 最小示例。
- Given 模型发出 `action: "open"`（非法动作），When 校验失败，Then 错误文本指出该动作不合法并列出合法动作。
- Given 模型发出 `navigate` 且 `url` 为 `file:///...`，When 校验失败，Then 错误文本说明本工具只接受 http/https，并指向文件预览。
- Given 模型连续 3 次发出完全相同的 `browser_tab` 空对象调用，When 第 4 次发出同一调用，Then 该调用不再执行，返回终止性错误并提示修改入参。
- Given 止损已生效，When 模型改用一个合法调用（例如 `{"action":"snapshot"}`），Then 调用正常执行。
- Given 工具返回 `stale_reference` 或可重试错误，When 重复调用，Then 不触发止损。
- Given 同一会话进入新回合，When 再次发出此前被止损的同一调用，Then 守卫已重置，按正常路径执行。
- Given 一次成功的工具结果出现，When 之后再失败，Then 同一「工具 + 参数」的连续计数重新开始。

## 必须保持

- `BrowserTabToolInputSchema`（发给 Provider 的 Schema）与运行时规范化 Schema 的动作集合、`additionalProperties: false`、`elementRef` 两种形态不变。
- 写类动作仍提升到 L3 并走既有 Tool Approval。
- 每个 `toolCall` 仍然产生一一对应的 `toolResult`；取消、stop、usage 语义与 `tool_execution_start` / `tool_execution_finish` 事件顺序不变。
- 团队成员会话仍然看不到 `browser_tab`。
- 止损只影响「相同工具 + 相同参数 + 相同确定性错误」，不扩大到其他工具或其他参数。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts packages/coding-agent/test/features/browser-tab/browser-tab-tool.test.ts packages/agent/test/tool-failure-guard.test.ts`。
- 引擎回归：`bun scripts/quality/run-vitest.mjs --run packages/agent/test/agent-engine.test.ts`。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：组件/引擎测试覆盖空对象、非法动作、`file://`、连续重复、参数变化恢复、新回合重置；不连接真实模型。

## 验收分层

- 工程验证：完成。定向 3 文件 34 例、`test:impact`（agent 1+8 文件 / coding-agent 2+32 文件）、`check:quick`、根 `tsgo`、Desktop `typecheck:incremental` 全部通过。
- 技术评审：待独立评审。
- 集成：实现 `f2728086a` 已推送 origin/dev 并核对远端（同批 `1f555175b`）。
- 人工功能验收：待验收；需要一次真实模型回合观察错误文案与重复次数下降。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 中让模型操作内置 Browser 页；或让模型发出不合法的 `browser_tab` 调用。
- 操作步骤或 AI 任务输入：连续发出相同的非法调用；随后改用合法调用。
- 预期行为与最终产物：错误文本包含合法动作/示例/恢复步骤；第 4 次相同调用被止损；改参数后恢复；单回合同义失败数量显著下降。
- 不通过表现与已知限制：仍只返回 `invalid browser_tab tool input`；或止损误伤 `stale_reference` 与正常重试。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `browser-tab-tool-contract.ts`：新增 `readBrowserTabToolInputResult`（失败给具体问题）与 `describeBrowserTabToolInputProblem`；按动作分支 Schema 推导合法字段，区分「非对象」「缺 action（列 9 个动作 + `{"action":"snapshot"}`）」「非法 action」「多余字段（点名合法字段）」「畸形 elementRef（提示原样回传 token）」「navigate 缺 url / 非 http(s)（`file://` 指向文件预览）」；严格 `Value.Check` 与 `isAllowedBrowserTabUrl` 未变。`formatBrowserTabToolError` 的 `no_browser_session` 补「打开当前工作区内置 Browser 页」并说明重试不会成功，`unimplemented` 改为求助用户。
  - `browser-tab-tool.ts`：`validateInput` 与 `execute` 兜底改用同一判定入口的说明文本。
  - `packages/agent/src/engine/tool-failure-guard.ts`（新增）：`ToolFailureGuard` 按「工具名 + 排序键规范化参数 + 确定性错误码」计数，连续 3 次后止损；成功清账、非白名单错误清账、错误码变化重新计数、止损结果本身不清账；`AGENT_TOOL_CALL_STOPPED` 为终止性错误码。
  - `tool-executor.ts`：`ExecuteToolCallsRequest.failureGuard?`；`prepareToolCall` 先查止损再校验/审批/执行；批次循环按结果 `details.code` 记账。
  - `run-agent-turn.ts`：`RunState.toolFailureGuard = new ToolFailureGuard()`，每回合新建即自然重置。
  - `packages/agent/src/engine/index.ts`：导出守卫模块。
  - 测试：新增 `packages/agent/test/tool-failure-guard.test.ts`（11 例，含 `runAgentTurn` 两回合重置）、`packages/coding-agent/test/features/browser-tab/browser-tab-tool.test.ts`（11 例）；`browser-tab-tool-contract.test.ts` 增加判定入口用例。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run <3 个定向文件>` → 3 files / 34 tests passed；`bun run test:impact` → agent 11 + 86 例、coding-agent 23 + 132 例，全绿；`bunx tsgo --noEmit` → 通过；`bun run --cwd apps/desktop typecheck:incremental` → 通过；`bun run check:quick` → 通过（`ratchet: waived=626 new=0`，声明头门禁首轮报 `index.ts` 缺头，已补后复跑通过）。
- 未运行及原因：未启动 Desktop、未运行 `verify:ui:*`、未连接真实模型；`bun run check` 完整套件留待本轮三个 Task 全部完成后一次执行。
- Worktree：未拆出；串行修改契约与执行链路。
- 剩余风险：止损阈值固定为 3，真实会话中模型可能在 3 次内仍无进展；`{}` 入参的生成/解析异常仍需离线流式夹具定位（不在本 Task 范围）。
