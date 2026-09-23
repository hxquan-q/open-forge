---
id: TASK-0073
type: task
status: done
priority: P1
owner: runtime-core/coding-agent
requirement:
plan: PLAN-0002
source_issue:
execution: serial
branch: forge/dev
worktree:
base_commit: forge/dev
read_paths: [packages/runtime-core/src/kernel, packages/runtime-core/src/observation, packages/coding-agent/src/compaction, packages/coding-agent/test, project/research/RESEARCH-0007-context-cache-stability-references.md]
write_paths: [packages/runtime-core/src/kernel, packages/runtime-core/test/kernel, packages/coding-agent/src/compaction, packages/coding-agent/test]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: done
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 内核消息上下文缓存稳定性度量与衰减投影稳定坐标化

## 目标

依据 `RESEARCH-0007` 的三家对标结论，补齐内核上下文管理的两个缺口：

1. **C1（kernel）**：消息上下文的缓存稳定性度量——新增纯函数模块计算相邻两次模型调用投影的最长稳定前缀（内容比较为主、对象身份仅作快路径），并以 kernel 观察事件（`runtime.context.stability`）按模型调用发布，使 Provider 缓存破坏可观测；文档化 `ModelCallContextTransformer` 的身份/内容保持合同。
2. **C2（coding-agent）**：衰减投影稳定坐标化——模型调用路径上 thinking 块清理的年龄门从 30s 墙钟（把清理推迟到 Turn 边界、缓存代价最高的位置）改为消息流坐标纯函数（出窗即清），消除墙钟造成的人为翻转集中；为 `microcompact` 补齐首个测试文件（当前零覆盖）。

## 范围

### 并发评估

- 结论：条件支持
- 执行方式：serial（本任务内部）；与桌面侧会话并行时靠路径隔离
- 可并行 Task：TASK-0063/0069（browser）、TASK-0070（team attribution）路径不相交
- 前置依赖：无
- 冲突文件/独占路径：无（验证结论：13 个计划触碰文件在 2026-09-24 工作区全部干净；automatic-compaction-strategy.ts 等此前疑似的在途改动已由 cbfdb9039/1cc8c9ce0 落库）
- Branch：forge/dev
- Worktree：无（主工作区路径级隔离）
- 集成负责人：本任务自持
- 集成顺序：kernel 先行、coding-agent 叠加，分原子提交

### 做

- runtime-core：`message-context-stability`（命名以实现定稿为准）纯函数模块 + `runtime.context.stability` 观察事件 + 无状态引擎 `resolveModelCall` 发布接线 + kernel index 导出 + 合同注释。
- coding-agent：`model-call-context-projection.ts` 的 microcompact 选项稳定坐标化 + `microcompact.ts` 行为调整（保持纯函数与幂等性）。
- 测试：kernel 模块单测（分类：first/append/prefix_rewrite/prefix_shrink；身份快路径；内容回退）+ 引擎级集成测试（观察事件在重写/追加场景下的发布与 fail-safe）+ microcompact 行为测试（出窗即清、幂等、keepRecent 保护、时间门移除后的跨 Turn 稳定性）。

### 不做

- m[0]/m[1] 双槽布局、分层摘要（historian）合同、跨会话记忆注入、`ctx_reduce` 工具、压缩后缓存卫生（登记于 RESEARCH-0007 D 节 deferred）。
- 不改 `@vetta/ai` 的 `Context` 类型（观察型方案，无 Provider 变更）。
- 不改 `reduceContextByPressure` 的压力驱动语义（其截断幂等且与压缩 bust 重合，见 RESEARCH-0007 C 节）。

## Given / When / Then

