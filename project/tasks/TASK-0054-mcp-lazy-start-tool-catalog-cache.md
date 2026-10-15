---
id: TASK-0054
type: task
status: done
priority: P1
owner: packages/runtime-mcp
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0040 / VERIFICATION-0004
execution: serial
branch: forge/dev
worktree: unassigned（已集成；该历史工作树归 TASK-0053）
base_commit: forge/dev
read_paths: [packages/runtime-mcp/src/server/supervisor.ts, packages/runtime-node/src/mcp]
write_paths: [packages/runtime-mcp/src, packages/runtime-node/src/mcp, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（forge/dev 工作区，未提交）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# MCP 懒启动与工具目录持久缓存

## 目标

避免 `McpServerSupervisor.initialize()` eager 连接全部 server；缓存 `listTools` 结果到磁盘并在配置未变时复用。

## Given / When / Then

- Given：用户未使用某 MCP server
  When：应用完成启动
  Then：该 stdio 进程不应被拉起
- Given：server 配置签名未变
  When：再次连接
  Then：工具目录从缓存加载，无需重复冷启动 listTools

## 交付记录

- 实际修改（Worker B，worktree 提交 `85ecb03`，已集成主工作区）：
  - `packages/runtime-mcp/src/client/lazy-client-handle.ts`（新）：`LazyMcpClientHandle` 首次使用建连、并发去重、`disconnect()` 透明重连、`close()` 永久关闭；in-flight 计数覆盖「连接建立+请求执行」全程（修掉连接中途被空闲回收打死的竞态）。
  - `server/catalog-cache.ts`（新）：`McpServerCatalogCache` 端口 + 递归规范化配置签名（键排序、函数/undefined 剔除）。
  - `server/supervisor.ts`：`initialize()` 命中缓存即发布 `serverInfo`/tools/resources 并置 ready，不拉起进程；未命中完整启动后回写缓存；懒启动仅在宿主提供 `catalogCache` 时启用；server 采纳顺序改为配置序（确定性）。
  - `packages/runtime-node/src/mcp/catalog/`（新）：`FileMcpServerCatalogCache`，每 server 单文件、临时文件+rename 原子写、保留最近 4 个签名、损坏即 miss。
  - Desktop `composition.ts` 注入 `getApplicationCacheService().namespace("mcp-tool-catalog").rootDir`。
- 实际运行：
  - 主工作区：`runtime-mcp` `lazy-client-handle` 8 + `server-supervisor` 19 绿（缓存命中不拉起进程、签名变化回写、懒连接并发去重、disconnect 重连、close 终态）；`runtime-node` `file-catalog-cache` 5/5（原子写、签名滚动、损坏 miss）。Worker B 侧合计 229 tests/44 files 绿。
  - 三包 tsgo 构建绿；desktop tsc 本批文件 0 错误。
- 未运行及原因：`bun run check` 全量受基线既有问题与他人在途错误影响；冷启动 A/B 秒数未在真实多 server 配置下实测（以「命中即不拉起进程」的合同测试覆盖行为）。
- 剩余风险：server 端在配置不变的情况下增删工具时清单需改配置或重启才刷新（发布说明已写明）；缓存文件损坏/版本漂移按 miss 处理走完整启动。
