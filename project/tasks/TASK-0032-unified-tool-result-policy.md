---
id: TASK-0032
type: task
status: done
priority: P0
owner: packages/coding-agent
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-1
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行，路径已与并行会话协调放行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src, packages/runtime-tools/src, packages/runtime-mcp/src]
write_paths: [packages/coding-agent/src, packages/runtime-mcp/src, .github/release-notes]
exclusive_paths: [packages/coding-agent/src/tool-results, packages/coding-agent/src/extensions/runtime/extension-tool-runtime.ts, packages/coding-agent/src/plugins/runtime/tool-runtime.ts]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 统一工具结果出口（消除插件/扩展无界结果）

## 目标

三条旁路让插件/扩展工具结果无界进入 JSONL 与内存：(1) extension `resultProjection:"preserve"`；(2) 插件工具 details.result 无策略；(3) result-policy 的图片盲点（measure 不计 image、超限仍保留 image）。统一收敛到 coding 50KB+artifact 策略，MCP 单调用既有上限与图片展示不回退。

## 方案边界（设计工作流产出后回填）

- 不改 RuntimeToolResult 公共形状（已与并行会话确认：其审批拦截器只读 context.tool/request）；
- 正常大小结果显示不变；超限结果 UI 降级为 artifact 引用需可点开；
- MCP 传输层 64MB/16MB/24MB 语义不动。

## 并发结论

条件支持——独占路径已声明（tool-results / extension-tool-runtime / plugins tool-runtime），并行会话确认不碰；主会话串行执行。

## 实施摘要（2026-09-23）

- **策略本体**（`result-policy.ts`）：图片字节数计入预算触发（正则-free 估算，分组量词正则在百万级字符串爆栈——顺带把 runtime-mcp `mcp-media-policy` 的 BASE64 正则改为线性安全模式并回归其测试）；超限投影时图片按 MCP 媒体准入（16/8MB/24MB）保留内联（媒体引用链依赖持久化 content），超准入以与 MCP 同口径省略文案替换；details 预算 64KB，超限优先只摘要插件 `result` 键（其余 UI 字段原样），仍超限整份摘要（对齐 `McpToolResultOffloadDetails` 的 `offloaded` 词汇）并保留 cards 子集 ≤16KB；artifact 写失败永不投影。
- **旁路封堵**：`extension-tool-runtime` 构造注入 `resultPolicy`（默认 PRESERVE，两处 execute 出口包裹，投影失败返回原样）；`plugins/runtime/tool-runtime` options 增 `resultPolicy`，`executeContribution` 出口投影；`runtime-tools-composition` 暴露实际生效的 `resultPolicy` 字段（接口+实现）；`runtime-composition` 把 `codingToolResultPolicy` 传给扩展运行时；`turn/capability-session-assembly` 经 `options.codingTools.resultPolicy` 复用同一实例（transaction 无需改动——组合对象自带）。MCP 传输层策略与 coding 侧 preserve 防二次投影，全部不动。
- **遗留跟进（TASK-0033）**：会话执行运行时（bash/read/write/edit 等）的 registry 用 PRESERVE 默认，属同型旁路；须在本任务图片语义之上再评估（read 截图预览依赖准入内图片内联），单独立任务。
- 验证：policy 9 用例（1MB 内联保留、9MB 超准入省略、插件 result 键摘要、cards 子集、写失败保底等）+ plugin/extension runtime 15 + mcp-media-policy 2 全绿；`check:quick`（变更文件）通过；coding-agent vitest 增加 `@vetta/runtime-mcp/browser` src 别名。
