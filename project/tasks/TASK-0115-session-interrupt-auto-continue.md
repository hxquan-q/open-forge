---
id: TASK-0115
type: task
status: done
priority: P1
owner: apps/desktop
requirement: []
plan: PLAN-0012
source: RESEARCH-0012 WorkDaddy P1（会话级中断续接监视器：`inject.js:335-371,646-662` 判定矩阵——AGPL，净室重写）
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/agent-runtime/, apps/desktop/src/main/conversations/, apps/desktop/src/renderer/domains/conversation/, packages/agent/src/]
write_paths: [apps/desktop/src/main/, apps/desktop/src/renderer/domains/, packages/coding-agent/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0106]
integration_status: integrated（c16e34d99，随本批推送 origin/dev）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 会话级「异常中断自动续接」监视器

## 目标

已有 silent-turn 重跑管**同一 turn 内**空回复（`agent-loop.ts:147-219`）；本任务补的是 **turn 之后**的中断续跑：网络断、进程抖动、超时导致回复半途停住且用户不在场时，跨会话巡检器识别「已中断」并补发「继续」。参照 WorkDaddy 判定矩阵（净室重写）：**仅 error/networkFailure/truncated 三因触发**；`manualStop`、非空输入框、完成标记、动作区待审、置信度不足（`suspected`）全部否决/降级为仅提示。绑定闸门复用同一分类函数——「允许绑定的会话」与「会被续跑的会话」永远一致。

## 范围

### 并发评估

- 结论：不支持并发——写面在主进程会话/运行时域与 renderer 会话视图，与 TASK-0106（transcript 投影面）有潜在交集。
- 执行方式：serial，主工作区。
- 可并行 Task：PLAN-0010 阶段 A、PLAN-0011 全部、TASK-0117/0118/0119（与 0117/0118 在不同文件但同 scheduler 相邻域，注意错开）。
- 前置依赖：无；建议先确认中断证据在自有事件流中的可观测字段（`RESEARCH-0012` 触发信号）。
- 冲突文件/独占路径：`agent-runtime`/`conversations` 会话状态读取面、conversation domain 视图。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0012 阶段 A 首项。

### 做

- 判定层抽**纯函数**（会话健康七态/置信度分级/触发三因/否决五因），落 `packages/` 层可单测；
- 主进程巡检器：跨会话定时巡检（低频、空闲时跑），命中触发三因且无否决因 → 自动补发续跑；
- `suspected` 态只提示不自动发；手动停止与输入框非空一票否决；
- 默认保守上线：可先开「仅提示」模式观察一轮遥测/日志，再放开自动续（两档开关进设置或管理面）；
- 续接动作走既有 agent 续跑通道，复用同一消息气泡语义（不新起一行）。

### 不做

- 不动 silent-turn 的 turn 内机制（两者正交互补，不合并）；
- 不做「任何停顿都续跑」——判定矩阵是白名单制；
- 不改 turn/agent 终态事件的协议语义；
- 不复制 WorkDaddy 代码（AGPL——全部重写，只借判定矩阵形状）。

## Given / When / Then

- Given：定时任务/长会话因网络中断在 assistant 半途停住，用户不在场；
- When：巡检器扫到该会话且判定为 truncated/networkFailure 且无否决因；
- Then：自动补发续跑，回复在同一气泡内续完；若为 manualStop/输入框有草稿/证据不足（suspected），零自动动作、至多提示。

## 必须保持

- 用户手动停止的会话**永不**被自动续跑；
- 输入框有未发送草稿时不抢输入框；
- 续接失败/再中断不无限重试（有界，如一次）；
- 判定层与绑定闸门必须共用同一分类函数（防规则错位）。

## 测试与验证

- 定向测试：判定纯函数全矩阵（七态×触发×否决×置信度）、巡检器调度单测、「先提示后自动」两档行为；
- 用户流程：fake provider 模拟网络断流 → 验证自动续接；手动停止 → 验证零动作；
- 质量检查：`bun run check:quick`、`test:pkg` 相关包、desktop typecheck。

## 交付记录

- 实际修改：
  - `packages/coding-agent/src/execution/session-interrupt-health.ts` + 测试 + `@vetta/coding-agent/runtime` 导出
  - `apps/desktop/src/main/agent-runtime/session-interrupt-*`（证据装配、监视器、草稿镜像、候选注册、bootstrap）
  - session/settings IPC、preload、常规设置开关、RootLayout Toast、release notes
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/execution/session-interrupt-health.test.ts`（通过）
  - `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/agent-runtime/session-interrupt-*.test.ts`（通过）
- 未运行及原因：真实 Electron E2E / `verify:ui:*`（用户未授权）；端到端 fake provider 断流以监视器单测 + 判定矩阵覆盖为主
- Worktree：主工作区串行
- 剩余风险：草稿镜像按 sessionPath 键；候选集依赖 running-changed 注册，冷启动未打开过的磁盘会话不会被扫到（符合「仅驻留会话」保守默认）
