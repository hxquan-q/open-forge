---
id: TASK-0289
type: task
status: done
priority: P1
owner: runtime-core
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0283, TASK-0288]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 82be7d535
read_paths:
  - packages/runtime-core/src/conversation/
  - packages/runtime-core/test/conversation/
write_paths:
  - packages/runtime-core/src/conversation/document-index.ts
  - packages/runtime-core/src/conversation/commands.ts
  - packages/runtime-core/src/conversation/document.ts
  - packages/runtime-core/src/conversation/history-projection.ts
  - packages/runtime-core/test/conversation/document-index.test.ts
exclusive_paths:
  - packages/runtime-core/src/conversation/commands.ts
  - packages/runtime-core/src/conversation/document.ts
  - packages/runtime-core/src/conversation/history-projection.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 会话文档命令 O(n) 扫描索引化（BUG-0127 修复路线 3）

## 目标

runtime-core 会话文档层的全部热点扫描随条目数线性增长，是 BUG-0127「越跑越卡」机制在命令/选择路径上的剩余部分（trace 采样：`appendCustomEntry` 重复检查谓词 20.2% + 命令体 6.1%、`selectBranch`/`selectBranchIds` 合计 2.2%）。引入按 entries 数组身份记忆化的文档索引（`byId` + `childrenByParent`），把以下调用从每次 O(n) 降为摊销 O(1)（每代 entries 数组最多建一次索引）：

- `appendCustomEntry` / `appendBranchSummaryEntry` / `appendLabelEntry` / `setActiveLeaf` / `resolveSubtreeTip` 的 `entries.some` 存在性守卫；
- `conversationDocumentEntry` 的 `entries.find`；
- `selectBranch`（commands.ts）与 `selectBranchIds`（document.ts）的每次 Map 重建（改为 O(深度) 链行走）；
- `childrenOf` 的全量 filter（`resolveConversationUserTurnTip` / `resolveSubtreeTip` 由 O(n·深度) 降 O(深度)）；
- `rewriteAfterRemoval` 内逐 compaction 条目重建 Map 的 `selectBranch` 调用；
- `history-projection.ts` 两处 `byId` Map 重建。

关键洞察：不改变条目列表的命令（`session.name.set`、`active_leaf.set`、`branch.select`）返回 `{...document}` 复用同一 entries 数组引用，按数组身份记忆化可在这些修订间跨命令命中；条目变更类命令创建新数组，索引自动失效重建，正确性依赖既有「文档深度只读、条目数组不原地变更」不变量（该不变量已被 TASK-0283 的共享缓存依赖）。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：runtime-core conversation 四个源文件与新测试
- Branch：`main`
- Worktree：不拆出（单模块切片，无并行写者）
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- 新增 `conversation/document-index.ts`：`conversationDocumentEntriesIndex(entries)` 返回 `{ byId, childrenByParent }`，WeakMap 按 entries 数组身份记忆化。
- 按上述清单改造 commands.ts / document.ts / history-projection.ts 的扫描点。
- 新增 `document-index.test.ts`：记忆化身份语义（同数组同索引对象、不同数组不同索引）、内容与暴力构造一致（byId 全量、childrenByParent 分组含 null 根）。
- 现有行为基线全绿（纯重构，语义不变）。

### 不做

- 不改 `ConversationDocument` 公开类型与任何命令语义/错误文案。
- 不从 `conversation/index.ts` 公开导出索引（内部模块，测试走包内相对导入）。
- 不动 `replaceLastUserTurn` 的局部 childrenByParent 构建（低频命令，改动无净收益）。
- 不做路线 6（IPC 增量序列化）与路线 5（渲染侧投影）。

## Given / When / Then

- Given：同一 entries 数组上先后执行多次查询（守卫/查找/分支选择），When：统计索引构建次数，Then：最多一次（摊销 O(1)/查询）。
- Given：任一命令在任一文档上执行，When：对比改造前后结果，Then：返回文档与抛错语义完全一致（现有全量基线）。
- Given：条目列表变更类命令产生新 entries 数组，When：后续查询，Then：索引按新数组重建，结果正确。

## 必须保持

- 「文档深度只读、条目数组不原地变更」不变量（索引正确性前提，与 TASK-0283 共享）。
- `childrenOf` 返回数组的调用方均先 `.filter()` 再 `.sort()`（不原地对索引数组排序）；在 `childrenOf` 上注明调用方不得原地变更。
- 所有既有命令/投影/持久化测试语义不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-core/test/conversation packages/runtime-node/test/conversation`。
- 消费者基线：runtime-core test/runtime-host、coding-agent 会话相关套件。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：通过；行为基线 73 文件 388 例全绿（runtime-core conversation/runtime-host、runtime-node conversation、coding-agent sessions/plan-mode/goal/todo/agent-configuration，含新增 `document-index.test.ts` 4 例）；desktop agent-teams 34 文件 235 例全绿；完整 `bun run check` exit 0（lint、五路 typecheck、全部 guards；首轮 typecheck 红 `childrenOf` readonly 返回类型 + 三个源文件缺 Modified 声明头，均已修复后复跑全绿）。
- 技术评审：自审；`childrenOf` 两处调用方均先 `.filter()` 拷贝再 `.sort()`（不原地变更索引数组）；type-only 回边不构成运行时循环依赖；`assertConversationDocumentGraph` 的增量 byId 是重复检测语义，刻意未接入索引。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：随 BUG-0127 用户侧长任务复测一并覆盖。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：任意会话（单聊/团队）正常运行；命令与模型消息选择持续发生。
- 预期行为：无可见行为变化；长会话下命令执行与分支选择成本不再随条目数线性放大。
- 不通过表现与已知限制：行为差异会被现有基线测试捕获；索引仅覆盖进程内文档对象生命周期。

## 交付记录

- 实际修改：新增 `conversation/document-index.ts`（`conversationDocumentEntriesIndex(entries)` → `{byId, childrenByParent}`，WeakMap 按 entries 数组身份记忆化）；commands.ts 六类扫描点（存在性守卫 ×5 处、`conversationDocumentEntry`、`selectBranch`、`childrenOf`、`rewriteAfterRemoval` 的 byId 复用）接入索引；document.ts `selectBranchIds`、history-projection.ts 两处 `byId` 接入；三个源文件按二开规范补 Modified 声明头；新增 `document-index.test.ts` 4 例（记忆化身份、byId 暴力对照、children 分组含 null 根、新数组重建）。
- 实际运行：行为基线 73 文件 388 例全绿；desktop agent-teams 235 例全绿；完整 `bun run check` exit 0。
- 未运行及原因：真实 Desktop 长任务 CPU 采样前后对照待用户侧复测（随 BUG-0127 人工验收一并覆盖）；纯重构无行为变化，不适用红基线（正确性由全量行为基线 + 索引单元合同证明）。
- Worktree：未拆出（serial 单模块切片）。
- 剩余风险：索引正确性依赖「条目数组不原地变更」不变量（与 TASK-0283 共享的前提，类型系统 readonly 已约束）；每代 entries 数组首次查询多付一次 O(n) 建索引，被同代后续查询摊销。
