---
id: VERIFICATION-0004
type: verification
status: done
priority: P1
owner: packages/runtime-mcp
source: TASK-0040
created: 2026-09-23
updated: 2026-09-23
related_tasks: [TASK-0040, TASK-0053, TASK-0054]
---
<!-- Copyright The Open Forge contributors. -->

# MCP stdio 生命周期盘点（TASK-0040）

## 结论摘要

| 能力 | 现状 | 差距 |
| --- | --- | --- |
| 关钩子杀进程树 | `StdioMcpProcess.stop()` 对当前 child 发 `SIGTERM`，5s 后 `SIGKILL`（`packages/runtime-node/src/mcp/transports/stdio/stdio-process.ts:107-121`） | Windows 未杀子进程树；无宿主退出全局 sweep |
| 空闲回收 | `McpServerSupervisor` 在 generation 退役且 `activeLeases===0` 时 `client.close()`（`packages/runtime-mcp/src/server/supervisor.ts:465-478`） | **无**空闲超时；`initialize()` 对配置内 server ** eager 全启**（`:98-116`） |
| 断连释放 | lease `release()` 触发退役关闭；`shutdown()` 关闭全部 server（`:216-222`） | 配置热更新前旧 generation 仍占进程直至 lease 归零 |
| 目录持久缓存 | 每次 `startServer` 都 `listTools/listResources`（`:322-336`） | **无**跨连接工具目录磁盘缓存 |
| 懒启动 | client 在 `initialize()` 阶段创建（`:307-314`） | 非 LazyWhenCached：应用启动即拉起 enabled server |

## 孤儿进程风险

- stdio 进程由 `StdioMcpProcess` 持有；正常 `close()` 路径会 `stop()`（`stdio-mcp-client.ts:336-337`）。
- 宿主崩溃或 `kill -9` 时无 documented 清理钩子；依赖 OS 回收子进程。
- Windows `spawn` 使用 `shell: shouldUseWindowsCommandShell`（`stdio-process.ts:66-70`），`SIGTERM` 行为弱于 POSIX。

## 登记后续 Task

- **TASK-0053**：stdio 空闲超时回收 + 宿主 `before-quit` 杀树（owner: `packages/runtime-node` + desktop 组合根）。
- **TASK-0054**：MCP 懒启动 + 工具目录持久缓存（owner: `packages/runtime-mcp` + `packages/runtime-node`）。

## 证据命令

- 阅读：`packages/runtime-mcp/src/server/supervisor.ts`、`packages/runtime-node/src/mcp/transports/stdio/stdio-process.ts`
- 现有测试：`packages/runtime-node/test/mcp/stdio-process.test.ts`、`stdio-mcp-client.test.ts`（仅消息边界与 cancel，不含空闲/孤儿计数）
