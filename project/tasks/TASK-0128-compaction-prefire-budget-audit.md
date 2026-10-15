---
id: TASK-0128
type: task
status: done
priority: P2
owner: coding-agent
requirement:
plan:
source: user-request（审计对话 token 预算与优化；只读 Dev 日志）
related_requirement: []
related_plan: []
related_tasks: [TASK-0073, TASK-0081]
related_issues: []
related_bugs: [BUG-0045]
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: 54f20df4f
read_paths: [packages/coding-agent/src/compaction/, packages/coding-agent/test/, docs/adr/, apps/desktop/src/main/runtime-configuration/]
write_paths: [packages/coding-agent/src/compaction/runtime/compaction-prefire-cache.ts, packages/coding-agent/test/runtime-core/context-runtime/compaction-prefire-cache.test.ts, packages/coding-agent/test/runtime-core/context-runtime.test.ts, project/tasks/, project/bugs/, .github/release-notes/v0.1.2.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-27
updated: 2026-09-27
---
<!-- Copyright The Open Forge contributors. -->

# 对话预算审计与有效预压缩摘要复用

## 目标与归属

审计长会话 token 来源，消除历史只追加时不必要的重复预压缩；对应
[BUG-0045](../bugs/BUG-0045-compaction-prefire-regenerates-valid-summary.md)。代码归属
**Upstreamable**，没有 fork 特有行为、公共合同或持久化迁移。

## 范围与并发评估

- 串行：本次先复现、再修复和验证同一 Session-local 缓存；与既有 MCP 打包改动无交集。
- 使用本地 `main`，不创建并行 Worker/Worktree，不代用户重启 Dev、不发送真实模型请求。
- 输入：只读 usage 数值、预算配置字段、源码和测试；输出：脱敏统计、缓存修复及回归证据。
- 不调整全局压缩阈值、模型窗口、工具能力、原始历史或调用次数上限。
- 集成负责人：本任务执行 Agent；提交仅包含本任务路径，未经整批验收不推送其他提交。

## 审计基线（2026-09-27）

只读最近已落盘会话，未复制消息、SQL、凭据、完整配置或会话标识。

| 指标 | 数值 |
|---|---:|
| 用户 Turn / 模型调用 / 工具调用 | 4 / 60 / 106 |
| usage.input / usage.cacheRead / usage.output | 294,045 / 6,541,056 / 111,898 |
| 输入中 cacheRead 占比 | 95.698% |
| 首次 / 最后一次请求输入（含缓存） | 22,794 / 209,808 |
| 数据库查询工具调用 / 文本返回字节 | 82 / 226,606 |
| 已提交自动压缩事件 | 0 |
| 本地模型声明 contextWindow | 1,000,000 |

解释边界：累计输入包含重复读取的缓存，不能全部按未缓存输入价格解释；没有核验服务商账单或单价，
也不能只凭工具次数认定重复/无用查询。高缓存比例仅说明该样本整体，不证明所有请求前缀都稳定。

当前策略事实：

- [`context-pressure-reduction.ts`](../../packages/coding-agent/src/compaction/context-pressure-reduction.ts)：
  50%/75% 软/硬压力、最近 3 个真实用户 Turn 保护；百万窗口下 21 万输入不会触发裁剪。
- [`token-policy.ts`](../../packages/coding-agent/src/compaction/token-policy.ts)：
  `max(window - reserveTokens, window * (1 - minFreePercent / 100))`；两条件同时满足，
  与 Desktop 设置文案一致，不是 `Math.max` 误写。按未启用 Memory 调整的默认值为 964,000；
  Memory rollover 会提前调整阈值，不能把默认公式当作该会话的确切生效配置。
- [ADR-0126](../../docs/adr/0126-model-and-tool-call-budgets-are-opt-in.md)：正常调用次数上限显式配置，
  不能把上下文容量保护等同于累计 token 预算。
- 本任务的预压缩缺陷由确定性测试证实，但**不是上述无压缩样本的已证实主因**。

后续候选：新增与模型最大容量分离、显式启用的工作上下文软预算（例如 128k），先复用已有摘要/保留尾部机制。
更早摘要会额外调用模型、改变缓存前缀并可能丢失细节，需用户确认预算目标后另立 Task，不能擅自缩小所有会话窗口。

## 方案比较与不变量

- 直接修复：用已有 `isPrefireCacheValid` 验证缓存摘要原切点的前缀；有效则保留，分支变化则失效重建。
- 先重构替代：新增统一预算管理器/持久缓存会扩大状态与公共合同；当前类已独立拥有生命周期且易测试，无需重构。
- 保持同一时刻至多一个生成、单次消费、取消/dispose、错误观测、分支失效、原始历史不变。
- 继续复用预热时的旧切点（已有 `prefire.ts` 合同），让之后增长保留在尾部，不追逐滑动切点。

## Given / When / Then

1. Given 预压缩已完成且历史只追加；When 在预热带继续工具/对话并再次检查预算；Then 不再次调用摘要生成，
   正式压缩消费原摘要一次，之后全部消息保留。
2. Given 缓存摘要来自旧分支；When 切换到不含原前缀的分支；Then 重新生成，绝不复用旧摘要。
3. Given 摘要仍在生成；When 正式压缩/取消/释放；Then 既有 single-flight、AbortSignal 和清理合同不变。

## 测试与交付记录

- 初始基线：compaction / context-pressure-reduction / compaction-configuration / context-runtime 4 文件，
  72 passed、2 skipped（需真实 Anthropic 凭据的已有摘要测试，不调用真实 Provider）。
- Red：新缓存用例产生多余 `entry-4` 摘要；用户流程用例错误改用 `event-5` 而不是原 `event-3`。
- Green：
  `bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/runtime-core/context-runtime/compaction-prefire-cache.test.ts packages/coding-agent/test/runtime-core/context-runtime.test.ts packages/coding-agent/test/compaction-prefire.test.ts`
  — 3 文件、60 测试通过；覆盖追加复用、分支失效及预热 → 继续对话 → 正式压缩的连续流程。
- 影响测试：
  `bun run test:impact -- packages/coding-agent/src/compaction/runtime/compaction-prefire-cache.ts packages/coding-agent/test/runtime-core/context-runtime/compaction-prefire-cache.test.ts packages/coding-agent/test/runtime-core/context-runtime.test.ts`
  — 直接测试 2 文件 / 50 测试、相关测试 29 文件 / 138 测试分别通过（两批不作为去重总数）；
  脚本所需的 12 个依赖包构建通过，没有手动运行全量应用构建。
- 首轮 `bun run check:quick -- <本次 8 个文件>`：通过，显式范围为生产文件、两个测试、Task/Bug 及其索引、当前发布说明。
- 收尾再跑相同 `check:quick`：本任务 3 个 TypeScript 文件的 Biome 通过，但共享 guards 失败：
  并行新增改动 `packages/runtime-knowledge/src/index.ts` 缺修改声明头（ratchet new=1）。
  不调整该文件或声明头基线，最终全仓门禁仍待并行任务解决后复核。
- 发布说明已写入 [v0.1.2](../../.github/release-notes/v0.1.2.md)（初稿误投 v0.1.1.md；v0.1.1 已打 tag，按约定条目归入当前开发版本 0.1.2）。
- 首轮完整 `bun run check`：通过，包含根/CLI/Desktop/Docs/Mobile 类型检查、lint 及架构/项目守卫。
- 收尾文档状态更新后的第二轮 `bun run check`：失败（退出码 1）。两轮间工作区新增了本任务之外的
  `packages/runtime-knowledge/src/domain/local-source-scope.ts` 与
  `packages/runtime-knowledge/src/storage/local-source-store.ts`；lint 报 3 个错误，包含格式错误。
  类型检查、Mobile lint、架构/项目守卫均通过；未修改、格式化或暂存上述并行文件。
  因最终工作区门禁非绿，Task/Bug 保留 verifying，不把首轮通过解释成当前工作区全绿。
- 并行任务收口后第三轮完整 `bun run check`：仅剩 HEAD 提交遗留的
  `apps/desktop/scripts/packaged-native-dependencies.mjs` 修改声明头缺失（ratchet new=1）；
  补声明头后全量门禁通过（lint / types / guards / mobile-lint 全绿）。
- `git diff --check`：通过；本次 5 份 Markdown 中 12 个本地相对链接均存在。
- 本地 `main` 串行实施；门禁转绿后按路径原子提交本任务文件；未推送远端、tag 或 Release。
- Dev：`bun run verify:ui:status:dev` 返回 `ACTION_RPC_UNREACHABLE`；不启动/停止实例，未做 UI 或真实 Provider 验证。

## 验收范围与剩余风险

- 完成预算审计及已证实的重复预压缩缺陷修复；默认预算策略、公共类型、持久化和历史原文均不变。
- 正式压缩沿用原预热切点，保留的尾部可能比当下重新摘要更长，这是已有预压缩复用合同。
- 未用真实会话复跑比较费用或总 token，不能给出生产节省比例，也不宣称本修复解决无压缩样本的主要消耗。
- 独立工作上下文软预算属于后续行为决策，尚未实施；需确认允许提前摘要及其质量/缓存代价。
