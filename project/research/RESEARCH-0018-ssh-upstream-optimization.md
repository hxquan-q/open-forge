---
id: RESEARCH-0018
type: research
status: done
priority: P1
owner: ssh-transport + desktop
source: user-request; openvetta/open-vetta upstream source comparison
created: 2026-10-02
updated: 2026-10-02
related_requirement: []
related_plan: []
related_tasks: [TASK-0133]
related_issues: []
related_bugs: [BUG-0049]
---
<!-- Copyright The Open Forge contributors. -->

# SSH 远程连接与上游增量对照

## 当前结论

建议**选择性移植上游补丁，保留本仓 Windows ssh2 传输，并优先补齐连接生命周期**；不整体覆盖 SSH 目录，也不先调大超时或关闭安全校验。

上游近期直接相关的增量是取消卡住修复、Windows 回环测试兼容、远端按文件名筛选。持久 helper、后台任务托管、端口转发、远端终端与修订冲突保护已经在本仓，不是此次需要重新引入的功能。

本文区分：**事实**是提交和源码可直接核实的内容；**风险**是静态调用链揭示、尚未运行时复现的行为；**建议**是后续可选实施，不代表已获得实施或真实主机测试授权。

## 问题与范围

- 回答如何优化 Open Forge SSH 远程项目，并核对原始上游最新更新。
- 调研范围：`packages/ssh-transport`、`packages/runtime-ssh`、`apps/ssh-helper`、Desktop SSH 装配及必要文件系统消费者。
- 本轮只读源码并记录研究；不合并上游、不修改产品代码、不连接真实主机、不启动 Desktop、不访问真实用户 SSH 配置或凭据。
- 单 Agent 串行调查，没有并行写入；本轮不建立实施 Task 或声称性能改进已经发生。

## 事实来源

核对日期为 **2026-10-02（Asia/Shanghai）**。通过公开仓库 `git ls-remote` 和不写入分支的 `git fetch --no-tags <url> main/dev` 取得对象；没有新增 remote、切换分支或合并。

| 对照对象 | 固定提交 | 提交时间（+08:00） |
| --- | --- | --- |
| 本仓调查基线 | `9e19c0e6338a52fd64009ab565080c605a56b7f9` | 2026-10-02 01:39:32 |
| [上游 main][up-main] | `a2d314a8521aa438c78dd51ed18c9e523a2cfab9` | 2026-09-30 10:34:24 |
| [上游 dev][up-dev] | `071ed323cda92cd7c1c37122b9ad68b3d642cfc5` | 2026-09-30 17:31:20 |
| 本仓与上游 main 的 merge-base | `d217984c72ef7b5f66ce0a6fea1ae2375060d425` | 2026-09-22 16:10:00 |

上述四个 SSH 核心目录在这两个上游 HEAD 间 `git diff --quiet` 返回 0，不能把 dev 中手机远程桌面/WebRTC 的新重连机制误算作 SSH 更新。

### 尚未进入本仓的相关上游提交

| 提交 | 事实与价值 | 移植边界 |
| --- | --- | --- |
| [896d80696：取消卡住修复][cancel]，09-27 | POSIX 下让本地 SSH 子进程拥有独立进程组；取消时 TERM/KILL 整组，避免 ProxyCommand 等遗留子进程持有输出管道，导致 `close` 不返回 | 优先移植 runner 与对应测试；同提交另含 LAN server 测试/行为变化，不必夹带。本仓 Windows 主通道走 ssh2，不会仅靠此补丁得到同样收益 |
| [d643c881f：Windows 回环测试兼容][loopback]，09-24 | 调整共享回环测试适配与 Desktop 多个远程流程测试，缓解 POSIX shell/路径假设造成的 Windows 失败 | 连同 `testing.ts` 与真实消费者测试评估，保留本仓独有 ssh2 回环覆盖；不是一个新的生产传输实现 |
| [8c6872ac8：远端文件名筛选][names]，09-29 | helper 与 exec fallback 在远端按 basename 筛选后再应用数量上限，减少无关返回项，也避免清单文件被先截断掉 | 不是目录索引；Go helper 仍遍历目录树，不承诺消除所有远端扫描成本 |
| [bb3a23ef8：筛选能力的消费者接线][names-api]，09-29 | 将 names/ignoredDirectories 接入 filesystem service、capability schema、IPC、preload 与 Plugin SDK | 只有底层补丁不会让插件入口自动受益；公共合同与版本门禁须整体核对，但不必顺带移植新的脚本插件 |

`1794ef9db` 出现在 SSH 路径日志里，但只给该处测试 fixture 补通知配置字段，不是 SSH 性能修复。

`8c6872ac8` 对旧 helper 的客户端后置过滤只能保证返回项符合 names，不能恢复旧 helper 在过滤前已经截断的文件；必须验证旧 helper 兼容与新版部署。正常部署本来就按摘要更新二进制，不能把“旧 helper 兼容风险”写成每次升级必然发生。

