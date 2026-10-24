---
id: PLAN-0024
type: plan
status: done
priority: P1
requirement: REQ-0002
owner: runtime-core/agent-team/desktop
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0002, REQ-0006]
related_tasks: [TASK-0394, TASK-0395, TASK-0396, TASK-0397]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Agent 内核与 Team 执行性能：证据驱动优化

## 背景与目标

用户授权在前一轮只读调查基础上继续深挖，参考其他 Agent 项目，先产出 Plan/Task、开隔离 Worktree 后编码与优化。复用 [REQ-0002](../requirements/REQ-0002-runtime-performance.md) 的性能/可靠性目标与 [REQ-0006](../requirements/REQ-0006-agent-team-orchestration-alignment.md) 的团队合同，不建立第二套 Runtime。

目标是降低真实调度路径中的重复计算、无效等待与长会话成本，保持模型输入、工具/通知语义和持久化事实。基准不能通过删步骤、跳校验、截短产物或提前结束任务获益。

## 当前事实

- 调查基线 `main@ea67d951e`；`.ua` 图谱位于 `254796d8`，已对目标差异回读源码。
- 产品执行入口是 `runtime-core/kernel/stateless-agent-core-turn-engine.ts` → `agent/engine/run-agent-turn.ts`，非旧 SDK loop；已有安全工具窗口并发（默认 4）、失败止损与 Turn generation。
- Team 已有成员独立通道、任务恢复、持久通知、共享 checkpoint、队长优先预热和状态发布合并。TASK-0122 的让出回合引导已落地，旧 45 分钟数据不能代表当前性能。
- `TeamCollaborationStore.readFromDocument` 每次重建七类状态；通知读同样全历史扫描。共享上下文命中 checkpoint 前仍全量投影/序列化/指纹。成本与收益待测。
- 续跑期间的新通知受 `pendingContinuations` 抑制，收尾未立即重检查；是否等待 30 秒恢复扫描须确定性复现，尚非已确认 Bug。
- 主检出存在其他任务的未提交管理记录，不覆盖、不夹带；代码仅独立 Task Worktree。旧 Markdown 实验不再用于新目标，保留原记录。

## 候选方案与取舍

| 方案 | 取舍 |
| --- | --- |
| 同文档投影缓存、明确失效与有界/弱持有 | 首选，软件合同可差分验证；先做直接缓存，不预先设计复杂增量数据库 |
| 全量扫描改追加增量索引 | 只有缓存后仍有实测瓶颈才升级；需证明非追加/替换/恢复回退 |
| 通知消费后重检查 | 先复现；只针对新待消费记录准入，保留失败退避与 stop generation，不能 busy-loop |
| 内核减少重复物化、查找或事件队列搬移 | 从实际热路径选一项，有基线再实施，不凭大 O 单独承诺收益 |
| 更高并发、滑动窗口、改 Prompt/预算 | 涉及 steering、权限、模型行为，暂不混入本批纯性能任务；证据充分另补合同/ADR |
| 替换 Agent Runtime、引入第三方编排框架 | 拒绝，既有机制齐全且迁移风险高 |

## 阶段

1. [TASK-0394](../tasks/TASK-0394-agent-execution-reference-research.md)：固定一手源码版本，研究 Pi、Codex、OpenHands 等执行/状态/协作机制，记录可采纳与不适用项，形成 RESEARCH-0043。
2. [TASK-0395](../tasks/TASK-0395-team-state-projection-performance.md)：冻结混合负载与差分 oracle，优化 Team 状态读取/关联查询；独立 Worktree，Autoresearch 正式量化。
3. [TASK-0396](../tasks/TASK-0396-team-notification-drain.md)：显式同步点复现通知中途到达；证实则先登记 Bug 再修，证伪则保留证据与回归，不制造修复。
4. [TASK-0397](../tasks/TASK-0397-agent-execution-hot-path.md)：结合研究与 profiling，从内核执行链选择一个低风险热点，收紧合同后建立基准、优化、完整验证。
5. Coordinator 回收独立只读审查，逐 Task 验证与交付；满足主检出干净条件才集成，否则保留候选与清晰阻断。

