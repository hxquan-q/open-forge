---
id: TASK-0311
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement:
plan:
source: RESEARCH-0032 / GHSA-r95r-rj6r-c39x（上游修复 135fb545）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 7d26d1df6
read_paths:
  - packages/runtime-node/src/host/transactional-text-storage.ts
  - packages/runtime-node/src/mcp/auth/file-oauth-state-store.ts
write_paths:
  - packages/runtime-node/src/host/transactional-text-storage.ts
  - packages/runtime-node/src/mcp/auth/file-oauth-state-store.ts
  - packages/runtime-node/src/host/text-storage.test.ts
  - packages/runtime-node/test/mcp/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 凭据/状态文件创建即收紧权限（GHSA-r95r 泄露窗口）

## 目标

消除「先写入后 chmod」的权限窗口，并给 MCP OAuth 状态文件补上权限：`NodeTransactionalTextStorage` 的所有 `writeFileSync` 创建/更新直接带 `mode`（保留 chmod 兜底，对齐上游 `135fb545`）；`FileMcpOAuthStateStore.save` 的目录 `0700`、文件 `0o600` 同样创建即生效。

## 范围

### 并发评估

- 结论：支持（本会话串行执行）
- 执行方式：serial
- 可并行 Task：TASK-0310/0312/0313（不同文件域）
- 前置依赖：无
- 冲突文件/独占路径：`transactional-text-storage.ts`、`file-oauth-state-store.ts` 及其测试
- Branch：main
- Worktree：不拆出
- 集成负责人：本会话
- 集成顺序：随 main 串行提交

### 做

- `transactional-text-storage.ts`：`write()` 与 `ensureStorage()` 的写入统一走带 `{ encoding, mode: this.fileMode }` 的单一路径；chmod 保留。
- `file-oauth-state-store.ts`：`save()` 目录 `mkdirSync(..., { recursive: true, mode: 0o700 })`，写入带 `mode: 0o600` + chmod 兜底。
- 回归测试（非 Windows 断言 mode 位）：新建/更新后 `statSync().mode & 0o777` 分别等于 `0o600`/`0o700`；OAuth state 文件同样断言；Windows 跳过位断言但仍断言写入内容不变。

### 不做

- 不引入 temp+rename 原子写（该主题属会话原子性批次，且 BUG-0054/0060 有既有约束）。
- 不动桌面端 `cloud/auth/credential-store.ts`（已带 mode 创建，亲核无此缺陷）。
- 不做 DPAPI/safeStorage（Windows 侧独立议题）。

## Given / When / Then

- Given：多用户 Linux/macOS 主机，运行时首次创建或更新 auth/设置/OAuth 状态文件；
- When：`NodeTransactionalTextStorage.withLock*` 写入、或 `FileMcpOAuthStateStore.save` 持久化 token；
- Then：文件自创建瞬间起权限即为 `0o600`（目录 `0o700`），不存在 0666&umask 窗口；读写与锁语义、JSON 内容不变。

## 必须保持

- 锁语义（proper-lockfile 同步/异步路径）与 `initialContent` 行为不变。
- OAuth state 的 `updatedAt` 覆盖行为与 `parseMcpOAuthStoredState` 合同不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-node/src/host/text-storage.test.ts`、`packages/runtime-node/test/mcp/oauth-state-and-provider.test.ts`
- 用户流程：MCP OAuth 授权落盘 → 重启后 `load` 恢复（现有测试流）
- 质量检查：`bun run test:impact -- <changed>`；收尾 `bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：不适用（权限由测试断言；Windows 位断言平台跳过）
- 发布：未授权

## 功能验收包

- 入口与前置条件：任一触发 auth 存储或 MCP OAuth 授权的流程
- 操作步骤或 AI 任务输入：完成一次 OAuth 授权/凭据写入
- 预期行为与最终产物：落盘文件 mode 为 0600，内容与旧行为一致
- 不通过表现与已知限制：Windows 上仅验证内容，mode 位由 Linux CI 断言
- 验收反馈及回归案例：

## 交付记录

- 实际修改：`transactional-text-storage.ts` 写入统一带 `{ encoding, mode: fileMode }`（chmod 保留兜底，对齐上游 `135fb545`）；`file-oauth-state-store.ts` 的 `save()` 目录 `0o700`、文件写入带 `mode:0o600` + chmod。测试：`text-storage.test.ts` 新增「写入调用本身携带 mode」的 fs 调用合同断言（终态断言抓不到创建窗口）；`oauth-state-and-provider.test.ts` 新增调用合同断言（跨平台）+ POSIX 终态位断言。
- 实际运行：定向 3 套件（text-storage / oauth-state-and-provider / interactive-oauth-flow）18 例全绿；`test:impact` 全量执行（归因汇总见 TASK-0313）。
- 未运行及原因：Windows 位断言平台跳过；不做 temp+rename 原子写（属会话原子性批次，BUG-0054/0060 约束另行评估）。
- Worktree：未拆出（串行小改动）
- 剩余风险：Windows 上 mode 大体无效（读写语义不变），DPAPI/safeStorage 为独立议题。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
