---
id: TASK-0017
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop]
write_paths: [packages/coding-agent, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0016]
conflicts_with: [TASK-0018, TASK-0019, TASK-0028]
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---

# Work Agent Profile 基础（implementation-plan 阶段 3a）

## 目标

定义并装配 Work Agent Profile 的 Prompt、Memory 和 capability contributions，复用
已有 Runtime/Task/Artifact/Permission。Shell 与项目级 WorkspaceMode 由 TASK-0024
负责；本 Task 不重建 Mode Switcher，也不自行决定 WorkspaceMode、会话 `agentMode`
和 capability profile 的关系。

## 范围

### 并发评估

- 结论：不支持并发（Work Profile/Prompt/Memory 合同是后续 Work/Coding 任务的公共地基）
- 执行方式：serial
- 前置依赖：TASK-0016（Approval/Trust 合同）
- 冲突：TASK-0018/TASK-0019/TASK-0028（共享 Work/Coding Profile 合同先冻结）
- 集成负责人：coordinator

### 做

- Work Prompt、Memory 与产品能力贡献的装配合同；
- 为文档能力定义输入、`document` Artifact、Review/Export 所需的产品结果合同；端到端文件入口由 TASK-0028 实现；
- 若 ISSUE-0005 决定使用独立 capability profile，限定其 Owner、默认值与 Tool Policy 的关系，并同步更新 ADR。

### 不做

- 文档文件入口与导出 UI（TASK-0028）；
- 批处理/研究/数据分析入口（TASK-0018/TASK-0025/TASK-0026）；
- coding 侧增强（TASK-0019）；
- 云端执行。

## Given / When / Then

- Given：宿主按 ISSUE-0005 冻结的合同创建 Work Agent Session；
- When：Desktop Composition 绑定 Profile、Prompt、Memory 与 capability contributions；
- Then：Session 只编译该 Profile 声明的产品资源，Artifact/Tool/Permission 仍使用共享 Runtime 合同；文件到文档 Artifact 的用户流程由 TASK-0028 覆盖。

## 必须保持

- 两模式共享 Runtime/Task/Artifact/Permission 基础设施；
- WorkspaceMode、会话 `agentMode` 与 capability profile 不通过同一个字段隐式互相改写；
- work 与 coding 的能力边界只能按 ISSUE-0005 冻结的合同实现，Prompt 不是权限边界。

## 测试与验证

- 定向：Work Profile Composition 合同测试；文档入口用户流程由 TASK-0028 覆盖；
- 质量检查：`bun run check:quick`、desktop tsc。

## 阻塞

- ISSUE-0005 尚未决定 WorkspaceMode、会话 `agentMode` 与 capability profile 的关系；决议并同步 ADR 前，不实现按 mode 隔离 Tool Catalog。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

- 实际修改：
  - `coding-agent`：`profiles/agent-profiles.ts`（`work`/`coding` 内置能力 Profile：
    work 默认不含 bash/shell、Memory 开启；`applyAgentProfileDefaults` 仅在无显式
    选择时应用默认，显式选择/模板永远优先）；`features/documents/contracts.ts`
    （文档处理请求、`document` Artifact 合同、Review 三分支与 Export 结果语义，
    入口由 TASK-0028 实现）；`./profile` 公开入口导出。
  - `apps/desktop`：`DesktopCodingAgentSessionConfig.capabilityProfile`（新建时由
    渲染层按 WorkspaceMode 派生传入，preload 类型同步）；`resolve-session-config`
    在装配 `agentConfiguration` 时折算 Profile 默认（人格绑定的显式白名单优先）；
    `useSessionOpener` 创建会话时传入派生值。
  - `docs/adr/0128-agent-profile-capability-axis.md`：三轴分离决策记录
    （ISSUE-0005 方案 C：WorkspaceMode=布局 / agentMode=提示词 / agentProfileId=
    能力默认；Profile 是默认不是边界；执行授权仍走 Tool Policy 与 Approval）。
- 实际运行：`packages/coding-agent` profiles 合同测试 6 项通过；根 `tsgo`、
  desktop `tsc`（本任务文件无错；工作区余下错误属并行会话 P0-3 在途文件）、
  `check:quick`（同上过滤）通过。
- 未运行及原因：Work Profile 端到端用户流程未测——按重写后的合同该流程属
  TASK-0028；本任务交付合同与装配折算。
- 剩余风险：capabilityProfile 未持久化到会话旁挂记录（恢复会话时由
  agentConfiguration 固化值生效，Profile 身份仅创建时使用）；Memory 默认开关
  尚未接到 memory feature 装配（memoryEnabled 字段已入合同，接入随 TASK-0018）。
