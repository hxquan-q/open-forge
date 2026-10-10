---
id: TASK-0223
type: task
status: verifying
priority: P1
owner: packages/ai
requirement:
plan:
source: BUG-0085（provider 连接被切断后回合长时间不进终态：停滞重试级联烧满 30 分钟预算）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0022]
related_bugs: [BUG-0085]
execution: parallel
branch: task/TASK-0223-turn-terminal-stall-bound
worktree: ../open-forge-wt/task-0223-turn-terminal-stall-bound
base_commit: 734505917
read_paths: [packages/ai/src/provider-kit, packages/ai/test/provider-retry.test.ts, packages/coding-agent/src/execution/session-interrupt-health.ts]
write_paths: [packages/ai/src/provider-kit/provider-retry.ts, packages/ai/test/provider-retry.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0085-turn-never-reaches-terminal-state.md, project/bugs/README.md, project/tasks/TASK-0223-turn-terminal-stall-bound.md, project/tasks/README.md]
exclusive_paths: [packages/ai/src/provider-kit/provider-retry.ts]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0154, TASK-0159, TASK-0197, TASK-0218]
integration_status: integrated
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# 给流式停滞加专用重试上限：死 provider 连接不再烧满 30 分钟瞬态预算

## 目标

provider 连接被切断（连接被接受但永不发数据）时，回合必须在**有限且可接受的**时间内落终态：最多再开 1 次停滞重试，之后立即以 `stream_idle_timeout` 失败结算。最坏等待从 ~30 分钟（10 × 180s）降到 ~2 个看门狗窗口（默认 180s ⇒ 约 6 分钟）。

## 范围

### 并发评估

