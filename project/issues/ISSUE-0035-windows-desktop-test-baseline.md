---
id: ISSUE-0035
type: issue
status: draft
priority: P1
owner: desktop/testing
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410, TASK-0411, TASK-0412, TASK-0414, TASK-0415, TASK-0416, TASK-0417]
source: PLAN-0026 combined test:changed and independent baseline comparison
created: 2026-10-29
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Windows Desktop 广域测试的存量失败与归因

## 背景

PLAN-0026 在隔离 Task 实现、审查和定向验证后，于本地 main 组合运行跨包门禁。共享资源与子代理相关包通过，但 Desktop 广域测试仍红，需要区分 shell/测试宿主问题和真实产品回归。这里记录未决根因，不将失败直接认定为资源准入改动或已确认的产品 Bug。

## 已知事实

候选含 TASK-0411 ddf02a580 与 TASK-0410 619cd9c3b；起点为 6bb27d048c5dccade7decafde58f4eeb8ec6686c。宿主为本次 Windows PowerShell/Node/Bun 环境，统一仓库 Node runner，无真实用户实例、Provider 或生产状态。

完整 bun run test:changed --base 6bb27d048 执行 2152 秒，六个其他受影响包全通过、2684 例通过；Desktop 1102 文件通过、7 文件失败、4 文件既有跳过，6233 例通过、14 例失败、18 例既有跳过，整体 exit 1。失败文件及用例数如下：

| Desktop 相对路径 | 失败例数 | 观测 |
| --- | --- | --- |
| src/main/plugins/remote-command-runner.test.ts | 4 | shell 脚本解析错误；单文件复验仍失败 |
| src/main/media-protocol.test.ts | 1 | 远端媒体按范围读取 |
| src/main/skills/skill-presentation-read.test.ts | 2 | 远端技能 URI 与展示列表 |
| src/main/filesystem/filesystem-service.remote-flow.test.ts | 4 | 远端文件树/过滤/变更/预览 |
| src/main/plugins/command-spawner.remote.test.ts | 1 | 远端长跑命令 |
| src/main/file-protocol.test.ts | 1 | 远端文件内容 |
| src/renderer/domains/weknora/weknora-background-flow.test.tsx | 1 | AC-20 多路终态合并刷新期望 baseline+1，实际 baseline+2 |

七个文件均不在本轮修改范围。远端命令单文件诊断 stdout/stderr 报 /bin/bash 的 unexpected EOF while looking for matching 双引号，exitCode 2；不能据此直接判定 WSL 缺失。UI 失败涉及现有 debounce/请求计数，未定位到产品实现或测试时钟根因。

### 独立源码基线

通过 git clone --shared --no-checkout 建立独立临时检出 C:/Users/xquan/AppData/Local/Temp/of-0026-6bb27d048，detach 精确原提交后 bun install --frozen-lockfile。检查 workspace 实际链接指向该检出 packages，原 gate 不含 waitTimeoutMs，原 scheduling-observation.ts 不存在；没有借用新源码或复制用户状态。

同一宿主执行以下命令（从基线根目录），14 个完整失败测试名称与候选逐项相等，7 文件失败、14 例失败、17 例通过、3 例既有跳过，exit 1：

~~~powershell
bun run test:impact -- apps/desktop/src/main/plugins/remote-command-runner.test.ts apps/desktop/src/main/media-protocol.test.ts apps/desktop/src/main/skills/skill-presentation-read.test.ts apps/desktop/src/main/filesystem/filesystem-service.remote-flow.test.ts apps/desktop/src/main/plugins/command-spawner.remote.test.ts apps/desktop/src/main/file-protocol.test.ts apps/desktop/src/renderer/domains/weknora/weknora-background-flow.test.tsx
~~~

原始本机日志在主检出 node_modules/.cache/plan-0026/：combined-test-changed.log、combined-main-check.log、desktop-remote-diagnosis.log、independent-baseline-install.log、independent-baseline-desktop-failures.log。日志为 ignored 诊断产物，不提交。新行为用例及完整 check 通过见两项 Task。

