---
id: TASK-0059
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: serial
branch: task/TASK-0059-canvas-browser-contracts
worktree: ..\open-forge-wt\TASK-0059-contracts
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-core, packages/runtime-storage, apps/desktop/src/shared, apps/desktop/src/main, apps/desktop/src/preload, docs/adr]
write_paths: [packages/coding-agent/src, packages/coding-agent/test, apps/desktop/src/shared, apps/desktop/src/preload, apps/desktop/src/main/ipc, apps/desktop/src/shared/i18n/locales, docs/adr]
exclusive_paths: [apps/desktop/src/shared/shortcuts.ts, apps/desktop/src/shared/i18n/locales, docs/adr]
depends_on: []
conflicts_with: [TASK-0027]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Canvas/Browser 共享合同与接缝冻结

## 目标

在 worker 开工前冻结全部共享合同与注册接缝：artifact 工具合同、`browser_tab` 工具合同、元素 capsule schema、IPC channel 与 preload 桩、组装根装配点、i18n key 骨架、快捷键注册，以及承载决策的 ADR。使后续 TASK-0060/0061/0062/0064 不写任何共享注册文件。

## 范围

### 并发评估

- 结论：不支持并行（本任务就是用来消除并行冲突的前置）。
- 执行方式：serial；由 coordinator 或单一 worker 完成后，下游 lane 才可开工。
- 前置依赖：无（PLAN-0006 决策已冻结）。
- 冲突文件/独占路径：`shortcuts.ts`、i18n locale、`docs/adr`、preload/IPC 注册聚合文件。
- 集成负责人：coordinator。

### 做

- `artifact` 工具合同（coding-agent session extension + host function 签名）：动作 `create` / `update` / `get` / `list` / `attach_to_task`；`update` 强制 `artifactId + baseVersion`；错误形状含 `stale_version` / `missing_file` / `no_active_task`。
- `browser_tab` 工具合同：动作表与读/写分类（读：snapshot/inspect/screenshot/wait/scroll；写：click/fill/press/navigate）；每动作参数 schema；`stale_reference` / `no_browser_session` / `policy_denied` 错误形状；`pageRevision` 与 `elementRef` 内嵌 revision 的表述合同。
- `vetta.browser.element-selection` capsule schema v1（TypeBox/JSON-safe，字段与上限按 PLAN-0006）。
- IPC channel 常量与 `window.vetta.*` preload 桩（canvas artifact 服务、browser picker/browser_tab 桥、截图裁剪）；主进程组装根装配到桩实现（未实现时返回明确 `unimplemented`）。
- `SHORTCUT_ACTIONS` 新增 `browser-element-picker`，默认 `mod+shift+d`，scope `app`。
- 全部新增 i18n key 骨架（`chat.json` 等 zh/en），worker 不再改 locale 文件。
- ADR：Canvas artifact 双生命周期 + `browser_tab` 归属应用内 WebView（写明 amends ADR-0090）、webview 安全基线（`webviewTag`/`contextIsolation`/`nodeIntegration: false`/无特权 preload/导航拦截/CSP）与 `HtmlPreviewView` 差异表、console/network 预留设计、partition 决策与 deferred 异议。

### 不做

- 任何行为实现（工具 handler、picker 逻辑、renderer 实现均为下游 Task）。
- 修改 `ArtifactDescriptorSchema`（`sourceTaskId` 已可选，Schema 不变）。

## Given / When / Then

- Given：下游 worker 拿到本 Task 产出；When：worker 在自己的 write_paths 内实现功能；Then：不需要编辑 IPC 聚合、preload 索引、shortcuts 注册表或 i18n locale 文件即可完成接线。
- Given：合同评审；When：对照 PLAN-0006 决策索引；Then：每条决策在合同或 ADR 中有唯一对应条款，无残留「实现时再定」。

## 必须保持

- 不引入第二个 storage/Agent Loop 事实源；descriptor 事件复用现有 `artifact.descriptor.recorded`。
- Tool `content`/`details` 分层语义不变。
- Turn 内工具面冻结语义不变（新工具下一 Turn 生效）。
- `browser_tab` 合同不暴露任意 JS 执行。

## 测试与验证

- 定向测试：TypeBox schema 合法/拒绝/兼容用例（capsule、工具参数与错误形状）；preload 桩的存在性与类型合同。
- 用户流程：无（本 Task 无可观察用户行为）。
- 质量检查：`bun run check:quick`；`bun scripts/quality/run-vitest.mjs --run` 新增合同测试文件。

## 交付记录

- 实际修改：
  - coding-agent：`artifact` / `browser_tab` 工具合同、可选 session extension、capsule schema `vetta.browser.element-selection` v1；组装根注册扩展；work profile 默认包含两工具；写类 `browser_tab` 提升到 L3；公开出口 `@vetta/coding-agent/function-extensions`。
  - Desktop：`vetta:canvas:*` / `vetta:browser-tab:*` channel 与 preload 桩（未实现返回 `unimplemented`）；IPC 聚合与 preload 索引接线；`SHORTCUT_ACTIONS.browser-element-picker` = `mod+shift+d` / `app`；zh/en `chat.json` + `settings.json` 骨架。
  - ADR-0129（双生命周期 + 应用内 WebView + webview 安全基线 / HtmlPreviewView 差异 / console·network 预留 / partition 异议）；ADR-0090 增加 amends 指向。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run` 合同测试 9 文件 36 通过（artifact/browser_tab schema、capsule、能力驱动扩展、IPC/preload 桩、快捷键与 i18n key）。
  - `apps/desktop/src/preload/index.test.ts` 本工作树 1 通过（`.claude/worktrees` 里另一份同名测试因 electron mock 解析失败，不属本任务）。
  - `bun run check:quick -- <本任务 35 个源/测文件>`：Biome 干净；`check:guards` 因并行改动的 `@vetta/coding-agent/projects` 缺根 tsconfig path map 失败，与本任务无关。
- 未运行及原因：
  - 完整 `bun run check` 未作为本任务放行条件：并行工作区已有 `projects/index.ts`、会话事件队列、`file-conversation-session-services` 等类型/lint 失败；Windows 上 `bunx tsc` 也不是本机可用入口。
  - 无用户可观察流程，未跑 `verify:ui:*`。
- 剩余风险：
  - host function 未写入 `function-extension-source.ts`（属 TASK-0060/0063 `write_paths`）。在那之前 `artifact` / `browser_tab` 不会出现在工具面——这是能力驱动的预期终态，不是漏接。
  - Desktop manifest 仍为 `0.5.59`；首发号 `0.1.0`（ISSUE-0007）尚未切入，fork-only 发布文案不得写入继承的 Vetta Release Notes。
- 候选发布说明（切入 Open Forge 首发版本后再写入对应 `v*.md`，当前阻断）：
  - 「其他」：冻结 Canvas artifact 与应用内 Browser 的共享合同、IPC 桩、元素点选快捷键和中英文案骨架；工具行为尚未实现，用户界面暂无变化。
