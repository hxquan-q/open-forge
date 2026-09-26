---
id: BUG-0043
type: bug
status: done
priority: P1
owner: packages/runtime-node MCP stdio transport + apps/desktop builtin preset
requirement: REQ-0007
plan:
source: dev 实机使用中「通用数据库」连接器添加后始终连接失败，能力页显示不可用
related_requirement: [REQ-0007]
related_plan: []
related_tasks: [TASK-0086]
related_issues: []
created: 2026-09-27
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# 「通用数据库」连接器首次启动被 30s 握手超时杀掉，npx 缓存损坏后每次秒失败且无报错详情

## 用户流程

- Given：用户在能力页添加内置「通用数据库」连接器并填写数据库连接参数（凭据落本机 env）
- When：宿主启动 MCP server（`npx -y universal-db-mcp@2.14.0`，首次需在线安装约 500 个依赖）
- Then：安装完成后握手成功，宿主自动注入 `connect_database` 建立只读连接，模型可用查询/表结构工具

## 实际行为

首次启动约 30 秒后连接失败；之后每次重连在毫秒级报 `MCP server exited: code=1`，连接器永远不可用，界面没有任何可定位原因的报错。

## 期望行为

首次启动按连接器声明的启动预算等待依赖安装完成；启动失败时把子进程 stderr 尾部透出给用户，能区分依赖安装失败、命令不存在与凭据错误。

## 环境与失败证据

- Windows 11 开发机，`~/.openforge-dev`，commit 含 TASK-0086 集成
- `~/.openforge-dev/runtimes/.npm-cache/_npx/<hash>/` 只有 `node_modules`，缺 `package.json`/lock 元数据；此后 `npx` 复用该目录立即 `ENOENT` 退出
- 应用 npm 日志停在中途（`better-sqlite3 install` 阶段），与 30s 超时被整树杀死的时点吻合
- 修复缓存后直探验证：服务启动、`connect_database` 连接 MySQL 成功、`get_connection_status` 返回 `connected: true`——上游包与凭据均无问题

## 根因

1. `StdioMcpClient.initialize()` 的握手走通用请求超时（默认 30s），**没有消费** `config.startupTimeout`（该字段此前只有 HTTP 客户端使用）；30s 到点后 supervisor 判定连接失败，`terminateMcpProcessTree` 杀掉仍在安装的 npx 进程树，留下缺 `package.json` 的半成品 `_npx` 缓存目录。
2. `StdioMcpProcess` 只在 debug 开关下记录 stderr，进程退出错误只携带 exit code，npm 的真实 `ENOENT` 报错完全不可见。
3. `universal-db` 预设未声明 `startupTimeout`，冷安装没有任何预算保护。

## 回归测试

- `stdio-mcp-client.test.ts` 新增两条：握手在请求级超时之后、`startupTimeout` 之内应答仍成功（旧实现会在 60ms 处即失败）；`startupTimeout` 自身到期仍按预期超时失败。
- `stdio-process.test.ts` 新增一条：进程启动即退出（写 stderr 后 `exit(1)`）时，pending `initialize` 的拒绝信息携带 stderr 尾部（旧实现只含 `exited: code=1`）。

## 修复与验证

- 修复：`StdioMcpClient` 握手改用 `config.startupTimeout ?? timeout`（同时覆盖 modern discover 与 legacy initialize）；`StdioMcpProcess` 保留 4KiB stderr 环形尾部，进程退出错误附带至多 800 字符片段；`universal-db` 预设声明 `startupTimeout: 180_000`。
- 测试：`run-vitest` 跑 `stdio-mcp-client` / `stdio-process` / `post-connect-tool-calls` 共 28 用例全绿；desktop 侧 `build-ability-items` / `useAbilityMcpInstall` / `useBuiltinMcpSecretsDialogModel` 共 32 用例全绿；`check:quick`（Biome + 全部架构守卫 + 声明头门禁）通过。
- 未运行及原因：`verify:ui:*` 实机验收未跑（需用户明确授权）；dev 实机链路已用应用自有 npm 缓存 + 用户真实配置直探验证连通。
- 残留风险：已被旧逻辑损坏的 `_npx` 缓存目录不会自动修复（错误现在会直接显示 npm 的 ENOENT 详情，可人工删缓存目录后重连）；通用 stderr 尾部未做凭据级脱敏，依赖 server 不在 stderr 打印 argv/环境。
