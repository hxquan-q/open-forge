---
id: TASK-0168
type: task
status: done
priority: P1
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018; RESEARCH-0019
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158, TASK-0165, TASK-0174, TASK-0177]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（2026-10-02/03 主检出串行实施完成）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport/src/testing.ts, packages/ssh-transport/src/ssh-connection.loopback.test.ts, apps/desktop/src/main/filesystem, apps/desktop/src/main/plugins, apps/desktop/src/main/agent-runtime]
write_paths: [packages/ssh-transport/src/remote-command.test.ts, packages/ssh-transport/src/remote-listeners.test.ts, packages/ssh-transport/src/node-process-runner.test.ts, packages/ssh-transport/src/ssh2-runner.loopback.test.ts, packages/ssh-transport/src/testing.ts, packages/ssh-transport/src/ssh-connection.loopback.test.ts, apps/desktop/src/main/filesystem, apps/desktop/src/main/plugins, apps/desktop/src/main/agent-runtime, project/tasks/TASK-0168-ssh-windows-loopback-parity.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153, TASK-0165]
conflicts_with: [TASK-0158, TASK-0174, TASK-0177]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-09
---
<!-- Copyright The Open Forge contributors. -->

# Windows SSH 回环夹具与 Desktop 流程适配

## 目标与取舍

从 TASK-0153 拆出 d643c881f：适配 Git Bash POSIX 路径和本地临时目录，保留本仓 setsid 边界、helper 品牌、真实 ssh2 回环。拒绝原样复制一个维护不同取消/输出语义的 Windows runner；优先复用进程端口。保留仅 POSIX/Go 支持的测试平台边界，不删断言冒充跨平台通过。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：Windows 临时目录带空格→URI/文件读写/取消/资源与插件命令流程；端口动态分配，不用保留端口；符号链接无权限时单独报告而非跳过整条流程；POSIX 同套用例继续通过。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。

## 新增的兼容前置

TASK-0165 的 ssh2 交互认证预算/KI 密码回退已有独立参与者在主树实施。本任务须在其验证/集成后以实际新基线适配，不复制旧 ssh2-runner 或覆盖该批 WIP；保留其新增回环与认证测试。

## 集成后优先级与边界（TASK-0172，2026-10-02）

提升 P1，合同转 ready；并非本轮已实施。TASK-0153/0165 已集成，当前基线为 c8dc167f0。此 Task 是 [TASK-0174](TASK-0174-ssh-standard-test-entry.md) 标准测试注册的前置，而不是再创建一份相同的 Windows 适配工作。

当前 testing.ts 仍以 /bin/sh 与 POSIX 会话假设实现回环；先逐项列出 17 个测试文件的核心跨平台行为和真正 POSIX 专属行为。历史曾有 POSIX 依赖失败，本轮没有重跑全包，不能沿用旧失败数当作现状。

- Windows 核心 URI、路径带空格、二进制传输、取消、认证/host key 和错误分类仍须实际执行；复用现有本地 ssh2.Server，不自造一个只会返回期望字符串的假 shell。
- 仅真正 POSIX 进程组语义可以交给 POSIX job，且必须保留覆盖证据；不得用整文件/整包 Windows skip 隐藏本应支持的核心合同。Go/helper 前置缺失显式报告，保持原有 setsid 安全约束。
- 先回归 testing.ts 的资源释放与共享夹具，再验证实际使用它的 remote-command/remote-listeners/connection 及必要 Desktop 消费路径；每个新增平台分支都有失败/取消/清理断言。
- cwd packages/ssh-transport：`bun ../../scripts/quality/run-vitest.mjs run src/remote-command.test.ts src/remote-listeners.test.ts src/node-process-runner.test.ts src/ssh-connection.loopback.test.ts src/ssh2-runner.loopback.test.ts`；与平台无关核心用例分组对照，不改原阈值。随后消费者 test:impact/完整 check；跨平台证据在现有 quality.yml 三平台矩阵收口。
- 本 Task 不添加 package test 入口或新的 CI 矩阵；这些归 TASK-0174，README 与 TASK-0177 串行处理。

本轮仅细化合同；所有实现/平台回归仍未执行，集成 pending。后续仍需用户明确进入实施。

## 交付记录（2026-10-02/03，主检出串行实施）

