---
id: TASK-0283
type: task
status: verifying
priority: P0
owner: runtime-node
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: []
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 1ebf8ea6e
read_paths:
  - packages/runtime-node/src/conversation/
  - packages/runtime-core/src/conversation/
  - temp/log/team-chat-perf-bug-report.md
write_paths:
  - packages/runtime-node/src/conversation/file-conversation-repository.ts
  - packages/runtime-node/test/conversation/file-conversation-repository.test.ts
exclusive_paths:
  - packages/runtime-node/src/conversation/file-conversation-repository.ts
  - packages/runtime-node/test/conversation/file-conversation-repository.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# readDocument 接入 ConversationWriteCache（BUG-0127 修复路线 1）

## 目标

消除主进程会话读路径的全量物化热点：`FileConversationRepository.readDocument()` 复用 `loadAppendState()` 的 `ConversationWriteCache`（字节大小失效），使缓存命中时每命令/每 turn/每次 persist 的读成本从 O(JSONL 文件规模) 降为一次 `stat` + 缓存命中。该单一改动覆盖 trace 采样 ≈50% 热点（readDocument 45.7% + 行解析 3.8% + schema 校验 2.2% 的命中部分），并让 mutation-coordinator 的每命令全量重读（路线 2）自动变廉价。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`packages/runtime-node/src/conversation/file-conversation-repository.ts` 及其测试
- Branch：`main`
- Worktree：不拆出（单文件单包小切片，无并行写者）
- 集成负责人：本 Agent
- 集成顺序：本地 `main` 原子提交

### 做

- `readDocument()` 改走 `loadAppendState()`：stat 字节数 → 缓存命中返回缓存 document；未命中全量读 + 重建 + 刷新缓存（首次读取即为后续追加预热）。
- 回归测试：缓存命中不重读 JSONL（旧实现红）、外部写入经读路径字节失效、缓存热时文件损坏仍报 `CORRUPT`、v1 旧 schema 会话不缓存（保持全量读语义）。

### 不做

- 路线 2（协调器信任内存投影）、路线 3（`appendCustomEntry` 谓词索引化）、路线 4（团队 `persist()` 指纹降本）、路线 5（渲染侧投影）、路线 6（IPC 增量序列化）——后续切片。
- 不改 `load()`/`saveSnapshot()`（`StoredConversation` 需要事件记录，缓存不持有；且它们不是本次热点）。
- 不改缓存数据结构、LRU 上限或失效策略本身。

## Given / When / Then

- Given：当前 schema 会话已在本仓库实例内完成过一次读或写（缓存热），When：调用 `readDocument()`，Then：不重读 JSONL，返回与磁盘一致的 document（缓存 document 即最近一次成功物化结果）。
- Given：另一实例在锁下追加了事件（字节数变化），When：调用 `readDocument()`，Then：字节失效命中失败 → 全量读取并返回包含新事件的 document。
- Given：缓存热时外部写入损坏记录，When：调用 `readDocument()`，Then：报 `CORRUPT`（不吞损坏）。
- Given：v1 旧 schema 会话，When：多次 `readDocument()`，Then：每次全量读取，行为与修复前一致。

## 必须保持

- `ConversationDocument` 深度只读约定：缓存返回共享引用，任何消费者不得原地变更（与写路径既有共享语义一致）。
- 缓存失效合同：会话文件经本仓库只增不减；任何外部写入改变字节数自动失效；旧 schema 会话不缓存。
- `readDocument` 错误语义：`NOT_FOUND`（ENOENT）、`CORRUPT`（解析/校验失败）不变。
- 文件锁与 per-session 串行队列语义不变。

## 测试与验证

- 定向测试：`bun run test -p @vetta/runtime-node`（或仓库 Node runner 定向 `file-conversation-repository.test.ts`）。
- 用户流程：团队长任务（用户侧复测主进程长任务计数/LCP，修复后回贴）。
- 质量检查：`test:impact` 受影响范围；完整 `bun run check`。

## 验收分层

- 工程验证：通过；定向 27/27（含新增 4 例，红基线已先行验证：旧实现下缓存命中断言失败「expected 2 to be 0」）；跨包定向 conversation+runtime-host+coding-agent sessions 52 文件 243 例全绿；`test:impact` 判定无额外受影响面；完整 `bun run check` exit 0（lint 4825 文件、root/cli/desktop/docs/mobile 五路 typecheck、全部 guards 含 project-indexes 与发布说明 v0.1.3 校验）。
- 技术评审：自审；共享引用安全性与失效路径复核。
- 集成：pending；本地 main 原子提交。
- 人工功能验收：待验收（用户侧长任务复测）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：桌面端团队会话 + 一条持续产出事件的长任务。
- 操作步骤：任务运行数分钟，期间持续交互输入。
- 预期行为与最终产物：无累积性卡顿；DevTools Performance 主进程无随时长增长的 >1s 长任务簇。
- 不通过表现与已知限制：仍渐进变卡则采新 trace 对比（注意 chunk 命名陷阱）；LRU 容量外或跨进程重启后首次读仍全量（预期）。
- 验收反馈及回归案例：待回填。

## 交付记录

- 实际修改：`FileConversationRepository.readDocument()` 改走 `loadAppendState()` 共享缓存路径（stat 字节 → 命中返回缓存 document，未命中全量读并回填，v1 不缓存）；`documentCacheLimit` 注释更新为读写共用。实现来自并行会话的在途改动；实现会话停滞 37 分钟后，托管会话按授权审查收编（`ee7c8bd93`）。
- 实际运行：新增四条回归全绿——缓存命中不重读 JSONL（原型 spy 计数）、外部实例追加后字节失效回退全量并刷新、热缓存下追加损坏记录仍报 CORRUPT、v1 旧 schema 每次全量读不缓存；runtime-node 会话套件 22 文件 111 例全绿，全包 466/473。2026-10-17 下午补充：旧实现红基线复跑确认（缓存命中断言 expected 0 received 2）、跨包 52 文件 243 例全绿（含 mutation-coordinator 与 kernel backend 套件）、完整 `bun run check` exit 0。
- 未运行及原因：全包 7 例 glob/grep 契约红为本机无 ripgrep（`spawn rg ENOENT`）的环境性失败，与本改动无关；真实 Desktop 长任务 trace 前后对照待用户侧复测（人工验收）。
- Worktree：未拆出（serial 小切片，无并行写者）。
- 剩余风险：缓存返回共享 document 引用，依赖既有深度只读约定；字节数不变的原地损坏不会被读路径发现（既有失效合同的已知边界，与写路径一致）。
