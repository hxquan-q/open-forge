---
id: TASK-0040
type: task
status: ready
priority: P1
owner: packages/runtime-mcp
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-6
execution: serial
branch: forge/dev
worktree: unassigned（盘点阶段 coordination-only；补强视盘点结果登记后续任务）
base_commit: forge/dev
read_paths: [packages/runtime-mcp/src]
write_paths: [project/tasks]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# MCP stdio 子进程生命周期盘点与补强

## 目标

runtime-mcp 已有 64/16MiB 响应上限与 deferred tools，但 stdio 连接生命周期未逐行核查：是否存在孤儿 server 进程、空闲连接是否回收、工具目录是否每次冷启动。先盘点出结论，有缺口再补「关钩子杀进程树 / 懒启动 + 目录持久缓存 / 空闲回收」。

## 范围

### 并发评估

- 结论：盘点阶段 coordination-only（只读）；补强按盘点结论另行拆分；
- 业界参照：Claude Code stdio 空闲 30 分钟超时 + 断连清缓存；Codex 连接 Drop 即 cancel + 显式 shutdown 杀 stdio + `LazyWhenCached` 懒启动 + 工具目录持久缓存（`codex-mcp/src/connection_manager.rs`、`tool_catalog_cache.rs`）。

### 做

- 盘点 `packages/runtime-mcp` stdio 连接的创建/复用/关闭路径，回答：进程树谁负责杀、空闲是否回收、断连后资源是否释放、目录是否有持久缓存；
- 对照「懒启动 + 目录缓存 + 空闲回收 + 关钩子杀树」四项给出差距清单；
- 每个确认缺口登记独立实现 Task（预估每 stdio server 子进程 50–150MB，仅使用 MCP 时存在）。

### 不做

- 本任务不改 runtime-mcp 代码（盘点产出是 Task 登记）；
- 不动既有响应上限与 deferred tools 语义。

## Given / When / Then

- Given：盘点完成
  When：评审差距清单
  Then：每个孤儿/泄漏/冷启动缺口有对应 Task 或无缺口的书面结论

## 必须保持

- 盘点只读，不改行为。

## 测试与验证

- 定向测试：无（盘点）；
- 验证：差距清单引用 `packages/runtime-mcp/src` 行号锚点；必要时以 server 子进程计数与空闲回收时间点实测佐证。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
