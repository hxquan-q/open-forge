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
| `TASK-0140` | `verifying` | PLAN-0004 | 根规则拆分，硬边界前置与 8 KiB 常驻预算。 |
| `TASK-0141` | `ready` | PLAN-0004 | 移除 Devin 镜像及同步路径，保留单一权威入口。 |
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