- 实现：`createLoopbackSshConnection` 跨平台化——POSIX 保留原假 `ssh` 脚本（含 perl setsid 边界）；Windows 用 PATH 里的 Git Bash（缺位显式抛错，不静默跳过）执行同一条远端命令，复用从 `node-process-runner` 抽出的命令级管线 `runSshCommand`/`openSshCommand`（行为保持重构，既有 17 用例证明），并锁 `LANG/LC_ALL=C`、`SHELL=/usr/bin/bash`（Node 环境的 PATH 里没有裸 `bash`，`$SHELL -l -c` 需要绝对路径）。新增导出 `toLoopbackRemotePath`：Windows 路径转 MSYS 根形式（`/c/…`），远端合同的「绝对路径以 / 开头」与 MSYS `cd` 两头成立。
- 测试适配：`ssh-connection.loopback` Windows 6→7 通过（符号链接单独成组并按权限显式报告；realPath 的 MSYS 挂载表镜头差异按平台分支断言）；`remote-command` 以 `SH`/`shPath`/`LOGIN_SHELL` 适配后 Windows 新增 20+ 用例真实执行（引用、cd 整体性、token、写文件、stat 解析、独占创建、递归列举），进程组 kill、chmod 权限位、符号链接写入三组显式交给 POSIX；`remote-listeners` 本机 ps/信号两组、`helper.e2e`（helper 仅 linux/darwin 目标）显式 POSIX 门控。
- Desktop 消费者解锁（原先整文件 win32 skip）：`filesystem-service.remote-flow` 5 通过（可执行位一例显式 POSIX）；`file-protocol`、`media-protocol` 全量通过；`remote-command-runner` 全量通过；`command-spawner.remote` 解锁可跑用例（端口转发与进程组停止两例显式 POSIX）；`resource-runtime.remote` 保持门控——桌面提示词运行时装配在 Windows 挂起，根因待诊（本轮未定位，不猜测）。
- 验证：`bun run --cwd packages/ssh-transport test` 195 通过 25 显式跳过（0 失败）；desktop 上述文件逐个实测；`test:quality` 484 通过。
- 遗留（记录为后续工作，不在本轮扩大）：`packages/runtime-ssh` 的 5 个回环消费测试未在本 Task write_paths 内，Windows 直跑仍红（无 test 脚本、标准入口不可见）；`resource-runtime.remote` Windows 挂起根因；Windows 缺 bash 环境的 CI 前置（GitHub windows runner 自带 Git Bash）。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：在主检出（当前 HEAD）**独立复跑**「集成后优先级与边界」一节声明的五条定向命令，再单独跑 `ssh-connection.loopback.test.ts` 复核 TASK-0169 记录的那条存量红，最后把交付记录里的「遗留：`packages/runtime-ssh` 的 5 个回环消费测试 Windows 直跑仍红」拉到可量化程度。本任务边界不含真实主机，故不含真实 SSH 连接。

| 命令 / 读数 | 结果 |
|---|---|
| `bun ../../scripts/quality/run-vitest.mjs run src/ssh-connection.loopback.test.ts src/remote-command.test.ts src/remote-listeners.test.ts src/node-process-runner.test.ts src/ssh2-runner.loopback.test.ts`（cwd `packages/ssh-transport`） | **绿：5 文件通过 / 59 通过 \| 19 显式跳过**（0 失败）。跳过项即交付记录里显式交给 POSIX 的三组（进程组 kill、chmod 权限位、符号链接写入）与本机 ps/信号组——是**显式门控**而非静默 skip。 |
| 同上，只留 `src/ssh-connection.loopback.test.ts` | **绿：1 文件 / 7 通过 \| 8 跳过**（0 失败），与交付记录写的「Windows 6→7 通过」一致。 |
| cwd `packages/runtime-ssh`：`bun ../../scripts/quality/run-vitest.mjs --run`（整包直跑） | **红：12 文件中 10 失败 \| 2 跳过；64 例中 22 失败 \| 32 通过 \| 10 跳过**。典型失败是 Windows/POSIX 路径混拼：`src/ssh-tool-environment.test.ts` 在 `src/ssh-file-operations.ts:68` 拿到的路径形如 `ENOENT … access '/srv/app/C:\Users\xquan\AppData\Local\Temp\vetta-local-artifacts-SMyz1a\reference.md'`（MSYS 远端根前缀与本地盘符路径被拼在一起）。 |