初次将基线放到 node_modules 内导致 TSX 转换出现 React 未定义；该 UI 对照无效，已更换独立 Temp 检出，以本节有效结果为准。未删除断言、增加 skip、延长超时或过滤失败项。

## 2026-10-29 交付基线复核

TASK-0412 在 f33ff37cc 候选的 Git Bash/Windows 宿主复跑：remote-command-runner 单文件 5/5 通过；原七文件 31 通过、3 既有跳过，约 42 秒。未修改 Desktop/SSH 产品实现、原断言、skip 或超时。当前定向未复现历史失败，不代表已修复十四个产品缺陷；仍以 origin/dev 到完整候选的 test:changed 及 check 判断推送条件，根因未决状态保留。

首次完整待推批次 br26koqiu 已运行：原十四项未复现，Desktop 1108 文件通过、1 文件失败、4 文件既有跳过，6246 项通过、1 项失败、18 项既有跳过；失败为 RuntimeHost history/fork/resume 合同超时 60000ms。同文件包内独立重跑 4/4 通过（14.84 秒），未修改超时或断言，不能据此断言广域时序已永久解决。

同批 coding-agent 1 项、runtime-node 7 项因 spawn rg ENOENT 失败：Git Bash 的 rg 是 shell 函数，原生 Node 不可执行。命令级 PATH 指向本机现有原生 rg.exe 后，三个相关文件 30/30 通过；未改全局环境或产品实现。check 因新增 workflow 测试格式错误失败，已定向格式化。第二次批次 bm0xe3uw6 的完整 check 已通过，但 quality 的 runner 空报告用例在 5000ms 超时并于清理时报 EPERM（699/700 通过），尚未进入包测试；该文件独立 9/9 通过，未改超时，不能代替广域复验。后续按命令级单 worker 与原生 rg PATH 复验，全红门禁没有被豁免。

第三次完整批次 b081j0xol 已结束：quality 63 文件、700 项通过，所有包测试执行完毕，test:changed=1、check=0。Desktop 为 1107 文件通过、2 失败、4 既有跳过，6245 项通过、2 失败、18 既有跳过；两个市场流程分别触及原有 5000ms/10000ms 上限，历史十四项未复现。相同两文件独立 36/36 通过（20.17 秒）不替代广域失败。

TASK-0414 随后用默认 fetch 拒绝/调用守卫取得明确 red（5 失败、31 通过，7.64 秒）：五个 fixture 只注入 archive，遗漏 manifest，共 9 次示例仓库请求被本地拦截，无真实外网。BUG-0159 已确认测试网络隔离缺口；生产离线回退可吞掉请求错误，但 afterEach 零调用断言仍可靠失败。仅补 manifest fixture 后，两文件 36/36 通过（7.45 秒），市场目录 152 项通过、2 既有跳过（15.26 秒），未修改生产实现、业务断言或超时。独立评审另指出两个 list 测试的后台检查与目录清理可交错；已在测试侧用可控 manifest 响应、公开 install 流程及 finally 等待收尾，同一评审者复核确认该 P2 已处置、未发现新实质问题，未将源码可构造竞态当成运行复现。收尾修改后两文件再次 36/36 通过（10.16 秒），目录 152 项通过、2 既有跳过（24.14 秒），quick 及定向合同通过。此证据不等于还原当时请求时长或证明唯一超时因果，不能替代新候选完整门禁。

### 2026-10-30 第四批结果

稳定候选 batk29tuf 的 test:changed=1、check=0；quality 60 文件通过、3 失败，696 项通过、4 失败（共 700），173.81 秒。四个用例均超时于原 5000ms：integrate 的 refuses a moving main branch and prepares a new candidate without losing the other change、applies only the reverified commit and records integration separately from publishing，release 的 reconciles a lost response before any retry and never treats local intent as published，以及 runner 的 does not mark an exit-zero but empty verification report as automatically repairable。runner 同一用例清理另报 EPERM，不增加失败用例数。quality 失败即返回，未进入 Desktop、CLI 或其他包测试；市场修复后的广域仍未验收。未修改原超时、断言、skip 或 retry，未提交、集成、推送或发布。TASK-0412 继续核查真实 Git/子进程耗时、worker 生效值及收尾边界，尚未确认共同根因。