研究/只读调查可并行，代码由 Coordinator 串行编写，每个代码 Task 独立 Worktree；共享测试与索引不并行写。集成顺序 0394 → 0395 → 0396 → 0397。

## 不做什么

不调用真实 Provider/付费 API，不读取真实用户状态、不操作用户 Desktop、不启动 UI 验证；不新增依赖、不推稳定分支/发布。不改变角色、消息、usage/stop、授权、取消、工具顺序、成员可见性与 stable ID/持久格式。

## 验证与回滚

- 每个 concern 有固定负载；性能实验与正确性回归分离。初始候选主指标为 Team 状态工作负载总耗时，各场景单独报告 p95/冷读/分配，不能称真实模型任务耗时。
- 负载覆盖小/长历史、1/4/8 成员、不同 entry 类型与修订；留出规模/随机种子、替换/恢复/失败/取消单独复验；交错 A/B，多次中位数，收益低于噪声不保留。
- 不变性由全量 oracle/差分、真实内部装配连续流程、并发与恢复测试证明；Mock 仅外部 Provider/I/O 边界。
- 每片定向测试 + test:impact，跨包 test:changed，最终完整 `bun run check`；未跑项明确列出。真实模型质量和费用仍未验证。
- 每个 Task 独立可回滚，无数据迁移。Autoresearch 自动提交/回退仅在所有变更均归当前 Task 的隔离目录执行，记录 ASI；不对主检出运行。

## 候选处置记录（2026-10-24）

- **EventStream FIFO 换容器：否决。** 真实生产节奏（消费方逐事件 await、队列近空）下 Array.shift 与双栈只差 0.2–0.5ms/2 万事件，低于噪声；27s 的二次成本只出现在消费者停滞的病态积压，而生产每 turn 事件量级远小于此。保留 Pi 双栈为参考，不引入。
- **工具名查找索引：未立项。** 每窗口 2 次 `.find`，工具目录规模（<100）下为微秒级；无量化瓶颈证据。
- **共享上下文 checkpoint 前置物化：部分完成，剩余降级。** 0403 把哈希降到 2.6×（fingerprint 19.4→6.9ms、checkpoint 构建 19.0→7.5ms/400 记录），剩余成本几乎全在 FNV 数学本身；无法在不改变已持久化值的前提下进一步优化算法。
- **pinned-context id 重复哈希：候选，暂缓。** `team-member-context.ts:40` 每 Turn 对同批 checkpoint 记录重算 pinned id（约 8ms/400 条）。已确认调用频次为每 Turn 一次（`context-runtime.bindForTurn`，非每模型调用）。优化空间存在但需拆分"公共部分 + 增量部分"的 id 组合方式，属于跨包合同调整，收益中频次低；在真实使用画像（成员数 × Turn 数 × 平均记录数）出来前不立项。

## 升级信号

测得共享上下文物化或通知扫描成为剩余主导成本时另开窄切片；出现调度语义/公共合同变化或真实模型调用需求时先补方案/授权。未达到留出集收益与正确性门槛即丢弃，不为刷分改夹具。

## 需要的 ADR

当前仅内部缓存与既有续跑合同修复不新增 ADR；若改变通知生命周期、并发窗口、预算或持久格式，先记录替代方案和迁移影响再实施。
## 集成终章（2026-10-24）

五项优化全部集成本地 main：0395 状态投影缓存（62359876f）、0396 通知排空修复（e78cad175）、
0397 帧释放（167255964）、0402 通知索引（cdd1104d2）、0403 哈希吞吐（1515a91dd）。
逐分支定向测试与完整 `bun run check` 全绿；`test:changed` 中 cli-host 与 desktop media/skills
的 11 个失败已用不含本批改动的基线 worktree 复跑证实为预存失败（skills 2 例在
main@ea67d951e 分支上同样失败，cli-host 为 256s 级超时负载问题），与本批无关。

候选处置：EventStream FIFO（否决，真实节奏差 0.2-0.5ms 低于噪声）、工具名索引（否决，
微秒级无证据）、pinned-id 重复哈希（暂缓，每 Turn 一次 8ms，需使用画像）、共享上下文
前置物化（0403 后降级为剩余 FNV 数学成本）。
