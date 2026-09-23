---
id: TASK-0028
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: task/TASK-0028-work-document-processing
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
- 文档 Task 由 TASK-0006 冻结的 promotion rule 创建，不从任意 Prompt 隐式推断权限。

### 不做

- 文件批处理、知识库研究和数据分析（分别由 TASK-0018、TASK-0025、TASK-0026 交付）；
- 云端上传、覆盖源文件的默认行为或不可逆批处理；
- 新建第二套 Conversation/Turn 执行循环。

## Given / When / Then

- Given：用户在 Work 文档入口选择一个本地文档并输入“总结成一页会议纪要”；
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

- ISSUE-0005 已裁决方案 C（done）。ISSUE-0006（Task 创建规则）仍为 draft：本切片按其推荐的方案 B（注册入口声明式创建 Task）实施；其正式决议前保持 `verifying`，不进入 `done`。depends_on 已全部完成（2026-09-23 校准）。

## 交付记录

- 实际修改：
  - Work 右栏新增文档处理三节（来源 / 产物 / 审阅与导出）：来源选择走系统文件对话框，目标 + 来源路径经既有全局发送通道发起任务；产物列表支持文本预览；审阅区支持 Review 决策与导出到本地。主进程补齐 artifact 工具（create 落会话旁暂存目录、attach_to_task 委托 Task 控制面）、Task IPC（getState / runCommand / readArtifact / exportArtifact）、document-export 导出服务与 artifact-broker 测试；DefaultChatView 在 workspace 模式下挂载新组件。i18n 补充 zh/en 文案。
  - 修复 HEAD 既有回归（f3fed63cc 迁移公共导出时遗漏）：`@vetta/coding-agent/projects` 子路径重新导出 `resolveCapabilityNameConflict` / `resolveToolCatalogPolicy`，desktop 的 resolve-session-config 导入恢复可解析；public-api-subpaths 合同测试同步跑绿。同时收敛 artifact-broker 内部联合类型分支，并把 commandErrorMessage 的翻译函数签名对齐仓库既有 `TFunction<"chat">` 模式。
  - 基础接线：desktop vitest 增加 `@vetta/action-rpc` 等 source alias，tsconfig 增加 `@vetta/coding-agent/projects` path map，function-extensions 公共面导出 document contracts 类型。
  - Release Notes 候选句（Open Forge 首发版本未定，暂存此处，不写入继承的 Vetta Release Notes）：工作模式新增文档处理入口：选择来源文档并描述目标即可发起任务，产物可在右栏预览、审阅并导出到本地。
- 实际运行：
  - `bun run check:quick -- packages/coding-agent/src/projects/index.ts apps/desktop/src/main/task-activity/artifact-broker.ts apps/desktop/src/renderer/domains/workspace-mode/components/WorkDocumentSections.tsx`：通过（Biome + 全部 guards）。
  - 定向测试（run-vitest.mjs，全绿）：coding-agent public-api-subpaths 3/3；desktop artifact-broker 6/6、ipc/task 6/6、WorkDocumentSections 9/9、DefaultChatView 4/4、document-export 6/6。
  - desktop 手动 `tsc --noEmit -p apps/desktop/tsconfig.json`：通过，0 错误。
  - 完整 `bun run check`：lint / guards / docs-site / cli-host / mobile 全绿。
- 未运行及原因：
  - 完整 check 中 desktop typecheck 子命令在本机失败：环境缺少 bunx（PATH 无 bunx），非代码问题；已用手动 tsc 等价覆盖并通过。
  - root tsgo 报 2 个既有错误（runtime-node/test/conversation/task-fact-persistence.test.ts 与 runtime-storage/test/conversation/task-fact-record-schema.test.ts 引用已从 RuntimeTaskIdentity 移除的 generation 字段）：两文件相对 HEAD 无本地改动，属基线滞后，不在本任务范围。
  - 未运行 verify:ui:*（用户未授权）；Electron 实机流程待授权后验证。
- 剩余风险：
  - 主工作区全量 desktop 测试曾出现 SSH 相关 12 个失败（media-protocol、command-spawner.remote、filesystem-service.remote-flow、resource-runtime.remote）：这些测试用 ssh://build-01 硬拼 Windows 临时路径（POSIX 假设），parseProjectLocation 必然抛 Malformed，与本任务改动无关，属测试层既有环境问题。
  - useSessionManager / date-picker 相关测试在高并行负载下曾超时，涉及文件与本任务无关；本轮已用定向测试覆盖改动面。
  - artifact create 之外的 update/get/list 分支仍按合同返回 unimplemented，由后续任务承接；document-export 仅支持纯文本内容类型，富格式导出待后续任务。
  - 未提交：所有改动留在 worktree 工作区，等待集成负责人审阅与合并。
