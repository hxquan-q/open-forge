---
id: TASK-0481
type: task
status: verifying
priority: P2
owner: desktop
requirement: REQ-0030
source: user-request / workspace OBS-ALLSTAR-ATTR-001 candidate
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0430]
related_issues: []
related_bugs: [BUG-0182]
execution: serial
branch: task/TASK-0481-session-projection-test-contract
worktree: unassigned（主检出串行；基于现检出 chenxvhua，不切换陈旧 main）
base_commit: 2784c53ed7916aa77284696e9fea8338df244294
read_paths:
  - apps/desktop/src/renderer/domains/project/
  - apps/desktop/src/renderer/domains/allstar-dev/
  - apps/desktop/src/renderer/shared/store/
write_paths:
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx
  - project/tasks/TASK-0481-session-event-mode.md
  - project/tasks/README.md
  - project/bugs/BUG-0182-existing-session-event-mode.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.5/task-0481-session-event-mode.md
  - .github/release-notes/fragments/v0.1.5/task-0481-session-projection-test-contract.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-09
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# 已有会话行及时消费增量事件的明确模式

## 2026-11-17 续修合同：F09 测试与当前会话投影合同对齐

- 来源：工作区已讨论 Bug 台账 F09 覆盖缺口；用户授权按 `(难度升序, 严重程度降序)` 逐项串行修复。本切片难度 D1、严重程度 S2，为当前队列首项，不新增问题组。
- 当前基线：`73f21c28b4c0465e6a976ba86388cc3a1fb2572e`；用户明确不处理残留 main，从 `chenxvhua` 基线在主检出串行创建本地 `task/TASK-0481-session-projection-test-contract` 候选分支，满足Task守卫；不创建或操作远程分支。下文 11-09 分支/通过数字均为历史。
- 目标/不做：修正 `useProjects.sessionsChanged.test.tsx` 对 Allstar 会话对象旧形状的精确断言，保留明确模式事件与旧快照保护的行为证明；不修改生产实现、不恢复全部 M1 流程、不关闭历史归属个案。
- 基线发现与必要前置（2026-11-17）：首次目标测试 exit 1，9例中5失败/4通过，先因外部宿主API替身缺少 `agentTeams.listSidebarConversations` 而在真实Team hook挂载时报TypeError，尚不能将该结果记作kind断言失败。允许仅在同一指定测试文件补齐返回空团队历史的外部IPC替身，不mock内部hook/model；随后重新执行，区分夹具错误与预期投影形状红灯，再对齐kind字段。该前置不扩大生产行为写域。
- 输入/输出：当前 model 返回带 `kind: "chat"` 的会话投影 → 回归测试准确断言当前公开合同并继续验证即时归属及晚快照保护。
- Given 当前真实 Hook/store/Allstar model 装配，When 收到明确 coding/work 事件及在途旧列表响应，Then 类型标记与归属状态均符合当前合同，原回归断言不得被删除或弱化。
- 方案比较：直接对齐遗漏字段即可；没有生产职责或依赖问题，不为测试形状差异重构。
- 验证：先实跑现有目标测试记录失败基线，再修改断言，跑该测试与相关投影/Allstar/项目写流程定向用例；收尾完整 `bun run check`。按用户工作区规则不主动运行 impact/全量行为测试，需单独申请，不将未运行写成通过。测试临时根定向至授权工作区内。
- 协作：同一 Task 仅一个实现写入者；Coordinator 负责记录、索引、发布碎片与本地提交，实现后另派只读独立审查。不得并行实施后续 Bug。
- 写域补充：允许新增 `.github/release-notes/fragments/v0.1.5/task-0481-session-projection-test-contract.md`（内部测试维护）；不修改已发布说明或升版。
- 完成标准：定向回归与相关检查结果如实记录；必需全仓检查若被无关问题阻断则保留验证缺口，不降低门禁；历史用户个案/人工验收状态不变。

### 本切片实际验证（2026-11-17）

