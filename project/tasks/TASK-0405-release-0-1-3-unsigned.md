---
id: TASK-0405
type: task
status: in_progress
priority: P0
owner: desktop-release
requirement:
plan:
source: 用户请求（2026-10-26）/ 签名凭据缺失 / WAIVER-0008
related_requirement: []
related_plan: []
related_tasks: [TASK-0404, TASK-0412, TASK-0413]
related_issues: [ISSUE-0029]
related_bugs: [BUG-0157, BUG-0158]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出任务分支串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [.github/workflows, .github/release-notes, apps/desktop/scripts, apps/desktop/src/shared, scripts/release, scripts/quality, project/decisions/waivers, project/tasks]
write_paths: [package.json, .github/workflows/desktop-release.yml, .github/release-notes/fragments/v0.1.4/task-0405-linux-release-contract.md, apps/desktop/scripts/linux-packaging-contract.mjs, apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/verify-linux-packages.mjs, apps/desktop/scripts/verify-linux-packages.node-test.mjs, scripts/release/verify-desktop-release-identity.mjs, scripts/release/verify-desktop-release-identity.test.mjs, scripts/quality/desktop-release-workflow.test.mjs, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, project/tasks/TASK-0405-release-0-1-3-unsigned.md, project/tasks/README.md, project/bugs/BUG-0157-linux-release-brand-path.md, project/bugs/BUG-0158-release-draft-source-identity.md, project/bugs/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 发布未签名的 Open Forge 0.1.3

## 目标

在仓库与 `desktop-production` 环境没有 macOS 签名/公证凭据的前提下，按用户 2026-10-26 的明确授权，把当前 0.1.3 以**未签名**制品发布为 GitHub pre-release；默认的签名发布门禁不得被削弱，必须由显式仓库变量开启，并在发布说明中标注未签名/未公证。

## 2026-10-29 续接合同（替代下方历史恢复操作）

用户本轮要求解决交付阻塞。续接 BUG-0157：默认分发品牌的 deb/rpm 使用 /opt/Allstr ai，旧 verifier 与容器检查仍要求 /opt/Open Forge。串行在当前任务分支修复现有 Linux 路径合同、包内检查及 Ubuntu/Fedora 安装检查；不改变生产安装目录、不降低验证、不扩展签名或沙盒豁免。实现前先补默认品牌的失败回归，再覆盖 self 档与缺二进制/标记、错包名/版本/架构的拒绝。

既有 v0.1.3 指向 d859f3a7ae617d2474fc0aac719de6036ab70d5b，当前候选存在实际产品源码差异，Release 尚不存在也不能证明可以复用标签。下方旧 stable dispatch 恢复假设已经失效。补 fail-closed 的远端标签与候选 SHA 校验：同 SHA 允许；已有异 SHA 拒绝；不存在的标签仅允许 GitHub 创建候选标签，R2 稳定发布要求标签已存在。回归还覆盖 annotated tag、查询失败和显式候选校验。守卫进入 prepare 以及实际发布前，不能只依赖 --target。

发布身份不一致时停在开发候选验证/推送，不执行 0.1.3 Release、不移动旧 tag、不晋升 origin/main、不擅自变更版本。候选发布说明仅按 WAIVER-0016 暂存，不代表下一版本已选定。

独立评审发现 BUG-0158：缺远端 tag 时，既有 draft 可能保存旧目标 SHA。续接同一发布身份 concern，保留现有 draft 恢复/创建流程；最终上传前让现有身份脚本读取 GitHub draft 元数据，严格校验 tag、draft 状态，并在缺 tag 时要求 targetCommitish 为候选完整 SHA，无法证明即拒绝，不重新绑定 draft 或移动标签。Given 缺 tag 与旧目标 draft，When 实际 workflow 发布脚本执行，Then 上传/发布前失败；同候选 draft 允许；查询/结构错误或远端异 SHA tag 拒绝。无网络测试执行真实 workflow shell，仅在 GitHub CLI 边界使用本地状态替身，Git 身份检查使用隔离真实仓库和 bare remote；通过同一入口覆盖创建、重试和拒绝。现有脚本与 workflow 可直接承载该局部校验，不拆第二套发布流程。

验证：先 Node Linux 回归 red/green，再 test:desktop:packaging、test:quality，最后与 TASK-0412/0413 串行复算 test:changed --base origin/dev 和完整 check。Windows 纯合同不替代真实 Linux 制品、容器安装或四平台 CI；没有新同 SHA run 就保留未验收。技术评审交给未参与实现的新上下文只读子任务，集成与发布分别记录。

## 2026-10-30 发布夹具启动成本合同

第五批完整 quality 中，新建 draft 后上传失败再恢复的原用例触及 5000ms；同安装 native Git 对照仍超时，不调整 Git 入口。当前本地 gh 替身通过 Bash 再启动 Node，先只验证去掉替身的额外 Bash 层是否降低固定成本，不把它预判为全部超时的共同根因。

- 范围：串行修改已有 scripts/quality/desktop-release-workflow.test.mjs 的 gh 夹具入口；续接只读建库模板实验，仅在完整搭建成本下降且隔离合同成立后复用模板。不改生产 workflow、身份守卫、Git 选择或全局配置；保留本地状态替身的参数、退出码及持久化行为。
- Given 全新真实仓库、bare remote、本地 gh 状态替身；When 原 workflow shell 创建 draft、首次上传失败并再次执行；Then 候选 SHA、一次创建、两次上传、仅成功后一次公开的原断言全部保持。旧目标拒绝、同候选恢复及 R2 匹配标签场景也必须通过。
- 使用 Node shebang 直接执行同一 gh 替身，Windows Node spawn 仍仅在 gh 外部边界转发。真实 Git、每次身份重验、实际 workflow shell、完整连续流程和原 timeout/retry/skip 不变；不引入网络、依赖、模型或真实发布。
- 验证：先对照 gh 替身启动开销，再经仓库 Node runner 运行原四场景和两个完整身份/workflow 文件，必要时用 Temp 计时 preload 核对；一次定向绿不覆盖第五批红。完成后串行复验 quality、test:changed 与完整 check，并回收新上下文只读评审。
- 已执行：独立 Temp/open-forge-gh-shim-ab-7zj10a 交替对照 8 轮，逐项核对含空格、引号、中文的参数、stdout、stderr 和失败退出码。Bash 包装中位 248ms、总计 2004ms，直接 Node 中位 188ms、总计 1591ms；只证明该替身入口的窄收益。候选已将 gh 包装改为 Node shebang，未改真实发布流程。
- 候选复验：原四场景 4/4 通过，29 项未选中，测试 13.31 秒、总计 13.72 秒；随后两个完整文件为 68 通过、1 失败，共 69 项，测试 26.75 秒、总计 27.49 秒。失败仍为 draft 创建后上传失败再恢复，6168ms 触及原 5000ms；不把定向绿覆盖完整红，不宣称共同根因已解决。该候选尚未重新完成静态及广域门禁，无提交、集成或推送。

### 剩余建库成本实验（2026-10-30）

- 最新 Node shim 计时单例仍失败：1 失败、32 项未选中，原用例 5129ms，测试 5.13 秒、总计 5.88 秒，原上限 5000ms。Temp/open-forge-node-shim-timing-Aq19yh 中目标 worker PID 50024 的五次建库 Git 合计 659ms，两次实际 Bash 为 1859/2521ms，状态为预期上传失败 123 / 恢复成功 0。内部八次 Git 1238ms、两次身份脚本 gh 232ms 已包含在 Bash 内，不重复相加；preload 有测量扰动，生命周期日志不等于完整启动成本。父 PID 36528 已由 PPID 关系归属 runner，其额外 Node 启动不计入用例。
- 下一窄实验：在新 Temp 中交替比较四次全新真实仓库搭建，与一次真实只读模板加四份独立复制；总成本必须计入模板创建，不靠移到 beforeAll 隐藏成本。复制必须无硬链接、无共享对象库和绝对模板 remote，各场景保有独立 .git、bare remote、tag、draft 状态和 artifact。
- Given 四份独立副本；When 一份创建并推送本地 tag；Then 另一份和模板仍缺该 tag，候选 SHA 与完整文件相同。若成本与隔离均证明成立，才在专用 describe 的 beforeAll 创建模板、各用例复制、afterAll 清理；所有实际 workflow shell、前后身份重验、连续创建/失败/恢复断言和原 timeout/retry/skip 保持。不以建库优化证明第五批其余超时或 EPERM 的根因。
- 实验已执行：Temp/open-forge-release-seed-ab-X1tHmg 四轮交替，每批四个仓库；新建耗时 1942/1708/1802/1748ms，模板含创建与四份复制为 720/924/809/885ms，总计 7200/3338ms，建库 Git 启动总数 80/20。SHA、完整文件、相对 remote、独立 common-dir、无 alternates、对象无硬链接均核对；一份推送本地 tag、改 draft 和 artifact 后，其余副本及模板不变。此实验未执行 workflow，不证明原用例或广域门禁已通过。
- 据此实施：四个发布场景使用专用 describe 的模板生命周期，各用例仍创建并清理独立 Temp 副本；新增复制后 tag/remote/对象/状态隔离回归，不共享可变 release 状态。验证顺序为原四场景及隔离合同、两个完整身份/workflow 文件、新上下文只读评审，再串行完整门禁；原上限与发布身份检查不变。
- 模板候选复验：命令级 VITEST_MAX_WORKERS=1，经仓库 Node runner 选择 isolated release draft workflows，5/5 通过、29 项未选中，测试 13.76 秒、总计 14.10 秒；随后完整身份/workflow 两文件 70/70 通过，测试 25.34 秒、总计 25.98 秒。单文件 Biome 已修正格式；未使用计时 preload，未改原 5000ms 用例上限、shell 20_000ms、retry/skip 或身份重验。只证明相关文件本次通过，不覆盖第五批广域红；新候选独立评审、完整静态及整个待推批次仍待完成。
- 新上下文只读评审 ac89929db63624574 已回包：限定范围内无可确认发现；gh 参数及进程结果、相对 remote 和对象/tag/draft/artifact 隔离、实际 workflow 前后身份重验及连续失败恢复证据均未见缺口。未运行测试、计时或异常清理注入，未验证其他宿主、真实 gh/GitHub；不保证超时或 Windows EPERM 时无残留，不替代完整门禁，也不构成集成或发布批准。未改文件、联网或再委派；不写成异厂商/异家族审查。
- 最新完整静态 bynqso0u8 已通过：git diff --check、TASK-0412 / TASK-0405 合同及 bun run check 均退出 0；5183 文件 lint 无修复，全部类型检查、架构守卫、407 个 Task 合同和索引一致，声明头 ratchet new=0。随后 fetch 确认 origin/dev 仍为 bf15534dd931998b510ada94d787df8e834d072d，且为当前 HEAD 的祖先；随后冻结候选运行第六批 bihx1rzms，test:changed 退出 1：quality 61 文件通过、3 失败，713 项通过、3 失败、5 项因集成初始化失败未执行（共 721），220.71 秒。runner 两项及 git 一项触及原 5000ms，integrate beforeAll 触及原 10000ms、afterAll 另有 EPERM；未进入包测试。发布 workflow 本批不在失败文件中，但整个待推批次仍红，不将静态或定向绿当作完整验收；未提交、集成、推送或发布。

## 本轮工程证据（2026-10-29）

- Linux 默认分发路径回归先红：旧 verifier 拒绝 /opt/Allstr ai/OpenForge，错误与远端 fatal 相同；修复后 Node 合同 6/6 通过，覆盖两档品牌、跨品牌与身份/缺文件拒绝。未改变实际安装目录；容器检查引用相同合同并保持 apt/dnf 安装、可执行与 marker 检查。
- 流水线现有 Linux 合同 27/27 通过；新增发布身份接入回归在旧 workflow 真实失败（缺少守卫），再接入 prepare、R2 稳定上传前及 GitHub Release 操作/制品上传前。
- 新脚本每次查询 origin，校验完整候选 SHA 与 checkout HEAD；区分远端缺 tag 和查询失败，支持 annotated tag 的 peeled commit。测试使用新建本地 bare remote，覆盖创建 tag、复核、异 SHA 拒绝、陈旧本地 tag、查询失败及入口环境参数；仅夹具产生本地提交和 tag，未操作真实发布仓库。
- 身份脚本与 workflow 定向合计 2 文件 47 例通过。串行打包测试 129/129、quality 62 文件 659/659、Desktop 打包合同均通过。
- test:quality 使用显式列表；新增入口防遗漏合同先红，再补根 package.json 接线，两文件当时 48/48 通过，不改依赖或版本。首次完整批次的 quality 段实际执行 63 文件 679 项，通过；该结果早于后续 draft 回归扩展。
- BUG-0158 有效 red：缺 tag 与旧目标 draft 的实际 workflow shell 退出 0 并完成上传/公开，拒绝断言失败。最终上传前接入 --github-draft 后，身份及 workflow 两文件 69/69 通过，覆盖同候选恢复、新建、上传失败重试、R2 附属发布及元数据拒绝；Windows gh 夹具进程边界已修正，保留真实 Git。
- 独立只读评审 a5f933ea5c91b0e1a 初审发现该 P1；续接复审确认缺口已补齐，未发现新增实质缺陷，Linux 路径合同亦未见实质问题。评审未运行测试，不替代工程验收。
- 首次完整批次 test:changed=1、check=1，宿主 rg、Desktop 超时及格式错误与定向复验见 TASK-0412。Biome 定向实际修正 workflow 测试 1 文件，diff --check 无错误。第三次完整批次 quality 63 文件、700 项通过，完整 check 通过，包测试完整执行但 Desktop 两个市场超时使 test:changed=1；TASK-0414 已确认并修复 fixture 网络隔离缺口，定向绿不替代稳定候选完整复验。真实 Linux 安装、四平台新 run 与发布未执行，既有 0.1.3 源码身份阻塞保持。

- 2026-10-30 交付候选复验 b3z2ngpmc：test:desktop:packaging 129/129 通过，verify:desktop:contracts 报 desktop-packaging-contract ok，整链退出 0。该次为本地打包脚本与静态合同，不是实际 deb/rpm 构建、Ubuntu/Fedora 安装、远端矩阵或发布；完整行为门禁仍由 TASK-0412 组合验收。

## 历史范围

### 并发评估

- 结论：支持（串行执行）。
- 执行方式：serial。
- 前置依赖：`main` 已包含 TASK-0404 交付与 Actions 同步；工作区干净。
- 冲突文件/独占路径：`.github/workflows/desktop-release.yml`、`scripts/quality/desktop-release-workflow.test.mjs`、`.github/release-notes`、`project/decisions/waivers`。
- Branch：`main`；Worktree：`C:/Users/xquan/Desktop/open-forge`。
- 集成负责人：当前会话 Coordinator。
- 集成顺序：先落显式开关、测试、豁免与说明，再运行 `publish 0.1.3`。

### 做

- 在 `desktop-release` workflow 增加显式开关 `VETTA_ALLOW_UNSIGNED_RELEASE`：仅当其为 `true` 且发布构建缺签名凭据时，才把 macOS leg 纳入矩阵并产出未签名制品。
- 保留默认行为：变量未设置时继续剔除 macOS 或拒绝无凭据发布。
- 增加 workflow 合同测试，登记 `WAIVER-0008`，并在 0.1.3 发布说明中明示未签名/未公证。
- 用 `node scripts/release-desktop.mjs publish 0.1.3 --confirm-publish` 原子提交发布说明日期、打 tag 并推送，随后验收真实 workflow 与 GitHub pre-release 制品。

### 不做

- 不修改产品代码、版本号或已发布版本说明。
- 不发布 R2/商业/稳定渠道；不宣称签名或公证通过。
- 不移动、复用或强推已存在的 tag；不绕过 tag 不可变与质量门禁。
- 不在仓库、脚本、日志或回执中写入任何签名/公证凭据。

## Given / When / Then

- Given 无签名凭据、`VETTA_ALLOW_UNSIGNED_RELEASE=true`；When 发布 0.1.3；Then workflow 纳入 macOS leg、产出未签名制品、发布说明标注未签名，并发布 GitHub pre-release。
- Given 无签名凭据、变量未设置；When 发布构建；Then 默认行为保持不变（剔除 macOS 或拒绝无凭据发布）。
- Given 发布失败；When 检查；Then 不宣称发布成功，保留失败证据与 tag 现状，按实际结果处理。

## 必须保持

- 默认签名发布门禁不被静默削弱；未签名必须是显式、可审计、可撤销的例外。
- tag 与版本事实源一致；发布正文即 Release 正文；已发布版本说明只读。
- 不同时发布 R2/商业渠道；凭据不入 Git、命令参数、日志或回执。

## 测试与验证

- 定向测试：`desktop-release-workflow.test.mjs`、`bun run check`、`node scripts/release/release-notes.mjs --check`、`check-waivers`。
- 用户流程：`publish 0.1.3 --confirm-publish` → tag 触发 `desktop-release` → GitHub pre-release 可下载。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审（显式开关与默认路径分离）。
- 集成：pending；发布提交与 tag 由脚本原子完成。
- 人工功能验收：待验收；以真实 workflow 与 Release 回执为准。
- 发布：用户已授权（2026-10-26），执行结果待回填。

## 功能验收包

- 入口与前置条件：`main` 干净、`VETTA_ALLOW_UNSIGNED_RELEASE=true`、无签名 secrets。
- 操作步骤：`node scripts/release-desktop.mjs publish 0.1.3 --confirm-publish`。
- 预期行为与最终产物：`v0.1.3` tag、GitHub pre-release、Windows/Linux/macOS 未签名制品、发布说明含未签名警告。
- 限制：macOS 未签名/未公证；默认签名门禁保持不变；R2 不发布。

## 交付记录

- 已完成 intake 与用户授权；显式未签名开关、发布断言边界、WAIVER-0008 与发布说明警告已落盘。
- 2026-10-26 发布尝试：tag `v0.1.3` 与 release 提交 d859f3a7a 已推送；tag run 40279526764 在 `build windows` 失败——受控沙盒 exe 缺失、清单 SHA 为 null，打包按设计阻断。用户选择本次跳过 Windows 沙盒（WAIVER-0009）。
- 历史恢复设想（2026-10-29 已判失效，不可执行）：从 main 以 stable dispatch 重建到既有 v0.1.3。原先假定 tag 后仅发布文档变化，但当前候选相对标签在 apps/desktop/src 与 packages 已有 123 个源码文件变化；--target 不会重绑既有标签，披露差异也不能满足制品与标签源码一致。
- dispatch run 40282832623：四个平台构建全部成功（Windows 已跳过沙盒检查）；四个 verify 失败——Linux/macOS 的 updater 元数据引用连字符产物名而磁盘文件保留品牌空格，Windows 的 checkpoint 还原用带盘符 `-C` 失败。已修：构建后统一把 release 顶层产物文件空格改连字符（含回归测试），Windows 改为 `cd` 后解压。
- dispatch run 40288854205：构建仍全部成功；verify 暴露三处——Windows 改名后 `latest.yml` 仍引用空格旧名，Linux 包检查子进程 `maxBuffer` 溢出，macOS/Linux packaged E2E 写死 `Open Forge` 品牌路径。已修：改名时同步改写 `latest*.yml`、包检查提升到 64MB、E2E 按实际 `.app`/`.AppImage` 发现产物。
- dispatch run 40294640871：macOS 两个 verify 已通过；Windows supplemental 包校验写死 `Open Forge`、Linux deb/rpm 包名 `vetta` 与校验期望 `openforge` 不一致。已修：Windows MSI/ZIP 改用与构建一致的品牌 slug，Linux 显式 `packageName=openforge`。
- dispatch run 40300005479：quality 在 `test:packaging` 失败——R2 发布测试 fixture 仍写死 `Open Forge` 的 MSI/ZIP 名。已改用 `windowsSupplementalArtifactNames` 同源命名；`test:packaging` 127 例通过。
- dispatch run 40301036921：quality 通过；四平台构建全部因 electron-builder 配置校验失败——`linux.packageName` 不是 `LinuxConfiguration` 的合法键。已改为 `deb.packageName` / `rpm.packageName`（schema 已核对）。
- dispatch run 40303791764（head 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d）：四平台构建、Windows 与两档 macOS verify 通过；Linux updater 文件通过，随后报 Debian package is missing /opt/Open Forge/OpenForge。容器安装、Linux packaged E2E 及发布未执行。依赖安装早期 node-gyp 报错已由重试恢复，不是最终 fatal。
- 只读调查 aec9c6e768f997ce7 已回包：同版本 electron-builder 的 FpmTarget 使用 /opt/${appInfo.sanitizedProductName}，默认 Allstr ai；verifier、workflow 和 fixture 同源写死旧目录。未下载远端 deb/rpm，目录依据生产配置与打包器调用链推导；失败日志保存在 ignored delivery-repair cache。
- 2026-10-29：Linux 路径修复及发布身份守卫进入实施；工程、独立评审、组合门禁与新远端 run 待完成。既有标签不可移动，当前候选发布 0.1.3 被源码身份差异阻断。
