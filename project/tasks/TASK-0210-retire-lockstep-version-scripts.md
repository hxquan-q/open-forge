---
id: TASK-0210
type: task
status: done
priority: P2
owner: release/product
source: user-request；PLAN-0016 阶段 4
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: [TASK-0209]
related_issues: [ISSUE-0009]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 9660f0933
read_paths: [package.json, scripts/release.mjs, scripts/release/package-release-policy.mjs, docs/dev/agent-rules/delivery.md]
write_paths: [package.json, scripts/release/package-release-policy.test.mjs, .github/release-notes/v0.1.3.md, project/tasks/TASK-0210-retire-lockstep-version-scripts.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 清理继承自上游的 workspace 锁步发版脚本

## 目标与范围

PLAN-0016 阶段 4 的收敛部分。根 `package.json` 仍带着上游的锁步发版机器：

- `version:patch`、`version:minor`、`version:major`：`npm version <x> -ws --no-git-tag-version` 整体改写所有 workspace 包版本，再 `rm -rf node_modules packages/*/node_modules apps/*/node_modules package-lock.json` 并重装。它们没有任何守卫，会把 `apps/desktop` 的独立版本一起改掉。
- `version:set`：同样是无守卫的 `npm version -ws`。
- `scripts/sync-versions.js`：把内部依赖版本对齐到锁步口径（引用上游包名），另被受守卫的 `scripts/release.mjs` 调用，因此保留。

做：删掉这四条脚本；补一条回归断言，禁止未受守卫的整体改版脚本回来。

不做：不动已受守卫的 workspace 发包路径（`publish`、`publish:private`、`scripts/release.mjs` 与 `package-release-policy` 的 fail-closed 策略，见 ISSUE-0009 与 TASK-0056）；不改 `release:desktop:*`；不改 `apps/desktop` 的版本。

## Given / When / Then

- Given 根 manifest 曾暴露 `version:patch` 等脚本；When 运行 `bun run test:quality`；Then 回归断言通过，且根 manifest 不再有 `npm version -ws` 形式的脚本。
- Given 有人重新加入这类脚本；When 跑守卫；Then 断言失败并指出脚本名。

## 必须保持

- 不减少现有保护：workspace 发包的 fail-closed 守卫（scope 与 push 授权、`private: true`）保持原样。
- 不执行任何真实版本改动、发布或推送。

## 测试与验证

- `bun run test:quality`（含新增断言）。
- `bun run check`。
- 确认删除 `version:*` 后根 manifest 无 `npm version -ws` 形式脚本，且 `scripts/release.mjs` 的受守卫路径仍可用（它调用的 `scripts/sync-versions.js` 保留）。

## 交付记录

- 顺序说明：本轮先在 `scripts/release/package-release-policy.test.mjs` 与 `.github/release-notes/v0.1.3.md` 落了两处改动，之后才补建本 Task。按仓库规则如实补记，脚本删除与验证在记录落盘后继续。
- 脚本删除已完成；守卫与全量 check 的验证结果见下方回写。
- 过程更正：最初误判 `scripts/sync-versions.js` 只被 `version:*` 使用（只查了根 manifest），实际 `scripts/release.mjs:269` 也在调用；已恢复该文件并把删除动作移出本 Task 范围，受守卫的 legacy 路径保持可用。
- 实际修改：
  - `package.json`：删除 `version:patch`、`version:minor`、`version:major`、`version:set` 四条未受守卫的整体改版脚本。
  - `scripts/release/package-release-policy.test.mjs`：新增 `root manifest release surface` 断言，禁止根 manifest 再出现 `npm version -ws` 形式脚本。
  - `.github/release-notes/v0.1.3.md`：在「其他」补一条说明。
- 保留未动：`scripts/sync-versions.js`（受守卫的 `scripts/release.mjs:269` 调用）、`publish`、`publish:private`、`publish:dry`、`scripts/release.mjs` 与 `release:desktop:*`。
- 验证命令与结果：
  - `bun run test:quality`：37 文件 / 498 项通过（新增 1 项）。
  - `bun run check`：exit 0。
  - `package.json` 仍可解析为合法 JSON，且 `grep "version:"` 无命中。
- 未运行及原因：未执行任何真实版本改动、发包或推送。
- 剩余风险：`release:patch|minor|major` 与 `publish*` 仍留在根 manifest（受 fail-closed 守卫，见 TASK-0056），脚本名仍可能被误用；是否改名以进一步降低误用，留待后续决定。
- 集成：实现提交 `29e429b21`（本地 `main`），`integration_status: integrated`；未推送、未发布。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI、工具链、规则、文档或仓库设置，无用户可观察行为变化；既定验收标准（静态门禁与定向测试）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
