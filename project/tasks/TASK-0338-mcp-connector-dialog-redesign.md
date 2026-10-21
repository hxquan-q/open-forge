---
id: TASK-0338
type: task
status: done
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0014
source: user-request; RESEARCH-0025; upstream 80f40d872, 8c9d2e2e5
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0335, TASK-0336, TASK-0337]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 218f07776
read_paths:
  - apps/desktop/src/renderer/domains/settings/components
  - apps/desktop/src/renderer/shared/components/ui
  - packages/theme-ui/src/shared
  - packages/theme-ui/src/settings
  - apps/desktop/src/shared/i18n/locales
  - project/tasks
  - .github/release-notes
write_paths:
  - apps/desktop/src/renderer/domains/settings/components/McpServerForm.tsx
  - apps/desktop/src/renderer/domains/settings/components/mcp-authorization-header.ts
  - apps/desktop/src/renderer/domains/settings/components/ManualMcpDialog.tsx
  - apps/desktop/src/renderer/domains/settings/components/McpEditDialog.tsx
  - apps/desktop/src/renderer/domains/settings/components/McpServerForm.tools.test.tsx
  - apps/desktop/src/renderer/domains/settings/components/McpServerForm.test.tsx
  - apps/desktop/src/renderer/domains/settings/components/useMcpSettingsModel.ts
  - apps/desktop/src/renderer/domains/settings/components/useMcpSettingsModel.test.tsx
  - packages/theme-ui/src/settings/JsonConfigInputView.tsx
  - packages/theme-ui/src/settings/index.ts
  - apps/desktop/src/shared/i18n/locales/zh/settings.json
  - apps/desktop/src/shared/i18n/locales/en/settings.json
  - project/tasks/TASK-0338-mcp-connector-dialog-redesign.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/settings/components/McpServerForm.tsx
  - apps/desktop/src/renderer/domains/settings/components/mcp-authorization-header.ts
depends_on: []
conflicts_with: [TASK-0335, TASK-0336, TASK-0337]
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 自定义 MCP 连接器弹窗重构

## 目标

按上游 `80f40d872` 与 `8c9d2e2e5`（重新设计/重构自定义 MCP 连接器弹窗）同步弹窗布局：500px、`rounded-2xl`、去线留白；协议选择常驻顶部；基础字段全宽单列；高级选项折叠并采用 1:1 网格；HTTP 增加 Authorization key 便利字段并与原始请求头双向同步；Manual 弹窗恢复「表单 / JSON」模式切换与底部右对齐操作区；编辑弹窗复用同一表单。必须保留本仓独有功能：编辑态工具清单与 `disabledTools` 勾选、stdio `idleTimeout` 字段、`SETTINGS_SECTION` 锚点/高亮属性。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0335/0336/0337 共享 Tasks 索引与 Release Notes。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无；`SegmentedControl` 与 `useMcpSettingsModel` 的 JSON 保存动作已存在，`JsonConfigInputView` 与 JSON 合并入口在本 Task 内最小补齐。
- 冲突文件/独占路径：`McpServerForm.tsx`、`mcp-authorization-header.ts` 为本 Task 独占；i18n、索引与发布说明共享。
- Branch：`main`。
- Worktree：不拆出；三个弹窗/表单组件紧耦合，串行修改避免半成品。
- 集成负责人：当前 Coordinator。
- 集成顺序：TASK-0337 之后，四项 UI 同步收尾。

### 做

