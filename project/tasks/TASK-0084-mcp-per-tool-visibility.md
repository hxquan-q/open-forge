---
id: TASK-0084
type: task
status: done
priority: P2
owner: packages/runtime-mcp + apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: 用户对齐 Cursor/Claude Code 的 MCP 应用层优化指令
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/runtime-mcp/src, packages/capability-sdk/src/domain/mcp.ts, apps/desktop/src/main/mcp, apps/desktop/src/renderer/domains/settings]
write_paths: [packages/runtime-mcp/src, packages/capability-sdk/src/domain/mcp.ts, apps/desktop/src/main/mcp, apps/desktop/src/main/ipc, apps/desktop/src/preload, apps/desktop/src/renderer/domains/settings, apps/desktop/src/shared/i18n]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（forge/dev 主工作区；随 523c28005 落地）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# MCP 按工具可见性与停用（Cursor parity）

## 背景

Agent 侧渐进披露（deferred threshold + `tool_search` + turn 冻结可见性）与 Skills 渐进加载已齐备，与 Claude Code 对齐。应用层差距（对照 Cursor）：用户看不到每个 server 暴露了哪些工具，也不能按工具停用——只有整 server `disabled`。`autoApprove` 刻意保持只作用于 MCP Apps 内嵌 UI（插件 manifest 可声明，接入 agent 审批会自我授权，不接）。

## 范围

### 做

- `McpServerCommonConfig.disabledTools?: string[]`（server 原始工具名），runtime-mcp config schema + 协议类型 + desktop `mcp-config-validation` + preload 类型 + capability-sdk detail/upsert 合同。
- `server-runtime-tool-source.ts` 按 `binding.view.config.disabledTools` 排除：停用工具不进 catalog（不进 deferred 索引、不可调用、对模型零成本）。
- 只读工具清单通道：读 `FileMcpServerCatalogCache`（signature 命中 = 该 server 上次成功发现的工具），IPC `vetta:mcp:list-server-tools` → settings UI。
- MCP 设置详情：可展开工具清单 + 每工具开关，写 `disabledTools`；无缓存时显示「工具清单将在 server 首次连接后出现」。

### 不做

- 不把 `autoApprove` 接到 agent 审批路径（安全边界：插件可自我声明）。
- 不动 deferred 阈值、`tool_search` 评分、skills 机制。
- 不做实时连接健康监控面板（本任务只读缓存目录；live 状态另立任务）。

## Given / When / Then

- Given：server 配置 `disabledTools: ["write_file"]`；When：runtime tool source refresh；Then：`mcp_<server>_write_file` 不在工具视图，模型侧索引与 deferred 目录均无该项。
- Given：用户在 MCP 设置详情打开某 server 的工具清单；When：缓存存在；Then：逐工具显示名称+描述+启用开关；关闭某项后写入 `disabledTools` 并在下次 refresh 生效。
- Given：server 从未连接过（无缓存）；When：打开工具清单；Then：显示空态说明而非报错。

## 验收

- runtime-mcp 源层测试覆盖 disabledTools 的增删改（新增过滤、移除恢复、配置热更）。
- capability-sdk 合同测试覆盖 disabledTools 输入输出与未知字段。
- desktop 配置校验/IPC/UI 组件测试。
- `bun run check:quick` + 定向测试全绿。

## 交付记录

### 实现

- `packages/runtime-mcp`：`McpServerCommonConfig.disabledTools?: string[]`（protocol 类型 + config schema 严格校验非空字符串数组）；`McpServerRuntimeToolSource.refresh()` 按 `binding.view.config.disabledTools` 排除，停用项不进 catalog、不进 deferred 索引、不可调用；`computeMcpServerConfigSignature` 剔除 `disabledTools`（可见性开关不打穿 catalog 缓存，避免无谓重连发现）。
- `packages/capability-sdk`：`mcpServerDetailType` / upsert 公共字段补 `disabledTools`。
- `packages/runtime-node`：`FileMcpServerCatalogCache.latest(name)` 返回最近一次成功发现的目录（不限签名），供 UI 只读展示。
- `apps/desktop`：
  - `main/mcp/mcp-tool-catalog.ts` `listMcpServerTools()`：读配置 + 缓存目录，产出 name/description/enabled/stale + `cached` 标记；不触发连接。
  - IPC `vetta:mcp:list-server-tools`（`ipc/fs.ts`，薄 handler + 非空校验 + teardown removeHandler）+ preload `mcp.listServerTools`。
  - `mcp-config-validation` 白名单补 `disabledTools`；`McpSettingsService` redact/upsert 透传。
  - `useMcpSettingsModel`：编辑态异步加载清单（`editingServerRef` 防过期覆盖），`serverToForm`/`formToServer`/built-in/市场合并全路径保留 `disabledTools`。
  - `McpServerForm` 基础区新增工具清单块（仅编辑态传入 `serverTools`）：逐项 CheckboxField + 描述 + stale 徽标；loading / 未发现 / 空目录三态文案；新增态不渲染。
  - i18n：`settings` ns 新增 `mcpServerTools*` 五键（zh 为准，en 已填）。

### 测试（17 用例全绿）

- `runtime-mcp`：`server-runtime-tool-source.test.ts` 停用排除 + 重新启用恢复（6/6）。
- `capability-sdk`：`mcp.test.ts` disabledTools upsert/detail round-trip + 非法类型拒收（4/4）。
- `desktop`：`mcp-tool-catalog.test.ts` 4/4（清单标注、stale 保留、无缓存空态、未知 server 报错）；`McpServerForm.tools.test.tsx` 7/7（渲染/勾选写入/取消移除/stale 标记/未发现/加载中/新增态隐藏）。

### 发布说明候选（首发号切入 manifest 前不入 Vetta 继承线）

- **MCP server 可以按单个工具停用，不再只能整 server 关停**：设置里编辑某个 MCP server 时会看到它上次成功连接发现的工具清单（名称、说明和逐项开关），关掉某一项后该工具不再进入 Agent 的工具面与搜索索引。server 从未连接过时清单区会说明首次连接后出现；配置里已停用、但 server 后来移除或改名的工具仍会列出并标为「已不在目录中」，便于清理。

### 已知边界

- 清单是「最近一次成功发现」快照，非实时连接状态；live 健康监控另立任务。
- `autoApprove` 仍只作用于 MCP Apps 内嵌 UI 回调；Agent 侧免确认走宿主 Trust/remember，不接 manifest 自我声明。
- SegmentedControl 在 vitest 下命中 react 19.3.0/react-dom 19.2.8 错配（既有问题，测试内 mock 规避）。
