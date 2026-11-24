---
id: TASK-0498
type: task
status: in_progress
priority: P2
owner: packages/theme-ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream a50993e86 + 448165e57 + 2f2464e30（plugin-ui 开放 + SegmentedControl count）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0497]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: d0e259483
read_paths:
  - packages/theme-ui/src/plugin-ui/index.ts
  - packages/theme-ui/src/settings/MotionSelect.tsx
  - packages/theme-ui/src/settings/SettingChrome.tsx
  - packages/theme-ui/src/shared/SegmentedControl.tsx
  - packages/theme-ui/src/shared/VettaKbd.tsx
write_paths:
  - packages/theme-ui/src/plugin-ui/index.ts
  - packages/theme-ui/src/shared/SegmentedControl.tsx
  - project/tasks/TASK-0498-plugin-ui-widening.md
exclusive_paths: []
depends_on: [TASK-0497]
conflicts_with: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# plugin-ui 开放第二批 + SegmentedControl count（PLAN-0032 P2 切片 2）

## 目标

把上游已开放给插件的宿主组件补进本地 `plugin-ui/index.ts`，并移植 SegmentedControl 的 `count` 字段：

1. `MotionSelect` + `SettingChrome`（SettingHeading/SettingRow/SettingSection）——上游 a50993e86
2. `VettaKbd` ——上游 448165e57
3. `SegmentedControl` + `count` 字段——上游 2f2464e30（`count` 移植，`aria-pressed` 删除不回移植——上游删它是可访问性回退，本地保留）

## 不做

- 不移植物件本身（MotionSelect/SettingChrome/SegmentedControl/VettaKbd 本地已有）
- 不改插件文档（上游 docs/plugin/styling-and-pitfalls.md 的新增段落是面向插件开发者的，本地插件文档结构不同，单独立项）
- 不动 `ModelSelectorTriggerVariant`（上游新增类型，本地 ModelSelectorView 尚未对齐，属 P7 范围）

## 验收（Given/When/Then）

- Given plugin-ui 新增 exports，When 插件 `import { MotionSelect } from "@vetta-org/theme-ui/plugin-ui"`，Then 类型与值均可用。
- Given SegmentedControl 传入 `count: 5`，When 渲染，Then 标签右侧显示灰色 `5`；`count: 0` 或省略时不显示。
- Given `badge` 与 `count` 并存，When 渲染，Then `count` 在前（灰字）、`badge` 在后（红点），语义不混。

## 验证

- `bun run check`（lint + types + guards）
- 无新增测试文件（纯 export + 字段移植，现有 SegmentedControl 测试覆盖）
