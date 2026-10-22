---
id: VERIFY-0020
type: verification
status: ready
priority: P1
owner: coordinator
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0367]
related_issues: []
related_bugs: []
source: REQ-0027 S0a 基线取证（TASK-0367 合同）
created: 2026-10-22
updated: 2026-10-22
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 记忆入口与 legacy rollover 兼容基线（TASK-0367）

## 目的与范围

为 REQ-0027 新记忆策略与旧 `memoryMode` 解耦（TASK-0369 合同、TASK-0375 接线）提供可重复的启用/行为基线：三宿主（Desktop / CLI / IM）各自如何启用记忆、记忆文件落点、`memory` 工具可见性、rollover 与压缩耦合点。本记录只取证，不改运行代码、不读真实历史、不启动真实实例。

源码基线：`main@8c07b195b`（TASK-0367 开工基线，含 REQ-0027/PLAN-0021 台账与 TASK-0368 派工修正）。

## 三宿主启用矩阵（源码锚点）

| 宿主 | 启用开关 | 记忆文件 | `memory` 工具可见性 | 证据锚点 |
|---|---|---|---|---|
| Desktop（正常入口） | **永不启用**：配置投影无 `memoryMode` 字段 | 工厂默认 `join(cwd, "MEMORY.md")`，但工厂从不被调用 | 不可见（即使启用也仅 `im-claw` 场景） | [resolve-session-config.ts](../../apps/desktop/src/main/conversations/resolve-session-config.ts) 全文无 memoryMode；[composition.ts:214](../../apps/desktop/src/main/agent-runtime/composition.ts) 仅注册 `createMemoryRolloverRuntime` 工厂；[peripheral-assembly.ts](../../packages/coding-agent/src/composition/session-initialization/peripheral-assembly.ts) 仅 `sessionOptions.memoryMode` 为真才调用（缺宿主工厂则抛错）；[memory-tool-registration.ts](../../packages/coding-agent/src/memory/memory-tool-registration.ts) `MEMORY_TOOL_SCOPES = ["im-claw"]` |
| Desktop（runtime-desktop） | 不接线 | — | — | `packages/runtime-desktop/src` 全目录 grep 无 `memoryMode`/`createMemoryRolloverRuntime` |
| CLI（cli-host） | argv：`--memory-mode` 或 `--memory-file <path>`（后者隐含启用） | `--memory-file` 缺省 `join(cwd, "MEMORY.md")` | 受同一 `im-claw` scopeUse 限制 | [cli-session-assembly.ts:208](../../apps/cli-host/src/rpc/runtime-host/cli-session-assembly.ts) `memoryMode: parsed.memoryMode || parsed.memoryFile !== undefined`；[launch-arguments.ts](../../packages/coding-agent/src/bootstrap/launch-arguments.ts) `--memory-mode` / `--memory-file` |
| IM（im-gateway，ADR-0009） | **恒启用**：host 硬编码 `MemoryMode: true` | `<conversationCwd>/MEMORY.md`（绝对路径，独立于按日期的 run cwd）；JOURNAL.md 同根；SessionDir 亦钉根目录 | 可见（im-claw 场景） | [host.go:140](../../apps/im-gateway/cmd/im-gateway/host.go)；[client.go:129](../../apps/im-gateway/internal/hostclient/local/client.go) 追加 `--memory-mode`/`--memory-file` |
| SDK 嵌入 | 选项透传，缺省关闭 | 启用时 `join(cwd, "MEMORY.md")` | 同 scopeUse | [node-session-host.ts:319](../../packages/coding-agent/src/host/sdk-session/node-session-host.ts)；[session-capability-hosts.ts:105](../../packages/coding-agent/src/host/sdk-session/session-capability-hosts.ts) `?? false` |

## 运行时行为合同（memory-rollover-runtime.ts）

[packages/coding-agent/src/memory/memory-rollover-runtime.ts](../../packages/coding-agent/src/memory/memory-rollover-runtime.ts)：