### 本仓已有、应保留的能力

通过 `git merge-base --is-ancestor <commit> HEAD` 确认以下上游历史已包含在本仓：

- `b4abf5ebc`：helper 就绪后的文件操作共用通道，不再每次新起 ssh 进程。
- `6bc56aa8d`：helper 托管后台任务，本机断开后仍继续运行。
- `f821fcecb`：远端 edit 修订冲突保护。
- `2f0bbc60f`：端口转发。
- `9335acdac`：远端 helper 交互式终端；终端不等同于可跨断线保活的后台任务。

另外，本仓 [TASK-0133](../tasks/TASK-0133-ssh2-windows-transport.md) 已引入 Windows ssh2。现行 [平台装配](../../apps/desktop/src/main/ssh/ssh-runtime.ts) 在 Windows 使用进程内 Client、多 channel 复用、主机密钥确认与提示桥，其余平台保留系统 OpenSSH。后续本仓提交 `d2824d6ee` 已修正 ssh-agent 不可达时的认证降级。这些 fork 差异不能被上游目录覆盖。

## 优化建议与代码锚点

### 1. 优先收敛连接身份和失效生命周期

**事实**：[manager](../../packages/ssh-transport/src/ssh-connection-manager.ts) 按 hostId 缓存，`invalidate()` 只删上层对象；[ssh2 runner](../../packages/ssh-transport/src/ssh2-runner.ts) 按 target 字符串缓存会话，`ensureReady()` 有 Client 就直接返回；[Desktop 装配](../../apps/desktop/src/main/ssh/ssh-runtime.ts) 又按 target 查找第一个主机配置。

**限定与风险**：[主机服务](../../apps/desktop/src/main/ssh/ssh-host-service.ts) 已禁止重复 target 登记，不能声称正常入口能同时创建两条同 target 配置。直接风险是同一主机修改端口/身份，或删除后按相同 target 重新登记：上层失效并不保证底层已认证 Client 或旧 helper 通道结束。对于 OpenSSH，同 hostId 的 ControlPath 也不会因上层 invalidate 自动关闭旧 master。具体用户流程尚未复现。

**建议**：将 hostId 与配置代次传到传输边界；让 invalidate/disconnect 明确清理对应连接、helper 和转发，并处理正在建立中的连接，防止它在失效后重新安装旧 Client。不要重写文件/命令协议或全平台统一替换传输实现。

### 2. 把平台缓存与真实连通性分开

**事实**：[SshConnection.probePlatform](../../packages/ssh-transport/src/ssh-connection.ts) 命中平台缓存后立即返回；manager 的 `probe()` 调用它后会置 connected。manager 没有从底层 close/error 接入连接状态变化。

**限定**：[设置页的 probeSshHost](../../apps/desktop/src/main/ssh/ssh-host-probe.ts) 另有真实 `exec()`，所以不能据此断言“测试连接按钮完全不访问远端”。问题是 manager 的探测语义和生命周期状态，而非抹掉现有真实探测。

**建议**：分别提供平台信息缓存与有截止时间的实时探测；接入连接代次匹配的 close/error 事件。恢复只能重新建立通道或恢复可安全恢复的订阅，不能把未确认执行结果的写入/用户命令自动重放。

[转发服务](../../apps/desktop/src/main/ssh/port-forward-service.ts) 已有巡检与一次自动重建，不应重复建设无限重试。Windows 已配置 30 秒 keepalive、最多 6 次未应答；非 Windows 当前 argv 没显式设置应用级 ServerAlive 参数，但用户 OpenSSH 配置可能已设置，不能直接断言没有保活。

### 3. 测量首次可用时间，再减少认证与 helper 往返

**事实**：[ssh2 runner](../../packages/ssh-transport/src/ssh2-runner.ts) 当前对不同候选认证配置逐次创建 Client；[helper 部署](../../packages/ssh-transport/src/helper-deployment.ts) 串行执行家目录解析、摘要检查、必要的目录创建/上传/chmod/复验、握手；[平台探测](../../packages/ssh-transport/src/ssh-connection.ts) 没有共享在途 Promise。连接复用不等于这些串行操作没有往返成本。

**建议**：先分阶段记录解析配置、握手、等待用户认证、平台探测、helper 准备的耗时；在测到主导瓶颈后，评估同一连接中的认证候选切换、合并只读探测、共享在途探测与本地 helper 摘要缓存。不得以跳过主机密钥确认、上传后摘要复验或修订检查换速度。

**恢复风险**：helper 建立失败会被折成并缓存 `undefined`；纯文件操作只使用 readyHelper，并不主动重连。已有目录 watch/后台任务等入口会显式调用 `helper()`，因此不是所有流程都永久降级。建议区分“不支持此平台”和“临时网络/握手失败”，后者允许有上限、有退避且可取消的恢复，并避免反复触发认证弹窗。

