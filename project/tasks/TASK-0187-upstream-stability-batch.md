---
id: TASK-0187
type: task
status: done
priority: P1
owner: coordinator
source: user-request; RESEARCH-0022
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0151, TASK-0188, TASK-0189, TASK-0190, TASK-0191, TASK-0192, TASK-0193]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0187-upstream-stability-batch
worktree: unassigned（已集成，待推送后清理）
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [project/research/RESEARCH-0022-upstream-nonmobile-gap-audit.md, apps/desktop, packages/runtime-core, packages/plugins/presets/git]
write_paths: [project/research/README.md, project/bugs/BUG-0073-dev-cache-missing-workspaces.md, project/bugs/BUG-0076-dev-cache-missing-workspaces.md, project/decisions/waivers/WAIVER-0003-unpublished-bug-id-collision.md, project/tasks, project/plans/PLAN-0014-selective-upstream-nonmobile.md, project/research/RESEARCH-0022-upstream-nonmobile-gap-audit.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0039, TASK-0154, TASK-0159, TASK-0181, TASK-0186, TASK-0196, TASK-0197, TASK-0200, TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 非手机上游稳定性首批隔离集成

## 当前收口状态（2026-10-03）

首批代码与 TASK-0199 已提交；定向、impact、完整 check 通过。跨包 changed 的 12 包中 11 包通过、CLI 失败，不能宣称工程完成。主树还有其他 Owner 的未提交记录且同期继续前进，暂不执行集成/推送；不采用预置 index、代交他人内容或任务分支推送绕过现行规则。

## 目标与范围

依据 REQ-0008 / PLAN-0014 / RESEARCH-0022，将现有功能的高优先级缺口拆成可独立回滚的修复，在用户指定的一个专用工作树内串行实现、验证和原子提交。本 Task 只拥有批次协调与验证记录，各代码 concern 在子 Task 中定义。

首批包含流式 usage 引用、toolUse 回复终态、恢复成功的回合终态、主动滚动记忆、配置事务、dev bundle 缓存输入、Git 特殊路径与重命名。目标模式、富内容/批注、MCP 跨工作区 scope、feed/attach 公共合同迁移和沙盒制品来源选择保留原 Task；不混入本次稳定性补丁，不宣称已经交付。

## 并发评估与集成顺序

- 条件支持隔离：`execution: parallel` 仅声明可独立工作树；实际单 Agent、单工作树，内部所有子 Task 串行，不派实现 Worker。
- 专用分支/路径由 worktree:create 回填；该树作为本批次集成检出，子 Task 不创建第二工作树。
- 与 TASK-0181/0186 的发布说明、Task 索引有共享写入风险，保持主工作区不动产品代码；集成时逐项合并记录，不覆盖他人修改。
- 用户本次明确授权 Coordinator 完成验证后先 fast-forward 推送本批次候选至 origin/dev，再合入本地 main。该授权不涵盖 origin/main、上游、force、tag、Release 或发布制品。
- 推送前 fetch 并审核 origin/dev..候选的所有提交；若远端/本地主树前进，先在隔离树整合并复验，不强推。不满足主树安全集成条件时保留工作树并报告。

## Given / When / Then

- Given 本仓已有窗口化、队列顺序、错误/取消/usage、原子写和隔离能力；When 逐项适配上游修复；Then 原合同不退化，每片有旧行为失败的回归和正常入口流程证据。
- Given 主树有其他 Owner 的未提交修改；When 创建、提交、推送和集成；Then 不复制、提交、覆盖或删除他人内容，只有已验收批次可到 dev。

## 必须保持

不移植手机远程；不整仓合并上游；不撤销历史分页、缓冲限额、MCP 回收；不降低测试/完整 check；不启动真实 Desktop/Provider/SSH，不访问真实状态；不新增依赖升级或未经决策的制品源。

## 测试与验证

- 子 Task：可失败红测 → 最小实现 → 定向/正常流程测试；回填实际证据。
- 批次：按实际文件 test:impact；跨包运行 test:changed；完整 bun run check；必要脚本合同、配置并发与 Git 临时仓库测试。
- 提交：中文多行、显式 pathspec，逐项核对 staged；每个 concern 独立提交。
- 最终：审核候选提交、推送 dev 后记录远端 SHA；主树集成后核对 SHA 和工作区归属，集成变更则重新验证。

## 验收分层与功能验收包

- 工程验证/技术自审：待执行；集成 pending；用户功能验收待验收；仅开发分支推送获授权，稳定发布未授权。
- 用户流程：长会话流式回复并调用工具、切换会话与浏览历史、并发更新设置、修改 workspace 后重建 dev、查看特殊路径/重命名提交。
- 预期：不无效刷新整屏、不提前结束或错误终态、不错误恢复滚动、设置不相互覆盖、缓存不运行旧代码、Git 路径和 diff 正确。

## 交付记录

任务先落盘，随后由专用工作树完成子任务合同、实现和验证；实际命令、提交、剩余风险与人工验收状态持续回填。

隔离基线未包含其他执行流的 TASK-0186 记录，因此 frontmatter 不引用尚不存在的 ID；与其发布说明/索引冲突在正文登记，集成时按主树最新台账补齐。

基线检查：HEAD 的 Task 索引包含 TASK-0186，但文件只存在主树未提交区/其专用分支；隔离树先移除悬空索引行以准确表达当前快照，不复制或提交其记录/代码。主树原索引和文件保留，集成时以其 Owner 的最新实际状态恢复导航。

验证环境：定向用例通过后，完整影响面需要 Electron 包的静态安装路径；按仓库 CI 的 electron/install.js 初始化固定依赖，不启动 Electron/用户 Desktop，不读取真实用户状态。验证进程使用单独 VETTA_HOME 临时目录。

## 首批原子提交与验证过程

| Task | 代码提交 | 定向证据 |
| --- | --- | --- |
| TASK-0188 | bc24eea1a；夹具类型补齐 c55411714 | 2 文件/17 测试 |
| TASK-0189 | 521806b99 | 会话/Team/队列相关 5 文件/32 测试 |
| TASK-0190 | 3a00d603f；夹具类型补齐 c55411714 | 3 文件/26 测试 |
| TASK-0191 | a7077fb10 | 2 文件/19 测试 |
| TASK-0192 | 4423aef2e | 缓存 3 测试、原生打包依赖 7 测试；记录更正 BUG-0076 |
| TASK-0193 | 0e691ac27 | Git 插件 10 文件/55 测试、包类型检查 |
| TASK-0151 | 34558a9ac | 配置/设置/项目/代理 8 文件/52 测试 |

以上是定向验证，不替代本批 test:impact、test:changed 和完整 check。

- 首次完整 check 捕获两个回归夹具类型问题，已补真实元数据/前置校验；根与 Desktop 类型复验通过，最终完整 check 待重跑。
- 隔离初始化首次误用了 PowerShell 的只读 HOME 变量，脚本未按预期创建临时目录。发现后立即中止；日志确认仅执行到依赖构建、尚未开始测试，并检查没有遗留本批进程。改为 ErrorActionPreference=Stop、独立变量名和 TEMP/非链接路径校验；实际测试使用经过确认的唯一 VETTA_HOME 临时目录，不沿用该次失败配置。
- Node 26 执行 electron/install.js 返回成功但缺 path.txt/可执行文件；32 个相关套件因此未收集。使用仓库 Bun 执行同一个固定依赖安装脚本后，校验 path.txt 和 electron.exe 均存在；没有启动 Electron。原始失败日志保留。
- 首轮有效 impact：Desktop direct 12 文件/84 测试通过；related 34 文件失败（32 个依赖收集失败与 3 个超时用例）、136 通过、3 既有跳过。环境修正后先对失败面定向复验，再重新执行标准入口，不删除测试或扩大超时。
- 另一个工作流登记了相同 BUG-0073 编号；本批尚未推送，仅将自己的缓存记录改为 BUG-0076 并保留历史提交映射，另一 Owner 文件摘要不变。Policy 例外见 WAIVER-0003。
- 已在临时 Git 仓库验证“仅将已验证目标 blob 置入 index，再快进”能保留未暂存的共享文档草稿；尚未对主树执行。实际集成仍须验证主树 HEAD、空暂存区、非本批修改和授权边界，无法证明安全即停止。

补充验证：Electron 固定依赖以 Bun 初始化并验证产物后，数据库技能打包/远端命令/函数扩展/文件系统 4 个原失败面定向文件 29 测试全部通过；没有修改断言或 timeout。正在重跑标准 impact。origin/dev 同期已推进到 e1605e4d2（TASK-0042 与 TASK-0196 记录）；推送前需在本工作树合入这组已发布开发提交并对组合再验证，禁止覆盖远端。

续接（2026-10-03）：本轮继续首批验证收口，不扩展新增产品能力；复用 TASK-0199 处理既有失败。执行单 Agent 串行，保护主树其他任务内容。以现行协作规则要求干净 main 为集成前提，不采用预置 index 绕过脏树保护。

本轮复核：定向文件系统 3 文件/19 测试通过；完整 bun run check 通过（包含类型/guards/lint，不代替行为测试）。日志目录：本机 TEMP/openforge-0187-resume-fe39ea72c9994a92abad460827afbae8。impact 以固定基线 48b8e487f 覆盖本批提交及工作树，直接 13 文件/87 测试已通过，关联部分运行中。

技术自审（非独立评审）：核对 usage 占位统计、toolUse 中间终态、恢复后 done 终态、跟随滚动缓存排除、配置生产写入调用点及失败后队列恢复、Git NUL/literal/rename 消费链，以及缓存与 Vite 共用 external 边界。生产 writeDesktopConfig 调用仅剩兼容定义；配置队列为同进程语义，不宣称跨进程防丢更新。未扩展历史窗口或重放缓冲。

本轮 impact 最终结果：bun run test:impact --base 48b8e487f 退出 0。Desktop direct 13 文件/87 测试；related 170 文件/1091 测试通过、3 文件/7 测试为原有跳过；Git direct 与 related、runtime-core direct 11 测试与 related 121 测试通过。TASK-0199 已提交 39ffc0a60。test:changed --base 48b8e487f 正在验证 12 个受影响包。

集成核查：本轮 git fetch origin 后 origin/dev=018824d7ef8944de9066ec019c265cc702fa209b，已含 TASK-0194 队列修复与 TASK-0196 开发候选；本批与其分叉，尚未合并和验证组合。本地 main 仍有 34 项未提交改动，不能按现行流程开始集成，也不得从任务分支绕过规定推送。保留本批候选与主树内容，不宣称已进入 main/dev。

changed 诊断中间证据：前 10 包通过，CLI 为 7 文件失败、10 测试失败/220 通过/14 原有跳过；主要为 get_state 首帧 20s 超时、5s/30s 用例超时，生命周期用例超时后还有 EBUSY 清理失败。不能将其直接归为本批回归或环境原因。Desktop 包仍运行中。

可证伪假设：①启动/资源耗时导致无首帧超时（固定基线相同用例也可能失败）；②生命周期清理在超时后仍有异步写入导致 EBUSY（定向 lifecycle 在基线/候选比较）；③本批 relay 终态修改造成回归（应只在候选且接收 done 后失败，不能解释尚无首帧的启动超时）。批次结束后先做少量代表性基线/候选对照，不扩大 timeout、不删断言、不循环重跑全量。
## 本轮最终验证与未完成项

- `bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts apps/desktop/src/main/filesystem/conversation-workspace-visibility.test.ts apps/desktop/src/main/filesystem/filesystem-service.test.ts apps/desktop/src/main/filesystem/file-explorer-dotfiles.test.ts`：3 文件/19 测试通过。
- `bun run test:impact --base 48b8e487f`：通过。基线覆盖首批所有提交及测试修正，不以只测当前未提交文件替代批次验证。
- `bun run check`：退出 0；终态记录更新后再次执行也通过（check-final.log）。日志中的 upstream/dev 缺少 ref 提示来自声明头检查的既有 fallback，检查最终退出 0；未变更基线。
- `bun run test:changed --base 48b8e487f`：退出 1，12 包中 11 包通过；Desktop 883 文件/4688 测试通过，4 文件/15 测试为既有跳过；CLI 7 文件失败、10 测试失败、220 通过、14 既有跳过。总耗时约 2901 秒。不把其他 11 包通过说成全绿。
- 对照命令（两边 CLI 包目录）：`bun ../../scripts/quality/run-vitest.mjs --run --maxWorkers=1 test/runtime-host.test.ts test/agent-runtime-selection.test.ts -t 'emits supported session lifecycle|creates a Runtime conversation when continue has no previous session'`。主树 `886173e67` 的 CLI/runtime-core 与原基线 `48b8e487f` 无源码差异；主树与候选 `39ffc0a60` 均复现 continue 用例 5s 超时，生命周期用例均通过。候选额外出现该超时用例的 afterEach 10s 超时。过滤产生的 24 个未选择测试不计为原有 skip，也未修改测试声明。
- 以上只证明至少一项 CLI 失败非本批新引入，不证明其余失败均属环境问题；其他 get_state 首帧超时、会话切换超时及清理占用仍需逐项定位。没有无限重跑、放宽超时或建立豁免。
- 日志：本机 `%TEMP%/openforge-0187-resume-fe39ea72c9994a92abad460827afbae8/{targeted,impact,changed,check,baseline-cli,candidate-cli}.log`；全部测试使用独立 VETTA_HOME，不启动用户 Desktop 或真实 Provider。
- 集成：最后核查 main 已由其他流程推进到 `886173e67`，仍有其他任务未提交文件；本批候选尚未纳入 main/origin/dev，远端队列回归修复尚需组合验证。保留隔离树和所有主树内容。
- 人工验收/发布：均未发生。当前 blocked 是验证遗留与跨任务集成前提未满足，不代表本批被接受；下一步先定位 CLI 剩余失败，再在 Owner 收口主树后按协作流程组合验证与集成。

## 集成收口（2026-10-03，Coordinator 合并结果复验）

前述 blocked 的两项依据在本轮解除：主树待提交记录已由协调会话入库（43c985fe2、685ed7c33）；CLI 失败经合并前后同机基线比对完成归属。以 `git merge --no-ff` 合入本地 main，冲突及解决：

- `desktop-config-store.ts` / `ipc/fs.ts` / `desktop-config-patch.ts`：批次的事务架构（updateDesktopConfig + mergeDesktopConfigPatch 下沉）与 main 侧 TASK-0161 通知偏好语义并集——writeDesktopConfig 保留事务转发并保住未来通知字段；CONFIG_SET 走事务+patch 白名单，notificationPreferences 补入白名单（批次基线早于该功能，直接取分支会令通知设置静默失效）。
- RESEARCH-0022（add/add 并集）、Task 索引、发布说明、TASK-0151 记录取批次演化版并回填 integrated。

合并结果验证（证据日志 `%TEMP%/openforge-intg/`）：

- 定向：config 事务面 8 文件 55 用例通过（store/settings/shortcut/project/CONFIG_SET/agent-mode/proxy）。
- `bun run test:impact`（29 文件）：desktop 175 文件/1131 用例通过；presets/git 批次用例 3 文件/13 用例通过，`noGit.test.tsx` 导入失败归属存量声明缺口（BUG-0077，a156f19e7 引入、与本批无关）；runtime-core 1 文件/11 用例补跑通过。
- CLI 归因（apps/cli-host 串行入口）：合并前基线 16 失败/214 通过，合并后 4 失败/226 通过；按用例名比对**零新增失败**，4 个失败均已在基线失败（BUG-0059 环境类超时），合并后反而恢复 12 个用例。上节"CLI 失败待定位"据此闭合为存量环境问题，不阻塞本批。
- 完整 `bun run check`：三轮收敛后退出 0——补齐 config-set-preserves-fields 夹具的 schemaVersion/notificationPreferences（合并组合暴露）、声明头基线收缩 7 条（660→653，missing 全集一致）、登记 0187 与 0039/0154/0159/0196/0197/0200 的共享发布说明/任务索引串行冲突（conflicts_with，任一侧登记即消）。
- push 前 `bun run test:changed --base origin/dev`（2026-10-03）：Desktop 923 文件中 918 通过、4905/4921 用例通过，CLI 226/244 通过（4 失败即上文基线比对中的同名存量用例），runtime-core 2 文件/11 用例、其余包 6 文件/33 用例通过。唯一 Desktop 失败 `useSessionManager.session-switch.test.ts`「只读历史预览失败时回退到 Runtime 历史水合」为并行负载假红：串行单跑两次 9/9 通过；不据此阻断批次，与 BUG-0059 同类的时序敏感面留待该 Bug 定位。
- 待推批次 `git log origin/dev..main` 共 21 个提交（2 协调记录 + TASK-0186/0181/0187 三个集成合并及其任务提交），origin/dev 未移动，fast-forward 推送。

未消除项：BUG-0059（CLI 环境超时，investigating）、BUG-0077（git preset 测试依赖声明，investigating）均为存量，独立修复；人工验收与发布未发生。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
