---
id: TASK-0462
type: task
status: verifying
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0458, TASK-0459, TASK-0461]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e10a88017
read_paths:
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/main/mcp/mcp-tool-catalog.ts
write_paths:
  - packages/host-protocol/src/domains/mcp.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/mcp-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/apis/system.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0462-mcp-noncredential-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0461]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# MCP 无凭证子域迁移到 Host 合同

## 目标

`vetta:mcp:config-path` / `has-auth` / `auth-status` / `list-server-tools` 迁为 `mcp.configPath` / `mcp.hasAuth` / `mcp.authStatus` / `mcp.listServerTools`，renderer 签名不变，旧 handler 删除。均为无凭证载荷（OAuth 状态布尔、工具清单、路径）。

## 调查结论（2026-11-07，只读核对）

- `mcp.getConfig()/set` 返回/接收含 env/headers 的服务器配置（可含密钥），按 ADR-0152 §7 与 models:get/set 同级——留待凭证通道评审，不在本任务。
- `mcp:login/logout/get-setup-login-status/start-setup-login/cancel-setup-login/clear-setup-login` 为 OAuth 流，留旧 IPC。
- `hasAuth(serverName) → boolean`（空白名 false）；`authStatus(serverNames[]) → Record<string, boolean>`（非数组返 {}，逐项过滤空白）；`listServerTools(serverName) → McpServerToolList`（未知名抛错→INTERNAL/INVALID_PARAMS 口径保持）；`configPath → string`。

## 做

- 新建 `domains/mcp.ts` 四方法合同（参数封闭；`authStatus` 的 params 为 string[]，长度 ≥0，元素 minLength 1 由实现过滤空白保持旧行为）。
- `host/mcp-domain.ts` 实现透传既有服务；`desktop-host.ts` 注册第三领域；`ipc/fs.ts` 删 4 handler 与枚举项及无用导入；preload 4 处改 `host.call`。
- 失败用例先行：注册清单 16 → 20 + hasAuth/authStatus 透传断言。

## 不做

- 不迁移 `mcp:get/set`（凭证面）与 OAuth 六通道；不改 `McpServerToolList` 形状与过滤行为。

## Given / When / Then

- Given 已登录某 MCP 服务器 / When `mcp.hasAuth` / Then true；空白名 → false（与旧通道一致）。`authStatus` 批量同口径；`listServerTools` 透传工具清单；`configPath` 返回路径字符串；旧 4 channel 不再注册。

## 测试与验证

- desktop 包内定向（desktop-host + host-transport + system）；`check:quick`；`apps/desktop typecheck`；`test:impact`；`count-ipc-channels` 记录下降。

## 交付记录

- 实际修改（2026-11-07）：新建 `domains/mcp.ts`（4 方法合同，参数封闭、`authStatus` 入参为非空 string 数组）与 `host/mcp-domain.ts`（透传 OAuth 服务与工具目录；`listServerTools` 对 readonly 数组浅拷贝对齐合同 Static）；`desktop-host.ts` 注册第三领域；`ipc/fs.ts` 删 4 handler、枚举 4 项及无用导入（`listMcpServerTools`、`MCP_CONFIG_PATH`）；preload 4 处改 `host.call`，`host-transport.ts` 客户端类型扩为 Settings ∪ Models ∪ Mcp。
- 行为差异说明：`authStatus` 对非数组入参由旧通道的"返回 {}"改为 `INVALID_PARAMS`（renderer 类型恒为数组，无存量调用受影响）。
- 实际验证：desktop 包内定向 3 文件 31 例通过（含 mcp 域 3 用例与注册清单 16 → 20）；`apps/desktop typecheck` 通过（修复 readonly 数组赋值）；`check:quick -- <8 个改动文件>` 通过（Biome 格式化 4 文件后复跑）；`test:impact` 后台复跑通过（264+ 例）；`count-ipc-channels` 683 → 679。
- 未运行与风险：完整 `bun run check` 未运行（既有环境问题）；`mcp:get/set` 与 OAuth 六通道仍留旧 IPC（凭证面，待 §7 评审）。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
