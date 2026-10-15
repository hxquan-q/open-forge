---
id: BUG-0049
type: bug
status: done
priority: P1
owner: desktop
requirement:
plan:
source: 用户反馈「SSH 主机不能够连接」+ 本机实测复现
related_requirement: []
related_plan: []
related_tasks: [TASK-0133]
related_issues: []
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# Windows 上 SSH 主机全部不可连接：ControlMaster fd 传递在 MSYS2 与 Win32-OpenSSH 上均失败

## 用户流程

- Given：Windows 用户已登记 SSH 主机（manual 或 ssh-config 导入），凭据可用。
- When：设置页「测试连接」，或打开该主机上的远程项目执行任意文件/exec 操作。
- Then：应连接成功并返回远端信息；实际主机状态落为 `unverifiable`，所有操作报 `Cannot reach <host>`。

## 实际行为

`buildSshArgv` 无条件携带 `-o ControlMaster=auto -o ControlPath=… -o ControlPersist=600`。`ControlPersist` 触发 master 后台化，客户端经 unix socket 请求会话通道，依赖 `sendmsg/recvmsg` fd 传递 —— Windows 上的两个 OpenSSH 实现都不支持该路径：

- MSYS2 `/usr/bin/ssh`（OpenSSH_10.3p1，dev 环境 PATH 优先命中）：`mm_receive_fd: no message header` → `Failed to connect to new control master`。
- Win32-OpenSSH 9.5p2（`C:\Windows\System32\OpenSSH\ssh.exe`）：`getsockname failed: Not a socket`。

每条命令在传输层即失败（exit 255 → `SshTransportError`），主机永远不可达。

## 期望行为

Windows 上 SSH 远程主机可用；按 ADR-0124 预留的方向补不依赖 ControlMaster 的传输实现（ssh2 纯 JS，Client 本身即多路复用）。

## 环境与失败证据

- Open Forge dev（main @ `6f0ea2165`）/ Windows 11 / MSYS2 OpenSSH 10.3p1 + Win32-OpenSSH 9.5p2。
- 对照实测（`ubuntu@13.192.213.39`，密钥认证）：
  - `ssh -o ControlMaster=auto -o ControlPath=… -o ControlPersist=60 …` → `Failed to connect to new control master`；
  - 同参数去掉 `ControlPersist` → 命令正常返回。
- `~/.openforge-dev/ssh/` 下留有失败连接产生的 `.srw` socket 残骸。
- `ssh-hosts.json` 的 manual 条目 `target` 缺 `user@` 前缀时另会叠加 `Permission denied (publickey)`（OpenSSH 默认本地用户名），属配置面问题，与本 bug 独立。

## 最小复现

1. Windows 上启动 dev，登记一台密钥认证可达的 SSH 主机。
2. 「测试连接」或对远程项目做任意操作。
3. 状态变 `unverifiable`；主进程日志 `Cannot reach …`（stderr 为 mux 报错）。

## 影响

Windows 上 SSH 远程项目功能整体不可用（文件读写、exec、pty、端口转发、helper 全部走同一 argv 构造点）。

## 根因证据

- [`packages/ssh-transport/src/ssh-argv.ts`](../../packages/ssh-transport/src/ssh-argv.ts) `buildSshArgv` 无条件 `ControlPersist=600`，无平台分支。
- `packages/ssh-transport` 全部源码无 `win32` 处理；`askpass-roundtrip.test.ts` 以 `skipIf(win32)` 跳过。
- [`docs/adr/0124`](../../docs/adr/0124-ssh-remote-projects-and-execution-boundary.md)：「以系统 OpenSSH 二进制为主路径，每主机一条 `ControlMaster` 复用连接……Windows 或无系统 ssh 的环境后续可补 `ssh2` 实现」——Windows 支持是立项时已知缺口。

## 回归测试

- 新增 `ssh2` 传输实现后，回环集成测试（真实 `ssh2.Server` + `SshConnection`）在 win32 可跑通 exec/文件读写/pty/端口转发；不存在 mux 语义可测，改以协议层行为断言。
