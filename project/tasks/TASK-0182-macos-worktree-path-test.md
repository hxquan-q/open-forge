---
id: TASK-0182
type: task
status: verifying
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
