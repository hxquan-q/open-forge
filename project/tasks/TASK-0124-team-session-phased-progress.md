---
id: TASK-0124
type: task
status: draft
priority: P3
owner: apps/desktop
requirement: []
plan: PLAN-0013
source: ISSUE-0027-D + ISSUE-0025（45min 仅「正在努力工作…」无阶段提示）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0025, ISSUE-0027]
related_bugs: []
execution: serial
branch:
worktree:
base_commit: main
read_paths: [apps/desktop/src/renderer/domains/agent-teams/, apps/desktop/src/main/agent-teams/]
write_paths: [apps/desktop/src/renderer/domains/agent-teams/, .github/release-notes/]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话阶段化进度展示（委派/执行/审计/收尾）

## 目标

实测 45min 任务期间用户只看到「正在努力工作…」动画与偶发的 timeout 载荷文本，无法区分
「在抽取数据」「在建页面」「在审计」。把成员任务状态机（已有 durable workItem：
running/waiting/completed）投影为团队会话页的阶段化进度条/阶段标签。

## 范围

### 并发评估

- 结论：必须串行——状态机投影面跨主进程与 renderer，且依赖 TASK-0122 确定的回合语义
  （阶段边界是否随让出回合而变）。
- 执行方式：serial。
- 前置依赖：TASK-0122 落地后定义阶段语义；UI 侧先完成 `docs/ui-review.md` 审查顺序推演。
- 冲突文件/独占路径：agent-teams domain 视图与 session 状态读取面。

### 做

- 设计阶段模型：以 workItem 状态机 + 通知 journal 为事实源，投影为「分派 N 项/执行中/审计中/
  收尾」的用户可懂阶段；
- timeout 载荷在 UI 折叠为「等待成员完成」类中性文案，不再原文展示结构化 JSON；
- 保持 ISSUE-0027-D 定位：先可见、可解释，不省时间。

### 不做

- 不改 workItem 状态机与通知投递；
- 不做进度百分比（无可靠分母）；
- 不做质检分级（ISSUE-0027-A 挂起中）。

## Given / When / Then

- Given：团队会话有 ≥1 个委派中的长任务；
- When：成员执行期间用户查看会话页；
- Then：看到当前阶段（谁在做什么/等待什么），timeout 不再以裸 JSON 出现；任务完成时阶段
  推进到收尾。

## 必须保持

- workItem 状态与通知语义为唯一事实源，UI 不维护第二份状态；
- 长会话无 UI 泄漏/重复挂载。

## 测试与验证

- 定向测试：阶段投影纯函数（workItem 集合 → 阶段标签）表驱动用例；视图组件测试断言阶段文案；
- 用户流程：组件级渲染测试（真实 state 投影），不升 E2E；
- 质量检查：`test:pkg` + `check:quick`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：
- 剩余风险：
