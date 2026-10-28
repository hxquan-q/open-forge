---
id: BUG-0152
type: bug
status: verifying
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: TASK-0406; openvetta/open-vetta@8d0f6f3c19495227d24816e6a5e51cc7620bd538
related_requirement: [REQ-0008]
related_plan: [PLAN-0025]
related_tasks: [TASK-0406]
related_issues: []
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# MCP 候选失败被记作已应用，普通刷新无法恢复

## 用户流程

- Given：已有可用 MCP generation，配置切换产生新候选。
- When：候选初始化临时失败，服务随后恢复，30 秒后再次正常刷新。
- Then：应在当前会话尝试新候选，旧 generation 与在途租约继续可用。

## 实际行为

失败签名被写入 `lastSignature`；之后相同配置的刷新一直返回 false，无新连接。

## 期望行为

将成功应用与失败尝试分开记录；30 秒内无启动风暴，到期由普通刷新驱动恢复。配置变化可立即尝试，关闭后不能复活。

## 环境与失败证据

- Windows，Bun 1.4.2，基线 `6ebd359b567da1ac46e37327c5178bc9c53fca50`，Desktop 版本 0.1.3。
- 命令：`bun scripts/quality/run-vitest.mjs --run packages/runtime-mcp/test/server-supervisor.test.ts -t "retries a failed candidate"`。
- 新增用例在 30 秒后的刷新断言失败：`expected false to be true`（server-supervisor.test.ts:150）。隔离假客户端和受控时钟，不连接真实服务。
- 首次收集曾因工作树缺失 runtime-core 构建产物而失败；补齐工作区依赖构建后才取得上述行为失败，不把环境错误当作复现。

## 最小复现

1. 初始化 docs-v1 并持有旧租约。
2. 将配置切为 docs-v2，让新候选初始化失败，然后恢复服务。
3. 推进时钟至 30 秒，调用 `reloadIfChanged()`；仍未创建第三个客户端。

## 影响与根因证据

候选失败路径更新 `lastSignature`，`reloadIfChanged` 的签名相等短路阻断后续尝试。候选保留旧服务的策略本身正确，应只修复失败记账与重试生命周期。

## 回归测试

上述用例覆盖 29,999/30,000 毫秒边界、重复请求、请求驱动恢复及旧租约释放。另补配置变化、无效配置、并发刷新、关闭场景。

## 修复与验证

- 候选 d51a45afc：定向 33 例、影响 65 例、MCP 全包 84 例与完整检查通过，独立审查无本次阻断。挂起连接关闭断言先失败再修复，普通刷新、并发与旧租约连续流程通过。
- 跨包整体回归仍红，同基线未改 MCP 的隔离工作树也重现 CLI 初始化 20 秒零帧超时；未将其伪报为本项通过。详见 TASK-0406，集成 pending。
- 未运行：真实用户 MCP、真实 Desktop 验收。
