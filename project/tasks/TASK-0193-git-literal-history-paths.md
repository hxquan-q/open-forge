---
id: TASK-0193
type: task
status: done
priority: P1
owner: plugin-git
source: user-request; RESEARCH-0022; upstream 2dd10fc5b
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0074]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/plugins/presets/git/src/git/log.ts, packages/plugins/presets/git/src/git/parseLog.ts, packages/plugins/presets/git/test/log.test.ts, packages/plugins/presets/git/test/parseLog.test.ts]
write_paths: [project/bugs/BUG-0074-git-history-path-parsing.md, packages/plugins/presets/git/src/components/graph/CommitDetailPane.tsx, packages/plugins/presets/git/src/git/log.ts, packages/plugins/presets/git/src/git/parseLog.ts, packages/plugins/presets/git/test/log.test.ts, packages/plugins/presets/git/test/parseLog.test.ts, project/tasks/TASK-0193-git-literal-history-paths.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# Git 历史特殊路径与重命名正确性

## 目标与范围

适配上游 2dd10fc5b 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

临时 Git 仓库含特殊文件名和重命名；读取提交文件列表与逐文件 diff；保留字面路径和前后路径，不按模式误匹配。

## 必须保持

不新增 reset/detach 等破坏性入口，不改插件权限；命令与 parser 成套兼容。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

接口适配：commitFileDiff 保留 path 参数并增加可选 originalPath；列表消费者补传 origPath 与 effect 依赖。name-status 改 NUL 合同并拒绝截断，唯一生产者/消费者一起迁移。测试用隔离 Git 临时仓库、空全局/系统配置与 hooks，不接触用户仓库；基线插件 `bun run --cwd packages/plugins/presets/git check` 通过。

有效红测：`bun scripts/quality/run-vitest.mjs run packages/plugins/presets/git/test/parseLog.test.ts packages/plugins/presets/git/test/log.test.ts`，7 失败/1 通过；真实 Git 证明 literal 邻居误匹配和 rename 退化。最初测试源码转义错误的收集失败不计入红测。

绿测：插件标准 `bun run --cwd packages/plugins/presets/git test` 与 `check` 通过；首次标准入口缺 plugin-vite dist，按实际 workspace 依赖构建后解决，不是产品失败。真实 Git 回归覆盖特殊路径与重命名前后路径；保留 helper 旧调用形式并补非零退出失败可见性。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

夹具：`<debug vettaHome>\fixtures\git-literal-paths`，五个提交覆盖 空格/中文/`'`/`$`/`#`/`&`/`()`/`[]`/目录内空格 与三种重命名（纯重命名 R100、重命名加改 R087、重命名加删）。把该目录注册为隔离实例项目后，在项目会话里打开活动面板 → Git 页签 → 提交图 → 提交详情。

- **字面路径**：提交详情文件列表逐项显示原文，无转义与丢字——根提交 `普通 文件.txt`、`sub dir/`→`带 空格.md`、`quote'file.txt`、`dollar$file.txt`、`amp&and.txt`、`paren(1).txt`；重命名提交 `renamed #2.txt`、`引号'文件.txt`、`new 文件&2.txt`。
- **前后路径**：纯重命名（`paren(1).txt` → `paren(1) 重命名.txt`，R100）的逐文件 diff 头部 tooltip/标题为 `paren(1).txt → paren(1) 重命名.txt`，状态徽标「已重命名」，正文「无差异内容。」（100% 相似度正确呈现）；重命名加改（`dollar$file.txt` → `dollar$file-v2.txt`，R087）同样带前后路径并渲染 `appended after rename` 的追加 hunk。列表行与其他列表视图一致用 `origPath → path` 作为行 tooltip（与 `GitFlatList.tsx:81`、`CommitDetailPane.tsx:47` 源码一致）。
- **不按模式误匹配**（本项的核心回归面）：新增提交 `449e837` 同时含 `br[ack]et.txt`/`bracket.txt` 与 `x[1].txt`/`x1.txt` 四组 glob 同名邻居。选中 `br[ack]et.txt` 的 diff 只含 `BRACKET_ONE`（**不含** `bracket.txt` 的 `PLAIN_TWO`）；选中 `x[1].txt` 的 diff 只含 `XBRACKET_ONE`（不含 `x1.txt` 的 `XPLAIN_TWO`）。若 `--` 后路径被当作 pattern，这两处必然串入邻居文件，实测未串入，`--literal-pathspecs` 生效。
- 相对照的真实 Git 输出：`git show 53273d4 -m --first-parent --name-status -z --find-renames` 为 5 项（`D a#b.txt`/`A new 文件&2.txt`/`D quote'file.txt`/`A renamed #2.txt`/`A 引号'文件.txt`），UI 平铺列表逐项对得上，`parseNameStatus` 未因 NUL 合同丢项。

按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。未覆盖项：`GitChanges`（工作区未提交变更）列表侧的特殊路径，本轮工作区为干净态未构造未提交变更；重命名的**可见正文**只在逐文件 diff 头部与行 tooltip 暴露（列表行正文仅显示目标路径），如需正文并排显示前后路径属交互设计取舍，请用户按预期裁定。