### 三文件定向诊断（非完整门禁）

保留原设置运行 integrate、runner、release 三文件：6 项失败、16 通过，93.20 秒；现场 resolved 配置证实 maxWorkers=1、pool=forks、testTimeout=5000。四项超时，另有 integrate 前序超时后的两个共享状态错误；runner 同例清理 EPERM 不是额外失败用例。release 八项及原空报告用例本次通过，只表明失败集合变化，不证明修复。没有更改实现、测试超时、skip 或 retry。

已读取临时结构化日志，三个 worker 可观测同步 Git 共 584 次、72061ms，主要为 rev-parse/status 等真实命令。隔离 adapter 不继承 preload，且同步日志有扰动；Reporter 通知延迟不能作为 worker 内精确用例边界，因此不以主进程时间窗口作逐用例归因。Git 启动窄基准仅支持固定成本存在，不证明唯一根因。一个 esbuild spawn 缺 end 不构成泄漏证据。随后独立 Temp 基准确认 readChanges 对 1/4/16 文件启动 5/17/65 次 Git、约 367/1259/4484ms，已建立局部行为保持型 TASK-0415；没有新建泛化共同根因 Bug，超时后收尾的确切因果仍未确认。

### 候选证据批量读取的定向结果

TASK-0415 四文件真实 Git 合同先核对完整输出正确，再于旧实现的 17 次启动超过上限 4 次处有效 red。raw diff、批量元数据及有界正文读取实现后，git/policy 两文件 27/27 通过（32.13 秒），覆盖完整内容、模式、路径、HEAD、大小及错误拒绝。相同基准逻辑在新临时仓库测得 1/4/16 文件均 3 次 Git、约 273/262/307ms，完整输出核对通过；不将单次微基准外推为全部广域失败根因。

原 runner/integrate/release 三文件 bp3aumy59 复验 22/22 通过（76.11 秒），命令级单 worker，未修改原超时、断言、skip 或 retry。该定向绿不是第五批完整门禁，也不证明历史 EPERM 已修复。该阶段的独立技术评审后续提出两项 P2，返修和复核结果见下节。新候选完整 test:changed/check 待完成，第四批广域红尚未覆盖；当前未提交、集成、推送或发布。

### 2026-10-30 批量读取评审返修

原独立评审提出对象头 ascii 有损解码与预算测试缺口两项 P2。BUG-0160 的公开 readChanges 高位对象头回归在旧解码下两项均未抛错（有效 red，4.04 秒），改用 latin1 后同命令两项通过（4.11 秒），正文仍按 UTF-8 解码。两个不同 9MiB blob 的新合同保留完整正文，并检查实际两批、每批预算及 maxBuffer；精确 16MiB framing 与独立超限拒绝均保留。独立临时副本仅取消分批后，完整正文断言通过而两批断言准确失败（2.50 秒）；未变异项目候选。

定向格式化后，完整 git/policy 两文件 31/31 通过（46.63 秒），原 runner/integrate/release 三完整文件 22/22 通过（66.57 秒）；未增加超时、skip 或 retry。原评审者 a77a8d5b5df3b4648 只读复核确认两项 P2 可关闭，未发现返修新可确认问题；未运行或独立复验测试，未读取变异副本。该结果不是第五批完整门禁，不证明广域超时或 EPERM 的共同根因已解决。返修后完整 check 已通过，随后第五批失败，详见下节；市场修复后 Desktop 广域仍待验收，未提交、集成、推送或发布。

### 2026-10-30 第五批结果

