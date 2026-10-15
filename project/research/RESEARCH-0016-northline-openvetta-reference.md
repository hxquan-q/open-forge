---
id: RESEARCH-0016
type: research
status: done
priority: P2
owner: project/collaboration
source: 用户请求调研 https://github.com/qll070226-a11y/northline
created: 2026-09-28
updated: 2026-09-28
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Northline 对 OpenVetta 的参考意义

## 摘要

**结论（推论）**：Northline 对 OpenVetta 有**中等、局部的参考价值**：最值得借鉴的是把开发协作中的“Worker 声称完成”与“Coordinator 独立核验”做成有版本、有 Git 证据、可恢复的交接合同；它不是 OpenVetta 需要引入的另一套 Agent Runtime。OpenVetta 已有 Task 合同、依赖/冲突 DAG、隔离 Worktree、父侧测试与集成门槛；主要增量是将交接证据从人工核对的记录，进一步变成可重算、可审计的结构化对象。[本仓协作合同](../collaboration/README.md#L4-L34) [本仓开发流程](../collaboration/development-workflow.md#L26-L85) [Northline 架构](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/architecture.md#verification-flow)

**建议**：暂不安装 Northline、也不添加 Python/MCP 运行依赖；继续以 `project/` 和现有 Worktree CLI 为唯一开发协作事实源。可先对 3–5 个真实并行 Task 进行无代码、无新状态目录的证据交接试点，观察是否确实出现过期基线、越界文件、测试声明与重跑不符、恢复困难等问题；有数据再决定是否扩展现有 CLI。[项目事实源](../README.md#L8-L25) [Task/Worktree CLI 职责](../../scripts/worktree/contract.mjs#L4-L27)

本文用“**事实**”表示能由来源直接核实的内容，“**推论**”表示与 OpenVetta 当前实现的对照判断，“**建议**”表示可选的下一步。Northline 来源固定到本次浏览的 `main` HEAD `abb608039ab5c8e0814657e32cf1c5731c25c0e7`；无第三方文章作为证据。[本次调研 HEAD][N16]

## 问题与范围

调研 Northline 实际解决什么问题、哪些能力由源码/配置落地、对 OpenVetta 的开发协作与产品 Agent Team 分别有什么映射。核对了目标仓库 README、源码、Skill/Plugin/MCP 配置、Python manifest、架构/测试文档、CI 配置、GitHub 提交与 release/tag 信息；本仓核对了 Project/Task 约定、Task Intake、Worktree 合同/CLI 与 Agent Team 相关实现。[Northline 来源索引](#来源)

本次只读公开 GitHub 和官方 Codex/MCP 文档，并读取本仓源码/文档及工作区状态；**没有运行 Northline、安装依赖、启动 MCP/Codex、访问真实业务服务或对目标仓库产生副作用**。调研对象是 Northline 的公开源码状态，不是对其实时模型表现或生产部署的测试。

## Northline 做什么（仅保留与判断相关的内容）

### 产品边界

- **事实**：Northline 自述为面向 Codex 的 Skill 与 Plugin，在 Root Agent、执行运行时和 Git 仓库之间提供长程任务控制；不是以增加并发 Agent 数量为目标的通用编排框架。项目 README 描述的接口有 Skill、MCP、CLI 和可选 LangGraph adapter；架构文档将 `ProtocolEngine` 作为有状态应用入口，把任务状态写入目标仓库的 `.northline/`，源码仍留在 Git Worktree。[README][N1] [架构文档：Product boundary / Repository data / Adapters][N2]
- **事实**：协议模型包含 `MissionState`（根目标、全局约束、决策、验收标准、根 commit；默认 `max_depth=2`、`max_children=4`）、`ProtocolPolicy`（隔离、脏工作区、测试、文件数、超时与尝试上限）、带版本/基线/文件范围/测试的 `DelegationContract`、任务派发包、基于 commit/dirty 状态的 `AgentCheckpoint`，以及包含变更文件、测试、验收证据、假设/风险/未决问题的 `HandoffReceipt`。[模型：MissionState / Policy / Contract][N4a] [模型：Dispatch / Checkpoint / Receipt][N4b] **实现核对**：README/架构文档称每父最多 4 个子任务，但模型与 JSON Schema 对 `max_children` 只设正数下限、没有 4 的上限；因此 4 是默认值而非强制上限。[协议 Schema][N20] [委派运行时][N21] [Northline README][N1] [架构文档][N2]

### 关键机制

- **事实**：Northline 状态机明确区分 `REPORTING`、`VERIFIED` 与 `INTEGRATED`；核验通过只允许 Root 继续审查，不代表代码已集成。`verify_handoff()` 验证身份、合同版本、基线、依赖，并从证据 Worktree 收集 Git/Test 事实；`record_integration()` 只接受 `VERIFIED`，要求已核验的结果 commit 可从父仓库 HEAD 到达，并在集成仓库重跑必需测试后才记录 `INTEGRATED`。[状态转移表][N9] [核验/集成实现][N5]
- **事实**：独立证据收集比较父侧合同与交接声明，包括 base/result commit 是否存在、结果是否从基线派生、证据 Worktree HEAD 是否等于声明结果、实际 `git diff` 文件是否等于交接文件列表，以及父侧重跑的必需测试是否通过。漂移检测还阻止错误的 agent/合同版本、过期基线、禁止/越界文件、缺失测试/验收证据与未解决问题；确定性 `BLOCK` 不能被 LLM Judge 覆盖。[证据比较实现][N6] [Git/Test 证据实现][N7] [漂移检测实现][N8] [架构文档：State and trust boundary][N2]
- **事实**：Root 可将目标、限制、测试和允许/禁止文件固化为合同；派发前检查 Worktree 与基线，暂停/阻塞时记录当前 commit、dirty 状态和已完成/待办/阻塞项；旧合同版本、过期状态、范围扩大或根约束冲突走 escalation/决策路径。README/SKILL 明示成功完成执行回合不等于交接已验证或允许集成。[模型][N4a] [派发/恢复/运行入口][N5] [Northline Skill][N3] [持久化工作流][N19]

### 宿主与成熟度边界

- **事实**：当前 manifest/依赖声明是 Python `>=3.10`、核心 `jsonschema`，MCP 是 optional extra；Plugin manifest 将 Skill 和 MCP server 一起打包，`.mcp.json` 以 `cmd.exe` 调用启动脚本。项目 README 说明首次 MCP 启动会创建 `.venv-plugin` 并安装依赖。官方 Codex 文档确认 Plugin 可捆绑 Skill/MCP，但可用界面依赖 Codex/ChatGPT 宿主；MCP stdio 规范定义客户端以子进程和标准流启动服务器。[Python manifest][N12] [Plugin manifest][N10] [MCP 配置][N11] [Northline 本地运行说明][N15] [Codex Plugin 文档][O1] [MCP stdio 规范][O3]
- **事实**：仓库架构说明当前支持目标是 Python/Git 仓库；CI YAML 配置为 `windows-latest` + Python 3.12，安装 `dev,mcp,research,langgraph` extras 后运行 pytest、任务生成、合成故障、smoke 和分析脚本。这里只核对了 CI 配置，没有检查 Actions 运行结果，因此不能把“配置了测试”写成“CI 已通过”。[README 当前边界][N1] [架构文档：v0.6 constraints][N2] [CI workflow][N13]
- **事实与限定**：Northline 文档记录一套 5 个隔离 Git 场景的 deterministic forward suite；自报的 v0.7 首次运行 9.23 秒、61 个协议事件、55 个文件、42,536 字节。文档同时明确这只能证明组件在当前主机上的组合/不变量，不证明真实模型遵循 Skill、成功率改善或大仓开销可接受；这些数字是项目自己的历史基线，不是独立复测或当前 `0.9.3` 性能承诺。[Product forward testing][N14]
- **事实与限定**：本次查询时仓库 `main` HEAD 是 `abb6080…`（2026-09-28）；README 与 `pyproject.toml` 标为 `0.9.3`，Plugin manifest 标为 `0.9.3+codex.20260924121900`，但 GitHub Releases 与 tags API 查到的发布标签只有 `v0.2.0`。因此源码/Plugin 元数据与可见 release/tag 记录不一致；不能仅凭 `0.9.3` 文案推断已有对应稳定发布，也不能据此推断代码质量。[HEAD commit][N16] [README][N1] [Plugin manifest][N10] [Python manifest][N12] [Release API][N17] [Tag API][N18]

## 与 OpenVetta 的映射

| 维度 | OpenVetta 当前事实 | 对照判断 |
|---|---|---|
| 项目目标、任务边界、事实源 | `project/` 已分别承载需求、Plan、Task、Issue、Bug、Research 等事实源；Research 必须记录来源、结论、代码锚点、失效条件和触发信号。[Project README](../README.md#L8-L25) [Project conventions](../CONVENTIONS.md#L199-L211) | Northline 的 `MissionState`/合同理念与现有项目管理高度重叠；再写一份 `.northline/mission.json` 会引入第二套可变事实源，除非将来明确做同步适配，否则不建议同时维护。**推论** |
| 并发拆分、基线、文件范围 | OpenVetta Task 模板已有 `execution`、`branch`、`worktree`、`base_commit`、`read_paths`、`write_paths`、`exclusive_paths`、`depends_on`、`conflicts_with`、`integration_status`；CLI 为并行代码 Task 建独立 Worktree。[Task template](../tasks/templates/task.md#L1-L26) [Collaboration contract](../collaboration/README.md#L186-L223) | “给子任务画边界并固定 Git 基线”不是新能力；Northline 可供参考的是把这些字段绑定到单次派发/交接，避免跨会话只靠聊天重述。**推论** |
| 静态范围守卫 | `scripts/worktree/contract.mjs` 规范化仓库相对路径、检查越界路径、Task ID/状态/依赖环，并对活动并行 Task 的写范围重叠做保守比较；`check-task-worktrees` 是不依赖 Git 的结构守卫。[合同解析/校验](../../scripts/worktree/contract.mjs#L82-L130) [Task 校验](../../scripts/worktree/contract.mjs#L249-L314) [依赖环检查](../../scripts/worktree/contract.mjs#L355-L405) [Scope conflict](../../scripts/worktree/contract.mjs#L419-L456) [质量守卫边界](../../scripts/quality/check-task-worktrees.mjs#L4-L13) | Northline 的 `allowed_files`/`forbidden_files` 思路可作对照，但不应再造一套不同 glob 语义；若要自动收紧，优先扩展现有路径合同和测试。**推论** |
| Worker 交接与独立验证 | OpenVetta 已要求 Worker 汇报 branch/commit、文件、实跑命令、未运行项和风险；Coordinator 核实证据、运行 Task 测试，集成后再跑 `test:impact` 与完整 `check`，成功后标记 `integration_status: integrated`。[Worker 交接](../collaboration/development-workflow.md#L43-L63) [Coordinator 集成](../collaboration/development-workflow.md#L65-L85) [集成前重跑 Worker 测试](../collaboration/README.md#L143-L150) | 主流程与 Northline 的“子报告 ≠ Root 验收”同构；差别是本仓当前工作流以 Task 文本记录交接、由 Coordinator 执行核验，而 Northline 再提供可持久化的机器可比较 receipt/evidence。增量是可审计性/自动拒绝，不是补上父侧验证责任。**推论** |
| Worktree CLI 核验范围 | `worktree:check` 对合同严格性、跨 Task 范围冲突、Git 中真实 Worktree 的注册路径/分支和 frontmatter 漂移设门；集成测试仍在 Coordinator 工作流执行。[CLI check](../../scripts/worktree/cli.mjs#L499-L557) [集成流程](../collaboration/development-workflow.md#L65-L85) | 一个精确缺口候选是“交接时自动重算 changed files / base-result commit 关系 / required test 结果并形成持久化 receipt”。不要误写成当前没有验证：当前已有父侧人工审核与重跑；缺的是统一的机器可核验凭证。**推论** |
| 长任务中断恢复 | 当前 Task 状态/交付模板会记录实际完成、验证和剩余风险；Task/Worktree 生命周期能保留未完成 branch/worktree。[Task template](../tasks/templates/task.md#L62-L74) [失败时保留 Worktree](../collaboration/development-workflow.md#L60-L63) | Northline 的 commit-bound checkpoint/event timeline 值得只在“跨会话恢复常丢失已完成/dirty 状态”是重复痛点时试用。若没有这类损失，新增 `AgentRunRecord`/checkpoint 存储会增加状态、隐私和维护成本。**推论** |
| 产品 Agent Team | 本仓协作规范明文区分开发协作并发与产品运行时并发，要求产品 Agent Team 继续复用 Runtime/Session/Turn/Policy/事件合同。[Collaboration README](../collaboration/README.md#L4-L34) `packages/agent-team` 已规定 Leader 在用户汇报前核验结果；`TASK-0069` 已落实“completed 仅表示成员发布结果，不等于 leader 核验”。[当前 Team 工具描述](../../packages/agent-team/src/task-runtime-tools.ts#L62-L66) [共享运行规则](../../packages/agent-team/src/operating-context.ts#L24-L30) [TASK-0069 记录](../tasks/TASK-0069-structured-delegation-handoff.md#L25-L50) | Northline 的 Git commit/worktree receipt 是开发协作控制面，不是面向最终用户 Team 任务的通用 Runtime 协议。可迁移的是“发布状态不等于被负责人验收”的原则；不要把 dev Worktree/commit 语义直接塞入 `packages/agent-team`。**推论** |
| 技术栈与宿主 | OpenVetta 是 Bun/TypeScript monorepo，含 Desktop/CLI/Mobile/Docs 与 Go/Kotlin 部分；Northline 当前产品包是 Python，面向 Codex Plugin/MCP/CLI。[仓库层次](../../docs/dev/agent-rules/repository.md#项目概览) [Workspace/package manager](../../package.json#L1-L49) [Northline manifest][N12] [Plugin 文档][O1] | 可借鉴模型/校验思路，不代表应依赖或复制 Python 产品；如果需要工具化，优先把最小门禁落在现有 Bun `scripts/worktree/`，保留现有 Project 合同与 CLI。**推论** |

## 借鉴与不借鉴

### 值得借鉴

1. **证据必须可重算（P2，增量能力）**：把 Worker 的“我改了哪些文件/跑了哪些测试”留作声明；由 Coordinator 从基线和结果 commit 重算文件集与祖先关系，并重新执行 Task 合同中的测试。receipt 同时保存声明与观察结果，二者不一致就阻止进入下一阶段。Northline 的实现展示了这一边界；OpenVetta 已有 Worktree 和 Coordinator 复测入口，可从小处增强，不必移植全套应用。[Northline evidence path][N5] [本仓 Task/Test/Integration flow](../collaboration/development-workflow.md#L43-L85)
2. **把 `verified` 和 `integrated` 分开（P1，现有不变量）**：保留“Worker 已提交”“Coordinator 已核验”“结果已合入并通过集成检查”三种不同事实。OpenVetta 已用 `status` 与 `integration_status`/集成流程区分；应继续让失败保留 `verifying`/`blocked`，不以测试或成员自述直接宣布集成。[Task status fields](../tasks/templates/task.md#L1-L26) [Failure/integration rules](../collaboration/development-workflow.md#L60-L85) [Northline state machine][N9]
3. **仅在真实需要时记录最小恢复检查点（P3）**：如果长任务被打断后经常要猜测 Worker 当前 commit、dirty files、completed/pending/blockers，可以借鉴 Northline `AgentCheckpoint` 记录这些元数据；先不复制原始会话轨迹或增加长期事件存储。[Checkpoint model][N4b] [Northline storage boundary][N2]

### 不值得照搬

- **不整套引入 Northline / 不把 `.northline/` 作为新事实源**：会重复 `project/` Task/Plan 状态，并与现有 `scripts/worktree/` 的合同解析和 Git 检查并行维护；Northline 自身还带 Python、MCP、Codex 适配与额外持久化。[Project single-source map](../README.md#L8-L25) [Northline package/runtime manifest][N12] [Northline storage][N2]
- **不把 Northline 固定的 Root→Worker→Leaf 深度/每父节点并发上限当成产品规则**：这是 Northline 当前协议策略的取值，不是由 OpenVetta 现有任务 DAG 或 Team 会话自动推出的通用最优值。[Northline limits][N4a] [OpenVetta Task DAG/并发合同](../collaboration/README.md#L186-L223)
- **不原样照搬“base commit 必须等于当前 parent HEAD”的 stale 门槛**：Northline 的漂移检测器在交接基线与当前 parent HEAD 不相等时产生阻断级 `STALE_BASE` finding，核验因此不能通过；在 OpenVetta 的独立 Worktree 里，另一项无冲突 Task 集成后也会推进 parent HEAD。若借鉴 stale 检查，应结合 `depends_on`/`conflicts_with`、实际 diff 与重跑测试判断是否可继续，不宜把每个祖先基线一概拒绝。[Northline stale 检查][N8] [OpenVetta 串行集成流程](../collaboration/development-workflow.md#L65-L85)
- **不把确定性测试通过等同语义目标满足，也不自动授权 merge**：Northline 自己保留 Root 的 diff review 和最终 integration；其评估说明亦承认模型遵循 Skill 与任务成功率尚未由 deterministic suite 证明。OpenVetta 应保留 Coordinator 对行为、用户验收与跨 Task 兼容的判断。[Northline architecture][N2] [Evaluation limits][N14] [本仓集成责任](../collaboration/development-workflow.md#L65-L85)
- **不直接采用它的执行适配器**：Northline receipt 中的测试命令最终由本机 shell 执行，工具也能创建 Worktree、启动 Codex 与写协议数据。若未来自动化，只运行 Root/Task 合同事先声明且受超时/工作区边界限制的命令；不采纳 Worker receipt 中临时提供的命令，也不推断模型授权。Northline 文档和官方 Codex/MCP 文档界定了其宿主/进程边界。[Git test runner][N7] [Northline trust boundary][N2] [显式 Root 授权][N5] [Codex Plugin/Skill boundary][O1] [MCP stdio][O3]

## 建议与最小试点

### 建议顺序

| 优先级 | 建议 | 成本与风险 |
|---|---|---|
| P1 | 维持当前“Worker 交付 → Coordinator 核验 → 集成测试 → integrated”门槛；不新增 Northline 依赖。 | 几乎无新增成本；现有 Task 文本需保持准确，避免把 `done` 写成未经集成的结果。 |
| P2 | 对 3–5 个未来的独立并行代码 Task 做**流程试点**：所有数据仍写入当前 Task 交付记录，不安装 Northline、不生成 `.northline/`。 | 低成本；由 Coordinator 增加少量取证时间，量化收益后再决定是否自动化。 |
| P3 | 只有在重复发生中断恢复困难、基线过期或 handoff 声明与事实不一致时，才考虑给现有 Worktree CLI 增加可选的 receipt/checkpoint 生成与校验。 | 中等成本：合同字段/兼容、Git fixture、测试命令输出保留和失败状态都要定义；错误的硬门禁会造成阻塞或虚假“已验证”。 |

### 流程试点与验收

1. Worker 开工时沿用现有 Task 合同：Task ID、`base_commit`、`write_paths`/`exclusive_paths`、前置依赖、Coordinator 预期检查的测试命令。
2. Worker 交接时分别记录“Worker 声明”与“Coordinator 观察”：结果 commit；从 base 到 result 的实际变更文件；worktree 是否 clean；命令、退出码与结果摘要；未运行项/原因；阻塞与风险。不要记录密钥、完整 Prompt 或不必要的原始会话内容。
3. Coordinator 独立核对文件范围和 commit 关系，重跑 Task 要求的测试；完成合并后再核对 parent HEAD/集成测试并写 `integration_status`。scope 不符、基线陈旧、结果未被集成或测试不通过，均不得记成 integrated。[当前集成合同](../collaboration/development-workflow.md#L65-L85)
4. 记录可量化指标：Worker 声明与 Coordinator 重算不一致次数（按 stale/scope/diff/test 分类）、被提前发现的问题、Coordinator 单次交接额外耗时、被阻塞/误阻塞次数，以及中断后恢复是否减少重复检查。
5. 若 3–5 个 Task 没有可避免的差异且人工成本更高，则停止，不开发新层；若观察到可复现差异或多次状态漂移，再在现有 `scripts/worktree/` 中试做纯本地 receipt 校验，并用临时 Git fixture 覆盖过期基线、越界路径、声明 diff 不符、必需测试失败和 `verified ≠ integrated`。该验证不需要真实模型或外部服务。

若关注的是**产品 Agent Team**而非仓库代码协作，继续沿用 `packages/agent-team` 的 TeamTask/Leader 规则；只有在真实会话出现“成员发布了不完整结果但 Leader 误报完成”的可复现问题时，才设计该 Runtime 自己的状态/证据合同，不直接移植 Northline 的 Git 控制面。[Team domain boundary](../../packages/agent-team/README.md#L3-L12) [现有 Team handoff 行为](../../packages/agent-team/src/operating-context.ts#L24-L30)

## 被否决的方案

- **将 Northline 作为本仓新的强制开发依赖**：现有 Task/Worktree/Coordinator 机制已经覆盖大部分调度职责；全量引入会出现第二套持久化状态、Python/MCP/宿主适配和两套 scope 规则，收益尚无本仓实测支撑。
- **在 Agent Team Runtime 中直接复刻 `HandoffReceipt`/Git commit 状态机**：开发协作和用户产品运行时是不同边界；一般 TeamTask 不一定涉及 Git 仓库或 Worktree。[本仓并发边界](../collaboration/README.md#L4-L34)
- **根据 Worker 提交的测试命令自动重跑，或测试通过后自动 merge**：命令来源与授权边界不清，并且测试通过不能替代行为/架构审查；若以后实现自动执行，命令只能由 Root/Task 合同授权并需独立验收。
- **现在先增加自动 checkpoint/event log**：尚未从本仓问题数据证明这是主要成本；持久化模型运行记录也增加存储、隐私、兼容与清理负担。

## 代码/测试/指标锚点

- 本仓规则：`AGENTS.md` 区分应用/包依赖层和 Project 管理位置；`project/README.md` 列出唯一事实源；`project/CONVENTIONS.md` 规定 Research 证据结构。[仓库架构](../../docs/dev/agent-rules/repository.md#项目概览) [Project 导航](../README.md#L8-L25) [Research 要求](../CONVENTIONS.md#L199-L211)
- 本仓 Task/Worktree 机械合同：`scripts/worktree/contract.mjs`；结构守卫：`scripts/quality/check-task-worktrees.mjs`；真实 Git Worktree 的 `check`/`status`：`scripts/worktree/cli.mjs`。[合同](../../scripts/worktree/contract.mjs#L189-L235) [静态守卫](../../scripts/quality/check-task-worktrees.mjs#L22-L29) [Coordinator CLI](../../scripts/worktree/cli.mjs#L499-L557)
- 本仓既有行为测试包括路径越界、glob/范围冲突和已登记冲突关系的检查，位于 `scripts/worktree/contract.test.mjs`、`scripts/quality/check-task-worktrees.test.mjs`；本次没有运行测试。[路径/冲突测试](../../scripts/worktree/contract.test.mjs#L69-L120) [结构守卫测试](../../scripts/quality/check-task-worktrees.test.mjs#L34-L53)
- Northline 核验路径：`ProtocolEngine.verify_handoff()`、`record_integration()`、`_collect_and_compare_evidence()`；Git/Test 重算在 `GitWorkspace.collect_evidence()`；规则在 `DriftDetector.inspect()`。引用均固定到本次 [HEAD][N16]。[核验/集成][N5] [证据重建][N6] [Git/Test 边界][N7] [漂移检测][N8]
- **没有运行 Northline CI 或 forward suite**。Northline 的 CI/workflow 配置与自报指标仅作为源代码/文档证据；真实运行结果、跨平台行为和 OpenVetta 上的提效幅度仍未知。[CI 配置][N13] [指标解释边界][N14]

## 失效条件与置信度

- **高置信度**：Northline 的字段、状态、验证与集成分离、显式运行授权、支持技术栈来自固定 commit 的源码/manifest；本仓已有 Task/worktree 合同来自当前源码、模板与协作文档。
- **中等置信度**：Northline 哪个子机制能减少 OpenVetta 实际交接错误，是跨项目推论；本仓目前由 Coordinator 手工核验，尚无本次试点数据证明自动 receipt 的收益。
- **低置信度/未能确认**：Northline live 模型遵循率、实际任务成功率、生产稳定性、大仓 overhead、非 Windows 支持程度，以及 `0.9.3` 是否已有未被当前 Tags/Releases API 返回的其他发布形式。Northline 自己的 forward-testing 文档也将 deterministic suite 的结论限制在组件组合/协议不变量，不外推为模型效果。[Northline evaluation limits][N14] [Release API snapshot][N17] [Tag API snapshot][N18]
- 若 Northline 后续适配 Bun/TypeScript monorepo、提供可验证的稳定发布/跨平台 CI，或本仓试点观察到重复的 stale/scope/test-claim mismatch，本结论应重新评估；若试点没有问题或人工成本超过收益，则维持现状、不做自动化。

## 下一步触发信号

- 未来某批并行 Task 出现重复的“Worker 报告通过、父侧重跑失败”、基线过期、变更越过 `write_paths` 或 Worktree 与 Task 声明漂移：优先用现有合同/CLI 分析原因，再触发 P2 receipt 小试点。
- 多个跨会话 Task 经常因无法确定最后观察到的 commit、dirty files、pending/blockers 而重复调查：再评估只存 commit-bound checkpoint 的 P3 方案。
- 本仓若决定对产品 Agent Team 增加机器级完成/验收保证，单独依据 `packages/agent-team` 与 Runtime 事件合同起草需求；不要把开发工具层的 Git 约束直接下沉。
- Northline 若发布更新后的 schema、明确支持非 Python/Git 目标、完成可复核的 live evaluation，或对齐 `0.9.3` release/tag 元数据，可按新快照补充比较；当前不因此触发依赖引入。

## 来源

### Northline 第一方源码、配置、文档与 API

以下 Northline 源码/文档链接固定到 `abb608039ab5c8e0814657e32cf1c5731c25c0e7`；GitHub API 元数据链接用于记录 2026-09-28 查询快照。

- [N1] 仓库 README：产品定位、Root/Worker/Leaf、状态机、验证门禁与安装/使用方式。
- [N2] [架构文档](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/architecture.md)：产品边界、持久化、信任模型、限制与 adapter。
- [N3] `skills/northline/SKILL.md`：启动/恢复、Root 授权、派发、checkpoint、receipt、核验、集成及完成规则。
- [N4a] [`models.py` 的 MissionState、ProtocolPolicy、DelegationContract](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/models.py)。
- [N4b] [`models.py` 的 AgentTaskPacket、AgentCheckpoint、HandoffReceipt](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/models.py)。
- [N5] [`engine.py` 的 Codex 显式授权、verify_handoff 与 record_integration](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py)。
- [N6] [`engine.py` 的 `_collect_and_compare_evidence()`](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py)。
- [N7] [`workspace.py` 的 Git/Test evidence 收集与 Worktree 操作](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/workspace.py)。
- [N8] [`detector.py` 的身份、状态、范围、测试及验收证据漂移检查](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/detector.py)；[状态转移表](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/state_machine.py)。
- [N9] [`state_machine.py` 的状态转移表](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/state_machine.py)。
- [N10] [Codex Plugin manifest](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/.codex-plugin/plugin.json)。
- [N11] [MCP server 配置](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/.mcp.json)。
- [N15] [Plugin README](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/README.md)：能力、安装、副作用、版本文案与状态目录。
- [N12] [`pyproject.toml`](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/pyproject.toml)：Python 版本、依赖、extras 和 CLI entrypoints。
- [N13] [GitHub Actions CI workflow](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/.github/workflows/ci.yml)：CI 命令配置。
- [N14] [Product forward-testing 文档](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/product-forward-testing.md) 与 [live-testing 限定](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/live-forward-testing.md)。
- [N16] [GitHub API：main HEAD commit `abb608039ab5c8e0814657e32cf1c5731c25c0e7`](https://github.com/qll070226-a11y/northline/commit/abb608039ab5c8e0814657e32cf1c5731c25c0e7)；[Repo API 元数据](https://api.github.com/repos/qll070226-a11y/northline)。
- [N17] [GitHub Releases API 快照](https://api.github.com/repos/qll070226-a11y/northline/releases?per_page=100)；可见 release 页面：[v0.2.0](https://github.com/qll070226-a11y/northline/releases/tag/v0.2.0)。
- [N18] [GitHub Tags API 快照](https://api.github.com/repos/qll070226-a11y/northline/tags?per_page=20)。
- [N19] [`product-workflow.md` 的持久化布局与 MCP/CLI 流程](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/skills/northline/references/product-workflow.md)。
- [N20] [`protocol.schema.json` 的 mission/delegation 上限字段](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/schemas/protocol.schema.json)。
- [N21] [`engine.py` 的 Root/Worker/Leaf 委派上限校验](https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py)。

### 协议/宿主官方文档

- [O1] [OpenAI Codex Plugins 官方文档](https://developers.openai.com/codex/plugins.md)：Plugin 的 Skill/MCP 组成和 Codex/ChatGPT 宿主面。
- [O2] [OpenAI Codex Skills 官方文档](https://developers.openai.com/codex/skills.md)：Skill 文件结构、发现方式与 Plugin 分发关系。
- [O3] [Model Context Protocol `stdio` transport 规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)：MCP 客户端以子进程和标准流启动服务的协议边界。

[N1]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/README.md> "Northline README"
[N2]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/architecture.md> "Northline architecture"
[N3]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/skills/northline/SKILL.md> "Northline Skill"
[N4a]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/models.py> "Mission and delegation model"
[N4b]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/models.py> "Dispatch, checkpoint, and receipt model"
[N5]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py> "ProtocolEngine execution and verification"
[N6]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py> "Independent evidence comparison"
[N7]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/workspace.py> "Git and test evidence"
[N8]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/detector.py> "Deterministic drift detector"
[N9]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/state_machine.py> "Handoff state machine"
[N10]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/.codex-plugin/plugin.json> "Codex Plugin manifest"
[N11]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/.mcp.json> "MCP server configuration"
[N12]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/pyproject.toml> "Python package manifest"
[N13]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/.github/workflows/ci.yml> "Northline CI configuration"
[N14]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/docs/product-forward-testing.md> "Product forward testing and interpretation limits"
[N15]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/README.md> "Plugin README and setup"
[N16]: <https://github.com/qll070226-a11y/northline/commit/abb608039ab5c8e0814657e32cf1c5731c25c0e7> "Northline main HEAD"
[N17]: <https://api.github.com/repos/qll070226-a11y/northline/releases?per_page=100> "Northline releases API snapshot"
[N18]: <https://api.github.com/repos/qll070226-a11y/northline/tags?per_page=20> "Northline tags API snapshot"
[N19]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/skills/northline/references/product-workflow.md> "Persistent workflow and tool sequence"
[N20]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/schemas/protocol.schema.json> "Protocol JSON Schema"
[N21]: <https://github.com/qll070226-a11y/northline/blob/abb608039ab5c8e0814657e32cf1c5731c25c0e7/plugins/northline/src/northline/engine.py> "Delegation engine limits"
[O1]: <https://developers.openai.com/codex/plugins.md> "OpenAI Codex Plugins"
[O2]: <https://developers.openai.com/codex/skills.md> "OpenAI Codex Skills"
[O3]: <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio> "MCP stdio transport specification"
