---
id: BUG-0119
type: bug
status: verifying
priority: P2
owner: packages/runtime-node conversation
requirement:
plan:
source: 工作区性能取证报告 team-chat-perf-bug-report.md（第三轮修正诊断，2026-10-16）+ dev 实例主进程采样
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0101]
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->
# 团队长任务累积性卡顿：会话读路径全量物化 + team persist 双重全量序列化

## 用户流程

- Given：agent-team 模式跑长任务（4h+，事件密集追加，会话 JSONL 持续增长）。
- When：任务推进过程中用户与 Team 会话交互（收流、切会话、收状态投影）。
- Then：期望交互延迟稳定；实际：越跑越卡，渲染 LCP 从 33s 涨到 97s（用户实测出现过 104s），随会话文件增大近似线性恶化。

## 实际行为

- 采样定位（第三轮修正）：**主进程**数据层读路径（渲染进程 99.5% idle，非渲染问题）。
- 热点归因（主进程采样占比）：
  - `FileConversationRepository.readDocument()` **45.7%**——每次调用全量读取 + 解析整个 JSONL 并物化 document，O(文件大小)；**无读缓存**（追加路径有 `ConversationWriteCache`，读路径没接）。
  - `appendCustomEntry` 的 `entries.some()` 去重谓词 **20.2%**——每次 custom.append O(条目数) 线性扫描。
  - JSONL 逐行解析 3.8%、schema 校验 2.2%、GC 2.7%（前两者副产物）。
- 读放大触发点（每轮 turn 多次）：
  - `conversation-document-mutation-coordinator.ts:64`——每条 document 命令先 `readDocument` 全量读。
  - `turn-pipeline.ts:327/767`——每轮 turn 两次全量读。
  - `team-session-state-repository.ts:58`——每次 team persist `readSessionDocument`。
- team persist 放大：`team-session-state-repository.ts:70` 用 `JSON.stringify(latest) !== JSON.stringify(session)` 判变更——**两次全量序列化**会话文档；persist 在 team-session-service 有 10+ 调用点。
- 主进程长任务：8 个 >1s（最长 3049ms）。

## 期望行为

1. 会话文件未变化时，`readDocument` 不重复解析文件（复用追加写缓存的字节数失效策略）。
2. team persist 的变更判定不再常态触发双重全量序列化。
3. 长任务期间交互延迟不随会话文件增长而持续恶化。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例），agent-team 长任务（Excel 表单蓝本 → Vue+SpringBoot+PG 全栈）。
- 代码锚：`packages/runtime-node/src/conversation/file-conversation-repository.ts:133`（readDocument 无缓存全量读）；`apps/desktop/src/main/agent-teams/team-session-state-repository.ts:70`（双重 stringify）。
- 完整取证：工作区 `D:\Coding\WorkSpace\Vetta\team-chat-perf-bug-report.md`。

## 最小复现

1. 起一个团队长任务持续追加事件（或单会话累计数千条记录）。
2. 观察主进程 CPU 采样：`readDocument` → `parseConversationFile` 占比随文件增长上升；交互 LCP 同步恶化。

## 影响

- P2：核心场景（团队长任务）可用性严重受损（LCP 一分钟级），无数据损坏/丢失；属累积性性能退化。

## 根因证据

- 置信度：高（采样归因 + 源码逐帧可溯；`loadAppendState` 已验证的字节失效缓存模式就在同文件，读路径未接）。
- 根因1：`readDocument` 每次调用 `readConversationFile` 全量解析，未复用 `ConversationWriteCache`（同文件 `execute/append` 写路径已在锁内维护该缓存，读命中天然新鲜）。
- 根因2：team persist 以双重 `JSON.stringify` 全量比较为变更判据，O(会话文档) × 每次 persist。
- 关键安全性论证（读缓存身份共享）：`applyConversationDocumentCommand` 为纯函数（结构共享、不改输入）；投影层 `replaceProjectedDocument` 本就跨调用共享 document 身份；追加路径 `loadAppendState` 命中已返回同一 `state.document` 引用——命中返回同引用是该层既有约定。

## 回归测试（修复时）

- 读缓存（红→绿，判别式=对象身份 + 外部写回源）：
  1. 未变更文件上连续 `readDocument` 返回同一缓存对象——旧实现每次新解析（红）。
  2. `execute` 后 `readDocument` 与命令结果同身份且内容最新；另一实例锁下追加后 `readDocument` 按字节数失效回源、不再返回旧对象——护栏（防缓存吃掉外部写）。
- team persist 快速路径（可证明等价：`revision` 是被序列化字段，revision 不等 ⇒ stringify 必不等 ⇒ 必追加；故无行为红测试，写护栏钉住判据语义）：
  3. revision 不同 → 追加新状态记录。
  4. 会话完全相同 → 不追加。
  5. revision 相同但内容不同 → 仍追加（stringify 判据保留为等值兜底）。

## 修复与验证

- 修复：2026-10-17（localtest 分支），两处：
  1. **读路径接缓存（主修）**：`FileConversationRepository.readDocument` 锁内改走 `loadAppendState`（stat 字节数 → 缓存命中直返 → 未命中全量读并回填；v1 旧 schema 会话照旧全量读、不入缓存）。错误语义不变（ENOENT 均为 NOT_FOUND，损坏文件均 CORRUPT）。命中返回共享 document 身份（见根因安全性论证）。单一改动消解 ≈45.7% 采样热点，连带 mutation-coordinator 每命令、turn-pipeline 每轮、team persist 每次的读放大自动变廉价。
  2. **persist 快速路径**：`TeamSessionStateRepository.persist` 先比 `revision`：不等直接追加（跳过双重 stringify）；相等再退回原 stringify 判据兜底等值比较。行为可证明等价，常态（每次真实变更后 persist）双序列化归零。
- 暂缓（记录在案）：`appendCustomEntry` 谓词索引化（20.2%）与渲染端 O(n²)、IPC 增量快照——待本两处落地实测后按残余占比决定是否另案。
- 验证：
  - 红→绿：runtime-node「连续 readDocument 命中同一缓存对象」旧实现红；「execute 后同身份 + 外部写回源」护栏绿。
  - 护栏：persist 三例（revision 不同追加 / 完全相同不追加 / revision 同内容不同仍追加）。
  - runtime-node conversation 套件全绿；desktop typecheck:incremental 零错。
  - 待实机：dev 实例跑团队长任务（>30min），观察交互 LCP 不随时间恶化、主进程无 >1s 长任务堆积。
