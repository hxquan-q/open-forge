---
id: BUG-0067
type: bug
status: investigating
priority: P2
owner: docs-site
source: CI docs-site workflow build (37056667697)
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0184]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# docs-site 构建在 CI 上 Turbopack 报 71 个错误

## 事实

`docs-site` workflow 的 `check + test + build` 在 ubuntu runner 上 `bun run build` 失败：`Turbopack build failed with 71 errors`（37056667697，2026-10-03）。本地本会话未改动 docs-site；具体错误清单待从 job 日志提取（当日 log API 返回空）。长期红绿状态未知（此前关注点在 quality/desktop-packaged）。

## 待诊

提取 71 个错误的分布（依赖解析/类型/资源引用），判断是上游内容变更、依赖漂移还是环境差异。归入 [TASK-0184](../tasks/TASK-0184-docs-site-build-repair.md)：以错误清单分型后决定修复方式；修复前不宣称 docs 站可构建。
