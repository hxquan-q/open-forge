---
id: TASK-0025
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
read_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024, TASK-0028]
conflicts_with: [TASK-0018, TASK-0026]
integration_status: integrated
created: 2026-09-22
updated: 2026-10-10
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

### 人工验收实测（2026-10-08，VERIFY-0017 组四；保持 verifying 待裁定）

方法：复跑本任务交付记录点名的四组套件（全部在主检出 HEAD `18a7bf7b4`）。合同的用户流程（选本地资料 → 提问 → 带引用摘要 → Review → 重开会话查引用）需要一次**真实模型回合**，本轮未驱动。

| 合同条款 | 本次读数 |
|---|---|
| 检索本地来源（白名单扩展名、排除依赖目录、深度/大小/数量上限、缺失或变更指纹复查） | `packages/runtime-knowledge/test/local-source-scan.test.ts` **1 文件 / 6 例通过**（与交付记录「6 用例」一致） |
| `research_scope` 工具与 `vetta-research-sources` 引用清单格式 | `packages/coding-agent/test/features/research-tools.test.ts` **1 文件 / 8 例通过** |
| 产物来源逐条复查（可用 / 缺失 / 已变更） | `apps/desktop/src/main/task-activity/research-source-verify.test.ts` **1 文件 / 2 例通过** |
| Work「本地研究」入口与产物复查触发 | `WorkDocumentSections.test.tsx` **1 文件 / 19 例通过** |
| **合计** | **4 文件 / 35 例通过，0 失败** |

- **未覆盖**：合同的核心承诺——「每条结论都能回到明确来源，缺失来源会标出而不会编造」「审核后的引用整理保存为 Artifact 并能在重开会话后查看」。这两句都以**模型产出引用清单围栏**为前提，需要一次真实模型回合；本轮唯一被授权的 `qwen3.8` 已被 [VERIFY-0018](../verification/VERIFY-0018-qwen38-real-provider-smoke.md) 判为端点输出不连贯并立案 [ISSUE-0031](../issues/ISSUE-0031-qwen38-endpoint-incoherent-output.md)，该 Issue 禁止其在闭合前用于任何真实流程验证 ⇒ **无可用授权模型**（与 TASK-0074/0155 同一成因）。
- 交付记录自己也就此写过：「真实 Desktop 端到端冒烟（选目录→提问→产物→重开会话查引用）待 VERIFY-0012 批次统一实机验收」——本轮**仍未做**，且现在多了一层模型阻塞。
- **关闭建议**：软件侧（扫描域、工具合同、清单格式、来源复查、入口）测试级成立；用户面与「模型是否稳定产出引用清单」属**客观阻塞**。建议按 TASK-0074/0155 同一口径裁定（软件合同闭合 / 模型效果层留待授权模型恢复），或等一次真实模型可用后补做用户流程。请用户裁定。

### 用户裁定闭合（2026-10-10，VERIFY-0017 分档口径；用户授权托管批量裁定）

按「按未覆盖成因分档」口径裁定（用户已授权托管批量闭合）。

- **清单行验收对象成立**：「摘要带引用、来源可检查」在授权模型 glm-5.3-flash 的真实 Work 回合中成立——逐条结论带原文引用与来源文件链接（尖括号形式），定价问题**如实标注「资料未覆盖」不编造**（判别性探针：夹具刻意不含定价信息），并做了跨来源一致性交叉印证；`research_scope` 工具被正确调用（root 指向用户选定目录），三份来源全部读取。
- **Artifact 尾条转 ISSUE-0033**：模型尝试产出 research-evidence 画布工件时受 [ISSUE-0033](../issues/ISSUE-0033-artifact-union-schema-gateway.md) 阻断（artifact 空参 ×3），按合同降级为等价落盘文件且**末尾规范清单块指纹逐字复制**（uri/sizeBytes/modifiedAtMs 与 research_scope 输出一致）——降级行为本身符合提示词要求。Artifact 面由 ISSUE-0033 修复后按其回归探针复验。
- Work 来源面板「本地研究」入口与来源复查为确定性 UI 面（本任务 35 例 + WorkDocumentSections 19 例已绿）；会话实录见 `~/.openforge-ui-debug/04987e4e/agent/sessions/--C--Users-xquan-AppData-Local-Temp-vetta-0025-materials--/`。
