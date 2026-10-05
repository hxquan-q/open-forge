---
id: TASK-0197
type: task
status: in_progress
priority: P1
owner: coordinator
requirement: REQ-0002
plan: PLAN-0015
source: user-request；RESEARCH-0021
related_requirement: [REQ-0002]
related_plan: [PLAN-0015]
related_tasks: [TASK-0195, TASK-0198]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0197-harness-absorption-batch
worktree: ../open-forge-wt/task-0197-harness-absorption-batch
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/coding-agent, packages/runtime-core, packages/agent, project/research/RESEARCH-0021-pi-deepseek-harness-absorption.md]
write_paths: [project/decisions/waivers/WAIVER-0004-harness-dev-candidate-validation.md, project/requirements/REQ-0002-runtime-performance.md, project/tasks, project/plans/PLAN-0015-harness-absorption.md, project/research/RESEARCH-0021-pi-deepseek-harness-absorption.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0181, TASK-0122, TASK-0123, TASK-0196, TASK-0039, TASK-0154, TASK-0159]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Harness 能力吸收批次隔离工作树

## 目标与范围

建立用户要求的独立工作树，依据 PLAN-0015 顺序实施三个推荐机制。此 Task 只拥有批次协调、记录和验证；代码分别归属于串行子 Task。本轮先 TASK-0195，后续合同满足 ready 再开工，不把探索项自动实施。

## 并发评估

条件支持独立树；execution: parallel 仅声明与其他任务隔离，实际单 Agent 串行。一个分支/工作树作为本批次检出，子 Task 不另建树；不派 Worker。与 TASK-0187 等共享索引和发布说明，集成时逐项合并，不能复制他人未提交内容。主树未干净时保留候选树，不合并或推送。

## Given / When / Then

- Given RESEARCH-0021 与既有产品合同；When 按小切片吸收机制；Then 每片有独立红绿证据、兼容路径和原子提交。
- Given main 的其他 Owner 在途修改；When 创建/验证/交付；Then 只基于已提交 HEAD，自己的研究/Task/Plan 管理文件显式移入检出，不夹带他人代码或状态。

## 必须保持

角色、tool call/result、错误、取消、usage/stop、持久化和权限合同；不触碰真实 Provider/用户实例/状态，不扩大依赖或权限，不降低门禁。

## 测试与验证

子 Task 定向测试与真实内部装配的常见流程；批次 test:impact、适用 test:changed、完整 bun run check。进展与失败归属持续回填；不运行 verify:ui 或真实模型。

## 验收分层与功能验收包

工程/自审待执行；集成 pending；人工验收待用户；仅根工作流的条件性 dev 集成授权，稳定发布未授权。用户流程、输入与预期由子 Task 定义。

## 交付记录

首次实施前已落盘；待记录 worktree 创建初始化、实际测试、commits、未执行与风险。三个阶段未全部验证前不宣称批次完成。

## 阶段证据（2026-10-03）

- TASK 编号与另一个批次分配竞争：只调整本批次记录，最终 TASK-0197/分支和工作树同名；未覆盖其他批次。通过仓库 CLI 建树并执行 frozen-lockfile 安装；因编号冲突校正，核对绝对路径位于 open-forge-wt 后重命名了自己唯一的新树与分支，随后复核合同。
- 工作树基于 48b8e487f，仅显式复制本批次 RESEARCH/PLAN/TASK；没有复制其他未提交记录或代码。已提交基线 Task 索引含 TASK-0186 行但缺正文，隔离树索引暂不列缺失条目；主树原记录不动，集成时保留其真实记录。
- TASK-0195：不安全的新前缀假设被现有摘要信任边界反证，blocked；不降级摘要防注入。
- TASK-0198：代码与定向测试已完成，最终门禁进行中；当前 test:impact 7+46+29+5 个测试文件、73+334+235+37=679 项通过。
- `run-vitest` 的初次平台测试收集缺少 fresh Worktree 的依赖 dist；按 `test:impact` 自动构建依赖后通过，不改 alias 或弱化测试。
- 首次完整 check：所有类型和 lint 通过；license header 守卫列出 8 个本次触及文件缺少声明，已补齐，待复跑。
- 还未实施慢消费者重同步，尚未集成、推送、发布或人工接受，批次不能标 done。

