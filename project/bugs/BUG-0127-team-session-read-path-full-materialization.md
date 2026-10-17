---
id: BUG-0127
type: bug
status: verifying
priority: P0
owner: runtime-node
requirement:
plan: PLAN-0002
source: user-report
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0283]
related_issues: []
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队长任务运行时主进程累积性卡顿：会话读路径全量物化被高频触发

## 用户流程

- Given：桌面端打开一个团队会话，会话内持续产出流事件（如 allstar-coding 多阶段长任务）。
- When：任务持续运行数分钟。
- Then：主窗口应保持可交互；实际输入延迟、掉帧随任务时长线性恶化（"越跑越卡"）。

## 实际行为

- 主进程（Electron main）长任务频发：同一 trace 实测 8 个 >1s，最长 3049ms。
- 渲染进程 97.2% idle、react-dom 全程仅 ~27ms——UI 卡是"等主进程 IPC 返回"，不是渲染画不动。
- 主窗口本地指标 LCP = 33.02s（任务更久后 ~97s 量级），INP = 224ms，CLS = 0.24。

## 期望行为

- 长任务期间主进程无秒级阻塞；会话数据读取成本不随文件规模被每命令/每 turn/每次 persist 全量重复支付。

## 环境与失败证据

- 环境：Windows 桌面端，团队会话 + 多智能体长任务流水线；报告人 chenxvhua（应用/插件层）。
- 证据：主窗口 DevTools Performance trace `Trace-20261015T123712.json`（20,106,133 bytes / 81238 events），CPU profiler `ProfileChunk` 采样重建，三轮独立复核（第三轮修正了第二轮的 chunk 名误判，结论以第三轮为准）。
- 主进程采样占比（去 idle 分母 ≈26.05s）：`FileConversationRepository.readDocument()` 45.7%、`readConversationFile` 行解析 3.8%、schema 校验 2.2%、`appendCustomEntry` 重复检查谓词 20.2% + 命令体 6.1%、`selectBranch` 合计 2.2%、string_decoder write 5.7%、GC 2.7%。
- 完整诊断报告：`temp/log/team-chat-perf-bug-report.md`（用户侧证据副本，未入库；本条目已自含结论）。

## 最小复现

1. 打开桌面端团队会话，启动一条持续产出事件的长任务流水线。
2. 持续数分钟观察输入延迟；DevTools Performance 录制可见主进程 >1s 长任务随任务时长增长。

## 影响

- P0：团队会话长任务场景基本不可用；单 Agent 长会话同样走 `turn-pipeline`/mutation-coordinator 读路径，受影响较轻但非零（推断，未单独 trace）。
- 非某插件专属：热点全部位于内核会话数据层（`runtime-node` / `runtime-core` / desktop 团队持久化），任何持续产出事件的团队长任务都会触发。

## 根因证据

置信度高（采样火焰图 + chunk 行号对照构建产物 + 调用链源码核实）：

1. `FileConversationRepository.readDocument()`（`packages/runtime-node/src/conversation/file-conversation-repository.ts:133-140`）无缓存，每次全量读 JSONL → 逐行 `JSON.parse` → 重建 `ConversationDocument`；而追加写路径已走 `loadAppendState()` 的 `ConversationWriteCache`（字节大小失效，:494-507），读路径完全绕过该缓存。
2. 高频放大器：`conversation-document-mutation-coordinator.ts:64`（每条文档命令前 `readAndSynchronizeProjection` 全量读，:56 重试再读）、`turn-pipeline.ts:327/767`（每 turn 两次）、团队 `persist()`（`team-session-state-repository.ts:54-76` 先读再对整份 session 双重 `JSON.stringify` 比较，`team-session-service.ts` 十余处调用）。
3. `appendCustomEntry` 的 `entries.some()` 谓词（`commands.ts:297`）与 `selectBranch`/`selectBranchIds` O(n) 扫描随 entries 增长。
4. 团队 coordination 会话文件随事件线性增长 ⇒ 每命令/每 turn/每次 persist 成本 O(文件规模)，单次退化到秒级且高频发生。

已排除：渲染侧投影（渲染 99.5% idle，O(n²) 事实保留为独立技术债）、所有权回填（Rollup 共享 chunk 命名陷阱，`team-ownership-backfill` 本体仅 77 行且有 WeakMap 守卫）、"每事件写整份文件"（写路径本就是 append-only + writeCache）、旧 BUG-0101（已修复）、themes 子进程（~84ms）。

## 回归测试

- TASK-0283：`readDocument` 缓存命中不重读 JSONL（旧实现每次全量读，计数断言红→绿）、外部写入经读路径字节失效、缓存命中后文件损坏仍报 CORRUPT、旧 schema 会话不缓存。
- TASK-0288：`persist()` 热路径单次序列化（旧实现红基线「expected 1, got 2 times」）、内容变化追加并刷新指纹、revision 被外部 custom.append 推进后回退精确比较（同内容不追加/异内容追加）、`removeCached` 后重走冷路径核对、协调 runtime 缺失抛错不变。
- TASK-0289：索引记忆化身份语义（同数组同索引、不同数组独立）、byId 与暴力查找对照、childrenByParent 分组含 null 根、条目增长后新数组重建正确；纯重构由全量行为基线（73 文件 388 例）证明语义不变。

## 修复与验证

- 修复：路线 1 已实施（`ee7c8bd93`，TASK-0283）——`readDocument` 复用 `loadAppendState` 字节缓存；路线 2 随路线 1 自动降本，再评估；路线 4 已实施（TASK-0288）——团队 `persist()` 指纹缓存，热路径单次序列化并跳过 O(entries) 扫描，revision 推进回退与旧实现逐语义等价的精确比较；路线 3 已实施（TASK-0289）——文档命令/选择路径 O(n) 扫描索引化（entries 数组身份记忆化 byId/childrenByParent，含 history-projection 两处）；路线 6 第一片已实施（TASK-0290）——`session-updated` 全量快照发布短窗合并 + 无订阅者跳过（零 IPC 合同变更，只减帧不减帧大小；增量载荷协议留待独立评估）；路线 5 第一片已实施（TASK-0291）——渲染端时间线投影 O(n²) 扫描索引化（活动回复/委派判定/流文本兜底 + 聚合视图跳过成员稳定化）；路线 5 第二片已实施（TASK-0292）——投影持久基座分离，流式 delta 不再重复支付 O(会话规模) 的持久项视图模型重建；剩余候选为增量载荷协议（跨 preload/渲染端合同，留待独立评估）。
- 测试：runtime-node 会话套件 22 文件 111 例全绿，含四条新回归（命中免读、外部写失效刷新、热缓存损坏报 CORRUPT、v1 不缓存）；路线 4 定向 5/5、agent-teams 目录 235 例 + `plugin-agent-presets` 包目录复跑 21/21（收集期红为该测试 cwd 依赖，非本缺陷改动）；路线 3 行为基线 73 文件 388 例 + desktop agent-teams 235 例全绿。
- 检查：路线 1、路线 4、路线 3 落地后各跑一次完整 `bun run check`，均 exit 0。
- 未运行及原因：真实 Desktop 长任务前后对照（LCP/主进程长任务计数）待用户侧复测。
