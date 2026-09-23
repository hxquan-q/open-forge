---
id: TASK-0019
type: task
status: done
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
write_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
exclusive_paths: []
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024]
conflicts_with: [TASK-0017, TASK-0018]
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# coding 模式增强（implementation-plan 阶段 4）

## 目标

在 coding 入口上交付：Project Context/Profile、Diff/Review 工作流、
Git 只读与写入的风险分级、Shell Sandbox 边界、Test Result Artifact、
coding Activity Panel、Tool/MCP deferred visibility。

## 范围

### 并发评估

- 结论：不支持并发（与 work 骨架改同一批 Profile/UI 入口文件）
- 执行方式：serial
- 前置依赖：TASK-0015（Task/Artifact projection）、TASK-0016（Risk/Approval/Sandbox policy）、TASK-0017（Profile）、TASK-0024（Shell/Activity 面板插槽）
- 集成负责人：coordinator

### 做

- Project Context 组装与 Profile 展示；
- 写文件默认走 Diff 而非静默覆盖；Diff/Patch Review 面板；
- Git 操作按只读/写入分级接入 Approval；Shell 落 Sandbox 边界；
- 测试输出落 `execution-result` Artifact；将 coding 专属信息接入 TASK-0015 的共享 Activity Panel 插槽，不另建第二套 Task 状态面板。

### 不做

- 远程 Task 调度、团队协作（MVP 排除）；
- 新 Diff 引擎（复用现有 diff 渲染）。

## Given / When / Then

- Given：用户在 coding 布局中打开已选项目；
- When：Agent 修改文件、用户审查 Diff、运行测试，并尝试一项 Git 写操作；
- Then：Diff 可审查并接受/拒绝，Shell 经既有 Sandbox，Git 写操作依 TASK-0016 风险合同审批，测试结果作为 Artifact 出现在共享 Activity Panel；拒绝审批不会执行副作用。

## 必须保持

- 修改文件默认产生 Diff，不静默覆盖；
- L4 操作在任何 Trust 状态下都需确认；
- coding 工具集不外溢到 work。

## 测试与验证

- 定向：Diff/Review 接线测试、Git 写操作经真实 Tool Policy 拒绝/批准测试、Test Artifact projection 测试；
- 用户流程：选项目 → 改码 → 审查 Diff → 运行测试 → 审批 Git 写入或拒绝 → 查看 Artifact/Activity；
- 质量检查：`bun run check:quick`、相关包全量测试。

## 阻塞

- ISSUE-0005 尚未冻结 WorkspaceMode、会话 `agentMode` 与 capability profile 的关系；本 Task 不自行引入 mode 级权限过滤。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

- 实际修改：
  - `coding-agent`：`execution/permissions/shell-risk-rules.ts`——参数级风险提升，
    force push / reset --hard / rm -rf / 管道执行远端脚本等破坏性模式升 L4
    （项目信任盖不掉，永远逐次确认），常规 git 与普通命令保持 L3；
    `features/artifacts/`——`attach_artifact` 模型工具：测试结果、报告等产出
    登记为任务产出物（execution-result 等 descriptor，文件内容仍是事实源），
    未注册宿主函数的会话不出现该工具。
  - `apps/desktop`：审批拦截器接 `raise` 规则（装配接线）；attach 函数落点挂到
    会话当前活跃任务（TASK-0015 任务面）。
- 实际运行：shell 风险规则 3 项、审批拦截器（含 raise 传播）11 项通过；coding-agent
  全包回归通过；根 `tsgo` / desktop `tsc` 对本任务文件无错（工作区剩余错误属并行
  会话在途的 result-policy 改动）。
- 未运行及原因：Diff 审查与 Shell Sandbox 未新增实现——既有产品面（本轮变更卡片、
  Git 面板 diff、沙箱授权链）已满足「写文件不静默覆盖、Shell 走既有 Sandbox」，
  本任务按重写后合同把增量收敛在风险分级与 Test Artifact 接线。
- 剩余风险：Project Context 展示复用 workspace facts 与 ADR-0128 Profile 轴，
  未另建面板；coding 信息接入共享 Activity Panel 由 TASK-0015 任务页承担。
