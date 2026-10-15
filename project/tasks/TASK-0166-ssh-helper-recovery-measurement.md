---
id: TASK-0166
type: task
status: verifying
priority: P2
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/helper-deployment.ts]
write_paths: [packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/helper-deployment.ts, project/tasks/TASK-0166-ssh-helper-recovery-measurement.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153, TASK-0169]
conflicts_with: [TASK-0158, TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# SSH helper 可恢复失败与首次可用测量

## 目标与取舍

区分不支持平台与临时连接失败；对临时失败提供有上限、可取消的恢复，避免认证弹窗风暴；共享平台在途只读探测。先测首次可用各阶段再决定是否合并往返，不改变上传摘要复验、修订冲突保护或后台任务语义。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：并发首次读取共享探测；helper 临时失败后可恢复、unsupported 不忙重试；取消结束在途恢复；采样不包含主机地址、命令、凭据或文件内容。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。

## 调用链核对补充（2026-10-03，实施前设计定型）

- 现行 `helper()`（ssh-connection.ts）：失败被 `connectSshHelper` 折成 `undefined` 并随 `helperClient` promise 永久缓存；`onClose` 只对成功 client 清缓存。不支持平台与临时失败不区分（RESEARCH-0018 §「恢复风险」属实）。
- 实施切面：
  1. `connectSshHelper` 返回三态 `{ready|unsupported|transient-failure}`：`resolveSshHelperTarget` 无匹配、本机无对应构建、协议版本不兼容 → `unsupported`（永久，不重试）；其余（探测/解析/上传/摘要复验失败、通道建立失败、握手超时与一切异常）→ `transient-failure`。
  2. `SshConnection.helper()`：`unsupported` 按连接缓存（同今日）；`transient-failure` 允许有界恢复——连续失败上限（默认 3）与退避间隔内不重试，达上限后按连接永久降级并留诊断；恢复仅在调用方实际需要 helper（`viaHelper`）时发生，无后台自动重试循环，避免认证弹窗风暴；`dispose()` 期间在途恢复立即失效。
  3. `probePlatform` 共享在途 Promise：并发首次只读探测合一，首个调用方的 signal 只影响该次共享探测，失败/取消后下次调用重新发起。
  4. 首次可用分阶段计时：`connectSshHelper` 内记录 probe/resolve/digest/upload/handshake 各阶段毫秒数，经 `onDiagnostic` 输出汇总行（不含主机地址、命令、凭据或文件内容）；认证阶段耗时在 runner 层（本任务 write_paths 之外），只登记不接线。优化取舍（合并往返等）待测量证据后另行立项，不在本任务实施。
- 不改变：上传摘要复验、修订冲突保护、后台任务协议、`ssh exec` 降级路径语义与 `readyHelper` 行为。

## 交付记录（2026-10-03，TASK-0196 批次）

- 实际修改：
  - `packages/ssh-transport/src/helper-deployment.ts`：`connectSshHelper` 返回三态 `SshHelperEstablishment`（ready/unsupported/transient-failure）；平台/构建/协议不匹配归 unsupported，上传摘要复验失败从永久改为临时失败（可重试的部署性故障）；各阶段耗时（probe/resolve/digest/upload/handshake）与总耗时随 `onDiagnostic` 输出（`helper ready in Xms (...)` / `unavailable after Xms (...)`），不含主机地址、命令与凭据。
  - `packages/ssh-transport/src/ssh-connection.ts`：`probePlatform` 共享在途 Promise（并发首次只发一次 uname，失败/取消不缓存）；`helper()` 三态化——unsupported/连续 3 次失败按连接永久降级，临时失败线性退避（30s×次数）且仅在调用方需要时重试，无后台重试循环；`readyHelper` 快路径与成功后重置失败计数保留「通道断开→下次调用重部署」语义；`SshConnectionOptions.now` 可注入时钟。
  - 既有 `ssh-connection.test.ts` dispose 用例适配三态 mock；新增 `ssh-connection.helper-recovery.test.ts`（共享探测、失败重探、unsupported 缓存、退避窗口、达上限放弃、dispose 停恢复）与 `helper-deployment.test.ts` 分类用例。
- 实际运行：
  - 红测先行：三态契约缺失时 10 例红（返回 undefined 无 status）。
  - `bun run test:pkg ssh-transport`：205 通过（2 例负载型假红经单跑复验绿：ssh2-runner 握手预算 1ms 漂移、directory-listing 超时）。
  - `bun run test:impact -- <四文件>`、`bun run check:quick`、完整 `bun run check`：通过。
- 未运行及原因：
  - 真实远端主机的首次可用计时：不连接真实主机（任务边界）；计时以诊断合同与单测覆盖，实机数值待用户验收。
  - 认证阶段耗时接线：位于 runner 层（write_paths 之外），按设计仅登记；合并往返等优化待测量证据另行立项。
- 剩余风险：
  - 退避常数（3 次/30s 线性）是保守初值，无实机数据校准；诊断日志可支撑后续调整。
  - 上传校验和失败重试可能重复上传大文件（上限 3 次），带宽敏感环境由失败诊断可见。
