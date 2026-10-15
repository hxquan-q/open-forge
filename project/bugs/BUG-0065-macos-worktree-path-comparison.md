---
id: BUG-0065
type: bug
status: verifying
priority: P2
owner: quality worktree
source: CI quality workflow macOS unit tests (37053825133 / 37059120973)
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0182]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# macOS 上 worktree 命令执行用例因 /var 符号链接误红

## 实际与期望

`scripts/worktree/git.test.mjs` 的「runs the command inside the worktree it was given」在 macOS runner 上断言 `process.cwd() === process.env.WORKTREE_ROOT_PATH` 失败（exit 1 ≠ 0，两次复现、一次通过）。macOS 的 `os.tmpdir()` 返回 `/var/folders/…`，而 `/var` 是指向 `/private/var` 的符号链接——chdir 后 `process.cwd()` 已解析链接，与 env 中保持传入形式的字符串必然不等。实现行为正确，是测试比较语义在 macOS 上失真。

## 修复（TASK-0182，2026-10-03）

测试改为两侧各过 `fs.realpathSync` 后比较——比较「同一路径」这一合同本身，三平台语义一致；本地 `test:quality` 484 通过。CI 三平台复跑为最终证据。
