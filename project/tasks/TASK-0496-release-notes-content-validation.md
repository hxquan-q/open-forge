---
id: TASK-0496
type: task
status: done
priority: P2
owner: scripts/release
requirement: REQ-0008
plan: PLAN-0032
source: upstream 06b431c3c（选择性重写，按本地格式改写判定集）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0495]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ee87e4e8d
read_paths:
  - scripts/release/release-notes.mjs
  - scripts/release/release-notes.test.mjs
  - .github/release-notes/v0.1.1.md
  - .github/release-notes/v0.1.3.md
  - .github/release-notes/v0.1.5.md
  - package.json
write_paths:
  - scripts/release/release-notes-format.mjs
  - scripts/release/release-notes-format.test.mjs
  - scripts/release/release-notes.mjs
  - scripts/quality/desktop-release-workflow.test.mjs
  - package.json
  - docs/dev/quality-gates.md
  - project/tasks/TASK-0496-release-notes-content-validation.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-24
updated: 2026-11-24
---
<!-- Copyright The Open Forge contributors. -->

# 发布说明内容层校验（PLAN-0032 P1 切片 2）

## 目标

参照上游 `06b431c3c` 的 release-notes 内容校验思路，为本地格式补 `--check` 没覆盖的内容层。

上游判定集（`## English`/`## 中文` 双语节、≤6 条、90 字硬顶、Full Changelog 链接）与本地格式
（`# Open Forge <ver>` + `发布日期` + `Upstream baseline` + `## 新增/改进/修复/其他` 单语四段）不兼容，
且本地存量有 300+ 条/节、2700 字/条的积压，套硬顶会让全部既有说明判负。因此按本地格式重写判定集：

- **problem（判负）**：允许清单之外的 `##` 小节、不在任何 `##` 下的 `- ` 条目、占位记号
  （TODO/TBD/FIXME/待补/待填/（占位）/[占位]）、空小节。
- **warning（不判负，--check 打印）**：单节超 25 条、单条超 300 字、内部引用
  （`文件名.x` / `apps|packages|scripts|src/` 路径 / `#N` 编号）、工程黑话
  （重构/单测/守卫/类型检查/回归测试/refactor/unit test/typecheck/monorepo）。

## 不做

- 不套用上游双语格式与 ≤6 条/90 字硬顶（存量不兼容，见目标）；
- 不清理存量 warning（v0.1.1/0.1.3/0.1.5/0.5.59 等合计 140+ 条，属发布说明清理任务，另行排队）；
- 不改 `--assemble` 行为与碎片目录合同。

## 验收（Given/When/Then）

- Given 说明含允许清单之外的 `##`、小节外 `- `、占位记号或空小节，When 运行 `--check`，Then 判负且每条带 `文件:行号`。
- Given 存量说明（v0.1.1–v0.5.59），When 运行 `--check`，Then 0 problems 通过；style 偏差以 `[release-notes]` warning 打印不判负。
- Given 条目含 `%…%` 占位符等正常措辞，When 校验，Then 不误伤（PLACEHOLDER 只认括号/方括号包裹的"占位"）。

## 保留合同

- `release-notes.mjs` 寻址、`--assemble` 碎片合同、`--check` 既有判定（标题/日期/baseline/tag 一致性/汇编一致性）不变；
- `collectReleaseNotesProblems` 返回值由 `string[]` 改为 `{ problems, warnings }`（模块内导出，测试未直接断言该函数，契约影响限于本模块）。

## 验证（实际执行）

- `bun run test:quality`（含新增 16 用例）：884 全过
- `bun run check`：lint + types + guards + mobile-lint 全绿（含 `--check` 的 warning 通道）
- `node scripts/release/release-notes.mjs --check`（v0.1.5，当前版本）：0 problems 通过，5 条 warning 打印不判负
- 存量全部 7 份说明离线校验：0 problems；warning 合计 ~144 条（v0.1.3 71 / v0.1.1 38 / v0.5.59 23 / v0.1.5 5 / 0.1.2 6 / 0.5.58 1）
- `desktop-release-workflow.test.mjs` 隔离沙箱补 `release-notes-format.mjs` 复制：75 用例全过（未补时该测试以 ERR_MODULE_NOT_FOUND 红 4 例）

## 附带发现（未在本任务处理）

- vitest 转换链（esbuild）对「解构默认值中含非 ASCII 键的对象字面量」求值有 bug：
  `function f({ sections = {新增:…} } = {})` 传入的实参被丢弃、取回默认对象。本任务在测试夹具中
  改用普通参数规避并在注释记录；上游/工具的根治不在本任务范围，先记入 LESSONS 候选。

## 未做项与风险

- 存量 ~144 条 warning 留待发布说明清理专项；SOFT_LIMITS 收紧为 problem 的时点由该清理进度决定；
- PLACEHOLDER 的「占位」仅认括号/方括号包裹写法——裸「占位」两个字的误报风险换「占位符」不误伤，
  若未来出现裸写法占位再补 pattern；
- warning 目前只在 `--check` 终端打印，未进 CI 汇总报表（无既有通道，不新建）。
