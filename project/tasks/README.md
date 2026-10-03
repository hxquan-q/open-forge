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
| `TASK-0196` | `in_progress` | PLAN-0014 | 存量 Draft 批次（15 项：0042/0167/0166/0039/0154/0155/0157/0158/0159/0051/0038/0152/0156/0160 剩余/0161）；单专用工作树内部串行，逐项验证后推 origin/dev，批末合入本地 main；不做视觉校验。 |
| `TASK-0042` | `verifying` | PLAN-0002 | suspend/lock-screen 一次性 working-set trim + 前后峰谷观测已落地（7 例定向+impact 绿，实机峰谷差待用户验收）；TASK-0196 批次工作树。 |
| `TASK-0185` | `verifying` | — | 队列消费用户消息被渲染到回复末尾（BUG-0068/BUG-0021 变体）已修：五处尾部落位改因果锚定；定向 96/全域 956/impact 493/check 全绿，待人工验收。 |
| `TASK-0181` | `in_progress` | — | 本机字体偏好：两项选择、主题持久化和终端跟随；独立 Worktree 实施。 |
| `TASK-0180` | `verifying` | — | desktop-packaged 合同 job 补安装+Bun 装配（BUG-0064）；CI 合同 job 已绿（37059120967）。 |
| `TASK-0184` | `ready` | — | docs-site 构建 Turbopack 71 错修复（BUG-0067）；仅建档待诊。 |
| `TASK-0183` | `ready` | — | packaged E2E CI 连续红修复（BUG-0066）；合同/堆 OOM 已修后遗留的 E2E 分型。 |
| `TASK-0182` | `verifying` | — | macOS worktree 用例路径比较已修（BUG-0065：/var 符号链接）；CI 复跑待证。 |
| `TASK-0179` | `verifying` | — | desktop tsc 堆上限经包内脚本提升（BUG-0063）；CI check job 已复跑绿（37059120973）。 |
| `TASK-0178` | `verifying` | PLAN-0014 | P1 安全：撤销主机密钥必须拒绝；已实施提交 8b63e0d02，定向/impact/changed/check 全绿，待人工验收。 |
| `TASK-0175` | `verifying` | PLAN-0014 | 原子写入完整字节与失败清理合同；已实施提交 521a1eac9，toolkit 35/35 与批次门禁全绿，待人工验收。 |
| `TASK-0173` | `verifying` | PLAN-0014 | RPC 超时分阶段诊断已落地（VERIFY-0015 六轮对照未复现，BUG-0059 保持 investigating）；待人工验收。 |
| `TASK-0174` | `verifying` | PLAN-0014 | ssh-transport 标准测试入口 + 选择器防回退断言已落地；入口/quality/impact 实测绿，三平台 CI 证据待推送后产生。 |
| `TASK-0176` | `done` | — | 三组串行基线与瓶颈证据已交付（VERIFY-0016：desktop 装配型、cli 进程型）；全部候选否决、默认策略不变——分析型任务按完成标准收口。 |
| `TASK-0177` | `done` | PLAN-0014 | SSH README 平台能力/安全边界按现行实现对齐（含 TASK-0174 落地后的真实测试入口）；纯文档任务按完成标准收口。 |
| `TASK-0172` | `done` | PLAN-0014 | 集成后审查：新建 0173～0178 六项、细化 0168/0169、登记三个隔离复现 Bug；只完成规划。 |
| `TASK-0171` | `done` | PLAN-0014 | 主树全部已有改动与七个 Task 分支已提交/集成并推送 origin/dev；最终 41 包、483 质量测试与完整 check 通过，原 Worktree 保留。 |
| `TASK-0170` | `done` | PLAN-0014 | 来源 769f31bc3 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0163` | `verifying` | PLAN-0014 | 来源 3dda219e9 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0162` | `verifying` | PLAN-0014 | 来源 6cb373dde 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0150` | `verifying` | PLAN-0014 | 来源 222de8813 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0149` | `verifying` | PLAN-0014 | 来源 7a2a5ce50 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0148` | `done` | PLAN-0014 | 来源 1020b7c59 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0165` | `verifying` | — | 主树实现已提交 925868a08；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0164` | `verifying` | PLAN-0004 | 主树实现已提交 a739e62b2；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0146` | `done` | — | 修复 plugin-vite 首次导入未收敛便关闭的挂起，保留原超时与断言。 |
| `TASK-0145` | `done` | — | 补齐 plugin-vite 的 React 测试依赖，验证当前批次后推 origin/dev。 |
| `TASK-0143` | `done` | PLAN-0004 | Claude 入口去重，保留专属提交约束并设置体积门禁。 |
| `TASK-0144` | `done` | PLAN-0004 | 113 个术语按领域分册，保留根索引与旧标题锚点。 |
| `TASK-0142` | `done` | PLAN-0004 | 根目录保守清理：废弃脚本、重复 banner、空目录与工作区品牌。 |
| `TASK-0140` | `verifying` | PLAN-0004 | 根规则拆分，硬边界前置与 8 KiB 常驻预算。 |
| `TASK-0141` | `verifying` | PLAN-0004 | 移除 Devin 镜像及同步路径，保留单一权威入口。 |
| `TASK-0139` | `verifying` | PLAN-0004 | 审核修复：交付判据、发布说明、规则去重与集成状态。 |
| `TASK-0138` | `verifying` | PLAN-0004 | 审核修复：Windows 链接占位、引用与 frontmatter 扫描覆盖。 |
| `TASK-0137` | `verifying` | PLAN-0004 | 开发 Skills 更名与描述统一为 Open Forge，迁移引用并验证。 |
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
