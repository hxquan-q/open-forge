---
id: TASK-0401
type: task
status: in_progress
priority: P1
owner: desktop-conversation
requirement: REQ-0002
plan: PLAN-0002
source: user-request; RESEARCH-0044 后续实施授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0398]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop, packages/theme-ui, project, docs]
write_paths: ["apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts","apps/desktop/src/renderer/root-layout","apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts","apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.session-switch.test.ts","project/tasks/TASK-0401-bounded-session-auto-restore.md","project/tasks/README.md","project/plans/PLAN-0002-performance-reliability.md",".github/release-notes/v0.1.3.md"]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 自动恢复会话的有界历史加载

## 目标与范围

自动恢复上一会话时采用既有有界 tail，避免元信息尚未就绪时默认完整历史；保留用户主动完整加载、分页、流式与草稿语义。

- 来源：[RESEARCH-0044](../research/RESEARCH-0044-desktop-startup-resource-audit.md)；用户已要求列 Task 并实施三个 P1 优化。
- 输入：当前实现、既有行为测试、脱敏调查证据；输出：最小实现、可失败回归、受控前后证据和验收包。
- 直接修改优先；只在同步IO/重依赖或恢复入口职责阻碍测试时提取必要接缝，不新增通用调度框架。
- 不做：次级缓存/隐藏窗口/知识库优化、监控协议重写、依赖升级、真实用户状态/Provider/SSH/UI测试、完整打包与发布。
- 不变量：安全沙箱与权限不变，角色/工具/错误/取消/usage/stop不变；不更改磁盘会话格式，不删功能/断言，不以扩大超时或缩小堆上限换取指标。

## 并发与执行

- 条件支持只读设计/审查并行；三个 Task 的产品代码由 Coordinator 在 main 串行写入，避免共享工作区并行写代码及脏目录集成。
- 无代码 Worktree；保留用户和其他会话未提交文档。共享 root-layout 与Project索引由同一Coordinator按顺序维护。
- 执行顺序：TASK-0399 → TASK-0400 → TASK-0401；并非功能硬依赖，各 concern 可独立回滚。
- 原生只读子任务在合同落盘后派发，禁止写入/Git/真实实例。归属 Open-Forge-only。

## Given / When / Then

Given 已记录上一大会话且 sessionsMap 尚空；When 启动自动恢复→查看最近历史→向上分页/接收live→主动重新打开完整历史；Then 自动恢复不后台全量回填，既有显式 full 与普通手动打开策略不变，历史与live无丢失重复。

## 测试与验证

- 先建立自动恢复入口空 sessionsMap 的旧红回归；结合 RootLayout/真实 opener 接线与现有 session-switch/分页测试验证，不只断言Mock调用；用合成大历史比较恢复驻留条目/映射量，实际MB收益待实机。
- Node runner：在 apps/desktop 下运行 `bun ../../scripts/quality/run-vitest.mjs --run <本Task测试>`。
- 每个切片定向测试、`bun run test:impact -- <本Task路径>`；中间编辑轮 `check:quick`，三项组合结束完整 `bun run check`。公共合同/跨包变化按测试政策追加 `test:changed`。
- 性能结论仅引用可复算的受控等待、驻留条目或构建依赖指标，不宣称真实启动时间/内存下降百分比。

## 验收分层与功能验收包

- 工程：待实现、回归与门禁；独立复审实际 diff 后处置发现。
- 集成：pending；原子提交仅含本Task内容，其他工作原样保留；脏工作区不推送。
- 人工：工程完成后 verifying，等待用户确认启动/恢复/编辑的实际体验。未运行的实机范围明确列出。
- 发布：未授权。
- 入口：正常启动与本Task影响的操作入口；预期为上述 Given/When/Then，具体提交和验证结果交付时补齐。

## 交付记录

- 尚未修改生产代码/测试；后续逐切片记录 red/green、检查、评审与限制。
- 最小实现决策：仅自动恢复入口显式传已有 `historyLoadMode: tail`；手动打开和resolveHistoryLoadMode默认策略不变。必要时将一次性恢复effect提取为useLastSessionRestore接缝，供真实SessionManager/分页集成回归使用，不新增协议。
- 初轮既有基线将session-switch与controller并行运行：首项动态import/transform约31s超过原30s期限，继发7项失败，controller24项通过；尚无证据将其归为产品Bug。源码冻结后改为单文件/单worker重新建基线，未调高超时或删断言。
- 源冻结后单文件 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/conversation/hooks/useSessionManager.session-switch.test.ts --maxWorkers 1` 九项全部通过（21.58s）；controller既有24项已通过。此基线不包含新有界自动恢复行为。
