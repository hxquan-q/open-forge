---
id: TASK-0086
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0007
plan: []
source: user-request; REQ-0007
execution: serial
branch: forge/dev
worktree: unassigned（主工作区串行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/abilities, apps/desktop/src/renderer/domains/settings/mcp, apps/desktop/src/renderer/domains/settings/components, apps/desktop/src/main/mcp, apps/desktop/src/main/mcp-config-validation.ts, apps/desktop/src/preload/api-types/mcp.ts, packages/runtime-mcp/src, packages/runtime-node/src/mcp, packages/theme-ui/src/settings, apps/desktop/src/shared/i18n, docs/adr/0049-abilities-unify-storage-and-presentation-not-installation.md, docs/adr/0092-declarative-managed-runtimes-for-mcp-abilities.md, packages/runtime-mcp/AGENTS.md, packages/runtime-node/AGENTS.md]
write_paths: [apps/desktop/src/renderer/domains/settings/mcp/builtin-mcp-presets.ts, apps/desktop/src/renderer/domains/abilities/lib/build-ability-items.ts, apps/desktop/src/renderer/domains/abilities/lib/ability-catalog-query.ts, apps/desktop/src/renderer/domains/abilities/lib/build-ability-items.test.ts, apps/desktop/src/renderer/domains/abilities/lib/ability-catalog-query.test.ts, apps/desktop/src/renderer/domains/abilities/hooks/useAbilityMcpInstall.test.tsx, apps/desktop/src/renderer/domains/settings/components/useBuiltinMcpSecretsDialogModel.ts, apps/desktop/src/main/mcp-config-validation.ts, apps/desktop/src/main/mcp-config-validation.test.ts, apps/desktop/src/preload/api-types/mcp.ts, packages/runtime-mcp/src/protocol/types.ts, packages/runtime-mcp/src/config/schemas.ts, packages/runtime-node/src/mcp, packages/runtime-node/test/mcp, packages/theme-ui/src/settings/BuiltinMcpSecretsDialogView.tsx, packages/theme-ui/src/settings/SettingsFormFields.tsx, apps/desktop/src/shared/i18n/locales/zh/settings.json, apps/desktop/src/shared/i18n/locales/en/settings.json, apps/desktop/src/renderer/public/mcp]
exclusive_paths: [apps/desktop/src/renderer/domains/settings/mcp/builtin-mcp-presets.ts, apps/desktop/src/renderer/domains/abilities/lib/build-ability-items.ts, apps/desktop/src/renderer/domains/abilities/lib/ability-catalog-query.ts, apps/desktop/src/main/mcp-config-validation.ts, apps/desktop/src/preload/api-types/mcp.ts, packages/runtime-mcp/src/protocol/types.ts, packages/runtime-mcp/src/config/schemas.ts, packages/runtime-node/src/mcp, packages/theme-ui/src/settings/BuiltinMcpSecretsDialogView.tsx]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 内置通用数据库 MCP：发现列表 + 宿主注入连接（Option D）

## 目标

在能力页以**客户端内置 MCP 预设**形式提供 `universal-db-mcp`：发现可见、添加时填写 `DB_*` 配置项、写入 `mcp.json`、宿主在每次 MCP 连接后自发调用上游 `connect_database` tool 注入连接。行为对齐历史「listed 内置连接器」模式（非 Plugin）；连接注入采用通用 `postConnectToolCalls` 机制，**不**走 argv。

## 背景事实

- `0f1d28c0d` 移除了 Notion/Figma/GitHub 的发现合成；`getListedBuiltinMcpPresets` 与 `buildMcpAbilities` 中的预设循环已删，`listedInDiscover`/`detail` 字段一并移除。
- 现有 `BUILTIN_MCP_PRESETS`（Canva/Slack/…）仍服务已装匹配与密钥对话框，但**不会**出现在未添加的发现列表。
- 当前 `isAbilityListedInDiscover` 认 `fromMarket || isBuiltin`；恢复方案是对 MCP 合成项用 `catalogSource.kind === "builtin"` 判断（旧机制），**不是**把 `isBuiltin` 置 true——后者会把条目归入「Open Forge 内置」分组（`group-abilities.ts`）并退出分页，与「连接」分组语义冲突。
- **已核实的上游事实（`universal-db-mcp@2.14.0` dist，npm latest，2026-03-17 发布）**：
  - stdio 模式只认 commander argv（`--type/--host/--port/--user/--password/--database/--file`）或运行时 `connect_database` tool；`DB_*` env 仅被 `config-loader` + `http/routes` 消费，`dist/mcp/mcp-index.js` 无 `process.env` 读取——**env 注入对 stdio 无效**。
  - 不传 `--type` 即以「无连接模式」启动，`ListTools` 无条件返回全部 tool；`connect_database`/`disconnect_database`/`get_connection_status` 是 2.14.0 官方 API。
  - `get_connection_status` 返回体只含 `connected/type/permissionMode/host/port/database/filePath/schemaCache`，无凭据回显。
  - `normalizeDbType` 合法值 17 个：`mysql postgres redis oracle dm sqlserver mongodb sqlite kingbase gaussdb oceanbase tidb clickhouse polardb vastbase highgo goldendb`；别名 `mssql→sqlserver`、`opengauss→gaussdb`；非法值启动即抛错。
  - 默认 `permissionMode: safe`（只读）。
