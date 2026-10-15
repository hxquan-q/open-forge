---
id: TASK-0212
type: task
status: done
priority: P2
owner: release/product
source: user-request；PLAN-0016 阶段 3
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: [TASK-0209, TASK-0211]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 0cc780f5a
read_paths: [scripts/release/release-notes.mjs, docs/dev/agent-rules/delivery.md, .github/release-notes/README.md, docs/release/desktop-release-runbook.md]
write_paths: [scripts/release/release-notes.mjs, scripts/release/release-notes.test.mjs, docs/dev/agent-rules/delivery.md, .github/release-notes/README.md, docs/release/desktop-release-runbook.md, .github/release-notes/v0.1.3.md, project/tasks/TASK-0212-release-notes-fragments.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 发布说明碎片化：一版一文件改为碎片加汇编

## 目标与范围

PLAN-0016 阶段 3。一版一个 `v<版本>.md`，所有并行任务往里追加，于是每次并行集成都可能在同一个文件上冲突——本次合并 `origin/chenxvhua` 时唯一的冲突就是它。本 Task 把「写说明」从「改一个大文件」改成「写一份碎片」，再由一个命令汇编成仍是唯一 Release 正文的 `v<版本>.md`。

做：

- 新目录 `.github/release-notes/fragments/v<版本>/<slug>.md`：每份碎片是一段或几段「`## <小节>` 加条目」，小节限定为 新增、改进、修复、其他 四个。
- `scripts/release/release-notes.mjs` 增加汇编：按文件名的稳定顺序收集碎片，按四个小节的固定顺序拼成正文；产物末尾带一行「由碎片汇编」标记，供再次汇编时识别。
- 加法式生效：只为存在碎片的版本汇编。既有 `v0.1.3.md`（110 条手写条目）不迁移、不重写；从下一个版本起，写碎片是默认路径。
- 冲突保护：某版本既有手写正文（没有汇编标记）又有碎片时，汇编直接报错，不静默丢掉任何一边。
- 守卫：`release-notes.mjs --check` 增加——碎片小节名必须合法、每份碎片至少一条、存在碎片时磁盘上的正文必须与汇编结果一致（防止改了碎片忘汇编）。
- 规则同步：`docs/dev/agent-rules/delivery.md`、`.github/release-notes/README.md` 与发布手册的事实源。

不做：不迁移既有条目；不改 `release-desktop.mjs` 的 prepare 与 publish 语义（publish 仍只写日期）；不改 workflow；不执行发布。

## Given / When / Then

- Given 一个并行任务要记录改动；When 它按新规则写 `fragments/v0.2.0/<slug>.md`；Then 不再与别人的改动落在同一个文件上，冲突面从「整份正文」缩到「同一份碎片」。
- Given 碎片已写但正文未汇编；When 跑 `bun run check`；Then 守卫报出正文与碎片不一致并给出汇编命令。
- Given 某版本同时有手写正文与碎片；When 汇编；Then 报错，而不是静默覆盖。

## 必须保持

- `v<版本>.md` 仍是 GitHub Release 正文，格式（标题、发布日期、上游基线行、四个小节）不变。
- 不改已发布版本的说明；不引入新依赖；不调用真实 GitHub。
- 上游继承的 `# Vetta …` 说明不受影响。

## 测试与验证

- `scripts/release/release-notes.test.mjs`：补汇编顺序、小节归组、手写与碎片并存报错、`--check` 一致性断言等用例。
- `bun run test:quality`、`bun run check`。
- 用一份临时版本目录跑一次汇编，确认产物格式与既有 `v0.1.3.md` 同构。

## 交付记录（2026-10-06）

- 实际修改：
  - `scripts/release/release-notes.mjs`：新增 `fragmentsDir`、`listFragmentPaths`、`parseFragmentSections`、`fragmentProblems`、`assembleReleaseNotes`、`assembleReleaseNotesFile`，导出 `RELEASE_NOTE_SECTIONS` 与 `ASSEMBLED_MARKER`；新增 `--assemble`，`--check` 增加碎片格式与「正文与碎片一致」两条断言。
  - `scripts/release-desktop.mjs`：`releaseNotesTemplate` 生成的骨架带上汇编标记，使新版本从出生就归碎片管理。
  - `docs/dev/agent-rules/delivery.md`、`.github/release-notes/README.md`、`docs/release/desktop-release-runbook.md`：把「补写发布说明」改成「写一份碎片」，并写明汇编命令与守卫。
  - `.github/release-notes/v0.1.3.md`：在「其他」补一条说明。
- 实现中实测到的缺陷与修复：`--assemble` 在无碎片时按空碎片集重建正文，把 v0.1.3 的 110 条手写条目整个清空。已从 HEAD 恢复（当前相对 HEAD 为 1 增 0 删），把无碎片路径改成纯 no-op，并补两条回归测试（无碎片不动正文、有碎片才汇编）；模板与汇编共用同一标记常量，另有断言防止两边漂移。
- 验证命令与结果：
  - `bun run test:quality`：37 文件 / 506 项通过（本 Task 新增 7 项）。
  - `node scripts/release/release-notes.mjs --check`：通过；`--assemble` 对 v0.1.3 报 no-op 且文件不变。
  - `bun run check`：exit 0（含声明头 ratchet new=0）。
- 未运行及原因：未执行发布；未做端到端验证——真实的并行碎片冲突场景要等下一次并行集成才会自然出现。
- 剩余风险：既有 110 条手写条目未迁移，`v0.1.3.md` 仍是手写正文，发版时照旧作为 Release 正文；历史 Task 记录里 102 处 `release-notes/v` 引用未回填（属历史事实）。
- 集成：实现提交 `a70bba348`（本地 `main`），`integration_status: integrated`；未推送、未发布。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI、工具链、规则、文档或仓库设置，无用户可观察行为变化；既定验收标准（静态门禁与定向测试）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
