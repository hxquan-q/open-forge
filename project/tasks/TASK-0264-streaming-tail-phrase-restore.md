---
id: TASK-0264
type: task
status: verifying
priority: P1
owner: packages/theme-ui
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream 22293f956
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: main 工作区（写路径与在途 TASK-0260/0261/0262 不相交）
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md, packages/theme-ui/src/markdown/streaming.ts, packages/theme-ui/src/markdown/streaming-reveal.ts]
write_paths: [packages/theme-ui/src/markdown/streaming.ts, packages/theme-ui/src/markdown/streaming-reveal.ts, packages/theme-ui/src/markdown/blocks, packages/theme-ui/test, project/tasks/TASK-0264-streaming-tail-phrase-restore.md]
exclusive_paths: [packages/theme-ui/src/markdown/streaming.ts, packages/theme-ui/src/markdown/streaming-reveal.ts]
depends_on: [TASK-0263]
conflicts_with: []
integration_status: integrated
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 流式回复写完后末尾短语立即恢复全亮（同步上游 22293f956）

## 目标

本仓吸收过 0.5.59 的「最新短语略暗、随下一句放出而变亮」流式策略：暗色只在尾块被标记为非流式后撤掉，而正文写完到回合结束事件之间常有约一秒空档，末尾短语一直偏暗。对齐上游 `22293f956`：已全部放出且 300ms 无新文本即撤暗，新文本到达再挂上；回合结束时文本未变则不再重新变暗。

## 范围

### 并发评估

- 结论：支持（theme-ui markdown 路径与在途任务不相交）
- 执行方式：serial，main 工作区 pathspec 提交
- 前置依赖：TASK-0263（本批串行顺序）
- 冲突文件/独占路径：`streaming.ts`、`streaming-reveal.ts`
- Branch：main；Worktree：不拆
- 集成负责人：coordinator；集成顺序：本批第二项

### 做

- 先 diff 本仓 `streaming.ts`/`streaming-reveal.ts` 与上游修复前版本，确认分叉程度；再按上游补丁形状适配（+300ms 无新文本撤暗、新文本重挂、回合结束不重挂）。
- 回归测试对齐上游 `TextBlockView.streaming.test.tsx` 的新增场景（写完后定时撤暗）。

### 不做

- 不重放上游 0.5.61 的消息列表重构；只做本仓现有流式渲染上的最小补丁。
- 不改匀速放出节奏、链接/围栏延迟渲染等既有策略。

## Given / When / Then

- Given：会话正在流式回复，末尾短语处于略暗态；When：正文已全部放出且 300ms 无新文本；Then：末尾短语恢复全亮，无需等待回合结束事件。
- Given：撤暗后同一回复又到达新文本；When：继续流式；Then：重新挂上略暗态直至再次静默。
- Given：回合结束事件到达且文本未变；When：渲染收尾；Then：不重新变暗。

## 必须保持

- 匀速放出、词边界断开、0.8s 链接/围栏整块出现等 0.5.59 既有行为不变。
- 页面每秒更新次数不增加（定时器只在静默窗口存在）。

## 测试与验证

- 定向测试：theme-ui markdown 流式相关测试（含新增回归）。
- 用户流程：长回复流式期间与收尾的视觉状态由组件测试断言（暗态类名/样式）。
- 质量检查：`bun run test:impact` → `bun run check:quick`；批末完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审；对照上游补丁与本地分叉差异。
- 集成：pending。
- 人工功能验收：待验收（视觉行为，dev 内目验可选）。
- 发布：未授权；交付时补 v0.1.3 发布说明。

## 功能验收包

- 入口与前置条件：任一会话触发较长流式回复。
- 操作步骤：观察回复写完到回合结束之间约 1 秒的末尾短语亮度。
- 预期行为：静默 300ms 后恢复全亮，不等到回合结束。
- 不通过表现：末尾短语持续偏暗直到回合结束。
- 验收反馈及回归案例：记回本 Task。

## 交付记录

- 实际修改：`packages/theme-ui/src/markdown/streaming-reveal.ts`（新增 `STREAMING_IDLE_SETTLE_MS = 300`）、`packages/theme-ui/src/markdown/streaming.ts`（`settleIdle` 只撤暗色保留 `streamedRef`；布局效果改为有新内容才挂暗色）、`apps/desktop/.../blocks/TextBlockView.streaming.test.tsx`（上游三场景：静默撤暗、回合结束不重暗、新文本重挂暗 + 声明头）。本仓两源文件与上游修复前逐行同形，补丁原样适配。
- 实际运行：定向红 3（旧行为持续暗到回合结束）→ 绿 12/12；`test:impact` desktop 12 例 + theme-ui 2 文件/36 例通过；`check:quick` 除在途任务未提交文件外全过。提交 `b5fdde595`，已推 `origin/dev`。
- 未运行及原因：dev 内目验未做（视觉行为，组件测试已断言暗态类；如需可后续实机验收）。
- 发布说明：同 TASK-0263，`v0.1.3.md` 在途改动落地后补写。
- Worktree：不拆（主树写路径干净）。
- 剩余风险：无已知；300ms 阈值取上游口径，与本仓 0.5.59 同源渲染策略一致。
