<!-- Copyright The Open Forge contributors. -->
# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。并行执行时必须同时遵守 [`../collaboration/README.md`](../collaboration/README.md)。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

## 状态

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

状态和实现/验证事实以每个 Task 文件的 frontmatter 与交付记录为准；本 README 的当前焦点表是导航副本，由 Coordinator 同步维护，并由 `bun run check` 校验状态一致性。

## 当前执行焦点

| Task ID | 状态 | Plan | 焦点 / 协调说明 |
|---|---|---|---|
| `TASK-0218` | `verifying` | — | 修复 BUG-0080：黑盒 shell 白名单加引号感知元字符扫描（复合命令/替换/重定向拦、引号内 URL 放行、未闭合引号 fail-safe）、读域拒 `..` 与绝对路径；红测 3 项先行转绿，fence-judge 78 项/包内 131 项/impact 89 项/完整 check 全绿；写域 `..` 等既有面登记 ISSUE-0031。 |
| `TASK-0217` | `verifying` | — | allstar-coding 黑盒环节升级（v0.5.2，包版本 0.3.2）：通道探测→三态分流→文档 v2→可选自测→用户核验；围栏为 blackbox 角色加窄读域（docs/ac/ 前缀、禁目录发现类）与 shell 白名单（仅 agent-browser）；fence-judge 74 项、包内 53 项、impact 127 项与完整 check 全绿；技能合同面待实机验收。白名单/读域两个绕过口由 TASK-0218 修复。 |
| `TASK-0215` | `verifying` | — | BUG-0079：按实际工具生成终端能力指引，区分 MCP 检索与内置命令；定向、impact、check 通过，Desktop 全量 4909 通过；CLI 首轮 3 启动超时，整文件复跑 14/14；本地 main，真实模型效果待验收。 |
| `TASK-0207` | `verifying` | PLAN-0006 | 修复 BUG-0078：`browser_tab` 的 `elementRef` 同时接受 snapshot 打印的编码串与对象，校验前解码为对象 ref，对外 Schema 也公布两种形式；定向 14 项/impact 119 项/desktop 12 项/check 全绿；待实机验收。 |
| `TASK-0208` | `verifying` | — | 集成 origin/chenxvhua 的 allstar-coding v0.4（ac-fence 事中拦截层）；先建记录再合并，待门禁与推送。 |
| `TASK-0209` | `done` | PLAN-0016 | 发布状态可判定：日期只在 publish 写入（已写入当天日期），`release-notes.mjs --check` 断言文件名/标题/manifest 版本一致、无 tag 时必须为「待定」、已发布与 tag 逐字一致；政策入 delivery 规则与 release-notes README；test:quality 497 项与完整 check 全绿（提交 53f674121）。 |
| `TASK-0210` | `done` | PLAN-0016 | 清理上游锁步发版残留：删除根 `version:patch/minor/major/set` 四条未受守卫脚本，补断言禁止其回归；`scripts/sync-versions.js` 因受守卫的 `release.mjs` 仍调用而保留；test:quality 498 项与完整 check 全绿（提交 29e429b21）。 |
| `TASK-0211` | `done` | PLAN-0016 | 发版人工门与仓库设置清单成文：实测 desktop-production 无 protection rules、desktop-test 未创建、rulesets 为空、main 未保护，已把人工门位置与待配项写进 runbook，阶段结论回填 PLAN-0016；完整 check 全绿（提交 ed4c31afb）。 |
| `TASK-0212` | `done` | PLAN-0016 | 发布说明碎片化已交付：每任务写 `fragments/v<版本>/<slug>.md`，`--assemble` 汇编、`--check` 校验一致性；无碎片为纯 no-op（实现中实测到一次清空，已恢复并加回归测试）；test:quality 506 项与完整 check 全绿（提交 a70bba348）。 |
| `TASK-0213` | `done` | PLAN-0016 | 仓库侧发布门禁：`v*` tag 的删除与改写 ruleset 已落地（id 24519581，管理员 bypass，不影响打 tag）；`desktop-test` 已创建；两个环境的 required reviewers 被平台以 422 拒绝（计划不支持），故可用人工门为 tag ruleset 加本地 publish。完整 check 全绿（提交 5fc62a929）。 |
| `TASK-0214` | `done` | — | 台账收口：闭合 7 个内部任务（0179/0180/0209–0213，均无用户可观察行为变化且既定标准已实际执行通过），其余 72 个 verifying 保留交用户验收；并记录两处台账缺口（16 个 verifying 不在焦点表、看似内部但缺证据的候选未闭合）。 |
| `TASK-0216` | `done` | — | 分层验收（用户决策）：合同面 17 个按工程证据闭合并注明授权依据（提交 272808ea0）；行为面 53 个整理成 VERIFY-0017 交用户验收；0183/0184 因 CI 受预算阻塞单独标注。 |
| `TASK-0206` | `done` | PLAN-0014 | feed/attach 第二片：`SessionFacade.attach` 一次同步步骤内订阅 + 运行中回合重放 + 历史快照（`SessionAttachment`），保留本仓 4096 有界回放，不引入上游无界回合缓冲；红绿/定向 10/10/impact 115 项/完整 check 全绿；无直接 UI，消费端随 IPC/desktop 后续片验收。 |
| `TASK-0205` | `done` | PLAN-0014 | feed/attach 底座第一片：快照暴露运行中回合身份（currentTurnId）+ 重放缓冲收录本轮工具事件（保留 4096 有界）；红绿/impact/完整 check 绿；工具状态切回即时可见待实机验收，currentTurnId 消费随 IPC/desktop 后续片。 |
| `TASK-0204` | `done` | PLAN-0014 | 会话事件合同清退死类型（message.final/toolcall.args，查证无生产者）+ 生产者登记表（23 类型 satisfies 穷尽）+ 墓碑守卫入 check:guards；定向/impact/完整 check 全绿，行为零变化；内部治理按完成标准收口。 |
| `TASK-0203` | `done` | — | 同步 cli-host 四个文件的精确工具清单断言到 TASK-0156 目标特性契约（get_goal/create_goal/update_goal 无条件贡献）；定向/完整 cli-host（230 项）/Desktop（4906 项）/impact/完整 check 全绿，零遮蔽；内部修复按完成标准收口（提交 76109c3ed）。 |
| `TASK-0202` | `done` | — | 台账修复：已按 frontmatter 补回 03ce0c378 丢失的八行；check-project-indexes 与完整 check 通过；内部台账修复按完成标准收口。 |
| `TASK-0201` | `done` | — | 修复 BUG-0077：git preset 显式声明 Vitest+jsdom+RTL 测试栈；标准检出包级 62 例全绿（提交 235b33456）；内部修复按完成标准收口。 |
| `TASK-0197` | `in_progress` | PLAN-0015 | Harness 能力吸收批次：有界工具并发（0198）已推 dev（a163b58b1）并合入本地 main（105dca3f2）；停止点复验完成——CLI 启动类失败归因负载（五文件 39/39 转绿）且 Desktop 完整范围 4906 项通过；剩余收口项为慢消费者重同步；WAIVER-0004 至 2026-10-10 到期，阶段 4（慢消费者重同步）未开工且缺前置压力/保真基线，批次暂不能标 done。 |
| `TASK-0198` | `done` | PLAN-0015 | 有界工具并发与独占屏障；实现 e6e05f5a3 已推 dev（a163b58b1）并合入 main（105dca3f2）；跨包 CLI 失败挂 WAIVER-0004（至 2026-10-10），待人工验收。 |
| `TASK-0195` | `blocked` | PLAN-0015 | 保留兼容模型请求前缀的摘要生成；实跑反证前缀假设与既有防注入摘要边界冲突（非产品 Bug），blocked 待重新设计或用户决策。 |
| `TASK-0196` | `done` | PLAN-0014 | 存量 Draft 批次（15 项）已全部逐项验证并推 origin/dev（0356daf39），批末合入本地 main（adeaa5294）；待人工验收。 |
| `TASK-0200` | `verifying` | PLAN-0014 | 0157/0158 交付审计完成（网络/沙箱/权限面逐字对照上游全数 retain）；两项收尾已实施（af7a9f5a9 重挂修复、501a935da 隔离 e2e 补跑、25467b0d2）并推 origin/dev，待人工验收。 |
| `TASK-0039` | `verifying` | PLAN-0002 | webview 剩余口子收口：插件 pinned 页签改为有界 LRU（非活动上限 3、驱逐可逆、不占用 warm 预算）；面板收起卸载核实为已有等价实现（retain + 回归验证）；已推 origin/dev（2de27ed59），待人工验收。 |
| `TASK-0159` | `verifying` | PLAN-0014 | Windows 沙盒制品完整性：受控清单（3 个 exe + sha256 + 来源提交）钉死、缺失/不一致默认阻断打包（仅显式 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` 降级为告警）；不引入外部下载源；已推 origin/dev（1c1a50b9e），待人工验收。 |
| `TASK-0042` | `verifying` | PLAN-0002 | suspend/lock-screen 一次性 working-set trim + 前后峰谷观测已落地（7 例定向+impact 绿，实机峰谷差待用户验收）；随 TASK-0196 批次推 dev（ca6c9df9d）合入 main。 |
| `TASK-0199` | `done` | PLAN-0014 | 会话目录回归隔离初始化；保持原超时与所有断言，TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0151` | `verifying` | PLAN-0014 | 配置读改写统一串行事务并随 TASK-0187 批次合入 main；8 文件/52 定向测试通过，待人工验收。 |
| `TASK-0187` | `done` | PLAN-0014 | 稳定性首批（0188–0193/0151/0199）已合入本地 main（03ce0c378）并推 origin/dev（e242e5ddf）；changed 的 CLI 失败经合并前后基线比对归属存量环境问题（BUG-0059 面），待人工验收。 |
| `TASK-0188` | `verifying` | PLAN-0014 | 流式回复用量引用稳定性；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0189` | `verifying` | PLAN-0014 | 工具调用期间回复保持进行中；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0190` | `verifying` | PLAN-0014 | 恢复成功的回合清除错误终态；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0191` | `verifying` | PLAN-0014 | 滚动记忆只保存用户停留位置；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0192` | `verifying` | PLAN-0014 | 开发主进程缓存覆盖实际打包输入；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0193` | `verifying` | PLAN-0014 | Git 历史特殊路径与重命名正确性；TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0185` | `verifying` | — | 队列消费用户消息被渲染到回复末尾（BUG-0068/BUG-0021 变体）已修：五处尾部落位改因果锚定；定向 96/全域 956/impact 493/check 全绿，待人工验收。 |
| `TASK-0186` | `verifying` | — | Office 按格式加载与 PDF URL 生命周期已验证并合入本地 main（559a8d79d）；未做实机 RAM 对照，待人工验收。 |
| `TASK-0181` | `verifying` | — | 本机字体偏好已实现并合入本地 main（75c5ae2df）；定向 30 项、Desktop 全包 4680 项及完整 check 通过，待人工验收。 |
| `TASK-0180` | `done` | — | desktop-packaged 合同 job 补安装+Bun 装配（BUG-0064）；CI 合同 job 已绿（37059120967）。 |
| `TASK-0184` | `verifying` | — | docs-site 构建 Turbopack 报错修复（BUG-0067）；已分型：fumadocs stringifier 丢 attention/peek 致 RangeError（内容含 `**`/`*` 即触发）+ 4 处 HTML 注释在 MDX 非法；本机可复现，待实施；CI 复跑受 ISSUE-0029 阻。 |
| `TASK-0183` | `verifying` | — | packaged E2E CI 连续红修复（BUG-0066）；已分型：`verify:staged-deps --staging` 三平台并集误报本平台 prebuild，E2E 未跑到；待实施；CI 复跑受 ISSUE-0029 阻。 |
| `TASK-0182` | `done` | — | macOS worktree 用例路径比较已修（BUG-0065：/var 符号链接）；CI 复跑待证。 |
| `TASK-0179` | `done` | — | desktop tsc 堆上限经包内脚本提升（BUG-0063）；CI check job 已复跑绿（37059120973）。 |
| `TASK-0178` | `verifying` | PLAN-0014 | P1 安全：撤销主机密钥必须拒绝；已实施提交 8b63e0d02，定向/impact/changed/check 全绿，待人工验收。 |
| `TASK-0175` | `done` | PLAN-0014 | 原子写入完整字节与失败清理合同；已实施提交 521a1eac9，toolkit 35/35 与批次门禁全绿，待人工验收。 |
| `TASK-0173` | `done` | PLAN-0014 | RPC 超时分阶段诊断已落地（VERIFY-0015 六轮对照未复现，BUG-0059 保持 investigating）；待人工验收。 |
| `TASK-0174` | `done` | PLAN-0014 | ssh-transport 标准测试入口 + 选择器防回退断言已落地；入口/quality/impact 实测绿，三平台 CI 证据待推送后产生。 |
| `TASK-0176` | `done` | — | 三组串行基线与瓶颈证据已交付（VERIFY-0016：desktop 装配型、cli 进程型）；全部候选否决、默认策略不变——分析型任务按完成标准收口。 |
| `TASK-0177` | `done` | PLAN-0014 | SSH README 平台能力/安全边界按现行实现对齐（含 TASK-0174 落地后的真实测试入口）；纯文档任务按完成标准收口。 |
| `TASK-0172` | `done` | PLAN-0014 | 集成后审查：新建 0173～0178 六项、细化 0168/0169、登记三个隔离复现 Bug；只完成规划。 |
| `TASK-0171` | `done` | PLAN-0014 | 主树全部已有改动与七个 Task 分支已提交/集成并推送 origin/dev；最终 41 包、483 质量测试与完整 check 通过，原 Worktree 保留。 |
| `TASK-0170` | `done` | PLAN-0014 | 来源 769f31bc3 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0163` | `verifying` | PLAN-0014 | 来源 3dda219e9 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0162` | `verifying` | PLAN-0014 | 来源 6cb373dde 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0150` | `done` | PLAN-0014 | 来源 222de8813 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0149` | `verifying` | PLAN-0014 | 来源 7a2a5ce50 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0148` | `done` | PLAN-0014 | 来源 1020b7c59 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0165` | `verifying` | — | 主树实现已提交 925868a08；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0164` | `done` | PLAN-0004 | 主树实现已提交 a739e62b2；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0146` | `done` | — | 修复 plugin-vite 首次导入未收敛便关闭的挂起，保留原超时与断言。 |
| `TASK-0145` | `done` | — | 补齐 plugin-vite 的 React 测试依赖，验证当前批次后推 origin/dev。 |
| `TASK-0143` | `done` | PLAN-0004 | Claude 入口去重，保留专属提交约束并设置体积门禁。 |
| `TASK-0144` | `done` | PLAN-0004 | 113 个术语按领域分册，保留根索引与旧标题锚点。 |
| `TASK-0142` | `done` | PLAN-0004 | 根目录保守清理：废弃脚本、重复 banner、空目录与工作区品牌。 |
| `TASK-0140` | `done` | PLAN-0004 | 根规则拆分，硬边界前置与 8 KiB 常驻预算。 |
| `TASK-0141` | `done` | PLAN-0004 | 移除 Devin 镜像及同步路径，保留单一权威入口。 |
| `TASK-0139` | `done` | PLAN-0004 | 审核修复：交付判据、发布说明、规则去重与集成状态。 |
| `TASK-0138` | `done` | PLAN-0004 | 审核修复：Windows 链接占位、引用与 frontmatter 扫描覆盖。 |
| `TASK-0137` | `done` | PLAN-0004 | 开发 Skills 更名与描述统一为 Open Forge，迁移引用并验证。 |
| `TASK-0136` | `verifying` | PLAN-0004 | 统一开发入口与双层验收已实现；449 例及完整 check 通过，待新会话功能验收，未推送。 |
| `TASK-0135` | `done` | — | 会话归档（对标 Cursor agent 对话归档）：侧栏右键归档直接对话与项目会话，设置「已归档」页重组为项目/会话双分节，支持取消归档与永久删除；三批提交已落地并通过归档族 43 例与门禁。 |
| `TASK-0130` | `verifying` | — | 修复 BUG-0046：runtime zip 解压改走内置 safe-zip-extract，不再依赖外部 tar；已集成（`9d6981fac`），定向回归 9/1skip 通过，待人工 dev 冒烟复装 Node runtime。 |
| `TASK-0131` | `verifying` | — | 修复 BUG-0047：stdout pipe 断开时 console transport 熔断降级，切断 EPIPE 日志风暴；已集成（`66c7ee464`），定向回归 4 例通过，待人工断 pipe 冒烟。 |
| `TASK-0132` | `verifying` | — | 修复 BUG-0048：ResizeObserver 噪音过滤放宽 sourceId 限制覆盖 dev 形态（判定下沉 logger/renderer-console-policy.ts）；已集成（`94d07c6df`），定向回归 7 例通过，待 dev 拖分屏冒烟。 |
| `TASK-0133` | `done` | — | 修复 BUG-0049：win32 下新增 ssh2 纯 JS 传输实现（多路复用 Client 替代 ControlMaster），含 known_hosts 校验与提示桥接；独立 Worktree。 |
| `TASK-0129` | `done` | — | 数据库问数与分析：内置技能、只读汇总分析脚本与分发/画布合同已落地；临时 SQLite 追问流程、影响包测试及完整门禁通过，未作真实模型评估。 |
| `TASK-0128` | `done` | — | 对话预算审计 + BUG-0045 预压缩缓存修复：历史只追加时复用已完成摘要（isPrefireCacheValid 唯一前缀规则），定向回归、影响包与全量门禁通过；发布说明归入 v0.1.2。 |
| `TASK-0027` | `done` | `PLAN-0001` | Plugin Artifact Renderer 注册表；SDK 合同（TASK-0068）与 Desktop 宿主接线已落地并通过合同/集成测试收口。 |
| `TASK-0025` | `verifying` | `PLAN-0001` | Work 本地研究纵切落地：显式 root 本地来源扫描（runtime-knowledge）+ `research_scope` 工具与引用清单（coding-agent）+ Work 来源面板「本地研究」入口与产物来源复查（Desktop）；缺真实 Desktop 端到端冒烟（VERIFY-0012）。 |
| `TASK-0026` | `verifying` | `PLAN-0001` | Work 数据分析纵切落地：只读数据集剖析（runtime-node/dataset：CSV/TSV/JSON/Excel 画像+问题行+缺列+取消）+ `dataset_profile` 工具条件注册 + Work 数据集节与 `dataset`/`analysis` 产物来源复查；缺真实 Desktop 冒烟（VERIFY-0012）。 |
| `TASK-0050` | `verifying` | `PLAN-0002` | transcript 窗口化第 2 步（`beforeEntry` 游标分页）三阶段全落地：Main 页合同、viewer 增量订阅、renderer 窗口化（上滚翻页/尾页刷新/整窗重置/导出排空）+ 乐观气泡尾对齐；缺真实 Desktop 大历史冒烟。 |
| `TASK-0107` | `verifying` | `PLAN-0010` | 后台进程统一健康记账（ProcessRoleContract + crash/restart/pid 归因入 perf 快照与诊断包）+ unresponsive JS 栈采样已落地并过定向测试；缺真实 Desktop 上 kill sidecar/模拟 unresponsive 的冒烟证据。 |
| `TASK-0072` | `verifying` | `PLAN-0006` | WebContentsView 迁移三阶段落地：main 宿主+IPC、renderer 占位矩形切换、ADR-0134；遮挡取舍（liveEdit 停靠条/加载徽标入工具栏/拖拽指针穿透）已定型；缺真实 Desktop 冒烟。 |
| `TASK-0045` | `done` | `PLAN-0003` | CLI/IM/MCP/插件外显身份迁移完成（CLI 命令 `openforge` 直接切换、IM 预填名/Signal 设备名/MCP client 名/插件 author/产品 UA、`openforge-serv` 代号）；解锁 `TASK-0049` 复核关闭 → `TASK-0047`/`TASK-0048`。 |
| `TASK-0122` | `verifying` | `PLAN-0013` | 团队主控「分派后让出回合」提示词引导 + `team_wait_tasks` timeout 载荷瘦身已落地；量化效果待 TASK-0125 真实会话复跑。 |
| `TASK-0123` | `verifying` | `PLAN-0013` | 成员会话经会话级函数源收窄隐藏 `browser_tab`（无 WebView 后端不再广告必失败工具）；协调会话不变，真实团队会话复核待定。 |
| `TASK-0124` | `done` | `PLAN-0013` | 团队会话阶段化进度展示；serial，依赖 TASK-0122 回合语义落地后细化设计。 |
| `TASK-0125` | `blocked` | `PLAN-0013` | rebase 上游+阶段 1 后同任务复跑量化对比（Verification 收口）；depends_on TASK-0122，需 commit 887017560 与真实 ~45min 团队会话复跑。 |
| `TASK-0126` | `done` | `PLAN-0013` | 团队会话预算可视化（ISSUE-0028 候选 C：成员/会话级 token·回合·时长只读投影）；serial，复用 TASK-0124 投影面。 |
| `TASK-0127` | `blocked` | — | 修改声明头存量缺失一次性 `--write` sweep（ISSUE-0023 A 阶段收尾）；等无并行代码线的安静窗口，执行后删除 ratchet 基线并关闭 WAIVER-0002。 |

