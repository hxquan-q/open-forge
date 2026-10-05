---
id: TASK-0182
type: task
status: done
priority: P2
owner: quality worktree
source: BUG-0065
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0179]
related_issues: []
related_bugs: [BUG-0065]
execution: serial
branch: main
worktree: unassigned（2026-10-03 主检出串行实施）
base_commit: cf4c1147a
read_paths: [scripts/worktree/git.test.mjs]
write_paths: [scripts/worktree/git.test.mjs, project/tasks/TASK-0182-macos-worktree-path-test.md, project/bugs/BUG-0065-macos-worktree-path-comparison.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 修正 macOS 上 worktree 命令执行用例的路径比较

## 交付记录（2026-10-03）

- 实现：断言改为两侧 `fs.realpathSync` 后比较（见 BUG-0065 根因），合同语义不变。
- 验证：本地 `bun run test:quality` 484 通过；CI 三平台复跑随下次推送产生。
- 状态：`verifying`；`integration_status: integrated`。
- CI 证据（2026-10-03）：quality 37060686088 全绿——check / macOS / ubuntu / windows 四 job 全部通过（macOS worktree 用例修复确认）。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
