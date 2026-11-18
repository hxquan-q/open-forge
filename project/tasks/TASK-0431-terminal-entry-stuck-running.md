---
id: TASK-0431
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0170（TASK-0425 报告 F06）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0425, TASK-0427]
related_issues: []
related_bugs: [BUG-0170]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 153efca4c
read_paths:
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
write_paths:
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.terminal-settle.test.tsx
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
  - project/tasks/TASK-0431-terminal-entry-stuck-running.md
  - project/tasks/README.md
  - project/bugs/BUG-0170-terminal-entry-stuck-running.md
  - project/bugs/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0157-terminal-settle.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.terminal-settle.test.tsx
depends_on: [TASK-0427]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# 终端条目完成结算与聊天闸门解耦（BUG-0170）

## 目标

feed 条目按事件自身键（toolCallId / 团队会话前缀键）结算，不随聊天流闸门丢弃：旧会话 tool.end 照常落定，聊天态保护不变。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0028 第 6 片，主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：新测试文件独占；两泵为同一 concern 的两处对称改动。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0028 第 6 片。

### 做

1. 普通泵：`tool.end` 的 `markAiTerminalEntryDone`（惰性提取）提升到双闸门之前；原位置删除，聊天侧 handleToolEnd 不动。
2. 团队泵：team `end` 结算提升到挂载闸门之前（会话前缀键）；原位置删除。
3. 红测试：切走后旧会话 end 仍结算；闸门保护由既有 cross-session-leak 测试看守。

### 不做

- 不动 start 的投影位置（cwd 取自当前会话，留在闸门后）；
- 不做按会话隔离 feed（F05 已接受限制）与 tool.update 流式（F07）；
- 不改闸门本身。

## Given / When / Then

- Given A 的条目 running、用户已切到 B，When A 的 tool.end 到达，Then 条目 running=false 且带输出摘要。
- Given 同一场景，When A 的消息 delta 到达，Then 不写入 B 的聊天态（既有测试看守）。

## 必须保持

- 双闸门语义与聊天投影行为一字不动；
- start 幂等入队、100 条上限、mark 键配对语义；
- 未命中键的 end 为 no-op。

## 测试与验证

- 定向：新 terminal-settle 测试 + 既有 cross-session-leak / compaction / memory-bounds / artifact 套件。
- 团队回归：useTeamChatModel.test.tsx 全量。
- `check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户实机（可选）。发布：未授权。

## 交付记录

- 实际修改：`useSessionEventController.ts`（end 结算提升至 handler 顶部闸门前，原 tool.end 分支只留聊天投影）；`useTeamChatModel.ts`（team end 结算提升至挂载闸门前，原块删除）；新增 terminal-settle 测试 2 用例；BUG-0170/本 Task/索引与 v0.1.4 fragment。
- 实际运行：定向红 1→绿（2/2）；控制器套件 13/13；团队回归 40/40；`check:quick` 通过（ratchet new=0）。
- 未运行及原因：完整 check 与 impact 留批次收尾；团队切走红测未单列（同构提升 + 全量回归覆盖，见 BUG-0170 记录）。
- Worktree：未拆出（主检出串行）。
- 剩余风险：feed 仍为全局混流（F05 已接受限制）；切走后 start 仍不投屏（维持现状，见任务不做项）。

## 2026-11-18 批次收尾：impact 与完整 check 已具备

- 本任务此前唯一未跑项是「完整 check 与 impact 留批次收尾」，2026-11-18 两项均已有结论，故 `verifying` → `done`。
- impact（用户实跑 `bun run test:impact`，范围是相对 `xquan` 的全量分支差异，覆盖本批次 desktop 改动）：49 包中 47 包绿，desktop 1487s 通过。两处失败为 `packages/plugins/presets/vetta-ui-design` 与 `packages/ssh-transport`——`git diff --stat xquan...HEAD` 与 `git log xquan..HEAD` 对两包均为空，失败与本变更无关；已反证为本机环境限制（TEMP 8.3 短名、无 symlink 权限），换长名 TEMP 后对应用例 2/2 通过，两包内部其余用例全过（ssh 234、vetta-ui-design 927）。**不记为「impact 全绿」**。
- 完整 check：用户同日实跑 `bun run check` exit 0（lint 5310 文件、types 五路全 0、guards 全过、声明头 `missing=0`、mobile-lint 0）。
- 团队切走红测仍未单列：按前文口径由「同构提升 + 全量回归覆盖」承担，本次 impact 的 desktop 段全绿即为该判断的支撑证据之一。
- `integration_status` 保持 `pending`：未合入 `origin/dev`，未 push、未发布。
