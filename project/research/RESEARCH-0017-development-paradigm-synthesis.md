---
id: RESEARCH-0017
type: research
status: done
priority: P2
owner: open-forge
source: user-request
created: 2026-10-01
updated: 2026-10-01
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 开发范式：OpenVetta、工程控制论与 Matt Pocock 方法对照

## 问题与范围

对照当前 Open Forge 的开发治理与三个参考来源，区分已有机制、可借鉴方法和未经验证的类比。本记录为 Open-Forge-only 研究，不改变开发规则、权限、公共合同或运行时行为；`done` 仅表示本轮研究完成，不表示建议已实施。没有调查上游完整演变史，因此“上游也有”不等于证明某条规则的历史作者或传播方向。

## 事实来源

2026-10-01 获取公开默认分支快照，固定 SHA 防止链接内容漂移：

- OpenVetta `main`：`a2d314a8521aa438c78dd51ed18c9e523a2cfab9`。
  - [Agent 规则](https://github.com/openvetta/open-vetta/blob/a2d314a8521aa438c78dd51ed18c9e523a2cfab9/AGENTS.md)
  - [贡献流程](https://github.com/openvetta/open-vetta/blob/a2d314a8521aa438c78dd51ed18c9e523a2cfab9/CONTRIBUTING.md)
  - [质量门禁](https://github.com/openvetta/open-vetta/blob/a2d314a8521aa438c78dd51ed18c9e523a2cfab9/docs/dev/quality-gates.md)
  - [守卫编排](https://github.com/openvetta/open-vetta/blob/a2d314a8521aa438c78dd51ed18c9e523a2cfab9/scripts/quality/check-guards.mjs)
  - [完整目录树 API](https://api.github.com/repos/openvetta/open-vetta/git/trees/a2d314a8521aa438c78dd51ed18c9e523a2cfab9?recursive=1)，响应 `truncated: false`。
- Matt Pocock Skills `main`：`d81f3a183412e71a5b1e84ca21bc1a35eea03a60`。
  - [设计意图与入口](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/README.md)
  - [深模块与测试接缝](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/codebase-design/SKILL.md)
  - [TDD](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/SKILL.md)
  - [纵向切片任务](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/to-tickets/SKILL.md)
- [AI Coding Dictionary](https://github.com/mattpocock/dictionary-of-ai-coding/blob/ed1ebed3975cba04ed5e74c6ca73659274beb754/README.md)，`main@ed1ebed3975cba04ed5e74c6ca73659274beb754`，重点核对 Harness、Progressive disclosure、Automated check、Automated review、Human review、Software factory。
- 工程控制论：本机 `C:\Users\xquan\.agents\skills\engineering-cybernetics-essence\` 的 Skill、原文索引及 `references/chapters/chapter_001.md`、`chapter_021.md`。第 1 章讨论工程近似，第 21 章区分大系统与系统工程并讨论分层协调。此为本地转录，未核对纸本页码；索引采用 1983 修订版章节号，不能直接当作 1954 原版或第三版的页码引用。本轮不宣称覆盖钱学森完整的系统工程思想体系。
- 本地：[规则](../../AGENTS.md)、[管理入口](../README.md)、[协作合同](../collaboration/development-workflow.md)、[质量门禁](../../docs/dev/quality-gates.md)、[任务样本](../tasks/TASK-0096-canvas-native-data-grid.md)。

## 当前结论

### 1. 上游工程底座与 fork 治理应分开归因

上游公开快照同样规定包边界、源码与测试作为当前事实源、必要重构、风险驱动测试、代表性用户操作流程、不可信外部输入以及按需 UI 验证；守卫脚本已承载部分规则。因此不能把这些都当作 fork 新创机制。

完整上游目录树没有 `project/`，所读开发文档也没有本地这套 Task 台账、独立 Task Worktree、Coordinator 集成与 `main:dev` 长期授权合同。上游要求贡献 PR 面向 `dev`，且只有用户明确要求时才提交；本地允许完成自洽且验证通过的修改后提交。上游产品里的 agent-team 不能作为开发团队采用同名协作制度的证据，也不能由公开文档推断维护者私下不用 Worktree。

建议称本地范式为“以 OpenVetta 工程底座为基础、任务合同驱动的人机协同闭环开发”。这是研究归纳，不是新增正式术语。

### 2. Matt 的方法应作为可组合工具，不是第二套治理框架

Skills README 明确强调小型、可编辑、可组合，并反对框架完全接管流程。可借鉴项：

- 深模块：小而稳定的接口承载足够行为，集中知识和变更；不是单纯把文件切得更碎。
- 纵向切片：每个功能 Task 交付一条窄而完整的行为路径，尽早贯通必要层；不是依次把整个数据库层、服务层和 UI 层做完才验证。
- 测试接缝：通过公开边界验证行为，避免内部 Mock 与私有结构断言。
- 渐进披露：常驻规则只保留关键约束与上下文指针，详细流程按任务加载。
- 审查分层：确定性检查、Agent 判断式评审、人工阅读产物是不同证据；人工只读 Agent 总结不等于审查了代码。

存在必须保留的差异：当前远端 TDD Skill 要求先与用户确认测试接缝，并把重构移到 review 阶段；本地允许按既有合同自主选测试，且必要重构不能拖到实现后。采用其原则，不照搬每个操作要求。远端 README 的 red-green-refactor 描述与 TDD 文件的细则也有张力，导入时需要固定版本和明确取舍。

纵向切片不是不顾依赖的普遍规则：跨仓高扇出合同迁移可用 expand–contract；安全的行为保持型重构也可单独成 Task。它和“每个 Task 一个可回滚 concern”互补，而非互相替代。

### 3. 工程控制论提供问题框架，而非软件流程稳定性证明

开发活动可暂作“离散事件、含随机性与时延、随上下文变化的社会技术系统”来分析；本轮没有识别状态方程或建立线性近似有效域，不能直接套 PID、极点或稳定性定理。

以下是工程映射建议，不是原著关于 AI 编程的结论：

| 控制视角 | 软件开发对应物 | 应检查的问题 |
|---|---|---|
| 目标与约束 | 验收行为、兼容、安全及权限 | 优化的是用户结果还是代码产量？ |
| 被控对象 | 仓库实现与集成状态 | 是否能定位当前实际状态？ |
| 控制动作 | Task 拆分、代码修改、并发量、回退 | 一次改动是否超出可验证范围？ |
| 观测 | 测试结果、diff、运行证据 | 绿灯是否覆盖真正关心的行为？ |
| 扰动与时延 | 需求变动、依赖变化、模型误判、CI 等待 | 反馈回来时，是否已积累过多未验证修改？ |
| 分层协调 | Worker 局部实现、Coordinator 集成、人工重大决策 | 局部通过能否保证集成正确？ |

建议采用三层闭环：实现内环（窄切片与快速测试）、集成中环（合同与跨模块验收）、产品外环（人工判断方向、价值与发布）。层次是本研究的设计建议，不是假称原著直接规定的软件流程。

### 4. 当前优先补证据，不优先加规则

先保留现有工程底座，收敛重复正文与 Task 完成证据。抽查 TASK-0096 同时有 `done`、`integration_status: pending` 与旧 `forge/dev` 名称：可能是历史迁移记录，不能直接认定当前违规，但需要避免把实现完成、集成完成和发布完成混为一谈。

候选观测项：需求到验收耗时、首次相关检查反馈时间、集成后返工率、逃逸缺陷、并发冲突与人工评审负担。没有实测基线，暂不设虚构阈值，也不用提交数、测试数或代码行数替代用户结果。

不能仅因有多 Agent 或 Worktree 就称为 Software factory：按词典定义还需要事件触发 Agent 会话的机制。本轮没有核实本地具备这样的完整自动触发开发链路。

## 被否决的方案

- 整套导入远端 Skills：会叠加冲突的确认、重构和任务落盘流程。
- 用控制论术语包装规则数量：没有观测与量化关系，不能由术语推出可靠性。
- 把所有工作强制拆成纵向功能切片：不适合纯研究、行为保持型重构及高扇出迁移。
- 仅凭 CI 绿灯自动批准所有变更：检查只证明已编码的断言，不能判断产品方向或补足遗漏的合同。
- 本轮直接改写 AGENTS、安装 Skills 或改变提交授权：用户请求是参考与分析，尚未确定具体治理变更。

## 代码/测试/指标锚点

- [包边界守卫](../../scripts/quality/check-package-boundaries.mjs)
- [Task Worktree 守卫](../../scripts/quality/check-task-worktrees.mjs)
- [项目索引守卫](../../scripts/quality/check-project-indexes.mjs)
- [本地 CI](../../.github/workflows/quality.yml)
- [任务 intake](../../.agents/skills/open-forge-task-intake/SKILL.md)

实际核验通过 GitHub API/raw 获取来源、读取本地文件并检查 Git 状态完成；这不是执行过质量门禁的证明。文档提交前检查本次相对链接、固定来源可访问性和 diff 空白。没有运行应用、Provider、单元测试、构建或完整 TypeScript check，因为没有运行时改动。

## 失效条件与置信度

- 固定快照中的文本与目录事实：高置信；团队实际执行率、收益及历史归属：未证实。
- 上游 main 不代表最新 dev，未检查私有管理流程；本地控制论转录未逐页校勘。
- 上游 AGENTS 与质量文档对测试选择失败/回退的描述存在差异，本轮未完整追踪选择器，不将其中任一描述当作已核实执行行为。
- 后续上游快照、任务状态模型、Skills 行为或治理权限变化时，需要重新对照。
- 三层闭环及指标建议尚未试点，不能宣称已经降低缺陷或提高效率。

## 下一步触发信号

用户确认要优化治理后，再建立独立 Task：先收敛规则权威入口和完成证据，再选择一个真实功能试点纵向切片与分层验收。实测反馈证明瓶颈后再调整并发度或门禁，不新增一套平行框架。
