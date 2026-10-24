---
id: PLAN-0002
type: plan
status: in_progress
priority: P0
requirement: REQ-0002
owner: runtime-core/desktop/ai
source: exprot/session-memory.md and exprot/differential-testing-observability.md
created: 2026-09-22
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 性能与可靠性基线

## 第一阶段

1. Provider 流协议 fixture。
2. Turn/Tool/Provider/MCP/Approval/Compaction/Team Member deadline。
3. bounded idle wait 与 recovery_required。
4. Compaction single-flight、滞回和冷却。
5. Main/Renderer/GPU/Heap/EventBuffer/Queue 快照。
6. 长会话与 Agent Team 内存上限。
7. WebGL、视频窗口和后台 Renderer 低功耗策略。

## 当前进度

- 第一阶段核心任务 `TASK-0002`–`TASK-0007` 与驻留/观测补强 `TASK-0010`–`TASK-0014` 均已记录为 `done`；`VERIFY-0001`、`VERIFY-0002` 也已完成。
- `RESEARCH-0004` 的 P0-1 至 P0-4 治理均已完成：`TASK-0032`（统一结果策略）、`TASK-0030`（IM 子进程堆上限）、`TASK-0031`（媒体引用化）、`TASK-0029`（子代理会话 LRU）。
- 本轮 P1 并发批次（Coordinator 主工作区 + 2 个 Worker worktree）：
  - `TASK-0033` 会话执行结果策略旁路：done，worktree 提交 `6a267ea` 同内容已落主工作区，6/6 测试绿。
  - `TASK-0035` transcript 视口占位：已实现并登记交付（`transcript-window` 服务+控制器、`fullHistoryToChatWithSpans` span 投影、`ChatTimelineItem` union、backlog 注册点×4、`rangeChanged` 驱动窗口化、占位行渲染与恢复），14 新单测 + 相关回归全绿，desktop typecheck 本任务文件 0 错误。
  - `TASK-0037` 事件分级背压：订阅者队列 delta 拼接合并、marker 可丢、终态与 delta 必达、microtask 批量投递（修掉逐事件 `flushSync` 空转与 `shift()` 丢终态）、`readSubscriberDeliveryStats` 接入 perf 快照 `eventDelivery`；19 runtime-core + 7 projection 测试绿。
  - `TASK-0041` 会话列表 stat 索引：流式 JSONL 元信息提取替代全量物化，120 会话合成库 72ms→29.9ms；`fileSizeBytes` 透传 + >4MB 会话打开确认（tail 末 10 轮 / full）。
  - `TASK-0054` MCP 懒启动+工具目录缓存：done，worktree 提交 `85ecb03`，已集成主工作区（lazy handle/签名缓存/原子写/命中不拉起进程），27+5 测试绿。
  - `TASK-0053` MCP stdio 空闲回收/退出杀树：done，worktree 提交 `95f92d8`，已集成主工作区（idleTimeout 30min 默认/0 关闭、进程树杀、退出 sweep），runtime-node mcp 18+desktop 10+sdk 3 测试绿。
  - 集成方式：两个 worktree 分支经 `git diff merge-base` 应用为 forge/dev 未提交改动（与在途工作共存，不产生提交）；`.github/release-notes/v0.5.59.md` 六条用户视角条目已归并。
- 其余 P1 ready 项为 `TASK-0034`（done 待核）、`TASK-0036`（在途）、`TASK-0038`（draft）。P2 防御项 `TASK-0039`、`TASK-0042` 仍为 draft。
- 已知在途干扰：`check`/`check:quick` 全量暂不可绿——工作区含多个其他 Agent 在途改动（plugin artifacts、task-activity、agent-text 去重契约 RED 测试、coding-agent/projects 路径映射守卫），本批任务文件自身 lint/format/typecheck 已清。

## 2026-10-24 Desktop 启动与占用优化批次

用户已授权按 [RESEARCH-0044](../research/RESEARCH-0044-desktop-startup-resource-audit.md) 的三个 P1 实施，复用 REQ-0002。此前进度保留为历史记录，不代表本批基线。

1. [TASK-0399](../tasks/TASK-0399-runtime-startup-async-probes.md)：运行环境子进程探测异步化，受控慢进程验证主线程可响应。
2. [TASK-0400](../tasks/TASK-0400-file-editor-lazy-startup.md)：文件编辑器按需加载，以同配置构建静态闭包和正常预览/编辑流程验证。
3. [TASK-0401](../tasks/TASK-0401-bounded-session-auto-restore.md)：启动自动恢复保持有界 tail，验证空元信息、大历史、分页与live兼容。

产品代码由 Coordinator 串行写入 main；只读调查与评审可并行。工作区其他修改保留，次级候选不自动纳入。各Task独立回滚，组合门禁通过后按原子提交交付；不以受控指标冒充实机启动/RAM收益，不运行真实用户实例或发布。

### 本批工程交付

- TASK-0399、TASK-0400、TASK-0401 均已完成实现、回归与独立复审，在本地 main 分别原子提交；Task 保持 `verifying` / `integrated`，等待实际体验验收，未推送或发布。自动恢复的提交同时承载本批计划与研究回链；共享导航提交例外见 WAIVER-0007。
- 运行环境慢探测期间事件循环可继续推进，超时/退出取消有回归；默认启动静态 JS 4,560,307→3,219,653 字节（-29.40%），gzip -29.32%；合成 2000 条历史的自动恢复 Renderer 驻留为 10 条，向上分页和显式 full 保留。构建字节与夹具条数不代表实机 RAM、CPU 或启动耗时降幅。
- 完整 `bun run check` 通过；影响范围其他包 102+236+1 项通过。Desktop 整包 6155 通过、3 项进程测试超时、18 跳过，相关文件隔离复跑 11 通过、2 原平台跳过，全部先前超时通过；不表述为单次整包或 `test:changed` 全绿。详细命令、日志与限制见各 Task。
- 未运行真实 Desktop、Provider、SSH 服务或 `verify:ui`，实机分进程占用与人工体验尚待验证；更广的性能可靠性计划仍为 `in_progress`，本批不覆盖次级缓存或隐藏窗口候选。

## 本计划完成标准

- 失败、取消和超时都有明确终态。
- 同一 Session 不并发执行多个 Compaction。
- 性能快照可以定位主要瓶颈。
- 所有优化都通过可重复基线或 A/B 数据验证。