- 实现代理 `fix-f09` 仅修改目标测试3处：补齐外部Team历史API替身；两处精确相等期望补 `kind: "chat"`。没有生产实现修改、内部hook/model替换或行为断言删除。
- 首次原测试：exit 1，5失败/4通过，为缺Team API的fixture错误。仅补外部IPC替身后再次运行：exit 1，5失败/4通过，失败差异仅为实际投影新增 `kind: "chat"`，确认合同滞后红灯。
- 补字段后，在Desktop包内运行 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx src/renderer/domains/project/services/sidebar-conversation-projection.test.ts src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx src/renderer/domains/project/hooks/useProjects.projectWrites.test.tsx`：exit 0，4文件22/22（9+6+3+4）通过。当前Allstar model仅3例，不沿用历史27例计数。
- 原生实现子代理启动的3个后台验证任务均已回收；Coordinator已读取三份实际日志。TEMP/TMP指向授权工作区 `.bugfix-validation/tmp`，Desktop setup沿该临时根创建隔离VETTA_HOME。
- 独立审查：未参与实现的新上下文 `review-f09` 已完成只读实际候选审查，亲读三份红绿日志，确认外部IPC替身合法、内部装配与精确断言保留，未发现本项代码/测试阻断。审查者没有运行测试或Git，不冒充异家族审查。
- 收尾：本切片保持 `verifying` / `integration_status: pending`，只提交本地候选；完整check受既有问题阻断，不能记为工程完成或集成通过。按用户允许跳过需owner治理事项的约定，在记录缺口后继续后续队列；不修改waiver、不夹带无关修复。
- 完整 `bun run check`：exit 1；全仓Biome、CLI/docs/mobile类型和mobile lint通过。失败包括既有WAIVER-0011/0012于11-11过期；3份无关测试文件缺声明头；`spawn-agent-resident-guard.test.ts`请求缺sessionId/turnId/signal；Desktop委任代码两处变量拼写、readonly push及旧terminal-settle测试类型错误。上述路径不在本次diff内，不修无关代码或擅自续期waiver，不宣称完整门禁通过。
- 本次引入并已纠正的记录错误：Task原填 `branch: chenxvhua`不符合守卫。已从该基线创建符合规范的本地Task候选分支并修正元数据；定向复验 `check-task-worktrees.mjs`、`check-project-indexes.mjs`均exit 0，新增发布碎片由生产 `fragmentProblems`校验返回空问题列表。该自有错误与既有门禁问题分别记录。
- 未运行：impact/全量行为测试（工作区规则需用户另行决定）、真实UI/Provider、开发服务、构建、发布；本切片只证明当前确定性回归合同恢复，不关闭历史归属故障或补齐全部M1流程。
- 发布碎片：`.github/release-notes/fragments/v0.1.5/task-0481-session-projection-test-contract.md`；当前manifest仍0.1.4，不修改已发布说明、不升版。

## 合同

- 来源与目标：台账 OBS-ALLSTAR-ATTR-001 列出的已有行模式更新候选，REQ-0030 开发会话与普通侧栏分离合同；仅验证并修复这一确定性软件缺口。归属 **Open-Forge-only**。
- 输入与输出：已有同路径的缺省/错误模式缓存行 + 有效消息与明确模式的 IPC 事件 → 立即更新模式并正确投影，不依赖300ms全量刷新纠正；较早启动的列表响应不得撤销请求期间已明确更新的模式。
- 不做：不猜测历史会话的真实bucket/持久模式，不改Team配置链、项目身份/存储、全量刷新错误处理或请求去重/防抖、未归册冷启动发现或台账能力边界。
- 并发：**必须串行**，单点共享 Hook，没有独立并行代码切片；当前会话唯一写入者。实现完成后另派新上下文只读审查。
- 分支：从干净的 chenxvhua HEAD 创建 task 分支，原 main 是陈旧基线，不切换、不擅自合并；仅提交本地待集成候选。
- 授权：每次 Git 操作前告知；禁止远程 Git、发布、部署、真实 Desktop / Provider / SSH / DB。

## Given / When / Then 与保留

1. Given 缺模式或 work 的已有行，When 同路径 coding 事件到达，Then coding 模式立即进入缓存、普通侧栏排除，并进入 Allstar 开发历史聚合。
2. Given coding 的错误缓存行，When 同路径明确 work 事件到达，Then普通投影立即恢复；不修改持久会话模式，只消费权威事件。
3. Given 已知模式，When 旧格式事件不带模式，Then 保留模式；已有标题/有效首条消息保持，时间仍取最大值。
4. 保留新行插入、旧格式无模式兼容、300ms合并刷新、模块级单次订阅及非受影响行。事件无有效首条消息的既有处理范围不扩充。
5. Given 事件前已启动listSessions且响应悬置，When 明确模式事件更新缓存，随后旧响应返回缺模式/旧模式/缺该行，Then请求期间已更新的模式行不得回退；事件之后启动的新查询仍可按权威快照更新或删除，不能永久冻结缓存。

## 方案和验证

- 用户目标：在正确的项目入口找到刚创建/续聊的开发会话；不应为了缓存漏字段去普通侧栏找。无需新界面、文案或视觉改动。
- existingIndex分支直接补字段；在途列表请求将Promise与其等待期间的模式事件放在同一条目，统一释放，避免并行Map造成生命周期错配。调整只服务已复现的晚回填竞态，不重构通用同步或增加请求。
- 复用 `useProjects.sessionsChanged.test.tsx`，从真实 Hook 注册的 IPC listener 进入真实 store 和列表投影，受控时钟保证断言发生在全量刷新前。先观察旧实现目标断言失败，再修改实现。
- 命令：Desktop 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx`；相关投影/Allstar/项目写流程；`bun run test:impact -- <本 Task TS 文件>`；中间 `check:quick`；完成 `bun run check`。
- 已发布 v0.1.4 的本地 tag 存在，尽管 Desktop manifest 仍为 0.1.4，本任务只新增 v0.1.5 待发碎片，不改已发布说明、不自动升版/汇编下一版。
- 工程通过后 verifying，实机人工接受待用户，不擅自 done。

