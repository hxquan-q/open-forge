---
id: TASK-0478
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0030
plan: PLAN-0027
source: user-request
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0423, TASK-0424]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: main checkout（用户明确要求主仓实施）
base_commit: b7ab49e695d4f6ed0a973862ed3c1890426e1939
read_paths:
  - apps/desktop/src/renderer/domains/conversation/components/command-panel/
  - apps/desktop/src/renderer/domains/conversation/components/input-bar/
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
  - apps/desktop/src/renderer/domains/conversation/hooks/
  - apps/desktop/src/renderer/domains/settings/
  - packages/plugins/plugin-sdk/src/manifest-schema.ts
  - packages/plugins/plugin-sdk/src/manifest.ts
  - docs/plugin/manifest.md
write_paths:
  - apps/desktop/src/renderer/domains/conversation/
  - apps/desktop/src/renderer/domains/settings/
  - apps/desktop/src/renderer/domains/skills/
  - apps/desktop/src/renderer/domains/workspace-mode/
  - apps/desktop/src/renderer/shared/i18n/locales/
  - apps/desktop/src/main/skills/
  - apps/desktop/src/preload/api-types/skills.ts
  - packages/theme-ui/src/skills/SkillCardView.tsx
  - packages/theme-ui/src/skills/SceneCardView.tsx
  - packages/plugins/plugin-sdk/src/
  - packages/plugins/plugin-sdk/test/
  - packages/plugins/plugin-sdk/package.json
  - packages/plugins/plugin-sdk/CHANGELOG.md
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - packages/plugins/presets/
  - docs/plugin/manifest.md
  - project/requirements/REQ-0030-allstar-dev-section.md
  - project/tasks/TASK-0423-allstar-dev-section-shell.md
  - project/tasks/TASK-0478-invocation-candidates-mode-visibility.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/task-0478-invocation-candidates-mode-visibility.md
exclusive_paths: []
depends_on: [TASK-0422]
conflicts_with: []
integration_status: integrated
created: 2026-11-02
updated: 2026-11-02
---
<!-- Copyright The Open Forge contributors. -->

# 显式调用候选项按会话模式显示

## 目标

用户在会话输入区通过 `/` 或 `@` 显式挑选 Skill、连接器或 Agent 时，候选列表按当前会话的 code / 普通模式显示对应条目，降低模式间的信息噪音。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial（主工作区）
- 前置依赖：TASK-0422（会话模式语义）；复用 TASK-0424 已落地的 Agent/Team `mode` 归属
- 冲突文件/独占路径：无在途代码冲突；沿主仓串行实施
- Branch：main
- Worktree：不拆 Worktree，用户明确要求在主仓实施
- 集成负责人：当前会话
- 集成顺序：独立功能切片，完成后回填 TASK-0423 的工具面范围决策

### 做

- `/` 列表：Skill/场景与内置连接器候选按产品固定的可见模式标签过滤。
- `@` 列表：Agent 候选按产品固定的可见模式标签过滤；复用既有 Agent/Team 归属信息。
- 未声明可见模式的新增候选默认两种模式都显示；不增加用户可编辑配置。
- 对应管理列表只读展示模式标签，不增加编辑/启停语义。
- 中英文文案与行为测试覆盖两个模式的列表成员、默认可见项和手动输入兼容。

### 不做

- 不改变 LLM 实际可用工具、工具 Schema、权限/审批、调用路由、手动输入或已选项行为。
- 不过滤或改写实际工具调用记录、工具结果与会话历史。
- 不新增会话内工具目录、项目级工具配置、持久化数据或调用时模式校验。
- 不重做 Agent/Team 新会话选择器的既有归属合同。

## Given / When / Then

- Given code 模式会话，When 用户打开 `/` 或 `@` 候选列表，Then 仅显示标记为 code 或两种模式可见的候选。
- Given 普通模式会话，When 用户打开 `/` 或 `@` 候选列表，Then 仅显示标记为普通或两种模式可见的候选。
- Given 候选未声明可见模式，When 任一模式打开列表，Then 该候选在两种模式均显示。
- Given 用户在某模式手动输入候选完整名称或 LLM 调用该工具，When 会话发送/执行，Then 原有调用与工具可用性不受列表过滤影响；工具调用与结果照常显示。
- Given 用户查看对应工具/能力管理列表，When 候选有模式标签，Then 以只读方式显示该标签；未标记项显示为两种模式均可见。

## 必须保持

- 当前会话模式取会话固化的 mode，不回读项目当前默认值来改写历史会话。
- 可见性只作用于输入区显式调用候选列表；不构成权限或授权边界。
- 未标记项默认两种模式可见；现有 Agent/Team 新会话选择器合同保持不变。
- 选择已选项、手动输入、实际 LLM 调用、审批和工具执行轨迹保持原行为。
- 用户可见标签全部走 i18n；模式标记由产品定义，用户不可编辑。

