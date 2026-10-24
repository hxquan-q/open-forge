---
id: TASK-0397
type: task
status: done
priority: P1
owner: packages/agent/runtime-core
requirement: REQ-0002
plan: PLAN-0024
source: user-request / execution profiling
related_requirement: [REQ-0002]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0395, TASK-0396]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0397-agent-execution-hot-path
worktree: unassigned（已集成，待推送后清理）
base_commit: 1584b54dfd6db56ee49d070d652b886705355e4d
read_paths: [packages/agent/, packages/ai/, packages/runtime-core/, packages/runtime-subagents/, packages/coding-agent/]
write_paths: [packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts, packages/runtime-core/test/kernel/frame-release.test.ts, packages/runtime-core/scripts/frame-retention.bench.mjs]
exclusive_paths: []
depends_on: [TASK-0394]
conflicts_with: []
integration_status: integrated
created: 2026-10-23
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Agent 执行热路径的测量与窄优化

## 目标与范围

参考 TASK-0394 并沿生产路径找出一个可量化的执行开销热点，优先重复物化/查找/事件处理，不预先指定优化结果。分类 Upstreamable。当前仅允许只读调查；选定热点后收紧 write_paths、Given/When/Then 与指标并转 ready/in_progress，再开独立 Worktree。

条件支持只读并行；生产代码本批串行，禁止和 Team 工作共享目录写入。不重写内核、不新增依赖、不修改公开调度/steering、权限、Provider 或持久格式。真实 Provider 不运行。

## Given / When / Then

- Given 固定模型事件/工具输入，When 通过实际 runAgentTurn/TurnEngine 运行不同工具数、历史长度与 chunk 形态，Then 外部结果、工具顺序、失败/取消、usage/stop 与终止次数一致，框架开销有可复现改善。
- Given 短任务、长历史与未用于调优的输入形态，When 复测，Then 无高尾延迟/内存灾难性退化。

## 必须保持

Turn generation 固定、工具授权顺序、parallel-safe/exclusive 屏障、steering 窗口边界、错误/取消传播、终态唯一、AI Core 依赖边界。

## 测试与验证

至少纯文本、工具循环/多个工具、Provider/Tool 错误、取消、usage/stop 和恢复；正常连续用户流程需消费侧合同覆盖。使用 Node runner、impact/changed 与完整 check。固定负载、留出集、交错 A/B；无显著收益不保留，不为跑分放宽校验。

## 只读调查结果（2026-10-24）

原生 actor `f4532216-fafe-4c9` 已回收，未写代码/运行测试：生产 `StatelessAgentCoreTurnEngine.createRequest` 的 frames Map 每次 set、resolveModelCall get 后不删除，持有历史 frame（含递归复制的 schema/工具包装闭包）直至 Turn 结束；没有发现历史 frame 再消费路径。首选候选是读到 frame 后移除已消费 Map 项，保留局部 frame/currentFrame 和工具闭包，不能把历史保留误称为跨 Turn 永久泄漏。

验证应在活跃 Turn 的末次模型 gate 内观测 retained heap/引用路径，不能只在 Turn 完成释放后测；覆盖 initialFrame、动态工具、失败恢复、取消、composition、tracing，以及短调用无收益对照。实际内存收益未知，尚未实现。

RESEARCH-0043 另发现 Pi 的双栈 FIFO 可供 EventStream 对照，但本仓 fail/end/multiple-waiter 合同更强；该候选触及 ai 包，须另开/收紧 Task 并测实际积压，不与 frame 引用释放一起试。

## 实施结果（2026-10-24）

改动：`resolveModelCall` 取到 frame 后立即 `frames.delete(modelCallIndex)`，让每个已消费 frame 只作为 resolveTools→resolveModelCall 的一次性交接；局部 `frame` 与 `currentFrame` 仍持有本次调用所需的 instructions/tools/缓存布局，事件屏障、检查点、恢复与工具执行全部不变。

测量（`packages/runtime-core/scripts/frame-retention.bench.mjs`，`node --expose-gc`，在**最后一轮模型调用内**强制 GC 后再采样，因此所有更早的 frame 仍在活跃 Turn 里；每场景配对“只跑 1 轮同工具集”的对照并相减）：

| 场景 | 轮次 / 工具 / schema 深度 | 基线净增量 | 改动后 |
|---|---|---|---|
| short | 8 / 4 / 2 | 0.48 MB | 0.47 MB |
| loop | 40 / 24 / 4 | 1.74 MB | 0.74 MB |
| long | 101 / 64 / 5 | 10.91–11.22 MB | 1.86–1.87 MB |
| 合计 | — | **13.1–13.4 MB** | **3.1 MB** |

基线两次分别 13.126 / 13.125 MB，改动后 2.40–3.08 MB（跨会话波动），`spreadPct` 0.6–2.4%。剩余部分是当次调用的 frame 与夹具自身持有，不是历史累积。

**可失败的回归守卫**：`node --expose-gc packages/runtime-core/scripts/frame-retention.bench.mjs --assert-release` 断言 long 场景净占用 ≤5MB。实测——移除 `frames.delete` 后立即报 `11.22MB > 5MB` 失败，恢复后 1.87MB 通过。这是唯一能对“已消费帧被释放”失败的检查；`frame-release.test.ts` 三例锁的是既有语义（移除补丁后仍绿），已在文档中如实标注，不再声称它们保护了本次改动。

语义验证：`packages/runtime-core` 全量 93 文件 585 例、`packages/agent` 22 文件 149 例全绿；完整 `bun run check` 全绿。

**独立技术审查**（actor `e798cce0-25e0-496`）结论：无 P1/P2 阻断。逐项确认每个 `modelCallIndex` 恰好经历一次 `resolveTools`→`resolveModelCall`；`continue`、静默重跑、checkpoint retry 都回到循环开头获取新 index；`currentFrame` 在 `streamFn` 前赋值，composition lifecycle 只读闭包变量不读 Map。审查同时指出：`frame-release.test.ts` 三例移除补丁后仍全绿，属既有语义锁定——已按此意见新增 `--assert-release` 内存守卫作为真正的回归保护，并撤回原先“由该测试文件保护”的说法。

审查另指出基准可外推性有限：仅成立于合成 64 工具×depth5 schema，`heapUsed` 含 tsx/ESM 缓存与同进程重复累积态，故本文数字降为两位小数并以区间表述。

## 验收分层与交付记录

工程验证：内存收益已量化，套件全绿；技术评审：未执行独立审查；集成 pending；内部行为保持型优化人工验收不适用，模型质量未知；发布未授权。收益仅为活跃 Turn 的存活堆，未测 GC 暂停/延迟，不宣称端到端加速。

### 集成记录（2026-10-24）

集成提交 167255964；runtime-core 585 + agent 149 例通过。
