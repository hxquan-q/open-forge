---
id: TASK-0444
type: task
status: verifying
priority: P3
owner: plugins/presets/scripts
requirement: REQ-0008
plan: PLAN-0014
source: BUG-0081
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0158]
related_issues: []
related_bugs: [BUG-0081]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: b2c8db886
read_paths:
  - packages/plugins/presets/scripts/locales/
  - packages/plugins/presets/scripts/src/components/ScriptsPanel.tsx
  - packages/plugins/presets/scripts/src/components/ProjectCard.tsx
  - packages/plugins/presets/scripts/test/ScriptsPanel.test.tsx
write_paths:
  - packages/plugins/presets/scripts/locales/en.json
  - packages/plugins/presets/scripts/locales/zh.json
  - packages/plugins/presets/scripts/test/locale-contract.test.ts
  - project/bugs/BUG-0081-scripts-panel-missing-locale-keys.md
  - project/bugs/README.md
  - project/tasks/TASK-0444-scripts-panel-locale-contract.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/bug-0081-scripts-panel-locale-contract.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Scripts 面板补齐中英文案与插值合同（BUG-0081）

## 目标与范围

补齐 Scripts 面板中英文 locale 缺失的 7 个 key，并令 summary 文案使用与调用点一致的 `projects` / `scripts` 插值。新增 locale 合同测试，确保组件中直接引用的 key 在两种 locale 中都存在，避免继续回显原始 key。

## Given / When / Then

- Given Scripts 面板使用中文或英文，When 显示搜索/错误/目录卡片控件，Then 不显示原始 `search.clear`、`action.dismiss`、`state.error.title` 或 `card.*` key。
- Given 面板有项目和脚本，When 显示 summary，Then 项目数与脚本数均正确插值。

## 必须保持

- 不改变脚本发现、搜索、运行或终端行为。
- 中英文 locale 的直接 key 集合与组件引用保持同步。
- 继续使用宿主的 `t` 翻译机制；不在组件中硬编码显示文案。

## 测试与验证

- 新测试动态收集 ScriptsPanel / ProjectCard 的字面量翻译 key，并对 en/zh locale 断言无缺项。
- 测试 summary 占位符与调用方插值键一致。
- 先确认旧 locale 合同失败，再更新文案；运行 preset Scripts 相关测试、impact 与 `bun run check`。

## 交付记录

- 中英文 locale 已补齐组件缺失的 7 个 key；summary 插值统一为实际传入的 `projects` / `scripts`。
- 旧 locale 合同先红 2→绿；`test:impact` 运行 Scripts preset 全包 17/17 通过。
- `bun run check` 全绿。
- 未启动真实 Desktop；该任务只改翻译和静态插值，措辞可在后续视觉验收中反馈。