## 跨包验证未通过（2026-10-03）

最终生产代码已通过完整 bun run check（exit 0）；另补取消过程中取 steering 的断言红/绿，agent 定向 3 文件 49 项通过。影响面 679 项通过。

test:changed 的 agent、coding-agent、runtime-core、agent-team、runtime-tools、runtime-mcp、runtime-storage、runtime-node、runtime-telemetry、runtime-desktop 均通过；CLI 51 个文件中 5 failed / 45 passed / 1 skipped，测试 11 failed / 219 passed / 14 skipped。错误集中在隔离 CLI 子进程启动：20 秒等待首次 get_state/prompt、frames=0、进程仍 running，另有一例清理 hook 超时；失败位于工具执行之前。不能未经基线证明就归咎于新并发或称为既有失败。

缩小复现：在同一代码上执行 `bun ../../scripts/quality/run-vitest.mjs --run test/installed-artifact-runtime.test.ts --maxWorkers=1 -t 'preserves the exact im-claw'`，1 passed / 13 deselected；该例不调用工具。说明失败未稳定复现，负载/用例串扰是待验证假设，不是已证实根因。未延长超时、未跳过或删除既有断言、未新增 waiver。

原全量命令仍继续 Desktop 检查；最终结果另补。由于规定跨包验证未全绿，工程状态保持 verifying，不能集成/推送或宣称批次完成。

## 本轮停止点与复验入口

- Desktop 收集错误确认为隔离树 Electron 39.8.10 安装不完整（缺 path.txt/可执行文件），不是测试断言失败。默认 installer 返回 0 但未补齐。核对主树已安装 vendor runtime 的 package/dist version 均为 39.8.10 后，在本树 node_modules 内保留不完整 dist 备份、复制相同版本依赖并核对 electron.exe SHA256；不更改依赖版本、锁文件，不启动 Desktop。
- 修复依赖后的单文件复验：`bun ../../scripts/quality/run-vitest.mjs --run src/main/agent-runtime/runtime-host-contract.test.ts`，1 文件 4 项通过。不能据此声称 Desktop 全包通过。
- 旧 test:changed 批次已有 CLI 11 项失败，Desktop 又沿用初始化失败的模块图继续报错，并出现两个远端命令 fixture 超时；为避免重复消耗，按完整命令行唯一识别本任务 test:changed PID 14672 后停止其子树。只停止自己的测试进程，不触碰用户实例或其他 Agent；该次跨包验证仍记失败/未完成，而非通过。未清理未确认归属的临时文件。
- 生产改动与测试均保留在独立树，未提交、未合入 main、未推送；TASK-0198 保持 verifying，TASK-0197/PLAN-0015 仍 in_progress，不能算批次工程完成。
- 后续先在依赖完整且低竞争环境下复验 CLI 失败文件并定位启动前 frames=0 超时；再复验 Desktop 完整范围。不要通过延长超时、删除断言或跳过用例掩盖失败。待验证闭环后才提交并启动下一切片。
## 2026-10-03 提交与集成请求

用户要求「提交推送 dev，然后并入主树」，明确授权本批次候选的 origin/dev 推送与本地 main 集成，不包含 origin/main、force、发布或夹带其他任务。沿用 TASK-0197/0198，不扩展压缩/重同步范围。

提交前复核：主树已前进到 886173e67，origin/dev 已前进到 a156f19e7，独立树仍基于 48b8e487f 且保留本任务未提交实现。主树有其他 Owner 未提交记录；不 stash、不覆盖，不将它们纳入本次提交。先复验上一轮失败的 5 个 CLI 文件；未明确授权降低测试门禁，不把一般提交请求自动登记为测试豁免。通过后才准备可 fast-forward 的 dev 候选；若主树仍有冲突修改，保留候选并报告。