buwu0sjd3 已成功 fetch 并确认 origin/dev 仍为 HEAD 祖先；TASK-0415/0412 定向 worktree 合同、git diff --check 和完整 check 均退出 0。冻结候选后的 bhgpw7sg8 使用相同命令级原生 rg PATH 与 VITEST_MAX_WORKERS=1，quality 61 文件通过、3 失败，716 项通过、4 失败（共 720），224.99 秒，test:changed 退出 1。runner 的 runs the actual candidate test after review and stores version-bound verification results、rejects a changed candidate instead of reusing its earlier review，integrate 的 applies only the reverified commit and records integration separately from publishing，以及 desktop-release-workflow 的 creates a candidate draft and resumes it after an upload failure 均触及原 5000ms。首个 runner 用例清理另有 EPERM，不另计失败用例；quality 失败立即返回，未进入任何包测试。未提高超时、retry 或 skip，未删除断言；继续受控核查 Git 启动成本和超时收尾，不将批量读取定向改善外推为共同根因已经解决。

### 2026-10-30 第六批结果

发布夹具模板候选的完整静态 bynqso0u8 已通过。冻结候选后的 bihx1rzms 使用相同命令级原生 rg PATH 与 VITEST_MAX_WORKERS=1，test:changed 退出 1：quality 61 文件通过、3 失败，713 项通过、3 失败、5 项未执行（共 721），220.71 秒。runner 的 runs the actual candidate test after review and stores version-bound verification results（7517ms）、rejects a changed candidate instead of reusing its earlier review（5184ms），git 的 retains NUL-delimited paths, byte-delimited bodies, absent sides and non-blob modes（5050ms）触及原 5000ms。integrate 的 beforeAll 触及原 10000ms，afterAll 另有 EPERM；五项因初始化失败未执行，不计为五个行为缺陷。quality 非零立即返回，未到包测试；发布 workflow 本批未报失败，不等于其稳定性永久得到证明。

发布夹具独立只读评审 ac89929db63624574 已回包，限定范围内无可确认发现；未运行测试或异常清理注入，不替代广域验收。六次完整批次均未全绿，市场修复后的 Desktop 广域仍未验收。继续分别测量夹具搭建、真实流程与超时收尾，保持原断言、timeout/retry/skip 和安全重验；不把 EPERM 直接归因为进程泄漏，不提交、集成、推送或发布。

### 2026-10-30 测试夹具生命周期与造对象续接

TASK-0416 已让每测试 owner 桥接取消、等待完整异步操作并拒绝迟到启动；integrate 初始化、cycle 和 review→verify 整段登记，runner 使用完整独立 Git 副本和每测试初始化。process 新合同在 no-op 旧行为下有效 red，修复后 green；三个完整文件首次 20/21，仍有一项 runner 原 5000ms 超时，局部夹具职责调整后完整 21/21 通过（59.71 秒），integrate 五项实际执行。该轮未见 EPERM/ENOTEMPTY，不关闭所有历史时序问题或证明真实 OS 隔离。

TASK-0415 的造对象夹具改为按字节 framing 的真实 fast-import，并由实际 marks 和 update-index 建树；新增合同以 hash-object 与 cat-file 完整字节比较，原特殊路径、模式、大对象及协议失败断言保持。完整 git/policy 32/32 通过（34.64 秒），没有提高 timeout/retry/skip 或缓存生产安全证据。新上下文只读审查待回包；这两次定向验证不是第七批完整候选门禁。市场修复后 Desktop 广域仍待验收，当前五文件 quick、三个 Task 定向合同与完整 bun run check 已通过；第七批完整行为门禁尚未完成，不提交、集成、推送或发布。

### 2026-10-30 第七批结果

bnw86pnmm 的 test:changed 退出 1：quality 62 文件通过、2 失败，718 项通过、1 项失败、5 项因初始化失败未执行（共 724），225.09 秒。runner 的 runs the actual candidate test after review and stores version-bound verification results 在 6144ms 触及原 5000ms；integrate beforeAll 触及原 10000ms，五项未执行不是新增 skip 或五个行为断言失败。quality 非零后未进入任何包测试；Git 复合合同本次未报失败，没有 EPERM/ENOTEMPTY 输出，不据此宣布永久稳定或关闭历史清理问题。

