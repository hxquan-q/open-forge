---
id: TASK-0058
type: task
status: done
priority: P0
owner: unassigned
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0008
execution: serial
branch: forge/dev
worktree: unassigned
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [LICENSE, NOTICE, project/issues/ISSUE-0008-apache-modified-file-notice.md, project/plans/PLAN-0005-independent-release-and-fork-governance.md]
write_paths: [source files selected by approved modification inventory, NOTICE, project/issues/ISSUE-0008-apache-modified-file-notice.md]
exclusive_paths: [source files selected by approved modification inventory, NOTICE]
depends_on: [ISSUE-0008]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# Apache-2.0 修改文件来源声明审计

## 目标

根据 ISSUE-0008 中经授权确认的 Apache §4(b) 文件级声明策略，以明确 upstream baseline 识别被分发的修改源文件，按批准格式补齐可验证的修改/来源声明，并保留原有 copyright、patent、trademark 和 attribution notices。

## 范围

### 并发评估

- 结论：当前不支持并发；可能涉及大量上游派生源文件和 NOTICE，需单一权利人/法律负责人确认后统一执行。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：ISSUE-0008 关闭；确认 Open Forge 修改的权利主体、upstream baseline、生成文件排除规则和文件头模板。
- 冲突文件/独占路径：经来源清单识别的被分发源文件、`NOTICE`。
- Branch：`forge/dev`；Worktree：待决策后分配独立 worktree。
- 集成负责人：后续指定。
- 集成顺序：法律/权利人决策 → modified-file inventory → approved header migration → verification。

### 做

- 基于确认的 fork baseline 生成 modified-file inventory，并逐项区分手写源文件、生成文件、第三方 vendored 文件与不随发行物分发的内容。
- 严格采用 ISSUE-0008 批准的修改声明，不自行编造作者或权利人。
- 增加静态检查/合同测试，阻止后续新增的相关修改文件漏掉批准声明。

### 不做

- 不批量给整个仓库添加虚构版权人或“作者”声明。
- 不删改上游版权、专利、商标或 attribution notices。
- 不把 README、About 或根 NOTICE 的项目级说明当成已自动满足所有文件级要求。
- 不在 ISSUE-0008 未关闭前修改源文件头。

## Given / When / Then

- Given：权利人/法律负责人已批准文件级声明模板和适用范围；When：对确定的 Open Vetta upstream baseline 运行审计；Then：所有随源码分发且属于适用范围的修改文件均有批准声明，不适用文件有可复核的排除理由，原始 notices 保留。

## 必须保持

- 不改变代码行为、公开 API、协议、版权归属事实或第三方许可证文本。
- 生成文件由其事实源/生成脚本处理，不直接手改生成产物。
- 未确认的著作权人、贡献者和法律实体保持未决，不猜测。

## 测试与验证

- 定向测试：修改文件 inventory 与基线的可重复性；声明检查覆盖遗漏和误匹配；排除规则覆盖生成物/第三方代码。
- 用户流程：从 Open Forge 源码发行包检查每个被分发修改文件的来源声明，且能追溯到批准的 upstream baseline。
- 质量检查：许可证审查记录、静态验证报告和 `bun run check:quick -- <changed files>`；不做真实发布。

## 已批准策略（ISSUE-0008 决策，2026-09-23）

- 可注释的修改文件头部统一加单行 `Modified by The Open Forge contributors`；Open Forge 自有新文件加 `Copyright The Open Forge contributors`（不加年份）。
- 审计基线为动态 `git merge-base upstream/dev HEAD`；审计脚本漏标 fail closed，未归类文件进清单待分类。
- 白名单：`*.json` 等不可注释格式、锁文件、二进制/图片、上游已发布 Release Notes 原文、`exprot/` 归档、第三方 vendored 目录；白名单文件由审计清单兜底声明。
- 上游原有版权/attribution 一律保留，声明追加而非替换。

## 阻塞

- 无。ISSUE-0008 已关闭，策略见上。

## 交付记录

- 实际修改：新增 `scripts/quality/check-modified-file-notices.mjs`（审计 + `--write` 迁移，动态 `git merge-base upstream/dev HEAD` 基线）；为 529 个可注释的修改/新增文件写入声明头（`//`、`#`、`<!-- -->`、`/* */`、`--`、`;` 六种风格，shebang/`<?xml` 声明/YAML frontmatter 均正确避让）；`NOTICE` 增加 §4(b) 兜底段指向审计清单。
- 实际运行：`node scripts/quality/check-modified-file-notices.mjs` 最终 `changed=585 covered=529 excluded=56 missing=0 unclassified=0`；`check:quick` 本批文件 Biome 干净；抽查 ts/plist/iss/Makefile/go.mod/md 声明插入位置正确；白名单校验确认无 JSON/锁文件/二进制被写头。
- 修正：首轮 `--write` 将 `<!-- -->` 插在 105 个 `project/**.md` 的 frontmatter `---` 之前（破坏解析），已修 `insertionIndex` 并迁移至闭合 `---` 之后。
- 未运行及原因：全量 `bun run check`（并行工作区有 4 个无关 typecheck 错误与 1 个 coding-agent tsconfig guard 失败，均非本批文件）；真实发布/提交/push 不做。
- 剩余风险：并行工作区持续新增文件，审计是持续门禁——发布前需重跑本脚本；`fileHasNotice` 仅扫前 4096 字节，frontmatter 超长的文件理论上有漏判窗口。
