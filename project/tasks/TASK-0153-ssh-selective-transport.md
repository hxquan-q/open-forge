---
id: TASK-0153
type: task
status: verifying
priority: P1
owner: ssh-transport
source: user-request; upstream 896d80696; RESEARCH-0018
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148, TASK-0169, TASK-0166, TASK-0167, TASK-0168]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0153-ssh-selective-transport
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport, apps/desktop/src/main/ssh]
write_paths: [packages/ssh-transport/src/node-process-runner.ts, packages/ssh-transport/src/node-process-runner.test.ts, packages/ssh-transport/src/node-process-runner.lifecycle.test.ts, project/tasks/TASK-0153-ssh-selective-transport.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/ssh-transport/src/node-process-runner.ts, packages/ssh-transport/src/node-process-runner.test.ts, packages/ssh-transport/src/node-process-runner.lifecycle.test.ts]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0148, TASK-0165]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# SSH 本地进程组取消的选择性适配

## 目标与范围

Upstreamable。用户取消/超时结束远端命令后，本地 SSH 的派生进程不能继续占用输出管道而使操作不结束。沿用 REQ-0002 的有限时间终态，参考上游 896d80696；只改系统 OpenSSH runner 和其回归，不整文件覆盖。

本次续接原 draft 并拆窄边界：d643c881f 的共享 Windows 回环夹具和 Desktop 消费者移至 TASK-0168；不能用跳过测试或另写一套弱化执行器代替适配。TASK-0148 是集成验证顺序而非本切片源码依赖：本工作树使用已有 Node runner，显式 --maxWorkers=1，不复制未提交质量脚本。

## 做与不做

- POSIX 创建独立进程组；取消/超时向整组 TERM，必要时 KILL；父进程 exit 后子孙仍持管道时也必须清理。
- run/open 共用终止边界，取消幂等，结束后清理定时器和监听，保留输出及 aborted/timedOut 语义。
- 跨平台基础进程测试用当前 Node；额外真实 POSIX 进程树测试及可在 Windows 跑的 OS 边界合同测试。
- 不修改 ssh2、认证/known_hosts、helper、IPC、手机协作、TASK-0147 UI 或其他现有 WIP；不自动重放远端写入/命令，不宣称杀本地进程等于确认远端退出。

## Given / When / Then

1. Given 一条命令产生 stdout/stderr；When 正常退出/非零退出；Then 完整保留输出和退出码，流式消费不再累积完整 stdout，stderr 仍有上限。
2. Given SSH 派生子孙持有管道；When 用户取消或 deadline 到；Then 发送进程组 TERM，未 close 时 KILL，返回准确取消原因。
3. Given 父 PID 已 exit 但输出管道未 close；When 取消；Then 仍清理独立进程组，不因 exitCode 或 killed 提前放弃。
4. Given 取消已发生或通道反复 kill；When 再次取消/超时；Then 原因不变，最多一个升级定时器；close/error 后不迟到杀其他进程。
5. Given Windows；When 正常执行/取消；Then 仍走单 PID 终止，不向负 PID 发信号，不改变 Desktop ssh2 平台选择。

## 并发评估

独立 Task Worktree，单 Agent 串行实施；execution: parallel 仅满足仓库独立工作树合同，不代表派工授权。与 TASK-0148 的实现路径不重叠；任务索引/release notes 与列出的 conflicts_with 串行集成。以已提交 main 为基线，不复制用户 UI WIP。主树不干净时不合并、不推送。保护证据见 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md)。

## 验证合同

- 定向：bun scripts/quality/run-vitest.mjs run packages/ssh-transport/src/node-process-runner.test.ts packages/ssh-transport/src/node-process-runner.lifecycle.test.ts packages/ssh-transport/src/ssh2-runner.test.ts packages/ssh-transport/src/ssh2-runner.loopback.test.ts --maxWorkers=1。
- 影响面：bun run test:impact -- packages/ssh-transport/src/node-process-runner.ts；中间 check:quick，完成后完整 bun run check。
- 本机 Windows 无法证明实际 POSIX 进程树行为；真实 POSIX 用例保留供对应平台执行，不把 Windows 边界 fake 说成 POSIX 实测。
- 不运行真实 SSH/Provider/用户 Desktop；仅隔离子进程和本地测试服务器。

## 验收与交付

工程：待 red/green 与门禁；技术评审：待自审；集成：pending；人工验收：待用户；发布：未授权。用户验收入口为远端项目的命令执行→取消/超时，预期不再卡住；传输失败仍不能推断远端任务已退出。完整 Windows 远程流程另归 TASK-0168。

## 实施证据（进行中）

