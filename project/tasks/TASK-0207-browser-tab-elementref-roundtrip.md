---
id: TASK-0207
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement:
plan: PLAN-0006
source: BUG-0078（browser_tab 拒绝回传 snapshot 打印的 elementRef 编码串）
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0063, TASK-0059]
related_issues: []
related_bugs: [BUG-0078]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: d4366ebdb65fda6e3a7397f926b5bf95182d45af
read_paths: [packages/coding-agent/src/features/browser-tab, packages/coding-agent/test/features/browser-tab, apps/desktop/src/main/browser-automation]
write_paths: [packages/coding-agent/src/features/browser-tab, packages/coding-agent/test/features/browser-tab, project/tasks/TASK-0207-browser-tab-elementref-roundtrip.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending（主工作区串行，随 BUG-0078 修复提交）
created: 2026-10-05
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 修复 BUG-0078：browser_tab 接受 snapshot 回传的 elementRef 编码串

## 目标

让 `browser_tab` 的输入边界接受模型从 snapshot 结果里原样回传的 `elementRef` 编码串 `v1:<pageRevision>:<id>`，在交给宿主前规范化为 `{ id, pageRevision }`；对象形式与既有的拒绝语义保持不变。修复后 `inspect`/`click`/`fill`/`press`/`scroll`/`wait`/局部 `screenshot` 在模型按最自然方式回传 ref 时可用。

## 范围

### 并发评估

- 结论：不支持并行——单一文件（合同模块）与单一测试文件的窄修复。
- 执行方式：serial（主工作区串行）。
- 可并行 Task：无。
- 前置依赖：无（TASK-0063/TASK-0059 已集成）。
- 冲突文件/独占路径：无其他在途 Task 触碰 `packages/coding-agent/src/features/browser-tab`。
- Branch：`main`（主工作区串行）。
- Worktree：unassigned（主工作区串行）。
- 集成负责人：coordinator。
- 集成顺序：随 BUG-0078 修复提交。

### 做

- `readBrowserTabToolInput` 在校验前把字符串形式的 `elementRef` 经 `readBrowserElementRef` 解码为对象；解码失败保持原值，交给 schema 判非法。
- 复用既有 `readBrowserElementRef`（已同时接受字符串与对象），不新增第二套编码格式。
- 对外 Schema（发给 Provider 的入参定义）在 `elementRef` 上同时接受编码串与对象，使模型侧不再「描述可回传、schema 只收对象」自相矛盾；运行时规范化的 `BrowserTabToolInput` 仍是对象形态，string 不会漏进宿主。
- 工具描述补一句：snapshot 打印的 elementRef 可原样回传。
- 回归测试：编码串回传被规范化；对外 Schema 接受编码串、拒绝畸形串；穿过真实 session-extension 装配时宿主函数收到解码后的对象；宿主 `validateBrowserElementRef` 接受编码串形式；畸形串与缺字段仍被拒。

### 不做

- 不改 `BrowserElementRefSchema` 本身（对象分支与 `{ id, pageRevision }` 语义不变）；编码串只在外层联合中额外接受。
- 不改 `CodingAgentBrowserTabFunctionRequest.input` 与其宿主消费方（仍是对象形态），避免跨包类型级联。
- 不改宿主 `dispatchBrowserTabAction`/`validateElementRef`（已兼容两种形式）。
- 不改写编码格式、`pageRevision` 语义或写类动作的 L3 审批。
- Release Notes 由 coordinator 统一写。

## Given / When / Then

- Given：模型已取得一次 snapshot，结果文本含 `- v1:5:e3 role=button name="提交"`；宿主函数可用。
- When：模型调用 `browser_tab { action: "click", elementRef: "v1:5:e3" }`。
- Then：工具输入校验通过，宿主收到 `elementRef = { id: "e3", pageRevision: 5 }`，返回按既有 click 语义的成功或 `stale_reference`/`no_browser_session`，而不是 `invalid browser_tab tool input`。

## 必须保持

- 对象形式 `{ id, pageRevision }` 的输入行为与类型不变。
- `e1`、`v1:-1:e1`、缺 `pageRevision` 的对象、`evaluate` 等非法输入仍被拒。
- `navigate` 仅 http/https；写类动作仍提升 L3 审批；错误码与 `stale_reference` 语义不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts`、`--run packages/coding-agent/test/features/browser-tab/browser-tab-session-extension.test.ts`。
- 用户流程：snapshot → 用回传的编码串执行 click/fill/inspect（合同层覆盖宿主收到的 ref 形状）。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check:quick`，完成后 `bun run check`（不跑测试）。

## 验收分层

- 工程验证：通过。定向 14/14（coding-agent 两文件）、impact 119 项、desktop 12/12、`check:quick` / `check`（root tsgo、lint、guards）全绿。
- 技术评审：自审；剩余风险见交付记录。
- 集成：与 frontmatter `integration_status` 一致（主工作区串行）。
- 人工功能验收：待验收（需在 Desktop 会话中实测 snapshot→click 全流程）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 会话中打开应用内 Browser WebView，模型支持工具调用。
- 操作步骤或 AI 任务输入：让模型「打开某页面，snapshot 后点击某按钮」。
- 预期行为与最终产物：snapshot 成功，后续带 `elementRef` 的动作不再返回 `invalid browser_tab tool input`。
- 不通过表现与已知限制：仍返回 `invalid browser_tab tool input` 即未修复。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：`packages/coding-agent/src/features/browser-tab/browser-tab-tool-contract.ts`（新增 `normalizeBrowserElementRefInput`，`readBrowserTabToolInput` 校验前解码字符串 ref；9 个动作分支改为按 elementRef 形态生成的工厂，对外 Schema 用对象/编码串联合、运行时校验用纯对象 Schema；描述补一句）；`packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts`（往返、对外 Schema 接受编码串、适配器解码、畸形串拒绝用例）；`packages/coding-agent/test/features/browser-tab/browser-tab-session-extension.test.ts`（真实装配下宿主收到解码后对象）；`apps/desktop/src/main/browser-automation/webview-element-ref.test.ts`（宿主接受编码串）；`project/bugs/BUG-0078-*.md`、本 Task、`project/tasks/README.md`、`project/bugs/README.md`、`.github/release-notes/v0.1.3.md`。
- 实际运行：`bun -e` 直跑合同模块复现旧行为（编码串 → `undefined`）；定向 14/14（coding-agent 两文件）、desktop 12/12（browser-automation 两文件）；`test:impact`（coding-agent 31 文件 119 用例、desktop 3 用例）；`check`（types/lint/guards）全绿。
- 未运行及原因：未运行 `verify:ui:*` 与真实 Provider 实机流程（当前任务未授权真实用户环境）；未跑全量测试套件（影响面与定向已覆盖本次改动，`check` 不含测试）。
- Worktree：未拆出（主工作区串行窄修复）。
- 提交：`c3654fcc9`（修复与回归测试、Release Notes）；记录登记 `ffbaa5bad`（BUG-0078/TASK-0207 建卡）。
- 剩余风险：对外 Schema 在 `elementRef` 上引入嵌套 `anyOf`（对象 + 字符串分支），严格网关是否接受未用真实 API 验证（分支均带结构关键字，不会被 `sanitizeToolParameters` 剔除，但 Gemini 系网关的嵌套联合支持需实机确认）；真实模型是否还会以其他畸形形状回传（例如 `elementRef` 携带未知字段）未实测。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

环境：隔离 Debug Profile 实例（真实模型 DeepSeek V4.1 Flash，真实 API），会话内打开应用内浏览器标签页；被测页面是本地夹具 `http://127.0.0.1:8791/`（`<debug vettaHome>\fixtures\browser-page\server.ts`，含 `textbox#q` 与 `button#submit` 文案「提交」；点击回调把自身文案改为「已提交」并追加一个「继续」按钮，用于在交互树上留下可观测的结构性副作用）。全程不手写 `elementRef`，只要求模型「原样回传 snapshot 打印的编码串」。

- **第一轮（点击前）**：snapshot 原文 `snapshot pageRevision=3 url=http://127.0.0.1:8791/`，交互树 `- v1:3:e3 role=textbox name=""` / `- v1:3:e4 role=button name="提交"`。
- **两轮 click 均成功**：模型取 `v1:3:e4`（第一轮为 `v1:1:e2`）原样回传，工具返回 `click ok pageRevision=3.`——**不是** `invalid browser_tab tool input`，也不是 `no_browser_session`。即输入边界接受了编码串、宿主拿到了规范化后的对象 ref 并真正落到页面上。
- **点击确实生效**：点击后再 snapshot，原文变为 `snapshot pageRevision=4 url=http://127.0.0.1:8791/`，交互树 `- v1:4:e5 role=textbox name=""` / `- v1:4:e6 role=button name="已提交"` / `- v1:4:e7 role=button name="继续"`——按钮文案变更与新增按钮都是页内 JS 回调的产物，只有真实 click 才会出现；`pageRevision` 3→4 也与 DOM 变更一致。
- 附带封闭的一条剩余风险：本次是**真实厂商网关**（非 mock）接受含嵌套 `anyOf` 的对外 Schema，模型能据此产出字符串形式的 `elementRef` 参数，交付记录里「严格网关是否接受嵌套联合」一项在 DeepSeek 一路得到实证（Gemini 系仍未测）。
- 未覆盖：`fill`/`press`/`scroll`/局部 `screenshot` 等同样受益的动作本轮未逐一实跑（同一解码路径，合同层已有单测）；`stale_reference` 的实机表现只在模型自己的说明里出现（旧 ref `v1:3:e4` 已失效），未单独构造过期 ref 调用。

按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。