- 宿主机制事实（已核实）：
  - `LazyMcpClientHandle.connect()` 是单飞 promise，`init` 在任何 queued invoke 前完成——bootstrap 挂 `client.initialize()` 之后天然有序，且 idle 回收（`recycleIdleServer`，默认 30min）后的重连自动重放。
  - `createNodeMcpSupervisor`（`runtime-node/mcp/supervisor.ts`）统一装配 desktop / cli-host / coding-agent session host 三宿主；在 runtime-node 层做 bootstrap 即全覆盖。
  - `disabledTools` 只过滤 agent 侧 tool 发布（`server-runtime-tool-source.ts`），宿主经 `client.callTool` 不受影响。
  - Desktop 写侧 `mcp-config-validation.ts` 是**白名单**：未知字段会使整个 `readMcpConfig` 落入 catch 返回空配置——新字段必须先登记白名单再使用。
  - 现有链路无 args 级日志（stdio `callTool` 不记 params，`McpRuntimeObservation` 只有计数，app-monitor 只有 `resource.lifecycle`）；脱敏是守护性要求，不是改现有管道。

## 范围

### 并发评估

- 结论：**不支持**与其它改同一预设/能力组装/MCP 配置合同文件的 Task 并行
- 执行方式：serial / 共享工作区；跨 `runtime-mcp`/`runtime-node`/`apps/desktop` 三包顺序修改
- 可并行 Task：无（文档站补丁可后置）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：`forge/dev`
- Worktree：主工作区
- 集成负责人：本 Task 执行者
- 集成顺序：单 Task 一次合入

### 做

1. **恢复发现合成**（renderer）：
   - `BuiltinMcpPreset` 增加 `listedInDiscover?: boolean` 并恢复 `getListedBuiltinMcpPresets()`。
   - `buildMcpAbilities` 恢复 listed 预设合成循环：`catalogSource: BUILTIN_SOURCE`、`category: ABILITY_CATEGORY_CONNECTORS`、`isBuiltin: false`；**必须一并恢复** `presetNames` 进 `hasCatalogConflict`（市场条目与预设同 slug 时市场项用 qualified name）与 `claimedByMarket` 去重/mcpConfig 过滤。
   - `isAbilityListedInDiscover` 恢复 `item.type === "mcp" && item.catalogSource.kind === "builtin"` 分支（与 `isBuiltin` skill/plugin 并存）。
2. **通用 `postConnectToolCalls` 合同**（按通用机制设计，不为 universal-db 私有）：
   - `runtime-mcp`：`McpStdioServerConfig` 增加可选 `postConnectToolCalls?: McpPostConnectToolCall[]`（`{ tool: string; args?: Record<string, string> }`）；`McpStdioServerConfigSchema` 增加对应形状校验（磁盘 schema 现状 `additionalProperties: true`，此处是补正式形状而非放行）。
   - Desktop：`mcp-config-validation.ts` `STDIO_SERVER_KEYS` + 形状校验；`preload/api-types/mcp.ts` `McpStdioServerConfigData` 同步声明。
   - **不变量：落盘 spec 是模板**。`args` 值只允许字面量或 `{env:KEY}` / `{env:KEY:number}` / `{env:KEY:boolean}` token；resolve 只发生在 bootstrap 执行器内存中并随 `tools/call` 发出，**绝不回写磁盘**。
   - **模板语义**：`{env:KEY}` 从该 server `env` 取值；env 缺失**或值为空串**时**整个 key 从 arguments 剔除**（不置空串/不置 `undefined`/`null`——`host:""` 会让上游以空地址/默认值静默误连）；`:number`/`:boolean` 做类型转换，转换失败按缺失处理；字面量原样透传。