## 提交前复验结果（2026-10-03）

在依赖已补齐的同一工作树，串行复跑此前失败的五个 CLI 文件（installed-artifact-runtime、agent-runtime-command-admission-contract、agent-runtime-session-transition-contract、agent-runtime-selection、agent-runtime-terminal-contract）。命令使用仓库 Node runner 与 --maxWorkers=1，未改测试/超时：5 文件中 4 failed / 1 passed，39 项中 9 failed / 30 passed，耗时约 480 秒。主要仍是首次 get_state/prompt 的 20000ms 超时，frames=0、子进程 running；不得无证据认定为本次回归或既有失败。

因此本轮未执行 commit、push 或 merge。一般提交请求不自动等于测试 Policy 豁免；等待用户明确选择修复后再推进，或允许登记有时限的开发候选测试豁免。主树的其他未提交内容保持原样，不以 stash/覆盖解决；远端已前进，后续仍须审查并保持 fast-forward，不 force push。

## 明确授权的 dev 候选（2026-10-03）

用户在已知 CLI 重跑 9 failed / 30 passed 后答复 ok，同意登记 WAIVER-0004（到期 2026-10-10）。允许本次候选提交→fast-forward 推 origin/dev→尝试合入本地 main；不是稳定发布或工程完成。保持本任务 verifying/批次 in_progress，保留所有失败记录，静态 check 与定向合同仍须通过，不覆盖主树其他修改。

归属：有界工具调度与公开可选执行元数据为 Upstreamable；Project 研究/计划/豁免为 Open-Forge-only。本次不向 upstream 提交。

## 候选提交与远端整合

实现提交 e6e05f5a3 已生成。为保证 fast-forward 推送，先在干净的隔离树合入 origin/dev 固定提交 15fdc5c81b94c09647d7e22e78243d58f2d477ab；仅发布说明和 Task 索引存在添加型冲突，保留双方全部条目。原生并发实现无源码冲突。新增远端 TASK-0196 的共享台账/发布说明冲突关系，保持隔离与串行集成。接下来复验完整静态 check 与定向合同；尚未推送。

## 远端整合复验通过（2026-10-03）

在 origin/dev@15fdc5c81b94c09647d7e22e78243d58f2d477ab 的合并结果上，完整 `bun run check` exit 0；同一 10 个生产文件的 `test:impact` exit 0：Agent 75、Runtime Core 334、Runtime Node 235、Runtime Tools 37，共 681 项。只豁免已记录的跨包失败，未豁免这些检查。

merge commit 的暂存区来自干净工作树上的 Git 合并，两个文档冲突已逐段合并，新增改动对比 dev 仍只包含本 Task 的 27 个路径；使用 Git merge --continue 完成整合，不做部分合并提交或覆盖远端源码。

推送前远端推进到 280e98f76；与已验 dev 基线相比仅 TASK-0196 文档状态变化，无生产代码变化。先合入该状态更新，并按其 frontmatter 把焦点表同步为 verifying；不 force push，不重复声称运行了未执行的测试。生产代码继续对应已通过的完整 check 与 681 项影响面证据，文档单独复核。

## 实际交付与主树停止点（2026-10-03）

- 实现提交：e6e05f5a3；合并并验证远端候选：9aee0540f；同步远端纯文档收尾：a163b58b112a9af42d624c2f50597bbe3842bcfe。
- 已执行并成功：git push origin HEAD:dev，远端从 280e98f76 fast-forward 到 a163b58b1；随后 ls-remote 核实 refs/heads/dev 指向该 SHA。未推 origin/main、未 force、未发布。
- 本地 main 当时为 280e98f76，拓扑可 fast-forward；但主树有其他任务未提交内容。project/research/README.md 的本地修改同时含 RESEARCH-0021 与不属本任务的 RESEARCH-0022，合并目标会写该文件；另有多份未落库记录。未执行主树 merge、未 stash、未移动/删除/夹带这些内容，因此本地集成仍 pending。
- 独立工作树和 Task 分支保留。WAIVER-0004 仅允许开发候选测试例外（expires 2026-10-10），不是全量验收通过；TASK-0198 保持 verifying，摘要和重同步未实现。主树重叠修改由其 Owner 落库后再继续安全集成。

