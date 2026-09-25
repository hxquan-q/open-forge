---
id: TASK-0045
type: task
status: ready
priority: P1
owner: release/brand
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: parallel
branch: task/TASK-0045-ecosystem-identities
worktree: ../open-forge-wt/task-0045-ecosystem-identities
base_commit: 0e2e1ae3f9089b77aa05d88f5ac2f8f3ff38de1a
read_paths: [apps/cli-host/AGENTS.md, apps/cli-host, apps/im-gateway/README.md, apps/im-gateway/Makefile, packages/runtime-mcp/AGENTS.md, packages/runtime-mcp, packages/plugins/AGENTS.md, packages/plugins, apps/desktop/src/main]
write_paths: [apps/cli-host, apps/im-gateway, packages/runtime-mcp, packages/plugins, apps/desktop/src/main, .github/release-notes]
exclusive_paths: [apps/cli-host, apps/im-gateway, packages/runtime-mcp, packages/plugins, apps/desktop/src/main, .github/release-notes]
depends_on: [TASK-0043]
conflicts_with: [TASK-0044, TASK-0046]
integration_status: pending
created: 2026-09-23
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# CLI 与第三方集成生态身份迁移

## 目标

让用户和集成方接触到的命令、IM 展示名称、MCP 客户端名称及插件作者身份遵循已批准的 Open Forge 品牌映射，同时保护既有公开合同。

## 范围

### 并发评估

- 结论：与活跃 Task 无并发冲突（`TASK-0044` 已完成、`TASK-0046` blocked）；跨 CLI、Go IM Gateway、MCP、Plugin 和 Desktop Host，需统一核对外显身份与兼容值，任务内部串行推进。
- 执行方式：parallel 泳道（2026-09-26 用户指定独立 Worktree 实施），任务内部按宿主顺序串行落地。
- 可并行 Task：无。
- 前置依赖：`TASK-0043` 的品牌事实源完成；CLI 命令目标、旧命令别名/迁移策略需先明确。
- 冲突文件/独占路径：各宿主的命令入口、IM/MCP 展示元数据、插件清单和 Release Notes。
- Branch：`task/TASK-0045-ecosystem-identities`；Worktree：由 `worktree:create` 按当前协作状态分配。
- 集成负责人：coordinator。
- 集成顺序：TASK-0043 → TASK-0044 → 本任务；完成后进入文档迁移。

### 做

- 按冻结后的映射更新 CLI 用户入口和外部集成可见名称，包括 IM 应用预填名、MCP OAuth `client_name`、插件作者显示值及明确属于产品品牌的 `User-Agent`。
- CLI 名称变更需先确认新命令名以及旧命令的兼容/弃用策略；合同测试和已安装制品同步更新。
- 改动点按其真实所有权落在 CLI Host、Go Gateway、Runtime MCP、Plugin manifest 或 Desktop Host；不得把产品策略塞进平台无关 Runtime。

### 不做

- 不改 `@vetta/*`、`VETTA_*`、`vetta:`、`vetta.remote.v1`、`X-Vetta-*`、`.vettapkg` 等冻结技术合同。
- 不改公开 npm scope（单列 TASK-0046），不执行 npm publish。
- 不注册外部账号、不修改第三方线上应用，也不调用真实 Provider / MCP 服务。

## Given / When / Then

- Given：用户或集成方通过 CLI、IM、MCP 或插件清单看到产品身份；When：已批准的名称映射应用到相应入口；Then：外显身份为 Open Forge，内部协议和未批准的命令/API 合同保持不变，旧命令的兼容行为符合明确的迁移策略。

## 必须保持

- CLI 参数、stdout/stderr、退出码和 sidecar 生命周期不因显示名迁移而改变。
- Go Gateway 与 Desktop 的启动/协议合同不变。
- Plugin API、manifest Schema、权限语义与 Runtime MCP Port 不变；如果实现发现必须改公共合同，另立合同 Task 并更新插件文档。

## 测试与验证

- 定向测试：CLI 命令/兼容别名合同、MCP 客户端元数据和插件清单构建校验。
- 用户流程：运行 CLI help/版本入口、检查 IM 集成配置展示和插件详情的名称；不得连接真实 IM/MCP 服务。
- 质量检查：`bun run verify:runtime-contract`、`bun run verify:artifact:installed`、`bun run test:impact -- <changed files>`；Go 改动另在 `apps/im-gateway` 运行 `make test`；插件清单变化按插件规则验证目标 build。

## 阻塞

- 无。命名决策已齐（2026-09-25 用户确认）：CLI 命令名 `openforge`；旧命令（`vetta`、`vetta-agent`、`vetta-cli-app`、`vetta-agent-rpc`）**直接切换、不保留别名**；`vetta-serv` 代号改 `openforge-serv`（按 ISSUE-0001 决策 #12，同步 SECURITY.md、`.coderabbit.yaml` 与 ADR 引用）。本任务 blocked → ready，可排期实施。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
