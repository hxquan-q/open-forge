---
id: TASK-0237
type: task
status: verifying
priority: P2
owner: packages/plugins
requirement:
plan:
source: BUG-0088（allstar-coding ac-fence 审计日志缺 fs.write 权限声明，fence-log 追加必被拒）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0032]
related_bugs: [BUG-0088]
execution: serial
branch:
worktree:
base_commit: 1ea3432
read_paths: [packages/plugins/presets/allstar-coding/plugin.json, packages/plugins/presets/allstar-coding/src/fence.ts, packages/plugins/presets/allstar-coding/src/fence/audit-log.ts, packages/plugins/plugin-sdk/src/fs.ts, packages/plugins/presets/allstar-coding/test/manifest.test.ts, project/bugs/BUG-0088-ac-fence-log-write-permission-denied.md]
write_paths: [packages/plugins/presets/allstar-coding/plugin.json, packages/plugins/presets/allstar-coding/test/manifest.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0088-ac-fence-log-write-permission-denied.md, project/tasks/TASK-0237-allstar-fence-fs-permissions.md, project/tasks/README.md]
---

# allstar-coding 补 fs.read/fs.write 权限声明：fence-log 追加与 state.md 兜底恢复可用

## 目标

`src/fence.ts` 经 `ctx.fs` 调 `readFile`/`stat`（fence-log 去重、state.md 兜底）与 `writeFile`/`createDirectory`（fence-log 落盘），但 `plugin.json` 未声明 `fs.read`/`fs.write`——写被拒刷 `Plugin permission denied: fs.write`，读被 `.catch(()=>null)` 静默吞掉（state.md 兜底从未生效）。按最小集合补齐两项声明。

## 方案

- `plugin.json` `permissions` 追加 `fs.read`、`fs.write`（preset 权限自动授予，声明即生效；属仓库内 preset 业务逻辑，非对外合同变更，无需手册/API 版本同步）。
- 更新 `test/manifest.test.ts` 权限断言：声明集合覆盖 fence 装配实际用到的 `ctx.fs` 方法，注释点明 fence-log 与 state.md 两个消费点。

## 边界

- 不扩大权限面：只补 fence 装配真实调用的两项；不引入路径收敛（权限模型无该粒度）。
- 不触碰 `ISSUE-0032` 的词法写域讨论——`docs/ac/` 写目标在该 issue 定论前维持现状。
- 不改 fence 业务逻辑与 fail-open 语义。

## 验证

- 红基线：`manifest.test.ts` 权限用例先按目标集合断言，旧 manifest 必失败。
- 修复后 preset `vitest` 全绿；按 plugins AGENTS 要求跑 preset `bun run build` 并核对产物 manifest。