运行中留存的 79 路径快照在终态核对 HEAD、文件大小和 SHA-256 均未变化，但不是运行前原子快照或执行证明。新上下文只读评审仍待回包，定向和静态绿不覆盖完整 red；市场修复后 Desktop 广域仍未验收，不提交、集成、推送或发布。

### 2026-10-30 评审返修及控制器运行时

第七批后 quality 诊断 boju20nzm 为 723 通过、1 项 release 原 5000ms 超时及同例清理 EPERM，201.18 秒；不是第八批完整候选，目标计时数据不完整，不据此确认 release 根因。随后两文件计时与独立探针确认本宿主 Bun 新进程首次同步 Git 约 4 秒，绝对 Git 路径亦然，不外推所有历史超时。TASK-0417 直接沿用控制器 process.execPath 运行真实 Worktree CLI，新增转发合同有效 red→green，原参数、隔离、取消和安全重验保持。

只读评审 a890db6753dc3bec5 对运行时选择及限定造对象夹具无可确认问题；process 回归的 teardown 所有权与等待断言两项 P2 已返修并复核关闭。完整 process 7/7，空 active 等待变异准确 red；最新 bcef7fb0r 的 process/runner/integrate/git/policy/release 六文件 63/63 通过（95.30 秒），quick、guards、diff 与四 Task 合同通过。修复后完整 check（bk47qkrk6）退出 0，冻结候选行为复验待执行，第七批完整 red 保留；release 本次通过不能关闭历史诊断失败，市场修后 Desktop 广域仍待验收。不提交、集成、推送或发布。

### 2026-10-30 第九批完整结果

bzbpubblu 完整跑完，82 路径字节快照未变，退出 1，约 64 分钟。quality 726 项通过；CLI 上一批三项超时未再出现。失败为 ssh-transport 的 BUG-0057 握手预算期望 240000、实际 239999，以及 Desktop AC-20 期望列表刷新 4、实际 5。其余已执行包通过。

TASK-0418 将不足 1ms 的建连前耗时不计入握手预算，原断言保持，ssh2-runner 27/27 通过。TASK-0419 将重叠的列表请求合并为一次在途请求，并让 AC-20 基线等到第二次会话落库；该文件 7/7 通过。

### 2026-10-30 第十批完整结果

b6c7y60gc 完整跑完，90 路径字节快照未变，退出 0，约 72.8 分钟。quality 726 项通过；ssh-transport 21 文件通过、1 文件既有跳过，236 项通过、25 项既有跳过，239999 未再出现；CLI 52 文件通过、1 文件既有跳过，239 项通过、14 项既有跳过；Desktop 1109 文件通过、4 文件既有跳过，6247 项通过、18 项既有跳过，AC-20 未再失败。该结果不关闭历史超时根因，也不表示已发布。

## 未决问题

远端测试的脚本 quoting/宿主边界仍需单独定位。AC-20 的额外刷新已由 TASK-0419 合并，第十批未再失败，但不证明真实客服服务表现与夹具相同。RuntimeHost、quality runner 的历史广域时序未被第十批绿证明永久解决。已确认的市场 fixture 缺陷独立登记，不用它解释历史十四项。基线一致说明本次改动前已能复现，不能替代这些功能自身验收。

## 候选方案与推荐

推荐后续按远端 shell 与后台刷新两个 concern 分别复现、建立最小失败、诊断并修复，保留原行为断言。扩大本次资源准入 Task 修复全部 Desktop 会混淆范围和回滚边界，因此不采用；跳过现有测试或降低期望不采用。

## 决策触发条件与后续 Task

任何下一次 origin/dev 推送前先解决当前完整批次门禁。仅本地资源准入集成按 [WAIVER-0015](../decisions/waivers/WAIVER-0015-resource-admission-local-baseline.md) 记录有限 Policy 例外；不豁免推送/发布边界。本记录为后续调查入口；TASK-0412 已接续当前交付基线复核，尚未据定向通过关闭历史问题。
