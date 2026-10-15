---
id: TASK-0242
type: task
status: done
priority: P1
owner: scripts/quality
requirement:
plan:
source: 声明头门禁（scripts/quality/check-modified-file-notices.mjs，ISSUE-0008 正文 / ISSUE-0023 接线）在 main 上判负——21 个已入库文件缺 fork 声明头，ratchet new=21，bun run check 恒红
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0008, ISSUE-0023]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 23ae759f7
read_paths: [scripts/quality/check-modified-file-notices.mjs, scripts/quality/baselines/modified-file-notices.txt, project/issues/ISSUE-0008-apache-modified-file-notice.md, project/issues/ISSUE-0023-modified-file-notice-guard-unwired.md]
write_paths: [apps/desktop/src/main/agent-teams/team-runtime-restorer.ts, apps/desktop/src/main/agent-teams/team-runtime-restorer.test.ts, apps/desktop/src/main/browser-automation/browser-runtime-manager.ts, apps/desktop/src/main/dev-cli-shim.test.ts, apps/desktop/src/main/ipc/agent-teams.ts, apps/desktop/src/main/logger/describe-error.ts, apps/desktop/src/main/logger/describe-error.test.ts, apps/desktop/src/main/updater-engine.ts, apps/desktop/src/main/updater-engine.test.ts, apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.ts, apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.test.tsx, packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts, packages/runtime-core/test/kernel/agent-session-async-continuation.test.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, packages/runtime-node/src/conversation/conversation-file-lock.ts, packages/runtime-node/test/conversation/conversation-file-lock.test.ts, project/tasks/TASK-0235-conversation-file-lock-hardening.md, project/tasks/TASK-0236-log-error-serialization.md, project/tasks/TASK-0237-allstar-fence-fs-permissions.md, project/tasks/TASK-0238-cli-shim-eperm-degrade.md, project/tasks/TASK-0239-updater-expected-check-errors.md, scripts/quality/baselines/modified-file-notices.txt, .github/release-notes/v0.1.3.md, project/tasks/TASK-0242-modification-notice-gate-recovery.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 声明头门禁在 main 判负修复：补齐 21 处 fork 声明头并收缩基线快照

## 目标

`bun run check` 在 main 上转绿。门禁唯一红点为 Apache-2.0 §4(b) 修改声明审计：`changed=2750 covered=1870 excluded=208 missing=672 unclassified=0`，ratchet `waived=651 new=21`——即 651 条存量缺失已由基线豁免，21 条判负。CI 侧 `.github/workflows/quality.yml` 以 `fetch-depth: 0` 检出、无 `upstream` remote 时回落到基线记录的 `merge-base d217984c72ef`（该对象是 `origin/dev` 祖先，已核实），因此同一 21 条在 CI 同样判负。

## 范围

### 做

- 按 `git diff --name-status <merge-base> HEAD` 的 A/M 分类为 16 个 `modified` 补 `Modified by The Open Forge contributors.`、5 个 `added` 补 `Copyright The Open Forge contributors.`；插入位置与注释风格对齐门禁的 `insertionIndex`/`styleForPath`（`.ts`/`.tsx` 用 `//` 置于首行，frontmatter 型 `.md` 置于闭合 `---` 之后）。
- 门禁转绿后运行 `--write-baseline scripts/quality/baselines/modified-file-notices.txt` 收缩快照中已修复的 1 条，消除「基线中已修复」提示。

### 不做

- 不使用裸 `--write`（会为全部 672 个缺失文件插头，含基线豁免项）。
- 不为 651 条基线豁免项补头：那是独立的 sweep 议题，需要单独排期。
- 不修改门禁判定语义与 `NOTICE_MARKER` 等契约。

## Given / When / Then

- Given：main 上 21 个文件缺声明头，`bun run check` 于 `check:guards` 退出码 1。
- When：按 A/M 分类补头并重跑 `node scripts/quality/check-modified-file-notices.mjs --baseline <baseline>`。
- Then：`ratchet: waived=651 new=0`、`unclassified=0`、退出码 0；随后完整 `bun run check` 退出码 0。

## 必须保持

- 每个被改文件只新增声明头一行，业务代码、类型、行为与测试断言零变化。
- 20 个源码/测试文件与 5 个 Task 记录的既有内容逐字保留（声明头之外无 diff）。

## 测试与验证

- 定向：`node scripts/quality/check-modified-file-notices.mjs --baseline scripts/quality/baselines/modified-file-notices.txt` → `new=0`。
- 质量检查：完整 `bun run check`（lint + types + guards + mobile-lint）全绿。
- 用户流程：不适用（工程内部改动，无用户可见行为）。

## 验收分层

- 工程验证：通过；绑定 `bun run check`（exit 0）与门禁 `new=0`。
- 技术评审：自审；风险为声明头插入位置错误导致格式破坏，已按门禁同一套 `insertionIndex` 规则实现并逐文件回读首行。
- 集成：main 串行。
- 人工功能验收：不适用（无用户可见变化）。
- 发布：未授权；已记入 `.github/release-notes/v0.1.3.md` 的「其他」小节。

## 交付记录

- 实际修改：21 个文件各新增一行声明头；`scripts/quality/baselines/modified-file-notices.txt` 删除 1 行已修复条目。
- 实际运行：门禁 `--baseline` 复跑 `new=0`；`--write-baseline` 收缩；完整 `bun run check` exit 0（`check:guards exited with code 0`）。
- 未运行及原因：未跑测试套件——本次为注释行插入，无行为变化，按测试政策取最低充分验证（门禁 + 完整 check）。
- Worktree：未拆出；单一串行改动，main 直接实施。
- 剩余风险：651 条基线豁免项仍待 sweep，门禁当前等价于「不新增违规」。
