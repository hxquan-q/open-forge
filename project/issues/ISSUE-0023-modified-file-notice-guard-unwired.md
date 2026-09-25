---
id: ISSUE-0023
type: issue
status: ready
priority: P2
owner: scripts/quality
related_requirement: []
related_plan: []
source: ISSUE-0019 实施过程中复核 `check-modified-file-notices.mjs`
created: 2026-09-25
updated: 2026-09-25
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 修改声明头守卫未接入任何门禁，且全仓大面积缺失

## 背景与已知事实

- 仓库要求 fork 侧修改的文件带声明头（上游 Apache-2.0 修改声明，见 `ISSUE-0008`）。
- `scripts/quality/check-modified-file-notices.mjs` 已经存在，支持审计（漏标即非零退出）与 `--write`（自动插入声明头）两种模式，并内置 `excluded` 与 baseline 对照（基线为 `upstream/dev@d217984c72ef`）。
- 实测（2026-09-25，本机 `node scripts/quality/check-modified-file-notices.mjs`）：`changed=1554 covered=896 excluded=102 missing=553 unclassified=3`，**退出码 1**。
- 该脚本**没有**接入 `package.json` 的任何 script、`check:quick`、`check-guards`、pre-commit 或 CI workflow；即"存在但从不运行"。

## 未决问题

1. 553 个缺失文件应当**一次性 sweep**（`--write`），还是先接入门禁并 ratchet（只允许减少不允许新增）？
2. `unclassified=3` 是哪三个文件、为何无法分类（是否需要补规则或补 baseline）？
3. 该守卫要求的 `upstream` remote 在 CI 环境是否可用（当前用法注明"需要本地存在 upstream remote"）？若不可用，接入 CI 需要换基线来源。

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 安静窗口一次性 `--write` sweep + 接入 pre-commit/CI | 彻底清零，之后可硬性门禁 | 一次触及 553 个文件；与并行在途编辑大面积冲突 | 多会话并行期执行会制造大量冲突与误判 |
| B. 先接入门禁并 ratchet（记录当前缺漏清单为 waiver，只允许减少），再分批 sweep | 不再恶化；可分批、低冲突 | 需要一份可解释的 waiver 基线并定期到期复审 | waiver 若无人复审会长期化 |
| C. 维持现状 | 零成本 | 声明头缺失无限期存在；守则是"存在但不执行" | 合规面（Apache 修改声明）长期不达标 |

## 推荐

**先 B 后 A**：当前仓库处于多会话并行活跃期，一次性 553 文件 sweep 会与在途编辑大面积冲突；先用 ratchet 挡住新增（并能解释现存缺口），等出现安静窗口（无并行代码线）再执行 `--write` sweep 并切换为硬门禁。执行 sweep 时必须配合 `git status` 分批核对，避免把他人未提交改动卷进机械改动。

## 决策触发条件

- 出现一个无并行代码 Task 的安静窗口 → 执行 A 的 sweep 阶段；
- 或 CI 基线来源（upstream remote 可用性）确定后 → 接入 B 的门禁。

## 后续可能拆出

- Task：`check-modified-file-notices` 接入 pre-commit / CI 并引入 ratchet waiver（含 3 个 unclassified 文件的分流）；
- Task：quiet-window 下的一次性 `--write` sweep 与复核。
