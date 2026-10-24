---
id: TASK-0394
type: task
status: done
priority: P1
owner: runtime-core/agent-team
requirement: REQ-0002
plan: PLAN-0024
source: user-request
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0395, TASK-0396, TASK-0397]
related_issues: []
related_bugs: []
execution: coordination-only
branch: main
worktree: unassigned（只读调查及独占研究记录）
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [packages/agent/, packages/runtime-core/, packages/runtime-subagents/, packages/agent-team/, apps/desktop/src/main/agent-teams/, project/]
write_paths: [project/research/RESEARCH-0043-agent-execution-performance-references.md]
exclusive_paths: [project/research/RESEARCH-0043-agent-execution-performance-references.md]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-23
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Agent 执行与协作的一手参照研究

## 目标

按 PLAN-0024 调研其他开源 Agent 的执行、状态投影、通知与缓存机制，筛选当前仓库可验证的窄优化，不复制框架或用外部材料替代本地事实。

## 范围

- 支持与代码调查并行；原生研究子任务仅写独占 RESEARCH-0043，禁止改代码、Git、索引、运行测试或真实模型。
- 输入：公开第一方源码（Pi/Codex/OpenHands 等）、主检出 `ea67d951e`。
- 输出：固定 commit/版本与 URL、源码锚点、适用边界、被拒绝项、可测假设。交付归类 Upstreamable（方法研究，无外部代码复制）。
- 不安装/执行外部项目；不读生产配置/用户日志；不把论文/README 宣传当实测结论。

## Given / When / Then

- Given 本仓已有窗口并发、持久任务与通知，When 对照至少三项一手实现，Then 每项建议可追溯源码、指出本仓是否已有等价能力，并给出验证与失效条件。

## 必须保持

- 包依赖、角色、权限、生命周期与产品 Team/临时 Subagent 的区别不被外部机制改写。

## 测试与验证

核对引用与固定版本、路径/符号、许可证及最小采用边界；纯研究无需行为测试。Coordinator 回读并纳入 Plan；不得宣称性能已改善。

## 验收分层

工程验证：研究文件与本地链接已核对，Coordinator 直接回读三项核心固定 SHA 原始源码；技术评审：已核对适用性，不采纳外部执行语义；集成：pending（主检出脏，候选分支保存）；人工功能验收：不适用（内部研究）；发布：未授权。

## 交付记录

- 实际修改：RESEARCH-0043（206 行）由原生研究 actor `6c5db759-f91f-483` 产出；Pi/Codex/OpenHands 固定 SHA、许可、机制、拒绝项与测试建议齐备，Coordinator 回读。
- 实际运行：原生研究已实际派发与回收；核心 source URL 3/3 获取成功，相关本地链接存在；无模型或性能实验。
- 核心结论：同快照投影缓存优先；通知 drain 先复现；Pi 双栈 FIFO 与本仓已消费 frame 引用释放是不同热点候选，不同时试；本仓授权/终态/持久通知合同严于部分参照，不能整文件搬移。
- Worktree：研究不写代码，不创建。
- 剩余风险：外部实现版本与本仓语义不同，候选须经本仓基准与合同测试。
