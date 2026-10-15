---
id: BUG-0057
type: bug
status: verifying
priority: P1
owner: ssh-transport
source: user-request
related_requirement: []
related_plan: []
related_tasks: [TASK-0165]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# Windows 新增 SSH 主机永远连不上：握手预算吃掉交互提示，KI 回退吞掉已存口令

## 用户流程

- Given：Windows 桌面端，新增一台系统里没有的 SSH 主机（设置页或远程项目选择器的手动新增，`user@host` 目标）。
- When：触发首次连接（选择器浏览目录 / 测试连接 / 打开远程项目），在弹窗中输入登录密码并勾选「记住」。
- Then：连接应建立；之后复连使用已存凭据，不再重复索要。

## 实际行为

连接永远失败；再次连接重复同样的提示与失败，「记住」看起来不生效。

## 期望行为

- 用户在指纹确认与密码提示上花费的时间计入调用方给首次连接预留的交互宽限（首命令 4 分钟），而不是被 15 秒的 `ConnectTimeout` 掐断。
- 服务器只开 keyboard-interactive 时，同一次连接内已获得的登录密码直接回答密码形态的回退提示；不因同轮第二次询问误判「存档是错的」而删掉刚记住的凭据。

## 环境与失败证据

- 平台：Windows（`process.platform === "win32"` 走进程内 ssh2 传输，`apps/desktop/src/main/ssh/ssh-runtime.ts` `createPlatformRunner`）；OpenSSH 路径不受影响。
- 失败表面：远端目录浏览返回传输失败（`SshTransportError` "Cannot reach" / 握手超时），用户侧只见到反复提示后连不上。

## 最小复现

1. 在 `ssh2-runner.loopback.test.ts` 的真实 `ssh2.Server` 上加两类断言（旧实现失败）：
   - `readyTimeout`：argv `ConnectTimeout` 为 N 秒时，`Client.connect` 收到的 `readyTimeout` 应为调用方 deadline（如 `timeoutMs`）而非 N×1000——FakeClient 断言 `connectConfigs[0].readyTimeout`。
   - KI-only 服务：`ctx.reject(["keyboard-interactive"])` 且经 `ctx.prompt` 收口令时，`askSecret` 在一次连接内只被询问一次，连接成功。
2. 真机等价路径：新增 `user@host` 手动主机 → 浏览目录 → 指纹确认 + 密码提示超过 15 秒必然失败。

## 影响

- Windows 上所有需要交互认证的新增主机首次连接近似必失败；ssh-config 导入且密钥已确认、凭据已存的老主机不受影响。
- 对 KI-only 服务器（CentOS/云镜像 `PasswordAuthentication no` + PAM、多数 NAS），密码「记住」永远不生效，且一次连接内重复弹窗。

## 根因证据

1. `tryConnect` 设 `readyTimeout: spec.connectTimeoutSeconds * 1000`（`ssh2-runner.ts`），而 argv 里 `ConnectTimeout=15`（`ssh-argv.ts`）。ssh2 的 `readyTimeout` 覆盖整个握手——`hostVerifier` 等待用户确认指纹、KI 提示等待用户输入都算在内；与 `ssh-prompt-broker.ts` 给用户的 3 分钟答题宽限、`ssh-connection.ts` `FIRST_COMMAND_TIMEOUT_MS` 4 分钟设计矛盾（代码注释自己声称「建连等口令的时间也算在里面」，实际只算进了 `linkDeadline` 而非每次 connect 的 `readyTimeout`）。
2. KI 处理器对每个 prompt 调 `askSecret`，round 沿用 establish 轮次；密码形态提示经 `classifySshPrompt` 归到 `"password"`，在 `SshPromptService.resolve` 命中同轮 `(hostId, password, round)` 已用标记 → `removeStoredSecret` 删档并再次弹窗——存档尚未真正被服务端验过。
3. 置信度：高（静态调用链完整闭合 + 两个机制各自可解释全部症状）；尚未做真实主机复现。

## 回归测试

- `packages/ssh-transport/src/ssh2-runner.test.ts`：`readyTimeout` 取调用方 timeoutMs；KI 回退复用当前尝试已获口令。
- `packages/ssh-transport/src/ssh2-runner.loopback.test.ts`：真实 ssh2.Server 仅收 keyboard-interactive 时一次询问即可连通。

## 修复与验证

- 修复（TASK-0165，`packages/ssh-transport/src/ssh2-runner.ts`）：
  - `readyTimeout` 改用调用方 deadline 剩余预算（`linkDeadline.remainingMs()` 逐层传入 `ensureReady`/`establish`/`connectWithAuth`/`tryConnect`，跳板链共享同一预算）；无 deadline 时默认 4 分钟（`DEFAULT_ESTABLISH_TIMEOUT_MS`，与首命令交互宽限一致）。
  - KI 事件处理器对 `classifySshPrompt` 判为 `password` 的提示，直接用本次认证尝试已获得的 `partial.password` 回答，不再经 `askSecret` 同轮二次取存档；验证码等非密码提示仍走 `askSecret`（kind=`keyboard-interactive`）。
  - 共享建连仍经 `readyPromise` 去重；`raceAbort` 只取消调用方视图，`spec` 参数随签名清理移除。
- 验证（2026-10-02）：
  - 定向：`run-vitest.mjs run src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts` → 32/32 通过；修复前 4 例按预期失败（red 确认）。
  - `bun run test:impact -- <三个源文件>` → runtime-desktop 51/51、desktop 4642/4642 通过。
  - `bun run check` 全绿。
  - 真实 `ssh2.Server` 回环确认：KI-only 服务器一次询问即连通（asked=1）；1s `ConnectTimeout` + 更慢的指纹确认回调仍连通。
- 未运行及原因：真实 Windows 主机冒烟未授权（建议人工验收：新增手动主机→指纹确认+密码记住→断开复连）；OpenSSH（POSIX）路径无改动；包内 26 例 POSIX `/bin/sh` 依赖测试在本机环境失败，与本修复无关。
