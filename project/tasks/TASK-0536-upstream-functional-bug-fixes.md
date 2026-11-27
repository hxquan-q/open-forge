---
id: TASK-0536
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 0b61dc611
read_paths: []
write_paths:
  - apps/desktop/src/main/agent-teams/
  - apps/desktop/src/renderer/domains/settings/components/
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
  - packages/ssh-transport/src/
  - packages/runtime-ssh/src/
  - apps/ssh-helper/internal/server/
  - .github/release-notes/fragments/v0.1.5/
  - .github/release-notes/v0.1.5.md
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 上游功能错误四项修复：预设对齐回退、团队换模型快照、预设请求头保留、csh/tcsh 登录 shell

## 合同

- 来源与目标：PLAN-0032 基线外增量，RESEARCH-0052 分诊出的「可直接采纳」功能错误修复四项，按 fork 实际手工合并：
  - 上游 `245f0dc4f`：插件预设对齐失败时退回已存配置，不再整份读废（`agent-team-file-repository.ts` 本地与上游前态逐字一致，近乎直搬）。
  - 上游 `057b22c1d`：团队对话换模型后不被旧会话快照改回原模型——主进程推送改用内存最新文档；渲染层采纳快照时会话文档只进不退、对话内容照常更新。
  - 上游 `50d6f5f86`：预设服务商改 key 重新启用时保留用户在 models.json 手加的请求头。
  - 上游 `29e678a97`：登录 shell 为 csh/tcsh 的远端主机可连可用——`SELECT_LOGIN_SHELL` 选择规则 + `wrapForLoginShell` 传输层包装，TS 与 Go helper 双侧同步。
- 做 / 不做：只做上述四项及其回归测试；不做 RESEARCH-0052 中其余批次（性能批、体验批、改写后采纳、待拍板项）。并发结论为串行：四项共享部分测试基建且无拆分收益。
- Given / When / Then：
  - 插件预设重铺抛错（如重复 handle）→ read() 返回已存配置且不改写 index.json，不再整页空白。
  - 团队对话一轮未结束时撞到额度上限、用户随即换模型 → 该轮收尾推送的快照不会把 modelSettings 改回去，下一条消息立即用新模型。
  - 已启用预设服务商改 key 重新启用 → `providers.<id>.headers` 手加项保留。
  - 远端账号登录 shell 为 csh/tcsh → 连接、执行命令、读写文件、后台任务正常；POSIX 登录 shell 行为不变（单行无特殊字符命令在 ps 里仍可读）。
- 保留：不触碰 ssh2 进程内执行路径（BUG-0049 的 Windows 决策）；`TeamSessionUpdatePublisher` 的合并语义（fork 自有分叉）保留——flush 时读内存最新文档这一结构已覆盖上游主进程修法，本任务按上游原文补同一防线（本地为防御纵深，无独立直发路径）并移植其回归测试；渲染层文件已分叉，按本地结构改写而非照抄 diff。
- 验证：各项定向 vitest（agent-teams repository、team-session-concurrency、teamChatModel、useTeamChatModel、usePresetProvidersSectionModel、ssh-transport remote-command/ssh-connection/loopback、runtime-ssh ssh-tool-environment）；`bun run test:impact --` 改动源文件；`bun run check`；Go 侧 `apps/ssh-helper` 包内工具链定向检查。
- 人工验收：无独立实机验收要求；csh 实机环境本机不具备，行为以真实 shell 往返测试（POSIX 上）与结构断言覆盖。

## 交付

- 状态：2026-11-27 完成实施与工程验证，转 verifying 待用户验收。
- 实施内容：
  - `245f0dc4f` 预设对齐失败回退：`agent-team-file-repository.ts` installPresets 整体包 try/catch——catch 内 log.error、恢复 storageIndex 原状并 return document，重铺失败不再整份读废。`agent-team-file-repository.test.ts` 新增重复 handle 导致对齐失败时返回已存配置且不改写 index.json 的用例。
  - `057b22c1d` 团队换模型快照：`team-session-service.ts` publishSessionUpdated 改用内存最新文档（上游防线直搬）；渲染层 `teamChatModel.ts` 新增 `adoptTeamSessionSnapshot`（会话文档只进不退、对话内容照常更新，双落后整帧拒收），`useTeamChatModel.ts` 三处接入——updateModelSettings 先更新 snapshotRef 再 setSnapshot、流事件采纳走 adopted 语义（staleUpdatePrune/titleChanged 与上游一致）、send 响应经 adopt 合并。测试：`team-session-concurrency.test.ts` 移植上游并发用例（本地适配：等 32ms 合帧 flush 到达后再退订断言）、`teamChatModel.test.ts` 三用例、`useTeamChatModel.test.tsx` 换模型后迟到旧快照不回退用例。
  - `50d6f5f86` 预设请求头保留：`usePresetProvidersSectionModel.ts` adopt 回调在覆盖 provider 配置时保留既有 `headers`；新建 `usePresetProvidersSectionModel.test.tsx`（jsdom，mock 层闭包捕获保存入参直接断言形状）。
  - `29e678a97` csh/tcsh 登录 shell：`remote-command.ts` 直搬上游 `SELECT_LOGIN_SHELL`（csh/tcsh/空 shell 名回退 /bin/sh，其余用 $SHELL）与 `wrapForLoginShell`（printf 八进制编码经 eval 注入登录 shell，规避 csh 引号语义差异）；`ssh-connection.ts` 两处 buildSshArgv 第三参改包装版；`apps/ssh-helper/internal/server/proc.go` wrapperScript 同步同一选择规则。测试：`remote-command.test.ts` 上游用例照抄（shell 矩阵 roundtrip、csh skipIf、可读性），`ssh-connection.test.ts`/`ssh-tool-environment.test.ts` 经 `unwrapLoginShellCommand` 解包后断言，`ssh-connection.loopback.test.ts` 新增 csh 模式三用例（本地适配 cwd 走 remote() 转换）。
