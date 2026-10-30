---
id: TASK-0416
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0002
source: user-request; ISSUE-0035; TASK-0412 phase timing
related_requirement: [REQ-0002]
related_plan: [PLAN-0019]
related_tasks: [TASK-0412, TASK-0415]
related_issues: [ISSUE-0035]
related_bugs: [BUG-0161]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [scripts/agents/, scripts/worktree/, project/, docs/adr/0146-repository-autonomy-controller.md]
write_paths: [scripts/agents/process-fixture.mjs, scripts/agents/process.test.mjs, scripts/agents/runner.test.mjs, scripts/agents/integrate.test.mjs, project/tasks/TASK-0416-agent-test-fixture-lifecycle.md, project/tasks/TASK-0412-desktop-delivery-baseline.md, project/tasks/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, project/bugs/BUG-0161-agent-test-late-process-cleanup.md, project/bugs/README.md, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, .github/release-notes/fragments/v0.1.4/task-0416-agent-test-fixture-lifecycle.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 控制器进程测试的取消、收尾与独立建库夹具

## 目标与范围

续接 TASK-0412 的失败诊断，修正测试未把 Vitest 取消传入真实异步流程、便先删除目录的问题。仅调整测试夹具，不改控制器生产实现、策略、执行证明或安全重验。重复建库成本在 runner 中用一次真实模板和各自完整副本消除；模板不共享对象、状态或执行证明。先直接修正资源所有权，无需重构生产状态机或新增 ADR。

## 并发评估

串行；当前分支和主检出承载同一交付候选，没有实现 Worker。TASK-0415 继续独立负责 Git 证据及其造对象夹具，本 Task 不改 git.mjs/git.test.mjs。Coordinator 负责集成；整个候选门禁通过前不提交或推送。

## 已确认基线

b3u6m1r68 是三文件定向诊断，不是第七批完整门禁：24 通过、5 原超时失败、5 因 integrate 初始化超时未执行，122.97 秒；integrate 清理 EPERM，runner 另有 ENOTEMPTY。临时日志包含写入扰动。

runner 的子进程 id=32 从空报告用例跨入 UI 用例才关闭，id=120、202、226 也跨过用例边界；调用来源和 start/end id 已配对，而非只按结束时 phase 归属。integrate 初始化启动的 Bun 在 afterAll 删除目录时未观察到 close，状态仍为 preparing。该证据确认缺少取消和等待，不证明所有历史 EPERM 或超时的共同根因，也不按旧 PID 杀进程。

## Given / When / Then

- Given 测试拥有真实进程与临时目录，When 用例取消或清理，Then 先传递取消、等待已登记操作收束，再删目录；收尾后拒绝新操作。
- Given runner 每项需要同样的真实基线，When 创建两个 fixture，Then 完整 Git 副本、提交、文件、状态和证明互相独立，不使用 alternates、硬链接或 linked worktree。
- Given 原实现、评审、验证与连续集成流程，When 原文件按原设置执行，Then 原断言和失败/恢复链不变，安全证据仍每次重新生成和验证。
- Given integrate 初始化失败或超时，When afterAll 执行，Then 取消并等待整个初始化 promise，不在仍运行的准备流程下删除目录。

## 必须保持

不提高 timeout/retry，不新增 skip，不删除原断言；保留真实 Git、真实 workflow/worktree 入口和逐入口/逐检查身份与候选重验。不运行真实模型、Desktop、SSH、发布或用户状态目录。测试执行证明仍仅为 synthetic fixture，不把 Temp 隔离写成 OS 沙箱。未知清理仍失败，不掩盖原失败，不通过缓存安全证据换绿。

## 测试与验证

1. 在现有 process.test.mjs 增加可控同步点的真实进程取消/等待/拒绝迟到操作回归，先取得旧夹具行为的有效 red；不使用任意 sleep。
2. 仓库 Node runner、命令级 VITEST_MAX_WORKERS=1，依次运行 process、runner、integrate；保留全部原超时。runner 增加副本独立性合同。
3. 新上下文只读评审、定向 Task 合同、diff 检查及 check:quick；最终 TASK-0412 冻结候选运行完整 test:changed 与 check。定向绿不覆盖广域红。
4. integrate 初始化若仍失败，继续按真实入口诊断；不将夹具生命周期修复宣称为性能根因已全部关闭。

## 2026-10-30 实施与验证续接

已实现测试专用 processFixture：桥接取消、登记整个异步操作、关闭后拒绝新操作，关闭时取消并等待已登记 promise。runner 的 owner 和 roots 绑定每测试 context；integrate 登记整个 cycle、review→verify 和初始化流程，不让超时续体取得下一测试的 owner。runner 使用真实模板的完整独立副本，保留逐入口新生成的 synthetic proof。

process 回归在 no-op 旧夹具下准确失败于取消信号，修复后通过。原超时串行运行三个完整文件：20 通过、1 失败，68.29 秒；process 6/6、integrate 5/5 实际执行通过，runner 9/10。剩余真实候选验证用例 5276ms 触及原 5000ms；本次输出未见 EPERM/ENOTEMPTY，不据此关闭所有历史清理问题。

剩余用例一次带计时定向通过，9 项未选中，不能覆盖完整文件的 red。日志 process-43408 中约 39 次同步 Git 耗时合计 3825ms，四次直接 Node spawn 合计约 724ms，事件跨度 4845ms；日志写入有扰动。直接 Git 原生程序与命令级 Git 启动器各四次只读 --version 对比没有明显收益，不改 PATH 或生产命令。

已将无业务操作的 baseline fixture 准备放入每测试 beforeEach，额外副本仍按需独立创建；这是初始化职责调整，不宣称全流程耗时因此下降。测试 body 保留原实现→评审→验证→证据导出及全部原断言、安全重验和 5000ms 限制。仅去除测试 adapter 对已跟踪 feature.txt 的冗余 git add，仍使用带明确 pathspec 的真实 git commit；提交后内容、干净状态、review 和验证均由原合同检查。未改生产接口或状态机。

新候选按相同入口、单 worker 和全部原超时运行三个完整文件：21/21 通过，59.71 秒；process 6 项、runner 10 项、integrate 5 项均实际执行，未见清理错误。不是第七批完整门禁，不关闭全部历史超时或证明真实 OS 隔离。新上下文只读技术评审已派发，待实际回包；完整候选行为及静态门禁仍待完成。

## 2026-10-30 第七批完整候选结果

bnw86pnmm 的 test:changed 退出 1：quality 62 文件通过、2 失败，718 项通过、1 项失败、5 项因初始化失败未执行（共 724），225.09 秒。runner 的 runs the actual candidate test after review and stores version-bound verification results 在 6144ms 触及原 5000ms；integrate 的 beforeAll 触及原 10000ms，五项未执行，不计为五个行为缺陷。未进入包测试；本轮输出没有 EPERM/ENOTEMPTY，不代表全部历史清理问题已解决。

运行中记录的候选快照含 79 个路径；终态逐项核对 HEAD、大小及 SHA-256 均未变化。快照并非运行前原子采集，也不替代执行证明。定向 21/21 与静态绿不能覆盖本批 red，继续区分 runner 真实执行成本与 integrate 准备阶段；不提高原超时、删除断言或缓存安全重验。只读评审仍待回包，不提交、集成、推送或发布。

## 第七批后诊断合同

在独立 Temp 中使用内存缓冲的 preload 与 setup，按真实 quality 文件集合、原 worker/timeout 配置诊断，不作为第八批完整候选验收。仅记录目标 scripts/agents 的调用来源、操作类别、PID/id、阶段、耗时和退出状态；退出时统一写入，避免每次同步写日志。仍有堆栈采集扰动，不作为无扰动性能基准。不记录完整参数、环境、正文或凭据，不向隔离 adapter 注入 preload，不修改生产代码或测试断言。先测 runner 入口与逐检查、integrate 建库和 prepareTask 子进程的分段，再决定可验证的最小修复；不能用连续重跑碰绿替代根因证据。

第一次内存缓冲 quality 诊断 boju20nzm 为 723 通过、1 项 release.test.mjs 原 5000ms 超时（6898ms），同用例清理 EPERM，201.18 秒；runner/integrate 本次通过，不覆盖第七批 red。worker 退出时写盘没有可靠保留目标文件的数据，不能据此分摊其耗时。仅将 Temp 计时器改为测试收尾批量写出，再诊断 runner/integrate 两文件，不修改项目代码或原设置；release 的独立生命周期写域未扩入本 Task。

收尾批量写出的两文件诊断 bqsaty7ge 为 15/15 通过（50.95 秒），不覆盖第七批 red。配对 PID/id 的记录未见未结束操作；runner 候选验证阶段包含 beforeEach 的两次 Git，必要 Git 与直接子进程耗时仍占主要部分，不删除逐检查与证据导出重验。integrate 的真实 Bun 准备子进程约 5.16 秒；独立隔离探针复现 Bun 新进程首次同步 Git 约 4 秒、后续约 60–90ms，绝对 Git 路径同样发生。运行时切换由新 TASK-0417 负责，不扩本 Task 生产写域。

## 2026-10-30 只读评审返修合同

只读评审 a890db6753dc3bec5 已回包：process.test.mjs 新增回归有两项 P2，测试在等待 started 时超时可能到不了局部 finally，afterEach 未持有 owner 便删目录；单次微任务检查及先等待 operation 的顺序也可能放过 close 不等待 active 的退化。其余限定夹具范围没有可确认发现；TASK-0417 的运行时单行和真实 spawn 转发合同另已只读复核无可确认问题，不代表完整候选通过。

返修仍在本 Task 的测试写域内，不改生产进程实现。先让框架等待的 afterEach 持有每测试取消、门闩和操作收尾，再删除该测试目录；增加明确的操作完成先于 close 完成断言，不以任意 sleep 或增加超时判断。用独立 Temp 副本变异 close 的 active 等待来检验断言确实 red，保留原文件；再验证未收到 ready 时的取消路径及整个 process 文件，最后复验完整连续流程和原审查。不能将定向绿覆盖第七批 red，当前无提交或发布。

返修后完整 process 文件 7/7 通过（5.38 秒），新增无启动输出的真实子进程经同一 teardown 取消并等待，根目录仍由后续 afterEach 删除。独立 Temp 副本只将 helper 的等待改为 Promise.allSettled([])，顺序合同准确 red：实际 close→operation，预期 operation→close，1 失败、6 项名称未选中，1.33 秒；仓库 helper 未变异。原评审已只读复核关闭两项 P2，限定返修未发现新增可确认实质缺口；评审未运行测试。首轮六文件 check:quick 报 prepare 命令数组格式及 process 的表达式赋值两项，全部 guards 通过；按提示局部修正后六文件 quick、全部 guards、diff 及 TASK-0412/0415/0416/0417 定向 worktree 合同均通过。随后 bcef7fb0r 在单 worker、全部原超时下串行运行 process/runner/integrate/git/policy/release 六个完整文件，63/63 通过，95.30 秒；process 7、runner 10、integrate 6、git/policy 32、release 8 项均实际执行。release 未修改，这次通过不能关闭 boju20nzm 的历史诊断超时/清理错误。最终完整静态及冻结候选复验待完成。

## 验收分层与功能验收包

工程：实现及评审返修已落地，最新六个完整相关文件 63/63、六文件 quick、guards、diff 与定向合同通过；修复后的完整 check（bk47qkrk6）通过，冻结候选 test:changed 待执行，第七批 red 仍保留。技术评审：新上下文只读审查两项 P2 已由原评审复核关闭，限定范围无新增可确认问题，评审未运行测试。集成：pending。人工功能验收：不适用，开发测试夹具不改变产品功能。发布：未执行，内部说明按 WAIVER-0016 暂存，不选择新版本或移动 v0.1.3。

复算入口：bun scripts/quality/run-vitest.mjs --run scripts/agents/process.test.mjs scripts/agents/runner.test.mjs scripts/agents/integrate.test.mjs。预期真实流程通过，取消操作不会在目录清理后继续；失败保留具体日志和目录，不降低门禁。

## 交付记录

取消/等待 helper、每测试资源所有权、integrate 全流程登记及 runner 独立夹具已实现；新增回归有有效 red/green。只读评审 a890db6753dc3bec5 的两项 P2 已返修复核关闭，空 active 等待变异准确 red，最新六文件 63/63 通过。六文件 check:quick、全部 guards、diff 与 TASK-0412/0415/0416/0417 定向合同通过。修复后的完整 check（bk47qkrk6）退出 0，lint 5184 文件无修复，全部类型、guards 与 mobile lint 通过。第七批完整候选仍为 red，下一冻结候选尚未执行；没有提交、集成、推送或发布。
