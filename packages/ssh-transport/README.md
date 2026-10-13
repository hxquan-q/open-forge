<!-- Modified by The Open Forge contributors. -->

# @vetta/ssh-transport

远程项目的 SSH 传输层：主机模型、连接复用、远端命令执行与文件操作。

架构决策见 [ADR-0124](../../docs/adr/0124-ssh-remote-projects-and-execution-boundary.md)。

## 边界

本包**只**负责「把一条命令或一次文件读写送到远端并把结果带回来」。它不知道项目、
会话、Agent 或 Electron 的存在。本机文件 I/O 一律经注入端口发生：ssh2 路径读取
`IdentityFile` 用的是调用方传入的 `readFile`，helper 二进制位置由 `resolveBinary`
给出；`known_hosts` 在包内只做纯解析与匹配（`known-hosts.ts`），文件的读写与用户
确认提示由宿主组合（Desktop 侧 `ssh-hostkey-verifier.ts`）。

## 平台后端

宿主按平台选择实现（Desktop 的选择点在 `ssh-runtime.ts#createPlatformRunner`）：

| | macOS / Linux | Windows（win32） |
| --- | --- | --- |
| 后端 | 系统 OpenSSH 二进制（`node-process-runner.ts`） | 进程内 `ssh2` 纯 JS 传输（`ssh2-runner.ts`） |
| `~/.ssh/config` | 由系统 ssh 原生完整承担：Include、Match、ProxyJump、ProxyCommand、IdentityAgent、FIDO 安全密钥、GSSAPI | 仅解析本仓主机模型与 `~/.ssh/config` 的 Jump/Identity 子集；**ProxyCommand 会被明确拒绝**（连接时给出「in-process transport 不支持」错误，不是静默降级） |
| 连接复用 | ControlMaster（失效时经 `ssh -O exit` 退出 master） | 一条已认证 `Client` 多路复用（失效时销毁会话与转发监听） |
| 主机密钥 | 系统 OpenSSH 默认 `StrictHostKeyChecking=ask` | 包内 `known-hosts.ts` 实现同一语义：普通同钥放行、换钥拒绝、未登记走确认；`@revoked` 同钥无条件拒绝，`@cert-authority` 不构成对 raw host key 的信任（证书链验证未实现） |

「用户只要 `ssh host` 能连上，Vetta 就能连上」这句话只在 POSIX 后端成立：Windows 走
的是进程内传输，能力以本表为准。两个后端共享同一 `SshProcessRunner` 端口与命令/
解析层，差异由各自的测试合同约束（见下）。

`StrictHostKeyChecking` 在 POSIX 侧保持 OpenSSH 默认的 `ask`：首次连接和主机密钥变更
都必须由用户确认，`no` 会让中间人攻击静默通过，`accept-new` 则跳过首次确认。

## 关键约定

### 项目标识是带 scheme 的 URI

远程项目的 cwd 是 `ssh://<hostId>/<绝对路径>`。Desktop 把 cwd 字符串当作项目与会话的
主键（会话分片目录、活动标签 keying、侧边栏展开集合），用 URI 能让这些地方原样工作，
只有真正做 I/O 的边界才需要 `parseProjectLocation`。

解析不使用 `new URL()`——它会百分号编码路径，同一个远端路径在「用户输入」与「往返
一次之后」会得到两个字符串，主键随之分裂。

### 失败分三类，不许合并

| 错误 | verdict | 含义 |
| --- | --- | --- |
| `SshTransportError` | `unverifiable` | 连接层失败，没拿到任何远端答复 |
| `SshOperationAbortedError` | `unverifiable` | 取消或超时，远端可能已执行完 |
| `SshRemoteCommandError` | `exited` | 远端确实执行了并返回非零 |

把传输故障当成「远端说没有」的后果是具体的：网络抖一下，文件树显示目录为空，Agent
以为文件不存在并重新创建一遍。

`RemoteProjectNotSupportedError` 用于让「静默回退到本地」变成可见崩溃——本机很可能
存在同名路径，本地执行会对着完全不同的仓库给出看起来成功的答案。

### 命令构造集中在一处

`remote-command.ts` 是整条链路上唯一允许拼接命令字符串的地方。路径来自用户选择的
目录、模型给出的参数和远端目录列表，任何一处漏引号都是一次任意命令执行。

两层引用要分开理解：`buildRemoteScript` 产出交给登录 shell 的脚本，
`buildRemoteCommand` 再把整段脚本作为 `-c` 的单个参数引用一次。

### 用户命令走登录 shell，内部操作不走

`exec()` 用 `$SHELL -l -c`，因为 nvm、pyenv、asdf 只在 `~/.profile` 里改 PATH，
非交互 shell 读不到，远端明明装了 node 却报 `command not found`。

文件读写刻意不走登录 shell：profile 里任何一句 echo 都会混进 stdout，把文件内容污染成
「前面多了一行欢迎语」。读写直接走 `ssh -T` 的 8-bit clean 原始字节流，也因此不需要
base64（GNU 的 `-d` 与 BSD 的 `-D` 不兼容）。

### 文件传输走流式 exec，不用 SFTP 子系统

大文件经 `uploadFile` / `downloadFile` 在 `openChannel` 上流过管道：下载是 `cat --`
的 stdout 字节流；上传把本机字节灌进 `buildUploadFileCommand` 生成的脚本，远端先
`wc -c` 核对收到的字节数，对不上就删临时文件——取消、断线或源提前结束都不会让半截
文件顶替目标，对上了才 `mv` 就位。进度与取消经 `onProgress` + `AbortSignal` 贯穿，
本机读写侧由调用方提供（见「边界」）。配套原语：`stat`、`listFilesRecursive`、
`makeDirectory`。

## 测试

本包有标准测试入口；源码变更会被仓库选择器（`test:impact` / `test:changed`）自动选中：

```bash
bun run --cwd packages/ssh-transport test
```

覆盖分层：命令引用与两层 shell 语义、URI 往返、失败三分类在真实 shell 上执行
（POSIX 用 `/bin/sh`，Windows 用 Git Bash）；ssh2 后端的连接复用、认证回退、流式
文件传输（含上传的 wc 校验与取消清理）、取消与失效经本地真实 `ssh2.Server` 回环验证
（`*.loopback.test.ts`）。真正 POSIX 专属的
语义（进程组终止、权限位、`ss`/`netstat`/`ps` 输出形状、linux/darwin helper 目标）
在对应用例上以 `skipIf` + 理由显式交给 POSIX 平台覆盖，不静默跳过。回环夹具见
`src/testing.ts`（`createLoopbackSshConnection` / `buildSshHelperForTests`）。

`SshProcessRunner` 是可注入端口，因此以上全部可以在没有 SSH 服务器的情况下验证。


## Context Boundary

```yaml
purpose: SSH transport for remote Vetta projects: host model, connection reuse, remote exec and file operations.
provides:  
  - "@vetta/ssh-transport"
  - "@vetta/ssh-transport/project-uri"
  - "@vetta/ssh-transport/testing"
consumes:  []
internal_dependencies:  []
```
