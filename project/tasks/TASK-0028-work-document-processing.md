---
id: TASK-0028
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0006
execution: serial
branch: forge/dev
worktree: C:/Users/xquan/Desktop/open-forge-wt/TASK-0028-work-document-processing
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024]
conflicts_with: [TASK-0018, TASK-0025, TASK-0026]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Work 文档处理纵向切片

## 目标

交付首条可见 Work 流程：用户选择本地文档，Agent 按目标总结/改写/翻译/生成纪要，产出可预览、Review、导出的 `document` Artifact，并可从同一会话恢复。

## 范围

### 并发评估

- 结论：不支持并发（占用首个 Work Panel 文档区与 Artifact/Review 接线）。
- 执行方式：serial。
- 前置依赖：TASK-0015 Task/Artifact 投影、TASK-0016 写入授权、TASK-0017 Work Profile、TASK-0024 Workspace shell。
- 冲突路径：`apps/desktop/src/renderer/domains/workspace-mode`。
- 集成负责人：coordinator。

### 做

- 文档读取与输出路径由 Host 限定；生成计划和目标文件名供用户 Review；
- 生成内容先保存为新版本/暂存 Artifact，不静默覆盖来源文件；导出时检查目标与授权；
- Activity Panel 展示计划、生成状态、Artifact 预览、Review 与导出结果；取消/失败后保留原文和已生成版本；
- 文档 Task 仅由用户明确升级或注册的持久工作流入口创建；普通 Chat 不按 Prompt 复杂度自动升级，遵循 [`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md) 决议。

### 不做

- 文件批处理、知识库研究和数据分析（分别由 TASK-0018、TASK-0025、TASK-0026 交付）；
- 云端上传、覆盖源文件的默认行为或不可逆批处理；
- 新建第二套 Conversation/Turn 执行循环。

## Given / When / Then

- Given：用户在 Work 中明确启动文档处理 Task（显式升级当前会话或使用注册的文档工作流），选择一个本地文档并输入“总结成一页会议纪要”；
- When：Agent 生成内容，用户在 Artifact Preview 检查并批准导出位置；
- Then：源文档保持不变，产出有来源与版本的 document Artifact，Review 前不写到目标位置；重开会话后 Artifact/Review 状态可恢复。

## 必须保持

- 写入前受 TASK-0016 Tool Policy/Approval 约束，WorkspaceMode 本身不授予文件访问；
- Artifact 文件内容是事实源，descriptor/event 可重建且不覆盖历史版本；
- `content` 与 UI-only `details` 分离。

## 测试与验证

- 定向：来源读取边界、输出版本、拒绝导出、目标被占用、取消/失败恢复测试；
- 用户流程：选文档 → 生成 → 预览/修改目标 → Review → 导出 → 重开会话恢复；
- 质量检查：`bun run check:quick`、coding-agent/runtime-node/Desktop 影响测试。

## 阻塞

- 已解除：TASK-0015/0016/0017/0024 均 done，REQ-0001 验收条件已补齐，[`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md) 已裁决。实现已从独立 worktree 合入主工作区。

## 交付记录

- 实际修改：
  - Work 右栏接入文档处理四节（计划 / 来源 / 产物 / 审阅与导出）：来源选择走系统文件对话框，必须选中来源并描述目标后才通过注册工作流入口发送 `create` 并走全局发送通道；产物列表支持文本预览；审阅区支持 Review 决策与导出到本地。主进程补齐 Task IPC（readArtifact / exportArtifact）与 document-export 导出服务。`DefaultChatView` 在 work 模式下挂载新组件。i18n 补充 zh/en 文案。
  - 不平行注册第二套 `artifact` 宿主函数：create/update/get/list/attach_to_task 继续由已合入主线的 Canvas Artifact Service（TASK-0060）承接，避免覆盖同一 function token。文档切片只消费其 `document` kind 与版本化落盘。
  - `coding-agent` 公开导出文档处理合同类型（`DocumentProcessingRequest` / `DocumentExportResult`）。
  - Release Notes 候选句（Open Forge 首发版本已定为 `0.1.0`，但 Desktop manifest 仍继承 `0.5.59`，不写入继承的 Vetta Release Notes）：工作模式新增文档处理入口：选择来源文档并描述目标即可发起任务，产物可在右栏预览、审阅并导出到本地。
- 实际运行：
  - Desktop 定向测试（`apps/desktop` vitest 配置）30/30：document-export 7、document-read 2、ipc/task 6、DefaultChatView 4、WorkDocumentSections 11。
  - 回归：task-activity-service.artifact-renderer 3/3、function-extension-source 4/4。
  - `bun run check:quick -- <本任务文件>`：Biome + guards 通过。
- 未运行及原因：
  - 未运行 `verify:ui:*`（用户未授权实机验收）。
  - 未跑全仓 `bun run check`：主工作区同时有其他任务的未提交改动，全量检查不能单独代表本切片。
- 剩余风险：
  - document-export / 右栏预览仅支持本机纯文本内容；远程 SSH 产物返回不可导出/无法预览。
  - 保存对话框由用户选定目标路径，覆盖确认交给原生对话框，不另实现 `target-exists` 分支。
  - 改动尚未提交。