- 结论：支持（独立 Task Worktree，不碰主工作区）。
- 执行方式：parallel
- 可并行 Task：与其他 packages/* 任务无写路径重叠
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`（`provider-retry.ts` 为本任务独占）；`.github/release-notes/v0.1.3.md`、`project/tasks/README.md` 是**所有活跃任务共写**的当前版本说明与索引，`check-task-worktrees` 报出与 TASK-0122/0123/0154/0159/0197/0218 的写域重叠，已按契约登记 `conflicts_with`（集成时这些文件按序串行合并；代码面互不冲突）。
- Branch：`task/TASK-0223-turn-terminal-stall-bound`
- Worktree：`../open-forge-wt/task-0223-turn-terminal-stall-bound`（base `734505917`）
- 集成负责人：coordinator（推送 `origin/dev` 需其授权）
- 集成顺序：本分支独立 `test:impact` + `check` 通过后由 coordinator 集成

### 做

- `packages/ai/src/provider-kit/provider-retry.ts`：新增导出常量 `PROVIDER_STREAM_STALL_MAX_RETRIES = 1`；`driveProviderRetryStream` 内维护停滞专用计数，停滞尝试超过上限时**不再消费 transient 预算**，直接以停滞失败结算（走既有 `pushSynthesizedError` 路径，`failure.message` 仍含 `stream_idle_timeout` 机器标记）。
- 既有语义保持：停滞仍 abort+drain 被放弃的 attempt（防双重计费）、静止仍消费 transient 预算（首次停滞重试的 `retry` 事件 reason 仍是 `transient`）、`maxRetries`/退避/其他轨道不变。
- `packages/ai/test/provider-retry.test.ts`：新增回归用例「provider 每次都停滞 ⇒ 最多 2 次 attempt 后落 `error` 终态」；先红后绿。
- 发布说明：`.github/release-notes/v0.1.3.md`「修复」一条（用户可见：死连接不再长时间“处理中”）。

### 不做

- 不改 `PROVIDER_STREAM_IDLE_TIMEOUT_DEFAULT_MS`（180s 仍是单次窗口；是否缩短另议）。
- 不改 transient / rate_limit 共享预算与退避公式，不改 `retry` 事件形状与 attempt 编号语义。
- 不引入 runtime 级回合总时限（另立评估；本切片先修停滞级联这一主导因素）。
- 不修态 A 的 UI 自救入口（`SendButton` 的 pending 禁用与 `isConversationBusyAtom` 驻留问题记在 BUG-0085「仍未定位」，需实机复现后再开切片）。

## Given / When / Then

- Given 夹具 provider 每次 attempt 都零事件停滞（连接被接受、永不发数据）。
- When 一次逻辑 provider 调用开始并走完重试循环。
- Then ≤ 2 次 attempt（1 次原始 + ≤1 次停滞重试）后发出 `error` 终态，`failure.message` 含 `stream_idle_timeout`；不再继续打开新 attempt。
- Given 停滞一次后恢复正常（既有测试场景）。
- When 循环继续。
- Then 仍允许那一次停滞重试并成功（行为不回归）。

## 必须保持

- `retry` 事件顺序与形状（`reason` / `attempt` / `maxAttempts` / `delayMs` / `errorMessage` / `failure`）不变。
- 调用方取消立即终止、不消耗预算；已 abort 信号不打开 attempt。
- 停滞 attempt 必须 abort + drain，不得留下会唤醒的旧请求。
- 输出上限静默修复（opaque 400/422）与本上限互不干扰。

## 测试与验证

- 定向测试：`bun run scripts/quality/test-pkg.mjs ai`（整包）或 `bun scripts/quality/run-vitest.mjs --run packages/ai/test/provider-retry.test.ts packages/ai/test/provider-stream-regression.test.ts`。
- 用户流程：本包无 UI；用户可见面为「死连接下回合在有限时间内落终态」，由 BUG-0085 态 B 复现步骤在实机验收。
- 质量检查：`bun run test:impact -- packages/ai/src/provider-kit/provider-retry.ts` 与完整 `bun run check`。

## 验收分层

- 工程验证：通过；`packages/ai/test/provider-retry.test.ts` 新增用例先红（旧实现打开 4 次 attempt）后绿；包内全量 63 文件 / 516 例、impact 33 文件 / 321 例、完整 check（lint/mobile-lint/types 五面/guards）全绿。
- 技术评审：自审；停滞上限只收紧停滞轨道，transient/rate_limit 预算、退避与事件形状未动，既有两例停滞用例保持通过。
- 集成：已完成——`d592dd53d`（实现 + 回归用例 + 发布说明）推 `origin/dev`（`734505917..6dbfee1e5`），随后台账批次 `e306d5812` 与 `merge(dev) 9beebe1e0` 收口并回推，`origin/dev == main == 9beebe1e0`。
- 人工功能验收：待验收（态 B：杀夹具进程后应在约两个看门狗窗口内自动落终态；态 A 的入口问题另议，见 BUG-0085）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：dev 模式 Desktop + 夹具 provider（`/control/slow`）。
- 操作步骤：发一条进入流式的消息 → 杀掉夹具进程 → 不点停止，计时观察。
- 预期行为与最终产物：约 2 个看门狗窗口内自动落 `turn.failed`（`stream_idle_timeout` 归类为停滞），UI 恢复可发送；「停止生成」仍可即时中断。
- 不通过表现与已知限制：超过 ~7 分钟仍无终态即为未达标；期间界面仍可能只显示转圈（页脚重连指示不反映 provider 级 retry，属 ISSUE-0022 收尾项）。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：
  - `packages/ai/src/provider-kit/provider-retry.ts`：新增 `PROVIDER_STREAM_STALL_MAX_RETRIES = 1` 与停滞专用计数；停滞超过上限时不再消费 transient 预算，直接以停滞失败结算；`streamWithProviderRetry` 的文档注释同步说明停滞在共享预算之外另有一层更紧的上限。
  - `packages/ai/test/provider-retry.test.ts`：新增回归用例「provider 每次都停滞 ⇒ 最多 2 次 attempt 后落 `error` 终态（`stream_idle_timeout`、仅 1 次 `retry` 事件、退避 1000ms）」。
  - `.github/release-notes/v0.1.3.md`「修复」一条（用户可见：死连接不再长时间「处理中」）。
- 实际运行：
  - 红：新用例在旧实现下 `expected [4 attempts] to have a length of 2`（旧实现继续在 transient 预算内重试停滞）。
  - 绿：`packages/ai/test/provider-retry.test.ts` + `provider-stream-regression.test.ts` + `provider-retry-policy.test.ts` ⇒ 3 文件 / 71 例；`packages/ai` 全量 ⇒ 63 文件 / **516 例**。
  - `bun run test:impact -- packages/ai/src/provider-kit/provider-retry.ts` ⇒ related 33 文件 / **321 例** 全绿。
  - `bun run check`：lint / mobile-lint / types（root·cli·desktop·docs·mobile）全绿；guards 首轮红在 `check-task-worktrees`（与 TASK-0122/0123/0154/0159/0197/0218 的 release-notes/索引写域重叠），登记 `conflicts_with` 后 `check:guards` 复跑全绿（`ratchet new=0`、release notes 校验通过）。
- 未运行及原因：态 B 的实机复现（杀夹具进程观察终态）需 dev 实例与夹具 provider，属人工验收；态 A 的 UI 自救入口未定位（记录在 BUG-0085，需一次实机复现确定驻留状态位）。
- Worktree：`../open-forge-wt/task-0223-turn-terminal-stall-bound`（`git worktree add ... 734505917`，branch `task/TASK-0223-turn-terminal-stall-bound`，`bun install --frozen-lockfile` 成功）；清理待集成后执行。
- 集成：已完成——分支提交 `d592dd53d` 推 `origin/dev`，台账批次 `e306d5812` 与 `merge(dev) 9beebe1e0` 收口后回推；`origin/dev == main == 9beebe1e0`；Task Worktree 已清理。
- 剩余风险：最坏等待仍约为 **2 × 180s ≈ 6 分钟**（未改单次看门狗，仅去掉级联乘法）；若用户开启中断自动续接，每轮同样有该上界（受既有 `maxContinueAttempts` 约束）。两次连续停滞即失败，不再等待第三次（更早把决定权交回用户/续接策略）。

