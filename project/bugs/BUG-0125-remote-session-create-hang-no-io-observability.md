---
id: BUG-0125
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的 dev 日志（desktop-app/logs/2026-10-16，main）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 远程项目会话创建挂起约 30 分钟后失败，耗时阶段无远端读取观测

## 用户流程

- Given：用户打开一个远程（`ssh://`）项目会话，主进程走 `runtime-create` 初始化。
- When：初始化执行。
- Then：初始化在可接受时间内完成；若必须等待，应给出可操作的错误与阶段耗时，而不是无限等待后抛 `conversation_not_found`。

## 实际行为

- 同一 SSH 项目的两次初始化各约 30.7 分钟：`cda6e196` 请求起点约 13:37:41、`runtime-create` 1,838,264.7 ms、14:08:20 成功；`f08a1b74` 约 13:39:02、1,840,161 ms、14:09:42 以 `conversation_not_found` 失败。
- 初始化 trace 的内层拆分：`peripherals` 3.8 ms / `context` 0.1 ms / `plugin-skills` 1.1 ms（正常），而 `prompt-runtime` 716,465.9 ms（≈11.9 min）、`turn-capabilities` 716,471.8 ms（含前者）、`initial-system-prompt` 1,123,663 ms（≈18.7 min）。
- 存在性校验被放在最贵步骤之后：初始化全程跑完（`status: completed`）后 `session.close`，才在 `TurnPipeline.resumeSession` → `readConversation` 命中 `ENOENT` 并抛 `conversation_not_found`。
- 当前没有任何远端读取次数/耗时观测，无法判定慢是「逐次远端读」还是「等待某共享事件」。

## 期望行为

- 初始化各阶段有远端 I/O 观测：远端读取次数、累计耗时与按操作分解，能与阶段耗时对照。
- 取证后据此决定整体预算与提前存在性校验，并把 `conversation_not_found` 提前到毫秒级。

## 环境与失败证据

- Open Forge 0.1.3 dev 实例（Windows 11）。
- 该远端项目全程走 `ssh exec` 回退：`[ssh-helper] <host>: no helper build for linux-amd64; using ssh exec`（13:37:39，正是 `cda6e196` 起点前 2 秒）。
- 同日 `[skills] loaded total: 136`，远端技能发现需逐个读 `SKILL.md`。

## 最小复现

1. 连接一个没有 helper 构建的远端主机（`ssh exec` 回退）并打开其项目的会话。
2. 观察 `runtime-create` 阶段耗时与 trace 拆分。
3. 观察是否有任何远端读取计数/耗时记录。

## 影响

会话创建可能挂起半小时后失败；用户与维护者都没有定位依据（无远端 I/O 观测、无整体 deadline），同类问题无法收敛。

## 根因证据

耗时阶段已定位，等待对象未闭环：

- 阶段测量在 `packages/coding-agent/src/composition/session-initialization/initialization-timeline.ts:11-75`；阶段词汇与 payload 见 `.../contracts/session-initialization-observability.ts:3-24`；聚合落盘在 `apps/desktop/src/main/agent-runtime/session-initialization-log-port.ts:17-47`。
- `prompt-runtime` = `createPromptRuntime` → `resourceSource.reload()`（`apps/desktop/src/main/agent-runtime/resource-runtime.ts:171`），`reload()` 内部对技能/上下文/提示词逐项走资源访问端口（`packages/coding-agent/src/resources/runtime/session-resource-runtime.ts:193-…`）。
- `initial-system-prompt` = `previewInitialSystemPrompt` → `refreshConfigurationResources` → `refreshSkillsIfChanged`（又一次技能读）。
- 远端读取的唯一汇聚点：`packages/runtime-ssh/src/project-resource-access.ts:23-107`——`stat`/`readText`/`readDirectory`/`realPath` 四个方法各自按 `ssh://` 分发，**无计数、无缓存、无批量**。没有 helper 时每次操作都是一个新 `ssh` 子进程（`packages/ssh-transport/src/ssh-connection.ts` 的 `readFile:297-304` / `listDirectory:573-580` / `stat:592-605` / `realPath:614-624` → `runChecked` → `run`）。
- 可排除文件锁：`conversation-file-lock.ts` 预算硬上限约 5.7 s / 60 次退避，超时抛 `WRITE_LOCK_TIMEOUT`，与本次错误码不符。
- 存在性校验次序锚点：`packages/runtime-core/src/runtime-host/composed-runtime-factory.ts:163`（初始化）早于 `:269-272`（`resumeAgentSession`）；`kernel-runtime-session-backend.ts:786`（初始化）早于 `:789`（`readConversation`）。

**待调查**：等待对象未闭环——12 + 19 分钟是否由「逐次远端读 + 无总预算」解释，需先有远端 I/O 观测才能判定。本轮只加测点，不改预算与路由。

## 回归测试

- 远端访问端口：以回环 SSH 夹具（`packages/runtime-ssh/src/project-resource-access.test.ts` 同款）执行若干远端读，断言统计的 operations/totalMs/byOperation 与实际调用一致，且本机读不计入。

## 修复与验证

- 修复：本轮只加测点（TASK-0282）——资源访问端口统计远端操作数与累计耗时并暴露 `readRemoteStats()`，`reload()`（`prompt-runtime` 阶段）边界落结构化记录。整体预算与提前存在性校验待证据落地后另立切片。
- 测试：`project-resource-access.test.ts` 新增 2 例（按操作统计、本机不计入）通过；该文件其余 3 例为存量 Windows 平台红。
- 检查：`packages/runtime-ssh` / `packages/runtime-desktop` 构建通过、desktop typecheck 通过、`test:impact` 5006 例通过（4 个 BUG-0107 存量收集期红 + 1 例并行偶发假红，单独复跑全绿）；覆盖 resource-runtime 的 7 个测试文件单独复跑 26 通过 / 1 跳过。
- 未运行及原因：真实远端主机量测交用户执行（按规则不主动连真实主机）；`verify:ui:*` 未获授权。
- 剩余风险：`initial-system-prompt`（约占 30.7 分钟中的 18.7 分钟）尚未有独立观测落点，仍是最大未知量。
