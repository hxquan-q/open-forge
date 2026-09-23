---
id: TASK-0069
type: task
status: done
priority: P1
owner: packages/agent-team
requirement: REQ-0006
plan: PLAN-0008
source: RESEARCH-0008 差距表「结构化委派交接」
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/agent-team/src, packages/agent-team/test, docs/adr/0109, docs/adr/0115]
write_paths: [packages/agent-team/src/task-runtime-tools.ts, packages/agent-team/src/operating-context.ts, packages/agent-team/test]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（forge/dev 主工作区，随本任务提交）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 结构化委派交接与 leader 编排纪律

## 目标

对齐 Cursor 多智能体最佳实践与 pi spawn 任务书形态：让 `team_delegate_task` 的工具合同显式要求自包含 objective（目标、必要上下文、交付物与验收、约束），并把 leader 的「拆分 → 并行委派 → 等待 → 验证 → 整合汇报」编排回路写进全队共享的协作纪律，填补当前只有工具语义、没有编排方法论的提示词空白。

## 范围

### 并发评估

- 结论：不支持（提示词合同是全队共享单点，且本任务与后续 B/C 同执行人串行）
- 集成顺序：PLAN-0008 Phase A，先于 TASK-0070/0071

### 做

1. `team_delegate_task` 描述增加自包含交接要求：objective 必须独立可执行——写清目标、必要背景（成员看不到 leader 私有会话）、交付物与完成标准、边界约束；引用共享历史时给出 entryId 或可检索表述。
2. `buildTeamSharedOperatingContext` 协作规则补两条：
   - leader 编排回路：把可并行的独立工作拆给多位成员并行委派，统一等待后再继续，不串行分发本可并行的任务；
   - 验证责任：leader 在向用户汇报前须对照 objective 核验成员产出，任务的 completed 状态只代表成员已发布结果，不等于已通过 leader 核验；不得仅凭委派受理（admission）宣称完成。
3. 测试：`runtime-tools.test.ts` 断言 delegate 描述含结构化交接要求；`operating-context.test.ts` 断言两条新规则进入共享上下文（并因此进入 roster 指纹渲染路径）。

### 不做

- 不给 `objective` 加 schema 化结构字段（RESEARCH-0008 已否决）；
- 不改成员侧规则（成员纪律已完备）、不动工具执行语义与端口合同；
- 不改 i18n（模型可见提示词保持英文，不属用户文案）。

## Given / When / Then

- Given 任意 Team 会话的成员提示词装配，
  When 渲染共享协作纪律，
  Then 包含 leader 并行委派回路与「completed ≠ 已核验」的验证责任条款，且该文本进入 `teamRosterFingerprint` 的指纹输入。
- Given leader 调用 `team_delegate_task`，
  When 模型阅读工具描述，
  Then 它被明确告知 objective 必须自包含（成员看不到发起者的私有上下文），并按目标/上下文/交付物/约束组织任务书。

## 必须保持

- 共享名册前缀对全体成员字节一致（既有测试锁定）；
- 既有 9 条协作规则与全部工具语义不变；
- 提示词措辞变更会使既有会话 roster 指纹一次性翻动 → 全体成员提示词一次性重建，属预期配置身份变更（交付记录注明）。

## 测试与验证

- 层级：合同测试（工具描述断言）+ 单元测试（operating-context 渲染）。
- 命令：`bun scripts/quality/run-vitest.mjs --run packages/agent-team/test/runtime-tools.test.ts packages/agent-team/test/operating-context.test.ts`；随后 `bun run test:pkg agent-team` 全包核对；变更文件 `bun run check:quick -- <files>`。

## 交付记录

- 实际修改：
  - `packages/agent-team/src/task-runtime-tools.ts`：`team_delegate_task` 描述要求 objective 自包含（目标/必要背景/交付物与完成标准/约束），共享事实引用 `team_read_shared_history` 的 entryId，并附并行分发后再统一观察的指引；
  - `packages/agent-team/src/operating-context.ts`：共享协作规则新增两条——leader 编排回路（拆分独立非重叠任务并行委派、`team_wait_tasks` 统一收集后再继续依赖工作）与 leader 验证责任（completed 只代表成员已发布结果，不得凭受理或部分产出宣称完成）；
  - `packages/agent-team/test/runtime-tools.test.ts`：新增「requires self-contained objectives in the delegation contract」合同测试；
  - `packages/agent-team/test/operating-context.test.ts`：新增「teaches the leader the parallel dispatch loop and the verification duty in the shared contract」，并断言两条规则落在全队字节一致共享前缀内（即进入 roster 指纹输入）。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run packages/agent-team/test/runtime-tools.test.ts packages/agent-team/test/operating-context.test.ts`：14/14 通过；
  - `bun run test:pkg agent-team`：82/82（12 文件）通过；
  - `bun run check:quick -- <4 个变更文件>`：Biome 4 文件无告警，package-boundaries / coding-agent-architecture / runtime-independence 等守卫全部 ok。
- 未运行及原因：
  - `check:guards` 中 `build-agent-modes` 报「modes-data.ts 已过期」：由并行会话在 `apps/desktop/src/main/agent-modes/` 的在途改动（新增 `partials/canvas-artifacts.md`、修改 `coding.md`/`work.md`）触发，与 `packages/agent-team` 无输入关系；不代跑 `generate:agent-modes`，避免把并行工作区未定稿内容固化进生成物；
  - 未触及 `apps/desktop`，无需 desktop tsc。
- 剩余风险：
  - 提示词措辞变更使既有 Team 会话的 roster 指纹一次性翻动 → 全体成员提示词一次性重建，属预期配置身份变更（与 ADR-0115 指纹机制一致）；
  - 行为约束是提示词合同而非硬校验，模型仍可能违背（与既有 9 条规则同级，接受此权衡）。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【改进】Agent 团队的队长现在按「拆分—并行委派—统一等待—核验产出—整合汇报」的编排回路协作：委派任务书要求写清目标、背景、交付物与边界（成员看不到队长的私有会话，任务书必须自包含），队长在向用户汇报前会先对照任务书核验成员结果，任务显示完成不再被直接当作已通过核验。