- Given：同一 Session 内连续两次模型调用，第二次仅在尾部追加了新消息；When：内核记录第二次调用的消息投影稳定性；Then：观察事件分类为 append-only，稳定前缀覆盖除新尾部外的全部消息。
- Given：transformer（或衰减投影）改写了历史中段某条旧消息内容；When：下一次模型调用记录稳定性；Then：分类为前缀改写，稳定前缀在该消息处截断，事件不暴露消息正文。
- Given：Turn 内突发长 tool loop（≥8 条带 thinking 的 assistant）后进入下一 Turn；When：投影 thinking 清理；Then：清理决策只由消息流坐标（出窗）决定，同一消息在相邻调用间不因墙钟翻转。
- Given：观察发布通道抛错；When：模型调用执行；Then：模型调用结果不受影响（fail-safe 合同）。

> 场景修订（Turn-scope v1）：原"压缩提交后分类为前缀收缩"场景降级至产品审计层。v1 追踪器是 Turn 作用域
> （无状态内核不持有跨 Turn 会话状态），Turn 首个调用恒分类 `first`；跨 Turn 的 compaction 边界归类需
> Session 级账本（快照合同变更，涉及 feature-compiler/capability 装配），按"度量先行"原则登记为后续任务，
> 产品侧可凭 `modelCallId`（`<turnId>:model-call:<n>`）在审计层关联压缩提交事件自行归因。

## 必须保持

