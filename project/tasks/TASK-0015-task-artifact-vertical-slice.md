---
id: TASK-0015
type: task
status: done
priority: P1
owner: packages/runtime-core
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0006
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, packages/runtime-storage, packages/runtime-node, apps/desktop]
write_paths: [packages/runtime-core, packages/runtime-storage, packages/runtime-node, apps/desktop]
exclusive_paths: [packages/runtime-core/src/task]
depends_on: [TASK-0008]
conflicts_with: [TASK-0016]
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---

# Task/Artifact 最小纵向切片（implementation-plan 阶段 1）

## 目标

由 `@vetta/runtime-core/task` 的合同创建并恢复真实 Task：状态绑定 root Session，
每次执行绑定已有 Turn；Artifact descriptor 与生命周期事件通过现有
Conversation Document/Repository 持久化；Desktop Activity Panel 从 Runtime observation
投影实时状态，并能在重新打开会话后恢复。

主 Owner 为 `packages/runtime-core`；`runtime-storage`/`runtime-node` 实现持久化适配，
Desktop 负责入口、事件投影和 Activity Panel。

## 范围

### 并发评估

- 结论：不支持并发（占住 `runtime-core/task` 合同与 Activity Panel 投影）
- 执行方式：serial
- 前置依赖：TASK-0008（合同已冻结）
- 冲突：TASK-0016（Approval 事件将复用 Task observation 通道）
- 集成负责人：coordinator

### 做

- Task 生命周期服务：绑定既有 Session/Turn，驱动 `RuntimeTaskEvent` 状态机；每次进入 `running` 都必须绑定该次实际 Turn；
- 将 Snapshot generation 从不可变 Task identity 移到每次 `task.turn_bound` 事件；`start/resume` 必须接收并保存对应 generation；
- 若更新已公开的 Task/event contract，提供明确 schema/API 版本；兼容已有记录或证明无持久化生产数据，并检查所有生产者/消费者；
- Artifact descriptor 投影 + `resolveArtifactAvailability` 接真实文件存储；
- Task/Artifact 事件经现有 Conversation Document 扩展写入 Repository；新建 RuntimeHost 后可从持久化事件重建；
- Main/preload 提供经校验的 Task command；Renderer Activity Panel 消费 Runtime observation，而非持有最终状态。
- 每个 `task.turn_bound` 事件保存对应 `turnId` 与当次 Runtime generation；Task 身份本身不固定单一 generation。
- 对事件版本、非法状态跳转、错误 `from` 状态和重复/乱序记录 fail closed，不把损坏记录静默归一化为有效 Task。

### 不做

- 独立 Task Runner / 第二套模型循环；
- Renderer 持有最终 Task 状态；
- Plugin 私自持久化 Artifact；
- 新数据库；
- L0-L4 风险策略（阶段 2）。

## Given / When / Then

- Given：Host/已注册工作流调用公开 Task create command，而普通 Chat 的升级策略按 ISSUE-0006 决定；
- When：Task 从已有 Session/Turn 执行、暂停或取消，应用关闭后以同一持久化 Repository 重建 RuntimeHost；
- Then：Activity Panel 显示恢复后的状态和 Artifact 引用；每一条 Turn 记录保留自己绑定的 generation，损坏事件被明确拒绝或隔离。

## 必须保持

- Task 不拥有第二套 Session/Turn 执行循环；
- Artifact 文件内容是唯一事实源，descriptor 可重建；
- 事件顺序 = 状态机提交顺序；Task 身份只固定 `taskId/rootSessionId`，generation 按 `task.turn_bound` 逐次记录；
- 取消/失败进入明确终态（复用 BUG-0001/0002 的 deadline 合同）。
- Artifact 新版本不覆盖历史版本引用；descriptor/checksum 与实际文件内容对应。

## 测试与验证

- 定向：状态机合同测试；使用临时文件目录的 Repository/RuntimeHost 集成测试覆盖关闭并重建；Desktop Activity Panel 组件测试；
- 用户流程：从冻结的 Task 入口发起 → 看 Activity → 执行/取消 → 重开同一会话 → 查看可恢复状态与 Artifact；
- 回归：未知 schema version、`status_changed.from` 与当前状态不一致、不可达转换、Artifact 版本被覆盖均失败；
- 质量检查：`bun run check:quick`、desktop tsc、runtime-core 全包。

## 范围边界

- 本 Task 只实现显式 Task API、生命周期与投影；不根据自由文本自行判断或升级普通 Conversation。
- Conversation → Task 的产品入口及升级规则由 ISSUE-0006 与 TASK-0028 决定。

## 交付记录

- 实际修改：
  - `runtime-core`：`StoredSessionEvent` 新增 `task.lifecycle.recorded` / `artifact.descriptor.recorded`
    会话级事实；`TurnPipeline.recordTaskFacts`（宿主显式提交）与 Turn 开始/终态推导
    （`task/turn-binding.ts` 纯函数，同一事务批落盘）；`task/session-projection.ts` 事件重放投影；
    `SessionEvent` 新增 `task.lifecycle` / `artifact.descriptor` 成员与 kernel 映射；
    `RuntimeHost` 暴露 `getTaskState` / `recordTaskFacts`（可选 `taskView` port，历史导入后端可缺省）。
  - `runtime-storage`：TypeBox 写/读 Schema、按 type 分发与写侧 `event` 字段口径统一。
  - `runtime-node`：无源码改动（codec 走 storage Schema）；fork 沿用既有 turnId 过滤语义，
    Session 级事实与 `context.recorded` 一致不随 fork 复制。
  - `apps/desktop`：主进程 `task-activity/` 领域服务 + `ipc/task.ts`（get-state / command，
    边界收窄）；preload `task` API；渲染端 `task-atoms` + `shared/task/task-projection`
    折叠/快照合并 + `useSessionEventController` 折叠 + Activity Panel 内置「任务」tab
    （状态、审阅三裁决、暂停/取消、Artifact 列表与缺失态、空态升级入口）；i18n zh/en。
- 实际运行：runtime-core/storage/node 全包 vitest（node 包存在与本任务无关的既有
  `tool-path-host` 环境性失败，本次未触碰该文件）；desktop 定向 92 项（activity-panel/
  task/codec/IPC）；`check:quick`、根 `tsgo --noEmit`、desktop `tsc --noEmit`、全量
  `bun run check` 通过。
- 未运行及原因：`verify:ui:*` 未运行（用户未授权实机 UI 验收）；真实 Electron E2E 未新增
  （组件/合同/集成层已覆盖任务页渲染、命令接线与持久化恢复路径）。
- 剩余风险：Task 创建为显式入口（符合 ISSUE-0006 推荐方案 B 的第一阶段），模型侧
  「建议升级」的结构化通道留给后续任务；多运行时（Team）会话只有主 runtime 可执行命令。