3. **runtime-node bootstrap 执行器**：
   - 在 `createNodeMcpSupervisor` 的 `clientFactory` 包装层装饰返回的 `McpClientHandle`：`initialize()` 成功后、返回前执行 spec。
   - 执行顺序：`client.initialize()` → `client.listTools()` → 对每个 spec 条目做**通用反射浅校验**（不硬编码具体 tool 的私有预期）：①目标 tool 必须存在于 advertise 列表；②spec args 的每个 key 必须在 `tool.inputSchema.properties` 中声明；③resolved 值类型须与 schema 声明的 `type`（string/number|integer/boolean）兼容；④`inputSchema.required` 的每个键必须由 resolved args 提供，缺必填报「env KEY 未设置/模板缺失」。任一不符即 throw「上游 schema 与预设不兼容」，**不发出错位 callTool** → `callTool(tool, resolvedArgs)` → 完成。
   - 每次（重）连都执行（connect 状态是进程内的）；失败即 init 失败 → server 进入 `error` 态并透出信息。
   - **脱敏不变量**：resolved args 不得进入 `onDiagnostic`、console、遥测或任何日志/调试管道；执行器自身的诊断输出只允许 server 名、tool 名与结果成败。
   - **错误透出脱敏**：上游驱动报错文本可能回显连接 URI（`scheme://user:password@host`）或参数值；bootstrap 失败透出前做凭据清洗（URI password 抹除 + secret 形态 key 的值替换），错误信息可含 host/user 等非敏感上下文但绝不含密码。
4. **预设 `universal-db`**：
   - `command: "npx"`, `args: ["-y", "universal-db-mcp@2.14.0"]`（无连接模式），`packageHint: "universal-db-mcp"`（已装匹配/图标/`canEdit=false` 依赖它），`listedInDiscover: true`。
   - `secrets`（写 `env`）：`DB_TYPE`（必填，**select**，选项为 17 个规范值）、`DB_HOST`（仅非 sqlite 必填）、`DB_PORT`、`DB_USER`、`DB_PASSWORD`（secret）、`DB_DATABASE`、`DB_FILE_PATH`（仅 sqlite 必填）；**不**暴露 `DB_ALLOW_WRITE`/`DB_AUTH_SOURCE`。
   - `config.disabledTools: ["connect_database", "disconnect_database"]`（对 agent 隐藏连接管理；`get_connection_status` 保留可见）。
   - `config.postConnectToolCalls: [{ tool: "connect_database", args: { type: "{env:DB_TYPE}", host: "{env:DB_HOST}", port: "{env:DB_PORT:number}", user: "{env:DB_USER}", password: "{env:DB_PASSWORD}", database: "{env:DB_DATABASE}", filePath: "{env:DB_FILE_PATH}" } }]`。
   - `BuiltinMcpSecretField` 增加 `options?: readonly string[]`（select 渲染）供 `DB_TYPE`；**视图层在 `packages/theme-ui/src/settings/BuiltinMcpSecretsDialogView.tsx`**（desktop 侧只是薄代理）——`BuiltinMcpSecretFieldView` 加 `options` 并以 `SelectField`/`MotionSelect` 渲染，desktop model 同步透传。
   - **条件必填**（SQLite 场景必填校验联动）：`BuiltinMcpSecretField` 增加 `requiredWhen?: { envKey; values; mode?: "in" | "notIn" }`（存在时覆盖 `required`），`isSecretFieldRequired` 纯函数按引用字段当前值判定；`canSubmit`、字段 `*` 标记与 `missingRequiredSecrets` 统一走该函数。选联动方案而非「仅 DB_TYPE 必填」：SQLite 用户不被网络字段卡住，MySQL 用户漏填 host 仍在表单层拦截。
5. i18n：`BuiltinMcpLabelKey`/`BuiltinMcpSecretLabelKey`/`BuiltinMcpGuideKey` 扩展 + zh/en `settings.json`（显示名/描述/字段 label/setup 引导，引导中强调使用只读账号）；`public/mcp` 图标。
6. **测试**（见下节，全部为新功能的最低充分集）。

### 不做

