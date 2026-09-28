---
id: TASK-0133
type: task
status: done
priority: P1
owner: ssh-transport + desktop
requirement:
plan:
source: BUG-0049 修复实施
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0049]
execution: parallel
branch: task/TASK-0133-ssh2-windows-transport
worktree: ../open-forge-wt/task-0133-ssh2-windows-transport
base_commit: 6f0ea216573c56f591e0c010bab29e754327722d
read_paths: [packages/ssh-transport/src, apps/desktop/src/main/ssh, docs/adr/0124-ssh-remote-projects-and-execution-boundary.md]
write_paths: [packages/ssh-transport, apps/desktop/src/main/ssh, .github/release-notes, project/tasks/TASK-0133-ssh2-windows-transport.md, project/tasks/README.md, project/bugs/BUG-0049-windows-ssh-controlmaster-mux.md, project/bugs/README.md, docs/adr]
exclusive_paths: [packages/ssh-transport, apps/desktop/src/main/ssh]
depends_on: []
conflicts_with: []
integration_status: integrated（main：6be8e68c5 合入 + 81bcae1b3 打包修正；端到端 probe 实测 connected）
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# Windows 补 ssh2 纯 JS 传输实现，恢复 SSH 远程项目可用

## 目标

修复 [BUG-0049](../bugs/BUG-0049-windows-ssh-controlmaster-mux.md)：win32 下 `SshProcessRunner` 改走 `ssh2` 纯 JS 实现（Client 本身多路复用，替代 ControlMaster），macOS/Linux 维持系统 OpenSSH 路径不变。

## 范围

### 并发评估

- 结论：条件支持（独占 `packages/ssh-transport` 与 `apps/desktop/src/main/ssh`）
- 执行方式：parallel（独立 Worktree）
- 可并行 Task：TASK-0130、TASK-0131、TASK-0132（写路径不相交）
- 前置依赖：无
- 冲突文件/独占路径：`packages/ssh-transport`、`apps/desktop/src/main/ssh`
- Branch：task/TASK-0133-ssh2-windows-transport
- Worktree：`../open-forge-wt/task-TASK-0133-ssh2-windows-transport`
- 集成负责人：Coordinator（本 Agent）
- 集成顺序：与并行任务任意顺序

### 做

- `packages/ssh-transport` 新增 `Ssh2ProcessRunner`（`ssh2` 依赖）：懒连接 + 单 Client 多 channel 复用、断线重连、`exec`/`openChannel`/`forwardPort`/`cancelPortForward` 语义对齐现有合同；argv 解析只取 `--` 后的 remoteCommand、`-tt` 与 `-O forward` 段。
- 连接参数解析：`ssh -G` 取有效配置（hostname/user/port/identityfile/proxyjump），二进制缺失时回退 `user@host` 直解析；ProxyJump 经内层 Client `forwardOut` 链实现；ProxyCommand 报明确不支持错误。
- 认证顺序对齐 OpenSSH：agent（SSH_AUTH_SOCK / Windows OpenSSH pipe）→ identityFile（含加密私钥的 passphrase 提示）→ password/keyboard-interactive 经现有 `SshPromptService` 弹窗与凭据库；`classifySshPrompt` 复用验证码分类。
- 主机密钥安全语义不降（ADR-0124）：known_hosts 匹配（含 `|1|` 哈希条目与 `[host]:port`）→ 命中放行；未知指纹经 `confirm` 提示后写入应用自有 known_hosts（`~/.openforge[-dev]/ssh/known_hosts`）；已登记但密钥变更一律拒绝，不静默放行。
- Desktop 装配：`ssh-runtime.ts` 按 `process.platform` 选 runner；新增 ssh2 运行时装配模块（prompt 桥接 + known_hosts 校验回调）。
- 测试：known_hosts 匹配、`ssh -G` 解析、argv 提取为单元测试；runner 用注入 Client 工厂测懒连接/失败 255/中断；真实 `ssh2.Server` 回环集成测试覆盖 `SshConnection` 文件操作与 exec 合同（win32 可跑）。
- ADR-0124 补充 Windows 传输实现落地的记录；发布说明写入当前版本。

### 不做

- 不改 `SshConnection` 对外 API 与 macOS/Linux 行为；不引入 ProxyCommand/GSSAPI/FIDO（明确报错）；不改远端 helper 部署协议；不把用户 `~/.ssh/known_hosts` 写回（只读匹配）。

## 测试层级与验证

- 单元：`known-hosts` 匹配矩阵、`ssh -G` 输出解析、argv 提取、runner 伪 Client 生命周期。
- 集成：`ssh2.Server` 回环（密码认证 + 主机密钥校验），覆盖 `SshConnection.probePlatform/exec/readFile/writeFile/listDirectory`。
- 命令：`bun scripts/quality/run-vitest.mjs --run packages/ssh-transport/src/…`、`bun run test:pkg ssh-transport`、`bun run check:quick`、集成前 `bun run check`。
- 真实验收：dev 环境对 `ubuntu@13.192.213.39`（密钥）与 `183.36.30.83`（ssh-config 别名）连接成功。

## 实施记录（2026-09-28）

已在 worktree 完成实现与验收：

- `packages/ssh-transport`：`ssh2-runner.ts`（懒连接 + 单 `Client` 多 channel 复用、`run`/`open`/`-O forward`/cancel、断线后下一次操作自动重连、`readyTimeout` 接 argv `ConnectTimeout`）、`ssh-target.ts`（`ssh -G` 优先、二进制缺席回退 `user@host`、ProxyJump 链式 `forwardOut` 深度上限 4、`ProxyCommand` 显式报错）、`known-hosts.ts`（plain/hashed/`[host]:port`/取反/通配 + `SHA256:` 指纹）；`ssh2@1.17.0` 入依赖。
- Desktop：`ssh-runtime.ts` 按 `process.platform` 选 runner（win32→ssh2，其余→OpenSSH）；`ssh-hostkey-verifier.ts` 匹配用户 `~/.ssh/known_hosts` + 应用 known_hosts，未知指纹经 `SshPromptService` confirm 后写回；口令/passphrase/KI 经 `resolveSshPrompt` 接既有提示桥。
- 测试 44 个全绿：known-hosts 匹配矩阵、`ssh -G` 解析、runner 伪 Client 生命周期，以及真实 `ssh2.Server` 回环（口令认证、单连接多路复用、stdin、退出码、端口转发、拒绝主机密钥、断线清理）。
- 门禁：`bun run check`（lint + types + guards + mobile-lint）全绿；包内既有测试在 Windows 上因无 `/bin/sh` 的失败为基线既有问题，与本次改动无关。
- 真实主机验收：`ubuntu@13.192.213.39` + `win.pem` 走完整 argv 合同，主机密钥指纹回调、exec 输出、退出码 7 透传、第二条命令复用同一连接——全部实测通过。
- ADR-0124「传输层」已补 ssh2 落地记录；`v0.1.2.md` 发布说明已写入修复条目。
- 待办：Coordinator 集成到 main（`integration_status: integrated（main：6be8e68c5 合入 + 81bcae1b3 打包修正；端到端 probe 实测 connected）`）。
