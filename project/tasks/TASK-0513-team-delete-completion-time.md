---
id: TASK-0513
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: BUG-0191
source: verifier 复查（verifier_0489 对 e324583a1 的延迟复核）
related_requirement: [BUG-0191]
related_plan: []
related_tasks: [TASK-0489]
related_issues: []
related_bugs: [BUG-0191]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: bf65341b1
read_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/
  - apps/desktop/src/renderer/shared/hooks/useConfirmDialogModel.ts
write_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/deleteSession.orchestration.test.tsx
  - apps/desktop/src/renderer/shared/hooks/useConfirmDialogModel.ts
  - scripts/quality/baselines/test-assertion-baseline.json
  - project/tasks/TASK-0489-session-delete-failure-feedback.md
  - project/tasks/TASK-0513-team-delete-completion-time.md
  - project/tasks/README.md
  - project/bugs/BUG-0191-session-delete-failure-silent-and-premature-side-effects.md
  - .github/release-notes/fragments/v0.1.5/bug-0191-team-delete-completion-time.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0513 团队会话删除改完成时判定（BUG-0191 收口修正）

## 合同

- 来源与目标：verifier 对 TASK-0489 提交 `e324583a1` 的延迟复核 verdict fail。中级发现：团队分支删除用发起时闭包 `wasActive`，完成时无条件导航 `/`——用户等待期切走后仍被拉回，违反 BUG-0191 自己的完成时语义；TASK-0489 交付段与 BUG-0191 记录「三分支完成时判定」言过其实。本次把团队分支改成与普通/批量一致的完成时判定。
- 输入 → 输出：`useProjectsPanelModel.ts` 团队分支 → 完成时以最新路由镜像（`activeTeamSessionIdRef` + `currentPathRef`）判定是否导航；`.then` 链重构为 IIFE，修复成功后步骤同步抛错落入失败 toast 的误报（低4）；普通/批量分支 `settleActiveSession` 与导航移到元数据清理之前，不被清理挂起阻塞（低2）；baseline 重复键删除（低1）；确认框注释改写准确（中2，行为不变）。
- 做 / 不做：只做 BUG-0191 完成时语义的团队分支补齐与上述低级修正；不改团队删除的导航落点语义（仍回 `/`），不动其他分支既有行为。串行主工作区。
- Given / When / Then：删除团队会话 pending 期间用户切走（离开该会话路由）→ 完成时不导航；仍在该会话路由 → 导航 `/`；IPC 拒绝 → 失败 toast、不导航。编排测试三个团队用例覆盖。
- 保留：普通/批量分支完成时语义、失败重试合同、菜单层只确认不调用的分层、确认框「确认即关闭」行为全部不动。
- 验证：编排组合测试 + 邻近回归 + `check:quick` + `bun run check`。
- 人工验收：侧栏删除正在查看的团队会话，确认回到 `/`；删除 pending 期间先切到别的会话再完成，确认不被拉回。工程完成以门禁+测试为准。

## 交付

- 实际修改与验证：`useProjectsPanelModel.ts` 团队分支重构为 IIFE——主删除 try/catch、失败 failToast return；成功后 notifyTeamSessionsChanged → 完成时以新增的 `activeTeamSessionIdRef`（useEffect 镜像，与 `currentPathRef` 同模式）判定是否导航 `/` → 元数据清理；普通/批量分支 `settleActiveSession` 移到 `cleanupMetadata` 之前。编排测试新增团队三用例（拒绝不导航不清标记/等待期离开路由不拉回但 forget 照常/仍在路由则导航 `/`），`confirmDeletion` 改返回完整 renderHook 结果以支持 rerender 驱动 ref 同步；基线 orchestration 14→22（门禁正则实测吻合）、删除 `useProjectsPanelModel.deleteSession.test.tsx` 重复键 3；`useConfirmDialogModel.ts` 注释改写准确（行为不变）。验证：删除链 3 文件 30/30 绿；sidebar/projects + shared/hooks 邻近回归 14 文件 88/88 绿；`bun run check`（types+lint+guards）全绿；断言深度门禁独立复核通过（2403 文件）。
- 评审与集成：verifier_0513 独立复查 `complete/pass`——IIFE 结构、ref 镜像模式、依赖数组清理、测试有效性（rerender 能抓闭包回归）、基线计数全部核实；非阻断项（passive effect 极短窗口、团队等待期用例只断言 forgetConversations）已评估接受或交叉覆盖。
- 未运行与风险：未做实机 UI 走查；团队会话「活动」由路由推导，删除完成与 effect 同步之间存在与 `currentPathRef` 同量级的极窄窗口（既有模式，未构成实际误导航）。
- 发布：碎片 `.github/release-notes/fragments/v0.1.5/bug-0191-team-delete-completion-time.md`（`## 修复`）已汇编进正文；推送 origin xquan 按既有授权执行。
