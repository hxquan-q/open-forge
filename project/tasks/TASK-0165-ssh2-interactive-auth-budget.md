---
id: TASK-0165
type: task
status: verifying
priority: P1
owner: ssh-transport
source: user-request
related_requirement: []
related_plan: []
related_tasks: [TASK-0133]
related_issues: []
related_bugs: [BUG-0057]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts, packages/ssh-transport/src/ssh2-runner.loopback.test.ts, packages/ssh-transport/src/askpass.ts, packages/ssh-transport/src/ssh-argv.ts, apps/desktop/src/main/ssh/ssh-prompt-service.ts, apps/desktop/src/main/ssh/ssh-runtime.ts]
write_paths: [packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/ssh2-runner.test.ts, packages/ssh-transport/src/ssh2-runner.loopback.test.ts, project/bugs/BUG-0057-ssh2-new-host-interactive-auth-starvation.md, project/tasks/TASK-0165-ssh2-interactive-auth-budget.md, project/tasks/README.md, project/bugs/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/ssh-transport/src/ssh2-runner.ts]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 修复 ssh2 新主机交互认证：握手预算与 KI 口令回退

## 目标

修掉 BUG-0057：Windows（进程内 ssh2 传输）新增主机首次连接的两个叠加缺陷——15 秒 `readyTimeout` 掐断交互提示、keyboard-interactive 回退在同轮内二次索要并吞掉已存口令。

## 范围

### 并发评估

- 结论：不支持并行（单点修复，共享 `ssh2-runner.ts`）
- 执行方式：serial
- 前置依赖：无；与 draft 状态的 TASK-0153 无写路径重叠（其独占为 `node-process-runner.ts`）
- Branch：main；Worktree：主工作区
- 集成负责人：本 Agent；集成顺序：原子提交，不夹带工作区中其他 Task 的未提交改动

### 做

- `tryConnect` 的 `readyTimeout` 不再取 `ConnectTimeout` 秒数：有调用方 deadline（`timeoutMs`）时用其剩余预算，无 deadline 时用足够交互的默认预算（对齐首命令 4 分钟宽限的既有设计意图）。
- `keyboard-interactive` 事件处理：归类为 `password` 的提示用当前认证尝试已获得的口令直接回答（`partial.password`）；其余提示（验证码等）仍走 `askSecret`，kind 保持 `keyboard-interactive` 交由宿主分类。
- 补齐回归测试（FakeClient 断言 + 真实 `ssh2.Server` KI-only 回环）。

### 不做

- 不改 `ConnectTimeout` 语义在 OpenSSH 路径的行为；不改 `SshPromptService` 的「同轮只用一次存档」合同（该合同对 OpenSSH 多进程提示仍然正确）。
- 不拆 TCP 建连超时与握手超时的 socket 级实现（ssh2 不暴露独立 TCP connect timeout；trade-off 记入交付）。
- 不新增密码表单字段、不改凭据存储模型；不做真实主机冒烟。

## Given / When / Then

- Given：Windows ssh2 路径、新增手动主机、服务器接受密码认证。
  - When：首次连接且用户答指纹确认+密码超过 `ConnectTimeout` 秒。Then：连接仍能建立（预算来自调用方 deadline，非 15s）。
- Given：服务器只允许 keyboard-interactive。When：用户在密码提示输入口令并勾选记住。Then：同一次连接内 KI 密码提示被自动回答，不弹第二个框，已存凭据不被误删；下次连接静默复用。
- Given：口令错误。When：KI 回退回答后服务端仍拒绝。Then：按既有语义删档并再问用户，不静默循环。
- Given：口令提示被用户取消。Then：如实返回传输失败，不悬挂（既有行为保持）。

## 必须保持

- 主机密钥 fail-closed：`verifyHostKey` 缺省拒绝、确认后写回 known_hosts 的行为不变。
- 取消/超时语义：`aborted`/`timedOut` 结果形状、channel kill/exited 兑现不变。
- OpenSSH（POSIX）路径、argv 合同、`SshPromptService` 对外语义不变。
- 口令/私钥密码不落配置文件的边界不变。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs run src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts`（包 cwd：`packages/ssh-transport`）；必要时 `ssh-prompt-service.test.ts` 基线。
- 用户流程：新增 `user@host` 手动主机 → 浏览目录：指纹确认（可超过 15s）+ 一次密码提示 → 成功列出目录；重连不重复提示。
- 质量：`bun run check`；按政策 `test:impact`（ssh-transport 变更）。
- 不做真实主机冒烟；verify:ui 未授权。

## 验收分层

- 工程验证（2026-10-02 已执行）：
  - red → green：先写失败用例后实现。修复前 4 例失败（`readyTimeout` 恒为 15_000、KI-only 服务器口令被问 2 次、慢于 `ConnectTimeout` 的指纹确认返回 255）；修复后 `run-vitest.mjs run src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts`（包 cwd：`packages/ssh-transport`）32/32 通过。
  - 影响面：`bun run test:impact -- <本任务三个源文件>` → runtime-desktop 51/51、desktop 4642/4642 通过。
  - `bun run check` 全绿（lint/types/guards/mobile-lint）。
  - 环境既有失败（非本任务引入）：包全量测试中 `remote-command`/`remote-listeners`/`node-process-runner`/`ssh-connection.loopback` 共 26 例因本机无 `/bin/sh`（POSIX 测试）失败，与本 diff 无关文件。
- 实际 diff（`packages/ssh-transport/src/ssh2-runner.ts`）：
  - `readyTimeout` = 调用方 deadline 剩余预算（`linkDeadline.remainingMs()`，经 `ensureClient` → `ensureReady` → `establish` → `connectWithAuth` → `tryConnect` 逐层传入，含跳板跳数共享同一预算）；无 deadline 时 `DEFAULT_ESTABLISH_TIMEOUT_MS` = 4 分钟。
  - KI 处理器：`classifySshPrompt` 判为 `password` 且当前尝试已持 `partial.password` 时直接复用回答；其余提示仍走 `askSecret`（kind=`keyboard-interactive`）。
  - `ensureClient` 改为 `(spec, signal, budgetMs)` 三参；转发路径传 `undefined` 预算（4 分钟默认）；`raceAbort` 仍只取消调用方视图，不取消共享的 `readyPromise` 建立。
- 技术评审：自审 diff；集成：pending（未提交）；人工功能验收：待用户（真实 Windows 主机：新增主机→指纹确认+密码记住→复连）；发布：未授权。
- 剩余风险：ssh2 无独立 TCP-connect 超时，`readyTimeout` 含交互期意味着网络黑洞场景的失败也放宽到同一预算——由调用方 deadline 兜底，属设计内取舍。

## TASK-0171 主树收口（2026-10-02）

实现已原子提交到 main：925868a08。本轮完整 check 通过；组合测试 Desktop 4642、theme-ui 169、质量脚本 483 项通过，SSH 认证定向 32 项通过。CLI 首轮两例 RPC 超时保留于 TASK-0171；同一失败文件 13 项以及随后单独完整 CLI 226 项复验均通过，未改代码或阈值。各功能人工验收仍未执行，保留 verifying；待最终分支集成与推送闸门，不宣称已推送或发布。