1. **冻结快照**：构造时读一次存储内容，`readPromptMemory()/renderPromptMemory()` 全程返回该快照；注入走 [prompt-runtime.ts:61-89](../../packages/coding-agent/src/model-context/prompt-runtime.ts)（memoryMode/file/snapshot/charLimit 四字段进提示来源）。
2. **压缩语义耦合**：`adjustCompactionSettings` 把 `minFreePercent` 抬到 ≥30、`reserveTokens` 抬到 ≥30% 上下文窗口。
3. **rollover 收尾**：`beforeContinuation` 追加 rollover 日志（best-effort）；`continuationAfterCompaction()` 返回 `{reason:"memory-rollover"}`，替代普通自动压缩收尾——[compaction-commit-lifecycle.ts:31-33](../../packages/coding-agent/src/compaction/runtime/compaction-commit-lifecycle.ts) 无 memoryRollover 时才 `finalizeAutomatic`。
4. **旁路失败不改 Turn 终态**：`beforeCompaction → flushMessages` 模型整合失败被吞并返回 0；turn journal 失败同 best-effort；`turn.cancelled/failed` 的助手消息不入日志。
5. **IM `/new` flush**：[router.go](../../apps/im-gateway/internal/command/router.go) `flushSessionMemory` 以 `CommandTypeFlushMemory` 驱动一次性整合（60s 超时），失败/无会话/memoryMode 关闭一律 `written:0` 且**不得阻塞 /new**；成功回复「已凝结 N 条记忆」。
6. **rollover 换文件**：[bridge.go](../../apps/im-gateway/internal/bridge/bridge.go) 监听 `session_path_changed` 事件（ADR-0009）。

## 实测命令与结果（2026-10-22，Windows 本机）

| 命令 | 结果 |
|---|---|
| `bun run test:impact -- packages/coding-agent/test/composition/memory-runtime.test.ts packages/coding-agent/test/runtime-core/memory-context-runtime.test.ts apps/desktop/src/main/conversations/resolve-session-config.test.ts` | 通过：3 个测试文件、19 例（memory 7 例：rollover 编排合同；resolve-session-config 12 例：Desktop 配置投影——含「不透传产品字段」合同，佐证 memoryMode 不出现在正常投影） |
| `go test ./internal/command/ ./internal/bridge/ ./internal/hostclient/...`（apps/im-gateway） | 4 包全部 ok（command 含 /new flush 行为；bridge 含 session_path_changed；hostclient/local 含 argv 追加合同） |
| `node scripts/quality/check-project-indexes.mjs` / `node scripts/quality/check-task-worktrees.mjs`（主工作区） | 通过；382 task 0 warning |
| `bun run worktree:check --task TASK-0368`（B 派工前置） | 通过 |

## 必须保持的兼容基线（0369/0375 合同输入）

1. Desktop 正常创建/恢复/团队/批量入口不得因新记忆功能改变现有行为；`agentMode`/`capabilityProfile`/Profile 声明都不等于记忆启用。
2. 旧 `memoryMode` 同时改变压缩阈值与收尾语义（30%/30% + memory-rollover continuation），**不得直接给 Desktop 打开旧 memoryMode 来实现新记忆**（PLAN-0021 已定：新 `memoryPolicy` 与 legacy 解耦）。
3. `memory` 工具的 legacy 输入输出合同（add/replace/remove）与 `scopeUse:["im-claw"]` 保持；IM 会话不得同时拿到两组语义含混的写工具。
4. IM `/new` flush 与 memory/journal 写入是 best-effort 旁路：失败不阻塞主流程、不改 Turn 终态、不伪装成功（written:0）。
5. IM 的 MEMORY.md/JOURNAL.md/SessionDir 钉在 conversation root，不随按日期的 run cwd 变化；缺省 CLI/SDK 的 MEMORY.md 落在会话 cwd。
6. 新记忆的 off/explicit/automatic 策略默认不得写项目根 MEMORY.md（那是 legacy IM/CLI 合同），两侧存储路径必须可区分。

## 未执行项与边界

- 未启动真实 Desktop/IM 实例、未读真实用户历史或状态目录（无授权；合同明确禁止）。
- 未跑完整 `bun run check`（本任务无生产代码变更，按合同执行定向 + impact 与记录类检查；完整检查由后续代码任务承担）。
- Electron 打包 ABI、native 驱动、FTS 行为不在本任务范围（TASK-0368 门禁）。
- 模型质量评测不在本任务范围（TASK-0388，未授权时不跑）。

## 结论

三宿主启用矩阵与 rollover/压缩耦合点已按源码与既有合同测试固定；上表 6 条兼容基线作为 TASK-0369（memoryPolicy 解耦合同）与 TASK-0375（Desktop 接线）的准入输入。工程验证完成，人工功能验收不适用（内部基线按证据合同验收）。