**对 TASK-0169 存量红记录的更正（本轮实测推翻，非本任务引入）**

TASK-0169 第 74/76 行记录「`ssh-connection.loopback.test.ts` 在 Windows 仍有 **6 例存量红**（POSIX 假 ssh 脚本 ENOENT，属 TASK-0168 跨平台夹具范围）」「Windows 存量红待 TASK-0168」。本轮在该文件上实测 **7 通过 / 8 跳过 / 0 失败**——那条记录描述的状态**已被 TASK-0168 自己的交付消除**，属**过期记载**，不应再当作待办。该结论只否证「现在还有 6 例红」，不追认当时的读数是否有误。

**对「遗留：`packages/runtime-ssh`」的量化（结论：如实成立，且比记录更宽）**

- 交付记录写「5 个回环消费测试」，实测该包 **12 个测试文件里有 10 个失败、22 例红**；方向一致，规模更大。记录未高估，只是未量化。
- 关键补充：这 22 例红**不在任何标准入口内**——`packages/runtime-ssh/package.json` 只有 `clean`/`build` **没有 `test` 脚本**；`scripts/quality/lib.mjs:82-84` 的 `TESTABLE_PACKAGES` 定义为「有 `scripts.test` 的工作区包」，故 `bun run test:pkg --list` 在 ssh 系里只列出 `ssh-transport`，`bun run test` / `test:unit`（`test-pkg.mjs --all`）**永不覆盖本包**；`turbo.json` 的 tasks 里根本没有 `test` 任务；`.github/workflows/` 全量搜索 `runtime-ssh` **零命中**。即交付记录写的「无 test 脚本、标准入口不可见」经本轮三处独立核验**成立**，这 22 例红不会被任何常规门禁或 CI 暴露。
- 该遗留属 TASK-0174（SSH 标准测试注册）的前置范围，本任务明确写着「本 Task 不添加 package test 入口或新的 CI 矩阵；这些归 TASK-0174」，故本轮**不修**，只把读数钉死供其引用。

**未覆盖（不宣称通过）**

- 真实 SSH 主机（含动态端口分配、带空格临时目录的全链）——按任务边界不连真实主机，归 TASK-0165/0169 的实机口径。
- `resource-runtime.remote` Windows 挂起根因——交付记录自认「未定位，不猜测」，本轮**未复诊**，仍为未知。
- Windows CI 缺 bash 前置（记录称 GitHub windows runner 自带 Git Bash）——需 CI 环境，本轮未实测。
- 完整 `bun run check`、`test:changed` 与三平台矩阵收口——未复跑；本轮只做定向复跑与两处遗留的量化。

- 关闭建议：五条声明的定向命令在 Windows 本机全绿（59 通过 / 19 显式跳过 / 0 失败），且交付记录里唯一与「Windows 红」相关的争议点（TASK-0169 的 6 例存量红）经实测已不存在 ⇒ 就「本任务合同的可及范围」而言倾向闭合 `done`；但 `packages/runtime-ssh` 22 例红的**归属**（留在 TASK-0174 还是另立）需用户一并裁定。按 VERIFY-0017 约定等用户裁定。

### 用户裁定闭合（2026-10-09，VERIFY-0017 分档口径）

按用户「**按未覆盖成因分档**」口径裁定：未覆盖项属**任务边界外 / 已归属他 Task / 需 CI 环境**，据此闭合。

- 真实 SSH 主机（含动态端口、带空格临时目录全链）：交付记录明记「本任务边界不含真实主机」⇒ 无验收对象，实机口径归 TASK-0165/0169。
- `packages/runtime-ssh` 22 例红：交付记录已明记「这些归 TASK-0174（本 Task 不添加 package test 入口或新的 CI 矩阵）」，属**已归属他 Task**；本轮只把读数钉死供其引用。
- Windows CI 缺 bash 前置：需 CI 环境（GitHub windows runner 自带 Git Bash），非本机可测。
- 可及范围内证据：五条声明命令 **59 通过 / 19 显式跳过 / 0 失败**（跳过项为显式交给 POSIX 的三组）；实测推翻 TASK-0169「6 例存量红」的过期记载。
- **随本闭合转出的未决项（不得随闭合丢失）**：`resource-runtime.remote` 的 Windows **挂起根因**仍未定位（交付记录自认「未定位，不猜测」，本轮未复诊）——见 VERIFY-0017 本轮记录的待办段。
