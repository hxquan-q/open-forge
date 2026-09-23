---
id: TASK-0053
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0040 / VERIFICATION-0004
execution: serial
branch: forge/dev
worktree: open-forge-wt/TASK-0053-mcp-lifecycle（提交 95f92d8）
base_commit: forge/dev
read_paths: [packages/runtime-node/src/mcp/transports/stdio, packages/runtime-mcp/src/server/supervisor.ts, apps/desktop/src/main]
write_paths: [packages/runtime-node/src/mcp, apps/desktop/src/main, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（forge/dev 工作区，未提交）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# MCP stdio 空闲回收与宿主退出杀树

## 目标

补齐 TASK-0040 盘点缺口：stdio server 空闲超时断开、Windows 子进程树清理、Desktop 退出时 sweep。

## Given / When / Then

- Given：MCP stdio server 已连接且无 lease
  When：空闲超过配置阈值
  Then：进程关闭、目录状态可回收；宿主退出时不留孤儿 stdio 子进程

## 交付记录

- 实际修改（Worker B，worktree 提交 `95f92d8`，已集成主工作区）：
  - `packages/runtime-mcp`：`McpStdioServerConfig.idleTimeout`（ms，`Type.Integer({minimum:0})`，0=关闭，缺省 30min）；supervisor 按 `lastActivityAt`+定时器回收，仅 `activeLeases===0 && inFlight===0 && stdio && 已连接` 时断连，目录/ready 保留、下次调用透明重连；定时器 unref、retire 清理、`recycleIdleServer` 复核 elapsed/lease/in-flight/generation。
  - `packages/runtime-node`：`stdio-process-registry.ts`（新）全局注册表+`sweepActiveStdioMcpProcesses()`+`terminateMcpProcessTree(Sync)`——POSIX `detached` 进程组 `kill(-pid)`（SIGTERM→SIGKILL），Windows `taskkill /PID /T /F`，`process.once("exit")` 同步兜底；`stdio-process.ts` start 注册、stop() 树杀+10s 上限、超限/启动超时同路径、cleanup 注销。
  - `apps/desktop/main.ts`：退出清理在 `disposeSharedRuntime()` 优雅关闭之后兜底 sweep（修正原顺序会绕过优雅关闭直接强杀的问题）。
  - 传播链：preload `McpStdioServerConfigData`、`validateMcpConfig`（stdio 键白名单+非负整数）、`mcp-settings-service` redact/upsert、capability-sdk detail+stdio-upsert 合同（`docs/capabilities/catalog.json` 已重生成）、设置表单仅 stdio 显示+i18n、`MCP.md`/`mcp.example.json`。
- 实际运行：
  - 主工作区：`runtime-node` mcp 测试 18/18 绿（真实子进程树杀、sweep、注销、超限消息杀进程、消息字节上限）；`runtime-mcp` supervisor+lazy 27/27 绿；`capability-sdk` domain/mcp 3/3；desktop `mcp-config-validation` 5 + `mcp-settings-service` 5 绿。Worker B 侧合计 229 tests/44 files 绿。
  - 三个包 `tsgo -p tsconfig.build.json` 构建绿；desktop tsc 本批文件 0 错误。
- 未运行及原因：
  - `bun run check` 全量：基线既有问题（coding-agent/projects tsconfig path-map 守卫、desktop `resolveToolCatalogPolicy` 导出缺失、`RuntimeTaskIdentity.generation` 两处测试类型错误）+ 他人在途 lint 错误，与本任务无关。
  - POSIX 进程组路径未在本机验证（Windows 环境只覆盖 taskkill 分支；POSIX 分支由代码对称性+CI 承担）。
- 剩余风险：
  - `idleTimeout` 仅 stdio 键白名单透传；plugin-sdk `PluginOfficialMcpUpsertData`/manifest 未扩展该字段（插件公开合同需文档同步，超本任务范围，用户可走 mcp.json）。
  - 回收断连后 server 进程内状态丢失属预期语义；发布说明已写明代价。