- 本地分叉适配（偏离上游直搬的决策点）：
  - 主进程 publishSessionUpdated 防线在本地为防御纵深：fork 自有 `TeamSessionUpdatePublisher` 32ms 合帧，flush 时已重读 sessionState 内存最新文档才发布，sessionState 内存单调前进（persist 以 `latestSessionStateEntryMatches` 对账、事务通道串行化），上游修复的事件流回退场景在本地结构上本不可达。防线保留以锁定合同并覆盖未来直发路径；渲染层 adopt 是 send 响应路径（可走旧 revision）的实际修复面。并发回归测试锁定端到端合同而非某一层的实现位置。
  - `packages/ssh-transport/src/testing.ts` 的 `resolveWindowsGitBash`（原 resolveWindowsBash 重命名导出）为本地修复、非上游内容：本机 PATH 裸 `bash` 解析到 System32 WSL 转发启动器，`-c` 脚本中变量赋值静默失效（temp/probe-*.mjs 有复现），是 remote-command.test.ts 12 个存量失败与 loopback 偶发失败的根因。新实现枚举 PATH 各目录 bash.exe 与 ProgramFiles/LOCALAPPDATA Git 安装位，逐个用 `l=ok; printf %s "[$l]"` 探针验证 stdout，全失败才抛错。
  - `packages/ssh-transport/vitest.config.ts` 新增 `testTimeout`（win32 20000/其他 5000）：包装层多一层 sh 进程，Windows Git Bash 进程串下 4MiB 传输用例 5 秒默认超时装不下。
  - `packages/ssh-transport/dist` 已重建（dist gitignored，runtime-ssh 测试经 dist 解析）。
- 工程验证（全部实际执行）：
  - 定向 vitest：team-session-concurrency.test.ts 64/64（含移植并发用例）；useTeamChatModel.test.tsx + teamChatModel.test.ts 91/91；agent-team-file-repository.test.ts 14/14；usePresetProvidersSectionModel.test.tsx 1/1；remote-command.test.ts 28 通过/5 skipped（Windows 无 csh，skipIf 正常）；ssh-connection.test.ts 33/33；ssh-connection.loopback.test.ts 7 通过/25 skipped（POSIX-only 由 CI 覆盖）；ssh-tool-environment.test.ts 11/11；ssh-transport 全套 237 通过/43 skipped 两次连跑稳定。
  - `bun run test:impact --` 九个改动源文件：desktop 67 个测试文件 644 用例、ssh-transport 106 通过/36 skipped，全部通过。
  - `bun run check` exit 0（lint/types/guards/mobile 全绿；release-notes 存量风格 warning 非本次新增）。检查首轮发现三个上游衍生文件缺声明头与一处超宽行，已修复后复跑全绿。
  - Go 侧：GOOS=linux 交叉编译 + vet `apps/ssh-helper` exit 0（Windows 宿主 `go test` 编译失败为既有限制——syscall.Kill/Setsid 无 Windows 实现，Makefile 注明不支持，与改动无关）。
- 未运行项与风险：
  - csh/tcsh 实机环境本机不具备：行为以 POSIX 真实 shell 往返测试与结构断言覆盖，csh 路径用例在本机 skipIf、由 Linux CI 覆盖。
  - `resolveWindowsGitBash` 修复了本机存量失败根因，但 WSL bash 转发器病灶属环境级问题；探针逐个验证可用 bash，全失败时显式报错而非静默降级。
- verifier 复查：complete/pass，无 P1/P2。独立核实：四项上游内容与本地改动逐点对照一致；主进程防线 no-op 判定成立（publisher flush 重读使两行恒取同一对象，并发用例锁端到端合同、不鉴别该防线——本交付说明已如实标注）；渲染层 adopt 语义忠实（titleChanged 用 adopted.session、snapshotRef 先写顺序正确）；闭包捕获断言有鉴别力且无 toHaveBeenCalled*；resolveWindowsGitBash 探针能区分 WSL 转发器、属真实修复；约束全过（声明头 missing=0、无 any/吞错/ts 压制）。P3 已处理：合同「直连 publish 路径」措辞矛盾已修正、write_paths 补记 v0.1.5.md；P3 已知晓不处理：catch 只回滚内存索引（写盘中途失败遗留未索引目录由确定性 key 下次复用，与上游同构）、send 响应 setSnapshot 未同步写 ref（上游同构、渲染期每帧同步兜底）、Git Bash 探针无超时与带引号 PATH 目录不枚举、Windows 20s testTimeout 取舍（注释已声明）、csh 用例本机 skip 由 Linux CI 覆盖。verifier 独立复跑 remote-command.test 28 通过/5 skipped、teamChatModel.test 56/56、usePresetProvidersSectionModel.test 1/1。
- 发布说明：`.github/release-notes/fragments/v0.1.5/upstream-functional-bug-fixes.md` 四条用户可见修复，已 `--assemble` 进 v0.1.5.md。
