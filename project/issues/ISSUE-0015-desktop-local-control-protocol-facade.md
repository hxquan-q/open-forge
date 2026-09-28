---
id: ISSUE-0015
type: issue
status: done
priority: P1
owner: apps/desktop/packages/action-rpc
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `mcp-control.ts` + ADR-0203 loopback MCP 控制面对照）
created: 2026-09-24
updated: 2026-09-25
related_tasks: []
depends_on: [RESEARCH-0010]
---
<!-- Copyright The Open Forge contributors. -->

# 桌面本地控制面的协议门面选型（MCP vs 扩展 action-rpc）

## 背景与已知事实

- RESEARCH-0010 §2 证实：PI-Desktop 以 `PI_DESKTOP_MCP_CONTROL=1` 在 Electron main 起 127.0.0.1 Streamable HTTP MCP server——bearer token、`~70` 个 IPC 通道打 read/write/dangerous 风险标、dangerous 强制 `confirm:true`、blocked keys 排除 secrets 通道、仅 mutating 调用推 renderer 刷新；同一操作目录同时服务 renderer IPC、外部 MCP 与插件三方。
- 本仓库**等价能力已存在**：`packages/action-rpc`（127.0.0.1 + token + 原子 endpoint file）+ `app-actions` catalog（`vetta-actions` 插件提供 navigation/settings/models/mcp/projects/batch-tasks/scheduler 等域）+ `approval-broker`（写操作审批）+ `OpenForge.exe action search/describe/run` CLI。外部脚本今天就能驱动桌面。
- 缺口是**协议面**：action-rpc 是私有 JSON-RPC，通用 MCP 客户端（Cursor、Claude Code、任意 MCP host）无法直接挂载；要让「在 Cursor 里调用 Open Forge 开重构会话」成立，需要 MCP 协议门面或第三方适配器。

## 未决问题

1. 是否需要 MCP 协议门面：继续推 `action` CLI 作为唯一外部入口，还是让桌面可被通用 MCP 客户端发现与调用？
2. 若做 MCP：在 `apps/desktop` 内起独立 loopback MCP server 把 `app-actions` catalog 映射为 MCP tools（复用 action JSON Schema 与 approval broker），还是另起协议层？
3. 风险分级：现有 approval broker 只区分读/写；是否需要 PI 式 read/write/dangerous 三级风险标 + dangerous 强制确认？
4. 发现与鉴权：沿用 endpoint-file + token 模式，还是 PI 式 `mcp-control.json` 连接清单（url/token/pid/active）？
5. 与 `packages/remote-control`（远端控制协议）和 `apps/cli-host` RPC 宿主的关系：三套外部面如何分工不重叠？

## 候选方案及取舍

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 不加协议面，继续扩展 action-rpc catalog | 零新协议成本；CLI 已可用 | 通用 MCP 生态进不来，外部集成只能走自研 CLI | 生态鸿沟长期存在 |
| B MCP 门面薄适配（推荐讨论） | 复用同一 catalog/approval/Schema；Cursor/Claude Code 即插即用；一份评审过的操作目录服务多方 | 需做 MCP 会话/工具发现/approval 交互映射；新增一个对外协议面要长期维护 | approval 在 MCP 无人值守调用下的交互语义需设计（阻塞等 UI 确认 vs 拒绝） |
| C 统一进 remote-control/RACP 风格自有协议 | 与远端控制同构 | 重复建设；外部生态仍要自研客户端 | 协议面膨胀 |

## 推荐方案

倾向 B：在 `apps/desktop` 起 loopback MCP server，把 `app-actions` catalog 直接映射为 MCP tools（`describe` → tools/list、action JSON Schema → inputSchema、`run` → tools/call），复用 approval broker 与 endpoint-file+token 发现；同步把 action 元数据补 read/write/dangerous 风险标。A 为保守备选——若外部生态诉求不成立则不动。

## 决策触发条件

- 用户确认需要「外部 agent/编辑器驱动 Open Forge 桌面」的产品场景；或
- 插件/ marketplace 出现控制面集成需求；或
- `action` CLI 的外部集成方明确提出 MCP 诉求。

属架构变更，立项时需 ADR。

## 后续可能拆出

- Task：action 元数据 read/write/dangerous 风险标补全（独立可做，不依赖本决策结论）；
- Plan：MCP 门面方案（catalog→tools 映射、approval 交互语义、token/清单发现、renderer 收敛）；
- 需求：若 B 成立，REQ + ADR 先行。

## 决策记录（2026-09-25）

- **裁决：暂不做（维持现状，方案 A 的保守形态）**。用户在本轮 backlog 收口中明确选择不为「外部 agent 驱动桌面」新增协议门面；ADR-0078 已划定的外部面边界保持。
- 依据与代价：新增对外协议面（含 MCP 门面）意味着长期兼容承诺与无人值守 approval 语义设计成本；当前 `action` CLI（`OpenForge.exe action search/describe/run` + action-rpc + approval broker）已能满足自有外部脚本场景。
- 事实更正（分析时核实，供未来重启时直接用）：`app-actions` 是 `apps/desktop` 下的目录而非独立包，且无 `settings` 域（实际为 general/appearance/shortcuts）；插件 action 的风险标**已存在**（`effect: read|write|execute`，17/18/2 分布），只是未进入 `search`/`describe` 输出；仓库目前仅有一个插件自带 MCP server。
- 触发重启条件（任一）：用户确认需要「外部 agent/编辑器驱动 Open Forge 桌面」；插件/marketplace 提出控制面集成需求；`action` CLI 的外部集成方明确提出 MCP 诉求。重启时先评估按 ADR-0104 做成**插件 loopback 服务**而非新增核心协议面的形态。
- 零决策遗留（未做，可随时单独立项）：把已存在的 `effect` 风险标接进 `action search`/`describe` 输出。