## CLI 启动失败复验（2026-10-04，主工作区低竞争环境，main 9e3cede94）

按停止点要求「先在依赖完整且低竞争环境下复验 CLI 失败文件并定位启动前 frames=0 超时」执行，未延长超时、未删除断言、未跳过用例：

- 此前失败的五文件逐个串行复跑（仓库 Node runner、`--maxWorkers=1`、原超时）：agent-runtime-terminal-contract 3/3（13.3s）、agent-runtime-selection 9/9（24.5s）、agent-runtime-session-transition-contract 4/4（22.2s）、agent-runtime-command-admission-contract 9/9（9.2s）、installed-artifact-runtime 14/14（83.6s）。合计 39/39 通过、约 153 秒——同一用例集在负载期（test:changed 批次）为 9 failed / 30 passed、约 480 秒（3.1× 放缓），现全部转绿且启动首帧正常。归因成立：负载诱发的启动延迟（frames=0、20s 首次 get_state/prompt 超时），非本次并发实现回归。
- 同一低竞争环境完整 cli-host 套件（51 文件）：4 failed / 46 passed / 1 skipped；244 项中 4 failed / 226 passed / 14 skipped，380.19s。剩余 4 例与启动超时无关：均为精确工具清单相等断言未随 TASK-0156 目标特性（bc85cfc7b，无条件贡献 get_goal/create_goal/update_goal）更新，属断言漂移而非行为错误；已对照上游同源码确认为既定行为，抽出 TASK-0203 单独修复（断言同步，零遮蔽）。
- WAIVER-0004 到期前状态：CLI 启动类失败已消除并完成归因；剩余 4 例断言漂移由 TASK-0203 处理；Desktop 完整范围复验待 TASK-0203 收口后执行。TASK-0198 保持 verifying，本批次不标 done。

## Desktop 完整范围复验（2026-10-04，主工作区低竞争环境，main 9e3cede94）

按停止点要求「再复验 Desktop 完整范围」执行，包内 `bun run test`（仓库 Node runner，未改超时/断言/用例）：923 文件中 919 passed / 4 skipped；4921 项中 4906 passed / 15 skipped；848.85s、exit 0。此前隔离树的 Desktop 收集错误确认为 Electron 依赖不完整（非断言失败），主工作区依赖完整后全量通过。停止点两项复验（CLI 失败文件 + Desktop 完整范围）至此全部完成；TASK-0203 的断言同步与完整 cli-host 复验见其记录。WAIVER-0004 的候选保留责任：TASK-0198 保持 verifying 至人工验收，本批次不标 done。

## WAIVER-0004 解除与批次剩余项（2026-10-05）

- WAIVER-0004 按其「到期处理」条款转 `resolved`（未到 2026-10-10 即闭环）：CLI 启动类失败已归因负载（五文件低竞争复跑 39/39 转绿，对照负载期 3.1× 放缓），Desktop 完整范围 923 文件 / 4906 项通过，剩余 4 例断言漂移由 TASK-0203 修复（done）。
- 批次仍不能标 done，剩余两个先决项：
  - 阶段 2（TASK-0195 缓存友好摘要）：`blocked`——前缀假设与既有防注入摘要边界冲突，待重新设计或用户决策。
  - 阶段 4（慢消费者重同步）：未开工，且 PLAN-0015 要求「先证明正常入口的压力与保真基线」，该基线尚未建立；子 Task 亦未落盘。
- TASK-0198 保持 `verifying` 至人工验收；本批次未集成、未推送、未发布。
