<!-- Copyright The Open Forge contributors. -->
# ADR-0148：browser_tab 是 coding-agent 内部工具，不进 Capability 暴露面

## 状态

已接受（2026-10-22，用户裁定「CP 暴露：browser_tab 是内部」）。

## 背景

`browser_tab`（`packages/coding-agent/src/features/browser-tab/`）操作的是 Desktop 内置浏览器（in-app WebView）的会话：点选元素、截图裁剪、点击/填写/滚动/等待。它进入模型工具面的唯一通路是**能力驱动的 host function**：Desktop 注册 `CODING_AGENT_BROWSER_TAB_FUNCTION`（`apps/desktop/src/main/agent-runtime/function-extension-source.ts`），`browser-tab-session-extension` 以 `functions.has(...)` 为闸门贡献工具（ADR-0129）；CLI 等无 WebView 宿主自然不可见。团队成员会话已有收窄先例（TASK-0123，`team-member-function-source` 以 `has→false` 隐藏）。

另一条「浏览器能力」是 `cap.foundation.vetta.browser.*` 的 10 个 Capability Token（`packages/capability-sdk/src/foundation/browser.ts`，公开目录 `docs/capabilities/catalog.md`），后端是独立的 `BrowserAutomationService` 自动化引擎。两条会话不共享（ADR-0129、RESEARCH-0005）：前者是 Agent 在对话里驱动内置浏览器，后者是插件/宿主侧的桌面自动化能力。

RESEARCH-0037（差距清单第 7 项）提出过把 browser_tab 映射为 MCP 工具服务外部 harness，尚无 Task 承接。

## 决策

1. **browser_tab 保持 coding-agent 内部工具，不新增 `cap.*` Token，不进 Capability Catalog。** 暴露面由 Token 生成并有 `catalog:check` 门禁兜底：只要不在 `foundation/browser.ts` 加 token，目录就不会出现它。
2. **可见性继续走能力驱动 + 按会话收窄**：宿主不提供 host function 即整面下线（ADR-0129 的回滚路径）；团队等专用会话沿用 `has→false` 包装（TASK-0123、RESEARCH-0034「既有收窄应保留」）。
3. **对外暴露（外部 harness / MCP）保留为独立立项**：若未来要做，按 RESEARCH-0037 走 MCP wrapper 调 `CODING_AGENT_BROWSER_TAB_FUNCTION`，需新 Task + 明确授权；经插件 `ctx.agent.registerTool` 暴露已被 PLAN-0006 否决。

## 取舍

- 不做工具级 `internal` 标志：现有三层（函数源可见性、Profile 白名单、每轮工具选择）已覆盖「谁能看见」；加标志是第二套真相源，易与能力驱动注册漂移。
- 不把内置浏览器会话桥接进 `BrowserAutomationService` 以复用 CP 面：两条会话的生命周期与信任边界不同（对话内 Agent 工具 vs 插件能力），强行合并会把 Agent 工具的审批语义（读 L0、写动作升 L3）错接到 Grant 链。

## 后果

- `docs/capabilities/catalog.*` 不含 browser_tab 是**预期状态**；评审暴露面时不应视作遗漏。
- 未来任何「外部可见 browser_tab」的提案必须以新 Task 立项并更新本 ADR，不得经插件工具注册静默进入。