- kernel 产品无关：观察事件只含计数/长度/分类，不含消息正文或路径。
- `ModelCallContextTransformer` 现有实现方（coding-agent 投影、扩展 transform）无需修改即继续工作；身份保持是 SHOULD 合同而非硬约束。
- 模型调用路径行为不变（除 C2 的清理时机外）：消息内容投影、token 估算、压缩触发阈值全部不变。
- 稳定性比较不得对大上下文产生显著开销：身份命中走快路径，内容比较按消息粒度缓存。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-core/test/kernel/<新测试>.ts`、`packages/coding-agent/test/microcompact.test.ts`、`test/context-pressure-reduction.test.ts`（回归）。
- 用户流程：kernel 引擎集成测试覆盖"追加/改写/压缩"三类真实调用序列（经由公共 TurnEngine 接口）。
- 质量检查：`bun run check:quick` 编辑轮次；完成后 `bun run test:pkg runtime-core` 与 `bun run test:pkg coding-agent`；`bun run check` 一次。

## 交付记录

- 实际修改：
  - C1（runtime-core）：
    - 新增 `src/kernel/message-prefix-stability.ts`：`compareMessagePrefixes` / `createMessagePrefixStabilityTracker` 纯函数模块，身份 `===` 快路径 + 复用 `messagesEqual` 内容回退，分类 `first`/`append_only`/`prefix_rewrite`/`prefix_shrink`，Turn 作用域追踪器保内核无状态。
    - `src/kernel/runtime-message-context.ts`：导出 `messagesEqual` 作为内核唯一消息相等性定义。
    - `src/kernel/runtime-observations.ts`：新增 `RuntimeContextStabilityObservation` 与 `RUNTIME_CONTEXT_STABILITY_OBSERVATION`（`runtime.context/stability`）。
    - `src/kernel/stateless-agent-core-turn-engine.ts`：Turn 作用域追踪器 + `resolveModelCall` 在 `finalizedMessages` 组装完成后按模型调用发布（`modelCallId = <turnId>:model-call:<n>`，双层 fail-safe）。
    - `src/kernel/contracts.ts`：Transform/Finalizer 身份保持 SHOULD 合同注释（提及 `contentFallbackCount`/`prefix_rewrite` 可观测信号）。
    - `src/kernel/index.ts`：公开导出（按字母序）。
    - 测试：`test/kernel/message-prefix-stability.test.ts`（7 例）+ `test/kernel/context-stability-observation.test.ts`（3 例，含隐私断言与稳定性通道抛错不影响模型调用；探针实现完整 Publisher 合同）。
  - C2（coding-agent）：
    - `src/compaction/runtime/model-call-context-projection.ts`：microcompact 调用点改 `maxAgeMs: 0`（出窗即清），`timeBoundary` 选项整体移除。
    - `src/compaction/runtime/context-runtime.ts`：退役 `projectionTimeBoundary` 管道（`now` 仍供熔断/背压/Prefire 使用）。
    - `microcompact.ts` 生产代码零改动（`maxAgeMs: 0` 语义既有，注释本就写明"0 = skip time check"）。
    - 测试：新增 `test/microcompact.test.ts`（8 例，首个 microcompact 直接测试文件）、`test/model-call-context-projection-stability.test.ts`（2 例）；改写 `test/runtime-core/context-runtime.test.ts` 原 "freezes time-based projection decisions" 为墙钟无关合同（原测试钉住已退役的 Turn 冻结时间边界机制）；`test/prompt-cache-verification.test.ts` 与 `test/runtime-core/context-runtime/model-call-context-projection.test.ts` 同步移除 `timeBoundary` 参数。
  - 文档：`packages/runtime-core/CHANGELOG.md` Unreleased Added、`packages/coding-agent/CHANGELOG.md` Unreleased Changed 各一条；本任务场景修订（Turn-scope v1）。
  - 任务编号：原 TASK-0071 与两个并行任务撞号，按磁盘既有编号顺延改号 TASK-0073（先例 e1432e4d2）。
- 实际运行：
  - 定向：`run-vitest.mjs --run` 两个 kernel 新测试文件（10 通过）、`context-runtime.test.ts`（41 通过）、8 个 compaction/projection 相关文件（64 通过）、`stateless-agent-core-turn-engine.test.ts` 回归（11 通过）。
  - 包级：`bun run test:pkg runtime-core` 通过；`bun run test:pkg coding-agent` 通过（先前唯一失败的 timeBoundary 合同测试已按新合同改写）。
  - 类型/静态：根 `tsgo --noEmit` 本任务全部触碰文件零错误；触碰文件 Biome 定向检查零问题。
- 未运行及原因：
  - `bun run check` 全量门禁当前红，但全部失败点经核实存在于 HEAD，非本任务引入：
    `check:types` desktop 段为 `date-picker.test.tsx` 的 react-day-picker 同版本双副本依赖冲突（node_modules 状态问题）；根 tsgo 另报 `context-runtime.test.ts` 4 处 `records.push` 返回值类型错误（cbfdb9039 引入）与 runtime-node/runtime-storage 两个 task-fact 测试的 `RuntimeTaskIdentity.generation` 缺失（e41d35d06 前后引入）。
    按多会话工作区隔离约定不代修他人域内文件；上述错误与本任务改动无因果（本任务文件在同类检查下全绿）。
  - `verify:ui:*` 未运行：无 UI 改动，且该命令需用户明确授权。
  - `bun run build:desktop` / `build:cli` 未运行：任务不需要构建产物。
- 剩余风险：
  - Turn-scope v1 不归因跨 Turn compaction 边界（见场景修订），产品审计层需以 `modelCallId` 自行关联压缩提交事件。
  - 30s→0 后 thinking 文本出窗即清，长 tool loop 中较早的 thinking 不再保留 30 秒宽限；签名保留（Anthropic 可重建），且清除本身单调、不再回翻。
  - 观测为 info 级默认静默通道，产品侧需主动订阅 `runtime.context/stability` 才可见；未接 Auditor 前仅测试内消费。
  - 发布说明候选文案（fork-only；ISSUE-0007 已定首发号 0.1.0 但尚未切入 Desktop manifest，按 CLAUDE.md 七节门禁暂存于此，不入 `.github/release-notes/`）：
    - 新增：内核按模型调用发布消息前缀稳定性观测（append-only / 前缀改写 / 前缀收缩分类与稳定前缀长度），Provider 缓存破坏可被产品审计层直接定位。
    - 改进：长会话中 thinking 内容的清理时机从"约 30 秒后"收敛为"超出最近 8 条窗口即清"，同一会话相邻请求不再因计时差异改写历史前缀，降低 Provider 缓存失效。