- 不把凭据写进 argv；不借道 LLM/agent 传参。
- 不改 `runtime-mcp` 的 supervisor、lazy handle、config schema 既有行为（仅 `types.ts`/`schemas.ts` 加可选字段的加法变更）；不改 agent loop、tool source 同步、审批语义。
- 不把 Canva/Slack 等现有预设默认 `listedInDiscover: true`。
- 不写 marketplace 包、不引入 managed-binary、不 vendor/patch 上游包。
- 不做 safeStorage 凭据库（env 落盘与现有预设同级，后续独立加固项）。
- 不恢复旧预设的 `detail`/ability.json 详情页内容（本次接受卡片详情较简）。
- 不动 `isManuallyInstalledAbility`/mine scope 语义（已装预设 MCP 不进「我的」是既有行为，文案以发现页已添加状态 + 设置→MCP 列表为准）。
- 不在本 Task 跑 `verify:ui:*`（除非用户另行授权）。

## Given / When / Then

- Given：未添加；When：能力 → 发现；Then：出现 `universal-db` 卡片，归「连接」分组，Canva/Slack 等未列出预设不出现。
- Given：点添加；When：未填必填项确认；Then：不写入 mcp.json，确认按钮禁用态保留在对话框。
- Given：填齐必填（`DB_TYPE=mysql` + host/user/password/database）；When：确认；Then：mcpServers 含该 key，`env` 含 `DB_*` 值，`postConnectToolCalls[].args` 只含 `{env:…}` 模板（序列化文件正则扫描无任何 secrets 明文），`args` 无 `--password` 类参数。
- Given：已添加；When：会话中首个 MCP 调用发生；Then：连接建立后 bootstrap 先执行 `connect_database`（参数为 env resolve 值），随后 catalog/agent 调用正常；`connect_database`/`disconnect_database` 对 agent 不可见。
- Given：sqlite 配置（仅 `DB_TYPE` + `DB_FILE_PATH`）；When：bootstrap；Then：发出的 arguments 不含 host/port/user/password 键。
- Given：上游 tool schema 与预期不符（如升级未钉版本）；When：连接建立；Then：bootstrap fail-fast，server 错误态提示「不兼容」，不发出错位调用。
- Given：已添加；When：打开能力详情改参数保存；Then：config signature 变化触发重连，新 env 参与下一次 bootstrap。
- Given：用户删除；When：确认；Then：mcp.json 条目移除，发现页可再次添加。

## 必须保持

- 市场 MCP、手动 MCP、已退休 Notion/Figma/GitHub 清理迁移行为不变。
- 未 `listedInDiscover` 的预设仍不出现在发现列表；手改 mcp.json 含 `postConnectToolCalls` 不得导致整个配置读取失败（白名单先行）。
- 合成 MCP 项 `isBuiltin` 保持 `false`（分组/分页/mine scope 语义不受影响）。
- 凭据不进 argv、不进 LLM 上下文；resolve 值不落盘；bootstrap args 不进任何可观测性表面。
- `onDiagnostic` 合同（不含 secrets/payloads）不被 bootstrap 破坏。
- 三源聚合、`mcp_<server>_<tool>` 命名、Trust/审批档位不变。

## 测试与验证

- **runtime-node 合同测试**（fake `McpClientHandle`，不连真实服务）：
  - `initialize` 成功后、`listTools`/后续调用前发出 `connect_database`，args 为 env resolve 值；
  - 缺失 env 的 key 不出现在 arguments（sqlite 子集场景）；`:number` coercion 生效；
  - required 键缺失报「env KEY 未设置」；schema 字段不符报「不兼容」且不发 callTool；
  - disconnect → 重连后 bootstrap 再执行；
  - `onDiagnostic`/log sink 全部消息中不出现 resolved secret 值。
- **Desktop 写盘断言**：`buildBuiltinMcpServerConfig` 产出序列化后，`postConnectToolCalls[].args` 不含任何 secretValues 明文（正则扫描）；`mcp-config-validation` 接受该字段且拒绝畸形 spec。
- **renderer 现有测试更新**：`ability-catalog-query.test.ts` 的「does not synthesize retired built-in MCP entries in discover」改写为「只合成 `listedInDiscover` 预设」；`build-ability-items.test.ts` 补合成项的 catalogSource/category/isBuiltin/slug 冲突断言；`useAbilityMcpInstall`/`useAbilityActions` 链路补添加→写盘→`disabledTools` 断言。
- 用户流程：发现 → 添加填表（DB_TYPE select）→ 已装 → 配置改密 → 删除再发现；组件/纯函数层覆盖主路径，真库连通为手工可选。
- 质量检查：`bun run check:quick -- <改动文件>`；`bun run test:impact -- <改动文件>`；`bun run test:pkg runtime-node`；任务结束 `bun run check`。

