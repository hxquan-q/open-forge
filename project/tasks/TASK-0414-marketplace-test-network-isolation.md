---
id: TASK-0414
type: task
status: verifying
priority: P0
owner: desktop/testing
requirement: REQ-0002
source: user-request; ISSUE-0035; TASK-0412 third delivery batch
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412, TASK-0405, TASK-0413]
related_issues: [ISSUE-0035]
related_bugs: [BUG-0159]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出任务分支串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [apps/desktop/src/main/abilities/open-marketplace/, apps/desktop/src/test/, docs/adr/0094-package-referenced-bundle-members.md, project/]
write_paths: [apps/desktop/src/main/abilities/open-marketplace/open-marketplace-service.test.ts, apps/desktop/src/main/abilities/open-marketplace/marketplace-bundle-service.test.ts, project/tasks/TASK-0414-marketplace-test-network-isolation.md, project/tasks/TASK-0412-desktop-delivery-baseline.md, project/tasks/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, project/bugs/BUG-0159-marketplace-test-manifest-network.md, project/bugs/README.md, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, .github/release-notes/fragments/v0.1.4/task-0414-marketplace-test-network-isolation.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-29
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 市场流程测试的 manifest 网络隔离

## 目标与范围

续接 TASK-0412 第三次完整批次的两个市场超时，以本地确定性拦截验证 fixture 是否越过已注入的归档替身、调用默认 fetch。确认隔离缺口后补 BUG-0159 与最小 fixture 修复；不先声称它是两个广域超时的唯一根因。TASK-0412 保留整体门禁责任，本任务只负责两个测试文件的外部网络边界。

已有 fetchManifest 注入点足够，直接修正 fixture，不重构生产服务或新增依赖。生产安装前 manifest 检查、离线缓存回退、安装身份、禁用状态、安全解包和失败恢复全部保持。

独立评审 ae64d6a217f85b1bc 指出两个 list 缓存测试仅等待 manifest 请求开始，尚未等待后台响应处理和 state.json 读取完成，清理可能先于后台结束。已在测试侧以 deferred manifest 响应及真实公开 install 流程加入确定性收尾点，finally 释放响应并等待安装完成后，才进入目录清理和默认 fetch 断言；不读取私有字段、不修改生产生命周期 API、不延长超时。同一评审者已复核确认原 P2 已处置、未发现新实质问题；该发现是源码可构造时序，未声称已运行复现。

## 并发评估

串行实施、串行跑重型测试；当前任务分支没有并行实现 Worker，因此不另建 Worktree。两个测试文件及共享索引由 Coordinator 独占本轮写入；独立只读评审不改文件。与 CLI、Linux/发布修复组合后才能进入完整候选验收。

## Given / When / Then

- Given：临时归档和隔离 HOME，真实 OpenMarketplaceService、catalog、缓存及 bundle 技能安装器，未授权外网。
- When：兼容插件 refresh/install，MCP prepare，技能安装，或 bundle 连续安装、升级、缓存重载及损坏更新回退。
- Then：所有归档与 manifest 请求使用明确的本地成功/离线替身；任何遗漏到默认 fetch 的调用立即被记录并令测试失败，不依赖外网延时。
- Given：旧 fixture 仅注入 fetchArchive；When：运行上述流程并拦截默认 fetch；Then：取得针对外部依赖泄漏的有效 red，而非依赖收集错误或真实网络超时。
- Given：manifest 版本随归档升级；When：安装前检查或后台刷新；Then：manifest 替身返回对应版本，原安装、更新、回退断言仍成立。

## 必须保持

- 不改生产实现、公共 API、依赖、测试超时、skip 或 retry；不删除原断言，不把真实内部协作者全部 Mock。
- 全局 fetch 替身及测试环境在清理时恢复；网络调用即使被生产离线回退捕获，也必须由测试守卫报告。
- 不运行用户 Desktop、真实 Provider、真实 SSH 或用户状态目录；不发起真实市场请求。
- 两文件定向绿不替代整个待推批次；广域红时不集成推送，不移动 v0.1.3、不擅自选择新版本。

## 调查证据

- 第三次完整批次 b081j0xol：quality 700/700；Desktop 两项分别超时 5000ms、10000ms；test:changed=1、check=0。
- 两个完整文件原超时独立运行 36/36，通过耗时 20.17 秒；只证明该次未复现。
- 源码构造器对 fetchArchive、fetchManifest 分别默认到 fetch；install/prepareMcp 经 ensureSnapshotFresh 下载 manifest，生产下载上限 15000ms。只注入归档不能证明离线。
- 已以拒绝默认 fetch 的本地守卫取得有效 red：两个完整文件 5 失败、31 通过，7.64 秒。兼容插件安装、MCP 准备、MCP/plugin/bundle 列表后安装、active snapshot 技能安装、bundle 连续流程分别尝试 2/1/1/1/4 次 manifest 请求，共 9 次；全部在本地立即拒绝，afterEach 零调用断言捕获了被生产离线回退吞掉的请求错误。
- 缺陷已登记 BUG-0159；这确认 fixture 隔离缺口，不把它直接等同于第三次广域超时的唯一原因。
- .ua 图谱元数据为 2026-10-12、254796d870036f0d3e7c0bbb9a0a1a2cbd28448f；已检查 service 文件节点及 manager/catalog/schema/cache 一跳边，并查询该提交到 HEAD 的目标目录增量。测试节点未收录，当前源码与 ADR-0094 的真实连续流程是依据；未刷新图谱。

## 测试与验证

1. 先添加默认 fetch 的拒绝/调用守卫，运行两个完整文件取得明确 red；记录具体失败流程。
2. 确认后建立 Bug 记录，仅在外部 manifest 边界补替身；重跑两文件及目录相关常见流程。
3. bun run check:quick、独立只读代码评审；回写实际结果后稳定候选。独立只读评审 ae64d6a217f85b1bc 已完成初审及续接复审，范围仅两个测试文件及对应生产调用链，不改文件、Git 或运行测试；初审的后台清理 P2 已按公开流程同步收尾，复审未发现新实质问题。
4. TASK-0412 负责完整 bun run test:changed --base origin/dev 与 bun run check，命令级现成原生 rg PATH、VITEST_MAX_WORKERS=1，保留全部原测试设置。
5. 内部测试修复的说明仍按交付规则记录；WAIVER-0016 仅增加本轮暂存范围，不延长到期日或豁免其他门禁。

## 验收分层与验收包

工程验证：确定性 red 与最小 fixture 修复已完成；初次两文件 36/36（7.45 秒）、目录 152 项通过及 2 既有跳过（15.26 秒）。后台收尾修正后两文件再次 36/36（10.16 秒），目录 18 文件通过、1 既有跳过，152 项通过、2 既有跳过（24.14 秒），默认 fetch 零调用守卫均通过。收尾修正后 git diff --check、bun run check:quick 及 TASK-0414 定向 worktree 合同通过；第四批完整候选 test:changed=1/check=0，quality 四项原 5000ms 超时，未进入包测试；本修复后的广域仍未验收。技术评审：ae64d6a217f85b1bc 初审及复审已回收，原后台清理 P2 已处置，未发现新实质问题；只读评审未代跑测试，不证明完整候选通过或广域超时唯一根因。集成：pending。人工功能验收：不适用，本任务不改变产品行为，自动化连续流程不能冒充用户验收。发布：未执行；候选说明暂存不代表已选择 0.1.4。

复算入口：包内 bun run test -- src/main/abilities/open-marketplace/open-marketplace-service.test.ts src/main/abilities/open-marketplace/marketplace-bundle-service.test.ts。预期原流程全部通过且默认 fetch 零调用；失败日志应指出遗漏边界，不等待真实网络。

## 交付记录

已在两个完整文件加入默认 fetch 拒绝/调用守卫并取得有效 red，BUG-0159 已登记；五个流程的 manifest 替身已补齐，bundle 随当前 data 读取 manifest。独立评审发现的两个缓存用例后台清理竞态，已在测试侧加入可控响应、公开 install 同步和 finally 收尾，复审确认原 P2 已处置。修后两文件与市场目录再次通过；保留生产实现、真实连续安装/升级/禁用/缓存恢复/损坏回退、原断言与超时。内部说明已落入候选暂存，WAIVER-0016 范围纳入本任务，2026-11-05 到期日及其他门禁不变。quick、定向 worktree 合同与独立评审已完成；第四批完整 check 通过，但 quality 失败未进入包测试，完整行为门禁仍红。尚未提交、集成或推送。