1. `McpServerForm.tsx` 拆为 `McpServerForm`（字段 + 底部操作）与导出的 `McpServerFields`（仅字段），采用上游 `space-y-5` / `space-y-4` / `space-y-3.5` 布局；协议选择移到基础字段上方常驻；基础字段全宽；高级选项按上游样式折叠，短字段用 1:1 网格；保留工具清单区块与 `idleTimeout`（stdio 时与 `startupTimeout` 组网格）。
2. 新增 `mcp-authorization-header.ts`：`getMcpAuthorization` / `setMcpAuthorization`，大小写不敏感地读写 `Authorization` 行，保留其他请求头。
3. HTTP 基础字段增加 password 类型 Authorization key 字段与说明文案；与高级请求头文本双向同步。
4. `ManualMcpDialog.tsx`：500px 去线留白弹窗；标题/描述 + 模式切换；视觉模式用 `McpServerFields`，JSON 模式用 `JsonConfigInputView` 与错误提示；底部右对齐取消/添加；保留 section id 与高亮属性。
5. `McpEditDialog.tsx`：同款弹窗形态与头部图标/字号；复用 `McpServerForm` 并继续传递 `editingServerTools`。
6. i18n：补齐 `mcpStore.*` 占位符、授权字段、JSON 模式与表单模式文案（zh/en）。
7. 测试：更新 `McpServerForm.tools.test.tsx` 适配新结构；新增 `McpServerForm.test.tsx` 覆盖协议常驻、授权 key 与原始请求头双向同步、保存值；补充 `useMcpSettingsModel.test.tsx` 验证 JSON 合并与弹窗内模式切换不关闭弹窗。
8. 更新 Tasks 索引、本 Task 交付记录与发布说明。

### 不做

- 不删除或弱化工具清单、`disabledTools`、`idleTimeout`、section 锚点等本仓功能。
- 不改 `useMcpSettingsModel` 既有保存/校验语义；仅新增 `onAddServersFromJson` 与弹窗内 `onDialogModeSwitch` 两个最小扩展并补测试。
- 不引入上游其他设置页重构或 `@vetta-org/theme-ui/shared` 之外的重复 SegmentedControl。
- 不启动 Desktop、不运行 `verify:ui:*`、不连接真实 MCP server。

## Given / When / Then

- Given 用户打开「添加自定义连接器」，When 弹窗出现，Then 协议选择可见且高级选项默认收起；弹窗宽度约 500px、无分隔线外壳。
- Given 用户选择 HTTP 并输入 `Bearer token`，When 保存并重新打开编辑，Then `headers.Authorization` 为该值，授权 key 字段回显同一值。
- Given 用户在高级请求头中写入 `authorization=manual` 与其他头，When 切回授权 key 字段，Then 显示 `manual` 且其他头保留；清空授权 key 后保存，Then 移除 Authorization 行但保留其他头。
- Given 编辑一个已发现工具的 server，When 打开编辑弹窗，Then 工具清单仍显示名称/描述/启用状态，取消勾选后保存写入 `disabledTools`。
- Given 编辑 stdio server 且填写 idleTimeout，When 保存，Then 仅 stdio 配置携带 idleTimeout；HTTP 不写该字段。
- Given 用户切换到 JSON 模式粘贴配置，When 保存，Then 走既有 JSON 合并与校验路径，错误显示在弹窗内。
- Given 从设置页深链定位 `mcp-server-list`，When 弹窗打开，Then `id` 与 `data-setting-section-*` 锚点仍在。

## 必须保持

- `McpServerFormState`、`isMcpFormValid`、`emptyMcpServer` 与模型保存动作的合同不变。
- 工具清单的加载/空态/过期标记与 `disabledTools` 增删语义不变。
- `idleTimeout` 仅 stdio 提交；HTTP 配置不出现该字段。
- Manual 弹窗的 `SETTINGS_SECTION["mcp-server-list"]` 锚点与高亮属性不变。
- 所有用户可见文案走 i18n；不硬编码中英文。
- 既有工具清单测试仍通过，不删除断言。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/settings/components/McpServerForm.tools.test.tsx apps/desktop/src/renderer/domains/settings/components/McpServerForm.test.tsx`。
- 设置模型回归：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/settings/components/useMcpSettingsModel.test.tsx`。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：组件测试覆盖添加入口、协议切换、授权双向同步、编辑工具清单、JSON 模式；不连接真实 server。

## 验收分层

