---
id: TASK-0412
type: task
status: verifying
priority: P0
owner: desktop/testing
requirement: REQ-0002
source: user-request; ISSUE-0035
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410, TASK-0411, TASK-0413, TASK-0405, TASK-0414, TASK-0415, TASK-0416, TASK-0417]
related_issues: [ISSUE-0035]
related_bugs: []
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出串行验证）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [apps/desktop/, packages/ssh-transport/, scripts/agents/, scripts/quality/, project/]
write_paths: [project/tasks/TASK-0412-desktop-delivery-baseline.md, project/tasks/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-29
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 交付失败基线复核与组合门禁

## 目标与范围

复用 ISSUE-0035，复核七文件十四项历史失败，查明当前宿主是否仍可复现，最终以整个待推批次的真实结果判断推送条件，不把历史失败直接当产品 Bug。当前重跑七文件均通过，因此先验证而非修改实现。若复现可靠行为错误，先补 Bug 与最小修复 Task，再修改对应实现及测试。

## 并发评估

串行执行所有重量级测试；只读 Linux 调查与本任务无写域重叠。当前主检出使用任务分支，未启动实现 Worker，无需新 Worktree。与 CI 修复 TASK-0413、发布 TASK-0405 按序组合后交由 Coordinator 集成 main。

## Given / When / Then

- Given：Windows、Node runner、真实 Git Bash 与隔离临时回环目录，无用户状态和真实 SSH。
- When：从包内入口和历史 test:impact 入口运行原七文件，再运行 origin/dev 到候选完整 test:changed。
- Then：保留全部原断言、跳过及超时设置，所有必需用例通过；失败时保留精确日志，区分环境、时序和产品责任，不用删除断言换绿灯。

## 必须保持

远端参数按字面量传递；stderr/退出码、取消和文件字节语义不变；WeKnora 多路后台终态合并刷新，不弹出提示。未授权真实 Desktop、Provider、SSH 和用户目录验证。全量门禁红时不推送。

## 测试与验证

- 已执行：包内 remote-command-runner 单文件 5 例通过；七文件 31 通过、3 既有跳过，约 42 秒。
- 已执行：原七文件 test:impact 入口完成 workspace build 后同样 31 通过、3 既有跳过；未改代码、未新增 skip。
- 首次组合批次 br26koqiu：test:changed=1、check=1，行为测试总耗时 2641.5 秒。coding-agent 1 项及 runtime-node 7 项因原生 Node 找不到 rg 而失败；Desktop 原十四项未复现，另有 RuntimeHost 历史/分叉/恢复合同 1 项超时 60000ms；check 被新增 workflow 测试格式拦住。
- 已验证宿主 shell 的 rg 是函数，原生 Node 不能执行；命令级 PATH 指向本机现有 rg.exe 后，原三个失败文件通过（coding-agent 15 项、runtime-node 15 项）。Desktop 超时文件独立包内重跑 4/4 通过，14.84 秒；未修改断言或超时。定向通过不能替代完整复验。
- 第二次完整批次 bm0xe3uw6：test:changed=1、check=0，完整 check 已通过。quality 63 文件中 62 通过，700 项中 699 通过；runner.test.mjs 的空验证报告用例超时 5000ms，随后临时目录清理 EPERM，test:changed 因此未进入包测试，不构成 Desktop 广域复验。相同 runner 文件独立重跑 9/9 通过（33.13 秒），未修改该文件或超时；当前尚不能确认生命周期根因。
- 后续采用命令级 VITEST_MAX_WORKERS=1 和现成原生 rg.exe PATH 串行复验，保留全部测试、原断言和超时；Vitest 4.1.11 原生支持该 worker 参数，仓库默认 Windows 上限为 2，不修改全局配置、runner 或被测实现。先验证完整 quality，再执行整个待推批次；结果未回收前不宣称最终通过。
- 第三次完整批次 b081j0xol 已结束：test:changed=1、check=0。quality 63 文件、700 项通过，全部包测试执行完毕；coding-agent 264 文件、1676 项通过、3 既有跳过，CLI 52 文件通过、1 既有跳过，239 项通过、14 既有跳过。Desktop 1107 文件通过、2 失败、4 既有跳过，6245 项通过、2 失败、18 既有跳过；失败为兼容插件安装 5000ms 超时和 bundle 连续升级/恢复 10000ms 超时，均为原上限。包级总耗时 3844.9 秒，完整 check 的 lint/types/guards 均退出 0。
- 两个市场完整文件原设置独立重跑 36/36 通过（20.17 秒）。续接 TASK-0414，以本地默认 fetch 拒绝/调用守卫取得 5 失败、31 通过的确定性 red：五个 fixture 共尝试 9 次未注入的 manifest 请求，均被本地拦截。BUG-0159 确认的是测试网络隔离缺陷，不将它等同于两个广域超时的唯一因果。
- TASK-0414 补 manifest 替身，生产实现、原断言和超时不变；两文件修后 36/36 通过（7.45 秒），市场目录 152 项通过、2 既有跳过（15.26 秒），默认 fetch 零调用。独立评审指出两个 list 测试仅等请求开始便清理的可构造竞态，已用 deferred 响应和公开 install 流程在 finally 中收束；修后两文件 36/36（10.16 秒），目录 152 项通过、2 既有跳过（24.14 秒），quick、diff 与定向 worktree 合同通过。原评审者 ae64d6a217f85b1bc 复核确认 P2 已处置、未发现新实质问题；未声称运行复现该竞态。新候选仍需完整门禁，第三次广域红没有被定向绿覆盖。
- 第四次完整候选验证 batk29tuf 已结束：冻结工作区并 fetch，确认 origin/dev 为 bf15534dd931998b510ada94d787df8e834d072d 且为 HEAD f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0 的祖先；使用命令级原生 rg PATH、VITEST_MAX_WORKERS=1，运行期间未修改候选。test:changed=1、check=0；quality 60 文件通过、3 失败，696 项通过、4 失败（共 700），173.81 秒。integrate.test.mjs 的 refuses a moving main branch and prepares a new candidate without losing the other change、applies only the reverified commit and records integration separately from publishing，release.test.mjs 的 reconciles a lost response before any retry and never treats local intent as published，以及 runner.test.mjs 的 does not mark an exit-zero but empty verification report as automatically repairable 均触及原 5000ms 上限；runner 同一用例另有清理 EPERM，不另计失败用例。quality 非零即返回，未执行任何包级测试，因此未验收市场修复后的广域结果。
- 2026-10-30 诊断续接：只读核查 worker 配置、真实 Git/进程耗时和超时后的收尾；必要时在独立临时目录放置只记录命令类别、时间和退出状态的诊断 preload/reporter，串行运行上述三个完整文件，保留原断言与超时。图谱提交 254796d870036f0d3e7c0bbb9a0a1a2cbd28448f 未收录 scripts/agents（该目录由后续提交新增），已比对目标增量并回读当前源码，不刷新图谱。确认具体缺陷前不修改脚本或测试；新实施范围另建立有效 Task/Bug 合同。
- 三文件定向计时已完成，非第五次完整门禁：2 文件失败、1 通过，6 项失败、16 通过，93.20 秒；现场 resolved 配置为 maxWorkers=1、pool=forks、testTimeout=5000。integrate 的 invalidates worker evidence、independently re-reviews，以及 runner 的 refuses same-family review、runs the actual candidate test 四项超时；integrate 后两项分别报 run has no verified evidence、run already has a live attempt，发生于共享连续 context 的前序超时后，尚不能认定两个独立缺陷。runner 同一超时用例另报清理 EPERM，不增加失败用例数。release 八项及 runner 空报告用例本次通过，不代表历史问题已修复。
- 独立 Temp 中的 preload/reporter 日志已读取：可观测同步 Git 共 584 次、72061ms，按 worker 为 release 144 次/18196ms、integrate 140 次/20643ms、runner 300 次/33222ms。隔离 adapter 不继承 preload，日志不覆盖全部后代进程；同步日志写入亦有扰动。Reporter 通知存在延迟，不能用主进程 start/end 时间把 Git 准确归属到单个用例；只保留 PID 级总计及调用序列证据。一个 esbuild spawn 缺 end 不能证明进程泄漏，不据此杀进程。
- Git --version 六次窄基准显示普通 launcher 约 63–72ms、mingw64/bin 多数约 50–53ms，只支持进程启动有固定成本；该次测量未修改 PATH、Git 配置或实现，不把 launcher 当唯一根因。随后已在独立临时仓库实测 readChanges：1/4/16 文件为 5/17/65 次 Git，367/1259/4484ms，正文与模式正确；据此建立 TASK-0415，只优化证据读取，不改必要检查或超时后生命周期。
- TASK-0415 已取得有效 red：四文件完整输出正确，但 17 次 Git 超过合同上限 4；随后实现 raw diff、批量对象元数据及有界正文读取。git/policy 两文件 27/27 通过（32.13 秒），保持路径、完整正文、模式、HEAD 绑定、16MiB 上限和 fail-closed。相同基准逻辑在新 Temp 仓库测得 1/4/16 文件均 3 次 Git、273/262/307ms，逐项核对完整输出；单次耗时不作为全部广域超时因果。
- 批量读取后的原 runner/integrate/release 三完整文件 bp3aumy59：22/22 通过（76.11 秒），命令级单 worker，保留原超时及断言。覆盖候选实现/评审/验证/重新集成验证与发布回执恢复；不是第五批完整门禁，不据此宣称 EPERM 或共同根因已解决。该阶段 TASK-0415 独立评审尚待回收；后续返修与复核见下条记录。新候选完整门禁及市场修复后 Desktop 广域仍待验收。
- TASK-0415 独立评审提出两项 P2，已在原 Task 返修：BUG-0160 高位对象头先取得两项有效 red，ascii 改为 latin1 后两项通过；新增真实分批预算与 framing 合同，在独立临时副本取消分批后准确失败，项目候选未变异。定向格式化后完整 git/policy 31/31 通过（46.63 秒），原 runner/integrate/release 三完整文件 22/22 通过（66.57 秒），保留原断言及超时。原评审者 a77a8d5b5df3b4648 只读复核关闭两项 P2，未发现返修新可确认问题；未独立运行测试或读取变异副本，不等于完整验收或集成批准。
- 评审返修前完整静态门禁 bw0q2l2id 已退出 0：git diff --check、lint、根/CLI/Desktop/docs/mobile 类型检查、guards 及 mobile lint 均通过；文档补齐候选 bdppbcr3d 的完整 check 也退出 0。两者不覆盖后续 latin1 与预算合同返修，check 不运行行为测试。返修后 buwu0sjd3 已完成 fetch、祖先关系检查、TASK-0415/0412 定向合同、git diff --check 和完整 check，均退出 0；HEAD 与 origin/dev 仍为下述引用。第五批 bhgpw7sg8 已失败：quality 61 文件通过、3 失败，716 项通过、4 失败（共 720），224.99 秒；runner 的 runs the actual candidate test after review and stores version-bound verification results、rejects a changed candidate instead of reusing its earlier review，integrate 的 applies only the reverified commit and records integration separately from publishing，以及 desktop-release-workflow 的 creates a candidate draft and resumes it after an upload failure 均触及原 5000ms；首个 runner 用例另有清理 EPERM，不另计失败用例。quality 非零立即返回，未进入包测试。保持原设置，继续受控测量 Git 启动成本及超时收尾，不盲目重跑。上述历史 fetch 后 HEAD/main 为 f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0，origin/dev 为 bf15534dd931998b510ada94d787df8e834d072d 且为 HEAD 祖先，未推送。
- 同安装 Git 入口受控对照：在新 Temp 仓库 open-forge-git-launcher-ab-tNllID 交替执行 12 轮真实 metadata/status 命令，每轮核对两入口输出完全相等。Node 默认 git 解析到 Scoop 的 bin/git.exe；同安装 2.54.0.windows.1 native 为 mingw64/bin/git.exe。launcher 的 metadata/status 中位数为 80/82ms，native 为 63/67ms，总计分别 997/979ms 与 755/836ms。此样本只支持固定启动成本差异，不证明完整流程或全部 Git/helper 语义等价；未修改项目、全局 PATH 或 Git 配置。临时 fixture 提交有 LF/CRLF 提示，命令成功；未改继承的全局 autocrlf。
- 只读调查 a2488a5477fb6fb21 已真实回包：executeAdapter 成功路径 implementer/reviewer 分别直接启动 6/5 次 Git；普通 verifyRun 为 4 + R + 2k 次（R 为当次 readChanges，k 为到达后验的检查数）。跨执行、逐项检查、证据导出与集成消费的重验不能删除。唯一窄候选是同次入口的 common-dir 与 snapshot metadata 联合查询，但非仓库 fallback、失败顺序及路径语义未证等价，暂不实施。调查仅静态阅读，未运行测试，不是集成批准，也未确认第五批 timeout/EPERM 的共同根因。
- 发布恢复计时使用 Temp/open-forge-release-timing-wYH4bY 的 preload，仅记录同步外部进程类别、耗时和状态，保留本地 gh 替身、真实 Git、原 workflow shell 与 5000ms。首次完整名称选择器未命中，33 项全未选中，无执行证据；经 runner list 核对后短前缀实际选中 1 项并通过，32 项未选中，总计 5.12 秒、测试 4.67 秒。PID 51492 的五次 fixture Git 合计约 547ms，两次 Bash 为 1837/2230ms（首次预期上传失败 status 123，重试成功）；内部八次 Git 约 1017ms、两次 gh 约 202ms，已包含在 Bash 内，不能重复相加。两个额外 Node PID 未精确归属，不计入用例。
- 同安装 native 的命令级 PATH 对照使用独立 Temp/open-forge-native-release-timing-DnQ3BN 日志，where.exe 确认 mingw64/bin/git.exe 优先。原用例 1 失败、32 未选中，测试 6.68 秒、总计 7.30 秒，仍触及原 5000ms；PID 36944 的五次 fixture Git 约 812ms，两次 Bash 为 2728/3023ms。此结果不支持 native 入口已解决超时，不修改项目 Git 选择或全局 PATH。无新增断言失败或发布行为，定向结果不覆盖第五批广域红。
- TASK-0405 已补发布夹具启动成本合同：独立 Temp 交替 8 轮核对 gh 两种入口的参数、输出及退出码，Bash/直接 Node 中位为 248/188ms；候选仅把 gh 替身包装改为 Node shebang。原四场景 4/4 通过（13.72 秒），随后完整身份/workflow 两文件仍为 68 通过、1 失败（27.49 秒），draft 创建及失败恢复原用例 6168ms 触及 5000ms。窄优化未解决完整超时，最新候选尚未重做静态或广域门禁；不提交、集成或推送。
- 最新 Node shim 单例计时仍为 1 失败、32 未选中，原用例 5129ms，测试 5.13 秒、总计 5.88 秒。Temp/open-forge-node-shim-timing-Aq19yh 目标 worker PID 50024 的五次建库 Git 659ms，两次真实 Bash 1859/2521ms，分别为预期上传失败 123 / 恢复成功 0。内部八次 Git 1238ms 与两次 gh 232ms 已包含于 Bash，不重复相加；preload 有测量扰动，不是完整门禁。PPID 关系已归属父 runner，额外 Node 启动不计入用例。
- TASK-0405 建库实验已执行：新 Temp 四轮交替，每批四仓库，完整计入模板创建；独立新建总计 7200ms / 80 次 Git，模板加独立复制 3338ms / 20 次 Git，SHA、完整文件、相对 remote、对象与 tag/draft/artifact 隔离均通过。随后已实施专用模板生命周期和每场景独立副本，新增隔离回归；未改实际 workflow shell、身份重验、连续恢复或原断言、timeout/retry/skip，不宣称其他超时或 EPERM 根因已确认。
- 模板候选复验：原四场景加隔离回归 5/5，29 项未选中，测试 13.76 秒、总计 14.10 秒；完整身份/workflow 两文件 70/70，测试 25.34 秒、总计 25.98 秒。均为命令级单 worker、仓库 Node runner，无计时 preload；单文件 Biome 已修正格式。新上下文只读评审 ac89929db63624574 已回包，限定范围内无可确认发现；未运行测试、计时或异常清理注入，不替代完整门禁或构成集成/发布批准。定向绿不覆盖广域红。
- 最新完整静态 bynqso0u8 已通过：diff 空白检查、TASK-0412 / TASK-0405 合同及完整 check 退出 0；lint 5183 文件无修复，全部类型、架构守卫、Task 与索引一致。fetch 后 origin/dev 仍为 bf15534dd931998b510ada94d787df8e834d072d，且是 HEAD 祖先。随后冻结候选，以现有原生 rg 命令级 PATH 和 VITEST_MAX_WORKERS=1 串行运行第六批完整 test:changed，原 timeout/retry/skip 保持。bihx1rzms 已退出 1：quality 61 文件通过、3 失败，713 项通过、3 失败、5 项因初始化失败未执行（共 721），220.71 秒。runner 的 runs the actual candidate test after review and stores version-bound verification results（7517ms）、rejects a changed candidate instead of reusing its earlier review（5184ms），git 的 retains NUL-delimited paths, byte-delimited bodies, absent sides and non-blob modes（5050ms）触及原 5000ms。integrate 的 beforeAll 触及原 10000ms，afterAll 另报 EPERM；其五项未执行，不计为五个行为失败。quality 非零即返回，未进入任何包测试；本批发布 workflow 不在失败文件中，仍不提交、集成或推送。
- 第六批后诊断：在独立 Temp/open-forge-agent-phase-timing-2qn813 中放置临时 preload、setup 与继承根配置的诊断配置，经仓库 Node runner 串行执行 runner/integrate/git 三个完整文件。只记录用例阶段、目标源码行、命令类别、耗时及退出状态，不记完整参数/正文/环境；不向隔离 adapter 注入 preload，不修改项目测试、原 timeout/retry/skip 或安全重验。同步日志存在测量扰动，异步子进程只观测生命周期，不代表其内部完整进程树；先区分夹具搭建、实际流程与清理，再决定是否需要新的实施合同。
- 诊断顺序：先查 Bash/进程参数环境差异，再查后台刷新异步边界，最后查与负载相关的测试时序；当前两种入口均未重现历史十四项失败，不强行归因。

## 2026-10-30 测试夹具修复续接

TASK-0416 已把真实异步流程绑定到每测试 owner，取消后等待流程收束再清理；runner 基线为完整独立 Git 副本，初始化进入每测试 hook，原实现→评审→验证→证据导出和安全重验全部保留。新增 process 合同取得有效 red/green。首次三个完整文件 20/21，runner 一项 5276ms 触及原 5000ms；局部夹具调整后三个完整文件 21/21 通过（59.71 秒），integrate 五项实际执行，无本次清理错误，不据此关闭所有历史问题。

TASK-0415 仅调整测试造对象：同样的 fixture 配置一次本地写入，用 fast-import 按字节边界导入真实 blob，再以真实 marks/update-index 构造提交。新增合同比较 hash-object OID 与 cat-file 完整 Buffer；原特殊路径、模式、二进制、大对象及损坏协议断言不变。完整 git/policy 32/32 通过（34.64 秒）。新上下文只读审查 a890db6753dc3bec5 已派发，待回包；不是第七批完整门禁。当前五文件 quick、全部 guards、diff 及三个 Task 定向 worktree 合同均通过；完整 bun run check 退出 0，lint 5184 文件无修复、类型和 guards 通过。重新 fetch 后 HEAD/main 仍为 f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0，origin/dev 仍为 bf15534dd931998b510ada94d787df8e834d072d 且是 HEAD 祖先，已审核待推历史。最终冻结候选的完整 test:changed 待完成，未提交、集成、推送或发布。

## 2026-10-30 第七批完整候选结果

冻结候选后的 bnw86pnmm 使用命令级原生 rg PATH 与 VITEST_MAX_WORKERS=1，test:changed 退出 1：quality 62 文件通过、2 失败，718 项通过、1 项失败、5 项因初始化失败未执行（共 724），225.09 秒。runner 的 runs the actual candidate test after review and stores version-bound verification results 在 6144ms 触及原 5000ms；integrate beforeAll 触及原 10000ms，五项未执行不是五个行为缺陷。quality 非零立即返回，未进入任何包测试；Git 复合合同不在本轮失败集合中，没有 EPERM/ENOTEMPTY 输出，均不能外推为永久稳定或全部历史问题已关闭。

运行中采集的候选快照覆盖 79 个路径，终态核对 HEAD、大小和 SHA-256 均未变化；它不是运行前原子快照或执行证明。新夹具独立只读评审仍待回包。继续区分 runner 真实流程与 integrate 初始化阶段，不通过提高原超时、删除断言或缓存安全证据换绿。市场修复后 Desktop 广域仍待验收，未提交、集成、推送或发布。

## 2026-10-30 第七批后评审与运行时返修

quality 诊断 boju20nzm 为 723 通过、1 项 release 原超时及同例清理 EPERM，201.18 秒，不是第八批 test:changed；目标计时日志未可靠留存，不据此作根因结论。随后两文件诊断与独立探针定位 Node 控制器切换 Bun 的准备成本，由 TASK-0417 将真实 Worktree CLI 改为沿用 process.execPath。新增真实 spawn 转发合同在旧实现准确 red，修改后 green；无版本、权限、租约或安全重验变更。

只读评审 a890db6753dc3bec5 对 TASK-0417 和限定 Git 造对象夹具没有可确认问题；对 TASK-0416 新 process 回归提出 teardown 所有权及等待断言两项 P2。已返修，空 active 等待变异准确 red，原评审复核关闭两项。最新 bcef7fb0r 串行六个完整控制器文件 63/63 通过（95.30 秒），quick、guards、diff 与四个 Task 定向合同通过；这些结果不覆盖第七批完整 red，也不关闭全部历史超时/清理问题。

修复后完整 bun run check（bk47qkrk6）退出 0：lint 5184 文件无修复，根/CLI/Desktop/docs/mobile 类型检查、guards 和 mobile lint 全通过；git diff --check 通过。fetch origin 后 origin/dev 仍为 bf15534dd931998b510ada94d787df8e834d072d，且是候选 HEAD 的祖先。

最终验证合同：在运行前保存候选 HEAD、origin/dev、路径及字节 SHA-256 快照，按命令级原生 rg PATH、VITEST_MAX_WORKERS=1 和全部原 timeout/retry/skip 运行 test:changed --base origin/dev。执行期间不编辑候选，结束后核对快照；任何必需门禁失败都不提交、集成、推送或发布。记录归入 Temp/open-forge-delivery-gate-YXCXky；该快照不是 OS 执行证明。图谱 .ua/meta.json 停在 2026-10-12，缺少 scripts/agents 节点，本切片依据当前源码，不刷新图谱。

## 2026-10-30 第十批完整候选结果

b6c7y60gc 使用同一命令级原生 rg PATH 与 VITEST_MAX_WORKERS=1，运行前冻结 90 路径，结束后大小与 SHA-256 未变，test:changed 退出 0，约 72.8 分钟。quality 726 项通过；ssh-transport 236 通过、25 既有跳过；CLI 239 通过、14 既有跳过；Desktop 6247 通过、18 既有跳过。第九批的 239999 与 AC-20 基线加 2 均未再现。该结果不关闭历史超时根因，不替代真实 Linux 安装、新 SHA 远端 CI 或发布授权。

## 验收分层与验收包

工程：历史失败定向未复现；前七批完整候选未全绿，第八批被系统中止，第九批 ssh-transport 与 AC-20 失败。第十批 b6c7y60gc 的 test:changed 退出 0，90 路径字节快照未变，不关闭历史超时根因。技术评审：独立只读评审 a10a0fe3885162483 未发现当时证据的实质性过度归因、状态误报或门禁跳过；仅为中间证据评审，不自动覆盖后续候选。集成：pending。人工功能验收：本任务仅复核自动化交付门禁，不宣称真实产品功能已被接受。发布：0.1.3 标签已存在且不等于本候选，本任务未发布。

复算入口为 ISSUE-0035 中原七文件命令及上述组合门禁；预期无新失败，发现不一致则回链本任务保留环境及日志。

## 交付记录

起点 main@f33ff37cc 干净，当前任务分支承载交付候选。第十批 b6c7y60gc 的 test:changed 退出 0，90 路径字节快照未变；历史故障未在本批复现不等于永久消失。TASK-0418、TASK-0419 已分别修复第九批的握手预算和列表双刷新。提交、集成本地 main 与推送 origin/dev 尚未执行；远端矩阵、真实 Linux 安装和发布未执行。
