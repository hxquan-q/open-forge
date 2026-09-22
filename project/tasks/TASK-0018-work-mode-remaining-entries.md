---
id: TASK-0018
type: task
status: ready
priority: P2
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
depends_on: [TASK-0017]
conflicts_with: [TASK-0019, TASK-0025, TASK-0026, TASK-0028]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---

# Work 文件整理入口：分类与批量重命名（implementation-plan 阶段 3b-1）

## 目标

在 Work Profile 和文档入口上增加一个可审查、可取消的文件整理流程：
用户选取一批文件后，Agent 先给出分类/重命名预览，用户审阅后才写入。
研究/知识库与数据分析分别由 TASK-0025、TASK-0026 交付。

## 范围

### 并发评估

- 结论：条件支持；先冻结 TASK-0017 Profile 合同与 TASK-0024 Workspace shell，
  文件整理逻辑与其他 Work 能力使用不同目录后才可 Worktree 并行
- 执行方式：serial
- 前置依赖：TASK-0016、TASK-0017、TASK-0024、TASK-0028
- 集成负责人：coordinator

### 做

- 文件选择、目标范围校验、分类/重命名计划预览、用户确认后的执行与逐文件结果；
- 将结果引用为已有 Artifact 合同支持的 `bundle` 或 `document`，保存来源与执行状态；
- 失败、取消、部分成功、重试时保留逐文件结果，不静默跳过或重复写入。

### 不做

- 研究/知识库入口（TASK-0025）；
- 数据分析入口（TASK-0026）；
- 自动回滚不可逆或外部副作用；失败后以可审查结果说明未完成项。

## Given / When / Then

- Given：用户在 Work 文件整理入口选择一组文件并描述分类/重命名目标；
- When：Agent 展示完整变更预览，用户确认后执行，并在中途取消或遇到部分失败；
- Then：只操作已审阅范围，每个文件都有明确结果，用户重开会话仍可查看执行记录；未确认时不写入。

## 必须保持

- 每类 Artifact 的 descriptor/来源/验证语义符合 TASK-0008 合同；
- 批量操作可取消；失败项有明确终态，重试不重复应用已成功的写入；
- 项目级授权和文件路径检查沿用 TASK-0016，不由 Work 模式绕过。

## 测试与验证

- 定向：预览/确认、拒绝、部分成功、取消、重试幂等与 Artifact 来源合同测试；
- 用户流程：选文件 → 预览 → 确认 → 查看逐文件结果/Artifact → 重开会话恢复；
- 质量检查：`bun run check:quick`、相关包影响测试。

## 阻塞

- TASK-0017 与 TASK-0024 尚未冻结 Work Profile / WorkspaceMode 关系；ISSUE-0005 决议前不把 mode 当作权限边界。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