- 工程验证：已完成定向测试 3 个文件 14 个用例（`McpServerForm.tools.test.tsx` 7、`McpServerForm.test.tsx` 4、`useMcpSettingsModel.test.tsx` 3）；Desktop `bun run typecheck` 通过；`bun run check:quick` 通过（声明头 ratchet `new=0`）。
- 技术评审：自审；对照上游最终布局并逐项核对本地保留功能；发现并修复弹窗内模式切换会关闭添加弹窗的问题（新增 `onDialogModeSwitch` 并补测试）。
- 集成：实现提交 `b53a6fd98` 已集成 main；记录 `2fcc7d9e7` 已推送 `origin/dev`，`git ls-remote` 核对远端为 `2fcc7d9e7583e24de3c3c961f42357556fb0c57f`。
- 人工功能验收：待验收；用户可在设置 → 连接器打开添加/编辑弹窗检查视觉与交互。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop → 设置 → 技能与连接器 → 连接器 → 自定义 / 编辑已有项。
- 操作步骤或 AI 任务输入：切换 stdio/HTTP；填写授权 key；展开高级选项改请求头；切换 JSON 模式；编辑工具勾选。
- 预期行为与最终产物：布局去线留白、字段对齐；授权 key 与请求头一致；工具清单与 idleTimeout 仍可用。
- 不通过表现与已知限制：工具清单消失、idleTimeout 丢失、授权字段不同步、弹窗仍为旧 520px 带线样式。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `McpServerForm.tsx`：拆出导出的 `McpServerFields`，协议选择常驻、基础字段全宽、高级选项折叠与 1:1 网格；stdio 保留 `idleTimeout`，工具清单区块原样保留；HTTP 增加 Authorization key 字段并与原始请求头双向同步。
  - `mcp-authorization-header.ts`：新增大小写不敏感的 `getMcpAuthorization` / `setMcpAuthorization`。
  - `ManualMcpDialog.tsx`：500px 去线留白弹窗、标题图标、表单/JSON 分段切换、`JsonConfigInputView` 错误提示、底部右对齐操作区；保留 `SETTINGS_SECTION["mcp-server-list"]` 锚点。
  - `McpEditDialog.tsx`：同款 500px 弹窗头部，复用 `McpServerForm` 并传递 `editingServerTools`。
  - `useMcpSettingsModel.ts`：抽出 `parseJsonConfig`；新增 `onAddServersFromJson`（合并 JSON 服务器并关闭弹窗）与 `onDialogModeSwitch`（弹窗内切换模式不关闭弹窗）。
  - `packages/theme-ui/src/settings/JsonConfigInputView.tsx` + `index.ts`：新增 CodeMirror JSON 编辑器并导出。
  - zh/en `settings.json`：补齐 `mcpStore.*` 文案；`jsonMustIncludeServer`、`jsonSaveError` 按上游放在顶层命名空间。
  - 测试：`McpServerForm.tools.test.tsx` 改 mock 路径；新增 `McpServerForm.test.tsx`；`useMcpSettingsModel.test.tsx` 新增 JSON 合并与弹窗内模式切换用例。
- 实际运行：`cd apps/desktop && bun run test <3 个 MCP 测试文件>` → 3 files / 14 tests passed；`bun run typecheck` → 通过；`bun run check:quick` → 通过（`ratchet: waived=626 new=0`）。
- 未运行及原因：未启动 Desktop、未运行 `verify:ui:*`（本 Task 未授权真实 UI 启动）。
- 影响面：`bun run test:impact` 通过——Desktop 977 files / 5293 tests、theme-ui 定向 3 + 5 tests。
- 质量检查：完整 `bun run check` 通过（exit 0；含 lint 4962 files、根 `tsgo`、Desktop `typecheck:incremental`、guards，ratchet `new=0`）。
- Worktree：未拆出；表单与两个弹窗串行修改。
- 剩余风险：弹窗视觉与真实交互仍需人工验收；主题 UI 包既有 `check` 报错与本 Task 改动无关。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