## 测试与验证

- 定向测试：slash Skill/连接器筛选、`@` Agent 候选筛选、缺省两档可见、管理列表标签呈现。
- 用户流程：分别在 code 与普通会话打开 `/`、`@` 并检查候选；选择一个候选后照常插入输入；手动输入另一模式候选仍不被前端列表逻辑拦截。
- 质量检查：`bun run check:quick -- <file...>` → `bun run test:impact -- <file...>` → 完整 `bun run check`；若涉及 Plugin manifest 合同则补跑 SDK 合同测试与目标 preset manifest 测试。

## 验收分层

- 工程验证：定向行为测试与完整 `bun run check` 通过；`test:impact` 的 Desktop、theme-ui 及其余受影响包通过，但脚本回退运行的 `presets/vetta-ui-design/test/engine-hmr.test.ts` 有 1 个可独立复现的既有 fixture 失败（临时目录缺 `src/styles.css`，不在本 Task 修改路径）；详见交付记录。
- 技术评审：自审完成；Skill manifest 仅增加可选只读展示元数据，已核对 schema、兼容默认、文档及 Plugin API 版本合同。
- 集成：实现、配套测试、Task/索引和 v0.1.5 fragment 将作为一个本地 `main` 原子提交；不推送。
- 人工功能验收：待用户验收；未启动真实 Desktop，也未运行 `verify:ui:*`。
- 发布：未授权；本次开发条目写入当前开发版本 release-note fragment。

## 功能验收包

- 入口与前置条件：分别有 work 与 coding 模式的会话；候选列表包含带模式标记与未标记的项目。
- 操作步骤：打开 `/` 与 `@` → 对比两种会话模式下的候选 → 选中一项确认输入插入不变 → 手动输入非当前模式候选确认不被拦截。
- 预期行为与最终产物：仅候选列表成员按 mode 不同；工具调用/结果、LLM 可用性及会话历史保持不变；管理列表只读展示标签。
- 不通过表现与已知限制：模式标签误被当成调用权限、未标记候选在任一模式消失、候选切换误清除已有文本或已选项。
- 验收反馈及回归案例：工程级候选过滤、缺省双模式可见、管理页只读标签与调用行为不变均有测试覆盖；等待用户按上述功能验收包实机确认。

## 交付记录

- 2026-11-02 立项：用户确认可见性由 code/普通会话模式决定，仅改变 `/`、`@` 显式调用候选列表；调用能力、实际调用输出及其他行为保持原样。模式标签由产品固定定义，未标记新候选默认两档显示；管理列表只读显示属性。
- 当前基线：`.ua/knowledge-graph.json` 分析于 2026-10-12、commit `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`；与 HEAD 存在目标 renderer 源码差异，已依据当前源码继续调查。
- 实际修改：在现有 `/` Skill/场景、内置连接器候选与 `@` Agent 候选上按会话固化模式过滤；未标记候选默认两档可见；管理列表只读展示模式。补充插件 Skill 可选展示元数据及 SDK/API 合同，不改变 LLM 工具可用性、审批、执行或结果。`v0.1.5` 新增 release-note fragment，已发布的 `v0.1.4` 正文保持无差异。
- 实际运行：Plugin SDK 合同测试 15 文件/72 例通过；Desktop 定向测试 10 文件/93 例通过，修正 `AtPanelEntryModel` 测试断言后该文件 3/3 通过；`test:impact` 的 Desktop 1126 文件/6319 例（19 skipped）、theme-ui 33 文件/237 例及其余受影响包通过，但整体因 `presets/vetta-ui-design/test/engine-hmr.test.ts` 1/2 失败而退出 1。隔离重跑同一测试可复现：测试临时目录缺少 `src/styles.css`，该路径不属于本 Task 修改范围。完整 `bun run check` 在修复该断言的类型错误后通过（lint、全部类型检查、guards、mobile lint 均通过；声明头 ratchet `new=0`）。
- 未运行及原因：未启动真实 Desktop、未运行 `verify:ui:*`（未获实机验证授权）；未做发布、tag 或远端 Git 操作。人工功能验收待用户执行。
- Worktree：未拆出；用户指定主仓实施且该 concern 串行。
- 剩余风险：用户尚未实机验收；影响面测试会被未修改 preset 中可复现的 HMR fixture 失败阻断，未扩大本 Task 范围去修复。产品尚无 `sql-connect` / `datachat` 实例，因此没有虚构候选；无模式标签的真实候选仍按产品约定显示在两档。