## 选项排除记录

首次候选为 OBS-TEAM-CONFIG-001 的 agentMode 缺省断链；已有 TeamRuntimeManager 基线 8/8 通过，但 resolver 被 mock，不能证明配置上下文。进一步读 TASK-0424 / ADR-0128 确认 Team capability coding 与模式先验不是同一合同，不能强制所有 Team 为 coding；因此撤回该修复方向，不修改 Team 实现/测试，也不声称历史问题解决。只读接缝调查已回收，未读取用户配置正文。

## 交付

### 实际修改和证据

- 首轮`useProjects.ts`在已有行更新分支消费明确agentMode；独立审查后新增在途列表请求的模式事件合并，避免旧快照回滚事件。缺省事件不擦已知模式，事件后的新查询仍可更新/删除。不改持久化、bucket、模式固化或请求去重/防抖。
- 回归从真实 Hook 注册的 IPC callback 进入 Jotai store，并观察真实普通侧栏投影与 Allstar 首页 model，不 mock 内部投影/聚合逻辑。外部 IPC、路由和翻译使用窄替身；fake timers 保证全量刷新尚未发生，再推进300ms验证刷新保持结果。
- 红灯：旧实现6例中3个目标断言失败、3例通过；分别为无模式/work→coding仍留普通侧栏、coding→work仍被排除。首轮fake timers与原waitFor组合曾造成2例测试框架超时，调整为effect完成后的同步断言后，在旧实现上重跑得到上述纯目标失败；超时不计作产品复现。
- 首轮绿灯：`bun run --cwd apps/desktop test src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx src/renderer/domains/project/services/sidebar-conversation-projection.test.ts src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx src/renderer/domains/project/hooks/useProjects.projectWrites.test.tsx`：4文件24/24通过，回归文件6/6。
- 审查续修红绿：在首轮已修实现上，先新增可控Promise的缺模式/旧模式/缺行晚响应3例，实测9例中3失败/6通过。补请求内模式事件合并后，同一4文件**27/27**通过、回归文件9/9；各例再验证事件后启动的新查询可改回work并正常删除，不永久冻结缓存。
- 首轮`bun run test:impact -- apps/desktop/src/renderer/domains/project/hooks/useProjects.ts apps/desktop/src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx`：exit 0，direct 1文件6/6，related 48文件199/199。
- **最终候选复跑同一impact命令exit 0：direct 1文件9/9，related 48文件202/202**；依赖准备26/26为本地Turbo缓存命中，Remote caching disabled。未把两轮重叠测试累计成独立用例总数。
- `bun run check:quick -- <本Task七个文件>`首轮及最终记录收尾均exit 0；完整`bun run check`首轮及续修候选均exit 0，lint、根/CLI/Desktop/docs/mobile类型、mobile lint及全部guards通过。当前waiver有效，不沿用旧Task的过期阻断结论；最终Project索引与Task范围守卫通过。
- v0.1.5待发碎片使用生产`fragmentProblems`校验通过；没有修改manifest或已发布v0.1.4说明，不汇编/发布下一版。

### 评审、集成与接受

- 自审：首轮差异仅新增模式合并字段；续修将Promise与请求期间模式更新统一所有权，未增加刷新请求。最终Git status只有七个Task路径，无生成产物或无关改动；diff空白检查通过，实际源码差异与续审候选一致。
- 独立审查：未参与实现的新上下文首次发现P2晚列表回填竞态，已先红后绿修复；同一审查者续审确认原竞态消除、无新增高置信代码阻断。审查指出的旧数字/状态记录已按两轮验证分开更新；审查为只读静态复核，不冒充执行测试或异家族审查。
- 集成：保留本地task分支候选，原chenxvhua与陈旧main不动；不自动合并或推送，integration_status保持pending。
- 人工功能接受：待用户。确认真实项目中已有会话在收到明确coding信息后从普通侧栏隐藏并在开发项目历史出现；无信息事件不抹归属。
- 未运行：真实Electron/E2E/Provider/SSH/数据库、开发服务、应用打包与部署（未授权且该确定性投影缺陷可由Hook集成层覆盖）。影响测试要求的库依赖准备已实际执行，不等于应用打包。
- 剩余风险：历史目标会话是否具有错误缓存模式尚未证明，OBS-ALLSTAR-ATTR-001仍待归因；无有效首条消息事件的既有处理范围、cwd/bucket校正、Team配置链及未归册冷启动发现未扩展。工程通过不代表用户运行实例已应用或历史故障已消失。