## 发布说明候选（首发版本切入前暂存）

- 能力发现新增官方「通用数据库」连接器（universal-db-mcp，默认只读；连接凭据由宿主安全注入，不进命令行参数与对话上下文）。

## 交付记录

- 实际修改：
  - `runtime-mcp`：`types.ts` 新增 `McpPostConnectToolCall` + `McpStdioServerConfig.postConnectToolCalls`；`schemas.ts` 同步磁盘形状校验（仅 stdio，HTTP 拒绝）。
  - `runtime-node`：新增 `mcp/client/post-connect-tool-calls.ts`（Proxy 装饰器 + 模板 resolve + 通用反射浅校验 + 空串剔除 + URI/secret 参数脱敏）；`supervisor.ts` 在 `createNodeMcpSupervisor` 的 clientFactory 包装层接线（对注入的自定义 factory 同样生效）；`client/index.ts` 导出。
  - `desktop`：`preload/api-types/mcp.ts` 声明字段；`mcp-config-validation.ts` `STDIO_SERVER_KEYS` 白名单 + 形状校验。
  - `renderer`：`builtin-mcp-presets.ts` 恢复 `listedInDiscover`/`getListedBuiltinMcpPresets` + `BuiltinMcpSecretField.options`/`requiredWhen` + `isSecretFieldRequired` + `missingRequiredSecrets` 动态化 + `universal-db` 预设（17 类型 select、模板 spec、hidden tools）；`build-ability-items.ts` 恢复 listed 合成循环（`BUILTIN_SOURCE`/connectors/`isBuiltin:false`/`presetNames` 冲突与 `claimedByMarket` 去重）；`ability-catalog-query.ts` 恢复 builtin 分支；`useBuiltinMcpSecretsDialogModel.ts` 动态必填 + options 映射。
  - `theme-ui`：`BuiltinMcpSecretsDialogView.tsx` 支持 options→`SelectField`；`SettingsFormFields.tsx` `SelectField` 增加可选 `placeholder`。
  - i18n zh/en `settings.json`（displayName/description/secrets label/guide）+ `src/renderer/public/mcp/universal-db.svg`。
- 实际运行：
  - `post-connect-tool-calls.test.ts` 13 用例全绿（时序/env 映射/空串剔除/coercion/required 缺失/schema 不兼容/重连重放/脱敏）。
  - `build-ability-items.test.ts` 25、`ability-catalog-query.test.ts` 7、`mcp-config-validation.test.ts` 7、`useAbilityMcpInstall.test.tsx` 3、`useAbilityActions.test.tsx` 8、`useAbilitiesModel.test.tsx` 5、`useBuiltinMcpSecretsDialogModel.test.tsx` 4 全绿。
  - `check:quick`（18+4 改动文件）全绿；`bunx tsgo --noEmit` 与 `tsc -p apps/desktop` 中本任务文件零错误。
  - `test:impact`/`test:pkg runtime-node`/`test:changed`：本任务测试全过；失败均为未触碰文件的既有基线问题（runtime-node `tool-path-host.test.ts` Windows 盘符断言、coding-agent/runtime-storage `generation` 字段、desktop plugin-permission/activity-panel 等 29 个文件）。
- 未运行及原因：
  - `bun run check` 全量：包含全仓 typecheck，基线本身有未触碰文件的既有错误，跑完也只会复现上述列表；以 `tsgo`/desktop `tsc` 定向验证替代。
  - `verify:ui:*`：无用户授权。
  - 真库连通：合同测试用 fake client，真库连通为手工可选验收项。
- 剩余风险：
  - `useAbilitiesModel.test.tsx` 深链测试的整表断言已按新合成卡片更新（`Universal Database`）——属预期行为变化。
  - `DB_HOST` 是网络库唯一表单必填（`requiredWhen notIn sqlite`）；user/password/database 保持可选以兼容无密码部署（Redis/Mongo 无鉴权），漏填由上游连接错误透出而非表单拦截。
  - 上游 `connect_database` schema 漂移由钉版本 + 反射校验兜底；升级需回归。