- Worktree 已由仓库命令创建，bun install --frozen-lockfile 成功；未复制 UI WIP 或凭据。
- 上游取消补丁只借鉴独立进程组：额外修正父进程已 exit 但管道未 close、通道 kill 升级、取消原因稳定、spawn 时 Abort 竞争及定时器回收。未修改 ssh2 实现。
- Red：原 runner 的 OS 边界回归失败（缺少 detached/进程组终止），当前 Node 跨平台原行为 4 项通过。首次命令使用了 Vitest 4 不支持的 --minWorkers，已按实际 CLI 删除该参数，不改配置。
- 首次失败断言意外展开环境并包含敏感变量；测试立即改为显式 baseEnv: {}，已告知用户，不将输出或凭据写入任何项目文件。
- Green：4 文件 43 passed / 1 POSIX-only skipped（Windows），包含现有真实 ssh2 loopback；之后改进 POSIX 用例的失败清理，待最后重跑。
- 当前 test:impact 按脚本回退 test:changed，runtime-desktop 13 文件 51 项通过；Desktop 影响面仍在运行。check:quick 进行中；完整 check 尚未运行。
- 源码自审：保留正常输出、尾部 stderr、退出码、错误和 Windows 平台边界；不声称本地进程终止确认远端已退出。

## 检查与环境补齐

- 最后定向重跑：4 文件 43 项通过、1 项真实 POSIX 用例在 Windows 跳过；已包含改进后的用例清理。
- check:quick 与完整 bun run check 均退出 0；lint、root/CLI/Desktop/docs/mobile 类型、mobile lint 与 guards 通过。守卫打印 upstream/dev 不存在后使用已有固定基线并通过，未修改 baseline 或远端。
- 首轮影响面：runtime-desktop 13 文件 51 项通过；Desktop 826 文件通过、50 文件失败、6 既有跳过；4401 测试通过、4 失败、31 跳过。46 个 suite 存在 Electron 缺失导致的收集失败，另有超时、EBUSY 与 McpAppSurface 断言失败，不能全部归因于 SSH 或环境。
- 隔离依赖安装的 Node install.js 未产生 Electron 产物；用同一已锁定依赖的 bun node_modules/electron/install.js 补齐后，path.txt 与 electron.exe 均存在。没有改依赖/锁文件、没有启动 Electron 或用户实例。
- 完整静态检查结束后，以 bun ../../scripts/quality/run-vitest.mjs run --maxWorkers=2 重跑全部 Desktop，保留全部断言/timeout；结果待回填。原 0148 未提交脚本没有复制进此工作树。

并发台账校正：另一参与者新建了 TASK-0165（ssh2 交互认证）并修改主树 ssh2 三个文件，本轮未触碰。只把本轮生命周期草案从冲突编号 0165 改为 TASK-0169，保留对方 Task/索引/代码；后续生命周期/回环须适配并保留其认证变更。隔离基线不包含该未提交修复，因此现有回环通过不等于两批集成通过。

## 本轮交付结果

- 实际修改：node-process-runner.ts、node-process-runner.test.ts、node-process-runner.lifecycle.test.ts 与独立工作树 v0.1.3 发布说明，共 4 文件；没有改 ssh2、主进程装配或 UI。
- 工程证据：SSH 43 passed/1 平台跳过；runtime-desktop 51 passed；补齐 Electron 安装后 Desktop 4624 passed/29 既有跳过；check:quick、完整 check 和 pre-commit 通过。首轮失败与后续复验区别见 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md)。
- 原子提交：2e41db644893488117bc58485a03a449a8a114f0，分支 task/TASK-0153-ssh-selective-transport；独立工作树干净。
- 主树相关 UI/表单/i18n/theme-ui 25 文件最终 SHA-256 全部保持原样；对方新增的 TASK-0165 认证改动未触碰。
- 工程验证已取得当前 Windows 环境证据；真实 POSIX 进程树仍待对应平台执行。技术评审为源码自审，人工功能接受待用户。
- 集成 pending：主树 WIP 尚在，不合并、不推送、不回退或夹带其他 Task。发布未授权。状态保持 verifying，不将独立提交写成已在当前 Desktop 生效。

### 功能验收包

可用候选为上述独立分支提交，尚不在 main。集成后在 macOS/Linux 的远端项目执行可取消命令，取消/超时应结束本地等待；同时正常命令、双向通道和 Windows ssh2 不退化。传输中断仍不能断言远端命令已退出，不自动重放。不要为本轮验收使用真实主机/用户实例，除非用户另行明确授权。

## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0153-ssh-selective-transport；来源提交：2e41db644893488117bc58485a03a449a8a114f0。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0153。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。
