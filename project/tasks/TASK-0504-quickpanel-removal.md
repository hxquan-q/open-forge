---
id: TASK-0504
type: task
status: in_progress
priority: P2
owner: apps/desktop + packages/*
requirement: REQ-0008
plan: PLAN-0032
source: upstream c38c0a3c5 + 5b81b82fa
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0501, TASK-0502, TASK-0503]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e36f3a8
read_paths:
  - apps/desktop/src/main/
  - apps/desktop/src/preload/
  - apps/desktop/src/renderer/
  - apps/desktop/src/shared/
  - packages/capability-sdk/
  - packages/plugins/
  - packages/theme-ui/
write_paths:
  - apps/desktop/src/main/
  - apps/desktop/src/preload/
  - apps/desktop/src/renderer/
  - apps/desktop/src/shared/
  - packages/capability-sdk/
  - packages/plugins/
  - packages/theme-ui/
  - docs/
  - CONTEXT.md
  - scripts/quality/baselines/test-assertion-baseline.json
  - project/tasks/TASK-0504-quickpanel-removal.md
exclusive_paths: []
depends_on: [TASK-0503]
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 删除双击功能键快捷面板 + ⌘K→⌘T（PLAN-0032 P3 切片 d）

## 目标

按上游 `c38c0a3c5` 删除「双击修饰键唤出的快捷面板」（quickpanel）全部实现：main 进程窗口与 uiohook 双击钩子、preload IPC 面、渲染层应用、能力/插件域、配置迁移、文档、i18n。随后按上游 `5b81b82fa` 把 `open-command-menu` 默认键 `mod+k` → `mod+t`。

## 两个切片（两个提交）

- **切片 1（删除）**：`c38c0a3c5`，上游 109 文件（D ~20 + M ~88）。本地真实足迹 grep 得 77 文件。
- **切片 2（⌘T）**：`5b81b82fa`，11 文件，默认键切换。

## 适配要点

- M 文件不得整文件 `git checkout` 上游 post-image：本地有漂移。仅当本地文件与上游 pre-image 逐字节一致时（已识别 26 个）可直接取上游 post-image，否则逐 hunk 移植删除 quickpanel 的部分。
- `uiohook` 修饰键双击机制与 **appshot 共用**——只删 quickpanel 分支，保留 appshot 触发逻辑。
- `desktop-config-store.ts`/`desktop-config-patch.ts`（本地多出）配置迁移：删 quickpanel 配置键，存量用户配置兼容属公共合同。
- preload 跨进程合同：`preload/quickpanel.ts`、`api-types/quick-panel.ts`、`apis/quick-panel.ts`、`shared/quickpanel-ipc.ts` 删除后，`index.ts`/`api.ts` 挂接点要清干净。
- `vite.*.config.ts` 删 `quickpanel.html` 入口。
- i18n：en/zh 各 locale 文件中 `quickpanel`/`quickPanel`/`quick-panel` 键全删。
- `test-assertion-baseline.json` 上游删 1 条，sed 单行删。
- 本地独有文件（上游 M/D 清单外）需单独处理：`desktop-config-patch.ts`、`main-quickpanel-bootstrap.test.ts`、`quickpanel-window.test.ts`、`quickpanel-trigger.ts`、a11y test 等。

## 不做

- 不动 appshot 自身的触发与手势逻辑。
- 不改 `open-command-menu` 之外的快捷键默认键。

## 验收（Given/When/Then)

- `grep -rniE 'quickpanel|quick[-_.]panel' apps/desktop/src packages` 仅剩有意保留（如 ADR/历史 docs，若有）。
- `bun run check` 全过；`check:quick` exit 0。
- 设置页「快捷键」分区不再出现快捷面板项。
- ⌘T 切片后默认 `open-command-menu` = `mod+t`。
