---
id: TASK-0025
type: task
status: verifying
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024, TASK-0028]
conflicts_with: [TASK-0018, TASK-0026]
integration_status: integrated
created: 2026-09-22
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# Work 本地研究与来源整理

## 目标

在既有 Knowledge Runtime 上交付一个端到端本地研究流程：检索用户选定的项目资料、回答问题、附上可追溯来源，并把经过 Review 的证据整理为 `research-evidence` Artifact。

## 范围

### 并发评估

- 结论：条件支持；必须先冻结 TASK-0017 Work Profile 与 TASK-0028 Activity/Artifact 面板合同。
- 执行方式：serial（默认）；仅在 Skill/Runtime-knowledge/Activity UI 写路径独立后再拆 Worktree。
- 前置依赖：TASK-0015、TASK-0016、TASK-0017、TASK-0024、TASK-0028。
- 集成负责人：coordinator。

### 做

- 使用显式注入的本地 Knowledge root；列出检索范围、来源 URI、摘要及引用关系；
- 以 `research-evidence` descriptor 和引用清单产出可 Review 的结果；
- 缺失/已变更来源给出可恢复状态，取消和部分失败不丢弃已完成的来源记录。

### 不做

- 默认联网搜索或上传本地资料；
- 为 Work 单独创建 Session/Runtime/Knowledge Store；
- 未经用户确认向源文件写入改动。

## Given / When / Then

- Given：用户在 Work 研究入口选择一个本地资料集并提出研究问题；
- When：Agent 检索本地来源并生成带引用的摘要，用户检查来源后提交 Review；
- Then：每条结论都能回到明确来源，缺失来源会标出而不会编造，审核后的引用整理保存为 Artifact 并能在重开会话后查看。

## 必须保持

- Knowledge Runtime 拥有索引/页面存储规则，Coding Agent 只拥有 Tool/Prompt/投影策略；
- 不访问默认 home 根，宿主显式注入路径；
- `details`/UI payload 不进入模型可见 `content`。

## 测试与验证

- 定向：检索命中/空结果/失效来源合同测试、Artifact 来源关联与重放测试；
- 用户流程：选择本地资料 → 提问 → 查看带引用结果 → Review → 重开会话验证引用；
- 质量检查：`bun run check:quick`、runtime-knowledge/coding-agent 影响测试和 Desktop 组件测试。

## 阻塞

- TASK-0028 已 done。本 Task 与 TASK-0026 共享 Work Panel 写路径并互相冲突，当前必须串行，由 coordinator 选定下一项。本 Task 不通过 WorkspaceMode 自动放宽网络或文件写权限。

## 交付记录

- 实际修改：runtime-knowledge 新增显式 root 的本地来源扫描域（白名单扩展名、排除依赖目录、深度/大小/数量上限、缺失/变更指纹复查）；coding-agent 新增 `research_scope` 工具（必填绝对路径 root、绝不回落默认 home）与 `vetta-research-sources` 引用清单格式（经 function-extensions 公共出口）；Desktop 组合注入 `researchScope`，Work「来源」面板加「本地研究」入口（选目录+提问走既有会话通道），`research-evidence` 产物预览时逐条复查来源状态（可用/缺失/已变更），IPC/Preload 新增 `verifyArtifactSources`。
- 实际运行：`local-source-scan` 6 用例、`research-tools` 合同/清单用例、`research-source-verify`、WorkDocumentSections（研究入口/产物复查）与 ipc/task 测试全绿；`check:quick` 绿。
- 未运行及原因：真实 Desktop 端到端冒烟（选目录→提问→产物→重开会话查引用）待 VERIFY-0012 批次统一实机验收。
- 剩余风险：模型是否稳定产出引用清单围栏格式依赖 Prompt 遵从；空清单时产物仍可复查但无来源列表；来源复查为只读 stat，不校验内容是否被同路径替换为语义不同文件（指纹含 size+mtime）。
