---
id: TASK-0415
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0002
source: user-request; ISSUE-0035; TASK-0412 isolated Git measurement
related_requirement: [REQ-0002]
related_plan: [PLAN-0019]
related_tasks: [TASK-0412]
related_issues: [ISSUE-0035]
related_bugs: [BUG-0160]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出任务分支串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [scripts/agents/, docs/adr/0146-repository-autonomy-controller.md, project/, scripts/quality/]
write_paths: [scripts/agents/git.mjs, scripts/agents/git.test.mjs, project/tasks/TASK-0415-agent-git-change-batching.md, project/tasks/TASK-0412-desktop-delivery-baseline.md, project/tasks/README.md, project/bugs/BUG-0160-git-object-header-lossy-decoding.md, project/bugs/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, .github/release-notes/fragments/v0.1.4/task-0415-agent-git-change-batching.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 候选差异批量读取与安全分类语义保持

## 目标与范围

续接 TASK-0412 的实测瓶颈，只重构开发控制器 readChanges 的同步 Git 读取，不声称已确认全部超时或清理 EPERM 的共同根因。独立临时仓库基线：1/4/16 个修改文件分别 5/17/65 次 Git，约 367/1259/4484ms，正文和模式均正确。旧实现每文件分别读取两侧 ls-tree/show，固定进程启动成本线性放大。

输入为已解析 base/head（或 HEAD），输出仍为有序 path/before/after/oldMode/newMode。直接替换局部读取算法，无公共 API、持久化或安全模型变更，无需新 ADR；不重构消费者或候选状态机。使用一次 raw diff、批量对象元数据和有界内容读取，避免逐文件启动 Git，保留完整分类证据。

## 2026-10-30 评审返修合同

独立只读评审回收两项 P2：对象头 ascii 有损解码可能接受最高位置位的损坏字节（BUG-0160）；现有大正文测试不能检测取消分批后自动提高 maxBuffer 的回归。续接本 Task 串行返修，不新增实施任务。直接局部修改优于再重构：现有对象头解析和外部进程接缝已足够，只需无损解码与预算合同，无公共接口、消费者或状态机变更。

- Given 合法真实 Git 响应仅对象头字节置高位，When 从公开 readChanges 读取 metadata/body，Then 两者均拒绝；先补真实转发边界回归取得 red，再改为保留字节值的解码。
- Given 两个各低于 16MiB、总 wire size 超预算的不同 blob，When 读取完整候选，Then 正文完整且外部 cat-file 正文请求确实分批，每批预算及 maxBuffer 不超限；恰好 16MiB 单对象的 framing 例外另保留断言。通过隔离临时副本中取消分批的单点变异，确认新合同真实失败，不改项目候选来运行变异。
- 返修后复跑完整 git/policy 和原 runner/integrate/release 文件，交原评审者复核实际新候选；之后才进入 TASK-0412 完整行为门禁与适用 check。bdppbcr3d 的文档补齐后完整静态门禁已退出 0，各 lint/types/guards/mobile-lint 退出 0，但不覆盖新返修。

## 并发评估

必须串行：Git helper 与证据/集成流程紧耦合，共享 Task 索引及 waiver；当前分支没有实现 Worker，不创建额外 Worktree。Coordinator 独占本轮写域，完成后另派独立只读技术评审；已有其他候选修改保持原状。最终与 TASK-0412 组合验收，不提前集成或推送。

## Given / When / Then

- Given 多个已提交修改，When readChanges，Then 输出正文、顺序、模式与旧合同一致，外部 Git 启动不再随小文件数逐项增长；先用转发真实 Git 的边界计数建立确定性 red。
- Given 新增/删除、空文件、空白结尾、Unicode/空格/换行路径、二进制内容、可执行/符号链接/gitlink 模式，When 读取两侧，Then 缺失为 null 模式及空正文，非 blob 保持 unknown/null，blob 按真实字节边界解码，不把内容当协议行。
- Given 多文件总大小超过单次缓冲预算但各文件在既有上限内，When 读取，Then 分批且不截断；单文件超过既有上限、缺失对象、失败命令或损坏协议应拒绝，不能静默省略或沿用缓存。
- Given 未解析 revision 或 HEAD 改变，When 读取，Then 拒绝非法 revision，重新取当前对象，不缓存陈旧候选；classifyChanges/auditDesign 继续收到完整两侧正文和模式。
- Given 原实现→评审→验证→合并候选→重新评审/验证→应用，以及失败发布回执/恢复，When 运行既有完整测试文件，Then 所有原断言及原超时保持，前序红不由后序状态错误掩盖。

## 必须保持

不修改测试超时、skip/retry、原断言、执行/租约/身份/批准规则、真实 policy 或 adapter 配置。不调用真实模型、用户 Desktop、SSH、外网或真实发布。同步 Git 仍无 shell、隐藏窗口、原超时和单对象 16MiB 上限；模式、NUL 路径、完整正文、候选绑定和 fail-closed 保持。Git stderr 不记录额外凭据。不新增依赖，不改全局 Git/PATH，不移动 v0.1.3、不选新版本、不推 origin/main。

## 测试与验证

1. 新 git.test.mjs 的外部 Git 边界仅转发真实调用，四文件批量合同在旧实现断言失败；不是依赖收集或人为延时 red。
2. 同文件验证内容/模式/路径、缺失/异常、总量分批及 fresh HEAD；真实临时 Git 仓库不触碰项目索引。
3. 仓库 Node runner 串行运行 git、policy 及既有 runner/integrate/release 完整文件，保留原设置；通过不直接等同完整候选通过。
4. 独立只读评审实际新 diff 与消费者；check:quick、git diff --check、定向 Task 合同。
5. TASK-0412 冻结最终候选后运行 test:changed --base origin/dev 和完整 check，全部通过才按协作合同提交/集成/推送。

## 验收分层与验收包

工程验证：返修后完整 git/policy 31/31、原连续流程 22/22 通过，分批变异被新增合同准确拒绝；buwu0sjd3 的返修后完整 check、diff、祖先关系及 TASK-0415/0412 定向合同均退出 0。第五批 bhgpw7sg8 的 quality 为 716 通过、4 项原 5000ms 超时（224.99 秒），未进入包测试；定向绿不能替代本批广域红。技术评审：原独立只读评审者 a77a8d5b5df3b4648 已复核关闭两项 P2，未发现返修引入的新可确认问题；评审未运行测试，不代表完整验收或集成批准。集成：pending。人工功能验收：不适用，本任务只改变开发工具的内部读取，不宣称产品功能获用户接受。发布：未执行，候选说明纳入 WAIVER-0016 的暂存范围，保留原到期日及其他门禁。

复算入口：bun scripts/quality/run-vitest.mjs --run scripts/agents/git.test.mjs scripts/agents/policy.test.mjs；再运行上述三个完整连续流程文件。预期正文/模式一致且原流程通过；红时保留日志，不提高超时或宣称已修复广域时序。

## 2026-10-30 第六批结果

冻结候选后的 bihx1rzms 退出 1：quality 61 文件通过、3 失败，713 项通过、3 失败、5 项因初始化失败未执行（共 721），220.71 秒；未进入包测试。新增超时为本 Task 的真实 Git 复合合同 retains NUL-delimited paths, byte-delimited bodies, absent sides and non-blob modes，5050ms 触及原 5000ms；没有正文、模式或协议断言不一致的证据。runner 两项原 5000ms 超时，integrate 的 beforeAll 原 10000ms 超时并在 afterAll 报 EPERM，不能归为已确认的同一根因。继续只读测量夹具造对象与实际读取成本；不提高 timeout/retry/skip，不删断言或安全重验，不将既有定向绿覆盖本次红。

## 2026-10-30 造对象夹具成本续接

三文件计时 b3u6m1r68 的复合合同 5215ms 再触及原 5000ms；同 worker 的 phase/start/end 已核对。42 次 Git 合计约 5126ms，其中 fixture init/config 6 次约 856ms，18 次逐 blob hash-object 约 2199ms；实际 readChanges 的 diff 与两次 cat-file 约 316ms，没有正文/模式断言不一致。同步日志有扰动，不外推为全部时序根因。

续接本 Task 的 git.test.mjs 写域，仅批量导入真实 blob 并合并本地仓库配置写入，保留特殊字节、NUL 路径、非 blob 模式、全部原断言和原超时。优先直接局部调整 commitTree，不新增通用生产接口。使用 Git 原生 fast-import 的 data 字节边界写入 blob，再从实际 mark 读取 OID；与真实 hash-object 结果比较，使用真实 Git 对象和 update-index，不共享对象或缓存 readChanges 安全证据。runner/integrate 生命周期由独立 TASK-0416 负责。

夹具调整已落地：本地 .git/config 一次追加同样配置；每次 commitTree 以一次 fast-import 导入本次缺少 OID 的 blob，用实际 marks 取得对象，仍通过真实 update-index/write-tree/commit-tree/update-ref 构造提交。字符串以 UTF-8 字节长度封帧，Buffer 原样导入；重复内容由 Git 去重，gitlink 继续使用调用方真实 commit OID。

新增夹具合同对空正文、Unicode、正文中的协议样式行、NUL、无效 UTF-8、无末尾换行和重复对象，比较真实 hash-object 的 OID，并以 cat-file 原始 Buffer 完整比对。所有原大对象、特殊路径/模式及损坏协议断言保留。完整 git/policy 两文件 32/32 通过，34.64 秒，原 5000ms 不变；不是完整候选门禁，也不把与旧轮不同条件的总耗时差写成受控性能收益。新上下文只读评审待回包。当前五文件 quick、全部 guards、diff、三个 Task 定向合同及完整 bun run check 均退出 0；lint 5184 文件无修复，未用旧静态结果代替本次验证。

## 2026-10-30 第七批完整候选结果

bnw86pnmm 退出 1：quality 62 文件通过、2 失败，718 项通过、1 项失败、5 项因初始化失败未执行（共 724），225.09 秒；未进入包测试。本 Task 的 Git 复合合同不在本轮失败集合中，不据此声称永久稳定或完整候选通过。runner 一项在 6144ms 触原 5000ms，integrate beforeAll 触原 10000ms；本次没有 EPERM/ENOTEMPTY 输出。定向 32/32 和完整 check 通过不覆盖本批广域 red，新夹具只读评审仍待回包，未提交、集成、推送或发布。

## 2026-10-30 造对象夹具评审回收

新上下文只读评审 a890db6753dc3bec5 已回包：限定 importBlobs/commitTree 及字节对照合同没有可确认的字节、模式、特殊路径或真实 Git 导入问题。该评审未执行测试；git.test.mjs 在指定基线不存在，不能据此证明相对所有早期未提交候选的断言完全未变。TASK-0416 的两项 P2 另已返修并由原评审复核关闭；不将评审无发现或定向 green 当成完整候选通过。最新六文件 quick、全部 guards、diff 与本 Task 定向 worktree 合同通过，随后 bcef7fb0r 的 process/runner/integrate/git/policy/release 六个完整文件 63/63 通过（95.30 秒），包含完整 32 项 git/policy 合同；修复后完整 check（bk47qkrk6）退出 0，冻结候选行为门禁仍待完成。

## 交付记录

- 2026-10-30 已完成独立 Temp 基线及 Task 准入。图谱旧提交不含 scripts/agents，已核对增量并读取当前 helper、消费者及 ADR-0146。只确认进程放大，不新建泛化共同根因 Bug，不关闭 ISSUE-0035。
- 新增四文件真实 Git 合同，旧实现两侧完整正文、顺序及模式断言通过，随后启动次数断言准确失败：17 次超过上限 4 次，单项运行约 2.88 秒。该 red 不是收集或环境失败，也没有人为延迟。
- scripts/agents/git.mjs 改为一次 raw diff、去重的 batch-check 元数据及按字节预算分批的 batch 正文；默认 HEAD 每次调用先绑定当前提交。保留缺失侧空正文/null 模式、tree/gitlink 的 unknown/null、symlink/可执行模式、完整 UTF-8 解码、16MiB 单对象上限和异常拒绝，不改消费者或控制器状态机。
- git 与 policy 两文件在评审返修前 27/27 通过，32.13 秒；其中新 helper 16 项、既有 policy 11 项。覆盖增删/空文件/重命名增删、Unicode/空格/换行路径、正文 NUL/无效 UTF-8/结尾空白、模式、文件目录替换、fresh HEAD、非法 revision、总量分批、16MiB 边界及超限、损坏协议和 Git 失败，并检查 classifyChanges/auditDesign 的真实输出。编写过程的 D01 断言误用 path 字段已改为公开 file 字段；16MiB Buffer 深度断言曾导致 worker 堆耗尽，改用完整 Buffer.equals 后通过，未缩小数据、提高堆或超时。
- 原 runner/integrate/release 三个完整文件串行复验 bp3aumy59：3 文件、22/22 通过，76.11 秒，命令级 VITEST_MAX_WORKERS=1，保留全部原断言与超时。覆盖实现、独立评审、验证、main 前进拒绝旧证据、合并候选重评审重验证、应用及发布回执恢复；该次通过不证明历史 EPERM 或所有广域超时已修复。
- 使用旧 measure.mjs 的相同逻辑，在新建临时目录 open-forge-git-read-batched-NW4xQb 及新真实仓库测量：1/4/16 文件均为 3 次 Git，约 273/262/307ms，逐项核对完整正文和模式；旧基线为 5/17/65 次、367/1259/4484ms。启动数是确定性合同，单次耗时只说明此次宿主实测，不外推全部门禁或产品性能。
- git diff --check 通过；八路径 check:quick 首次仅因两个 JS 文件格式失败，定向 Biome format 后复跑通过，含全部 guards，无语义修改。worktree:check --task TASK-0415 通过。上述行为测试在该次纯格式化前完成，未另报格式化后的行为复跑。
- 评审返修前批量读取候选的 git diff --check 及完整 bun run check（bw0q2l2id）退出 0，lint、根/CLI/Desktop/docs/mobile 类型检查、guards 与 mobile lint 均通过；之后文档补齐候选 bdppbcr3d 的完整 check 也退出 0。两者均不覆盖后续 latin1 及预算合同返修，check 不运行行为测试。
- 原独立只读评审 a77a8d5b5df3b4648 回收两项 P2：对象头 ascii 有损解码接受损坏字节，以及大正文测试未约束真实分批预算。续接同一 Task 完成返修，再由同一评审者复核实际候选；不是多名评审，也不冒称异模型家族。
- BUG-0160 的 metadata/body 高位对象头回归先在旧解码取得 2 项有效失败（4.04 秒，预期抛错但未抛错），改用 latin1 保留字节值后同命令 2 项通过（4.11 秒）；正文仍按 UTF-8 解码，不改消费者或状态机。
- 新增两个不同 9MiB blob 的预算合同：完整正文后检查实际两批、每批一对象、返回字节数及 maxBuffer。精确 16MiB 内容保留单对象 framing 例外；原复合用例曾触及原 5000ms，已将独立超限拒绝场景拆为另一临时仓库用例，未提高超时或删除断言。拆分后三项通过（7.55 秒）。
- 新建隔离临时副本 open-forge-batch-mutation-rGPRfR，仅禁用分批条件，保留自动 maxBuffer 与全部断言。两个完整正文断言通过，随后实际一批不等于预期两批处准确失败（2.50 秒，exit 1）；项目候选未变异。该副本是文件系统隔离，不是 OS 沙箱证明。
- 定向 Biome 格式化后，完整 git/policy 两文件 31/31 通过（46.63 秒，其中 helper 20 项、policy 11 项）；原 runner/integrate/release 三完整文件再次 22/22 通过（66.57 秒）。均使用命令级 VITEST_MAX_WORKERS=1，保留原断言、超时和 skip/retry 设置；不替代第五批完整行为门禁。
- 原评审者已重新读取实际实现、完整新测试及 Task/Bug，确认两项 P2 均可关闭，未发现返修引入的新可确认问题。评审全程只读，未执行或独立复验上述测试，未读取变异副本；同次调用期间 HEAD 移动、SHA-256 仓库、metadata 容量边界、非 UTF-8 文件名及真实对象库损坏未动态验证。
- 返修后 buwu0sjd3 的完整 check、diff、祖先关系及两 Task 定向合同均通过。第五批 bhgpw7sg8 止于 quality：61 文件通过、3 失败，716 项通过、4 项原 5000ms 超时，224.99 秒；runner 两项、integrate 最后一项及 draft 创建/上传失败恢复一项，runner 同例另有清理 EPERM。未进入包测试，市场修复后 Desktop 广域未验收。技术发现关闭不等于完整验收或集成批准；未提交、集成、推送或发布。