### 4. 大仓库筛选作为完整用户流程引入

选择性移植 `8c6872ac8` 与 `bb3a23ef8` 的必要接线。在正常插件/文件系统入口验证 names → schema → IPC → remote filesystem → helper/fallback，而不是只新增底层函数测试。新旧 helper、空 names、隐藏/忽略目录、超过 limit 才出现的目标清单都要覆盖。

## 被否决的方案

- **整包覆盖或无边界 cherry-pick**：前者会丢失 Windows ssh2、Open Forge helper 命名/目录及现有修复；后者可能夹带 LAN server、Plugin SDK 或通知配置等无关变化。
- **只调大超时**：可能延长挂起，不能修正旧连接复用、遗留进程或缓存探测。
- **关闭主机密钥验证、跳过摘要检查**：违反安全不变量。
- **无限自动重连并重放命令**：可能重复执行写入、触发连续口令提示；传输失败仍必须表示“结果不可确认”。
- **现在就全平台改 ssh2 / 重做远端 daemon**：系统 OpenSSH 的 ProxyCommand、FIDO 等能力不能静默退化；已有可选 helper 足以承接当前加速方向。

## 测试与指标计划（尚未执行）

| 切片 | 最小验证目标 |
| --- | --- |
| 生命周期 | 隔离 ssh2 回环服务覆盖修改端口/身份、删除后同 target 重建、连接中失效；保持既有 target 唯一性规则，POSIX master 清理单独验证 |
| 状态与恢复 | 成功探测后断线不得因平台缓存继续被判为实时在线；helper/转发恢复不重复认证、不重放用户命令 |
| 上游取消修复 | POSIX 下派生进程持有 stdout 的回归；Windows runner/ssh2 各保留取消、超时和退出码合同 |
| 大仓库筛选 | 目标清单位于 limit 之后；新旧 helper 与 exec fallback；正常消费者入口端到端接线 |
| 性能 | 固定 RTT/抖动条件下冷连接、热连接、首个目录可用、helper 就绪的 p50/p95；握手次数、远端往返数、返回字节数、取消完成时间；用户思考/输入耗时单独记录 |

本轮只有 Git 提交、祖先关系和静态调用链核对，没有运行上述行为/性能测试，没有性能基线数字。文档检查不构成 SSH 功能验收。后续实施走仓库 Node test runner 和定向/影响面测试；Go helper 修改另跑其原生工具链；完整代码任务再跑 `bun run check`。真实主机与 UI 验证必须另获授权。

## 本轮文档验证

- `git diff --check`：通过。
- `node scripts/quality/check-project-indexes.mjs`：通过。
- `node scripts/quality/workflow-skills.mjs`：通过。
- `bun run scripts/release/release-notes.mjs --check`：通过，当前开发版本 0.1.3。
- 复用仓库 `parseFrontmatter` 与 `brokenFileLinks` 的只读检查：本报告元数据、相对文件链接及 UTF-8/LF 编码通过。
- 研究结论为单 Agent 源码自审，不是独立评审。纯文档，无运行时变化，未运行 SSH 测试、Go 测试、完整 TypeScript check 或 UI 验证；没有连接真实远端。

## 失效条件与置信度

- 上游提交范围与本仓已包含能力：高置信度，有固定 SHA 和 ancestry/diff 证据。
- 生命周期与恢复问题：有直接源码证据，但用户可见影响范围仍须隔离复现，不能标为已修复或已实测故障。
- 首连提速建议：待性能数据验证，不承诺特定毫秒数或倍数。
- 本仓/上游 HEAD、传输缓存键、manager invalidate、helper 协议与部署机制改变后，应重做相关对照。

## 下一步触发信号

获得实施指示后，优先从 **Windows 连接身份/失效 + 隔离回环复现** 开始；随后选择性引入取消修复/跨平台测试，再完成大仓库筛选和测量驱动提速。不在本研究中预先建立跨包迁移承诺。

[up-main]: https://github.com/openvetta/open-vetta/commit/a2d314a8521aa438c78dd51ed18c9e523a2cfab9
[up-dev]: https://github.com/openvetta/open-vetta/commit/071ed323cda92cd7c1c37122b9ad68b3d642cfc5
[cancel]: https://github.com/openvetta/open-vetta/commit/896d80696d18ddf64019f3bcb23cf4f83bc21a47
[loopback]: https://github.com/openvetta/open-vetta/commit/d643c881faa84dd735a0729a267ab7fb6adc7887
[names]: https://github.com/openvetta/open-vetta/commit/8c6872ac82eb4b829c05786c6c5579cb0bd9ed5b
[names-api]: https://github.com/openvetta/open-vetta/commit/bb3a23ef83ca3e8172493e12fe88c1d00923a317