### SSH 专项

| Task | 状态 | Plan | 当前焦点 |
|---|---|---|---|
| `TASK-0153` | `verifying` | PLAN-0014 | 来源 2e41db644 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0169` | `verifying` | PLAN-0014 | P1 生命周期：探测代次+失效处置已实施（BUG-0061 修复），定向 94/94 与批次门禁全绿，待人工验收。 |
| `TASK-0166` | `verifying` | `PLAN-0014` | SSH helper 三态分类+有界恢复+共享探测+分阶段计时已落地（205 例套件、impact 与完整 check 绿）；实机计时与验收待用户。 |
| `TASK-0167` | `verifying` | `PLAN-0014` | 远端文件名筛选全链已实施并推送 dev（cfeec25d1）；Go helper 行为回归待 POSIX，实机远端验收待用户。 |
| `TASK-0168` | `verifying` | PLAN-0014 | Windows 回环夹具（Git Bash）+ desktop 消费者解锁已落地；包级 195 通过，POSIX 专属用例显式门控；runtime-ssh 消费者与 resource-runtime 挂起待后续。 |

## Task 要求

- 必须关联 `REQ` 或 `BUG` / `ISSUE`；
- 说明 owner、范围、不做什么和依赖；
- 给出可观察的完成标准；
- 指定测试层级和验证命令；
- 完成后记录实际验证结果；
- 不把多个可独立回滚的 concern 塞进一个 Task；
- Task 状态变更时同步本节焦点表，状态必须来自 Task frontmatter，不推测下一项工作。

## 协作与集成

- `depends_on`、`conflicts_with` 和 `write_paths` / `exclusive_paths` 是并发与集成顺序合同；具体 DAG 以对应 Plan/Task 文件为准，不在此重复维护路线细节。
- 并行批次启动前运行 `bun run worktree:check --all`；检查报告 scope 冲突时先缩小范围或登记冲突，再创建 Worktree。
- `bun run worktree:status` 用于确认真实 Git Worktree 状态；若与 Task frontmatter 不一致，先找 Owner 核实，不移动、覆盖或清理可能含有工作的 Worktree。
- Task 与 Project 索引检查会由 `bun run check` 执行；集成前另运行 `bun run worktree:check --task TASK-xxxx`。
