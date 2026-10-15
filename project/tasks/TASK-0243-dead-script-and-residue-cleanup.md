---
id: TASK-0243
type: task
status: done
priority: P3
owner: scripts
requirement:
plan:
source: 仓库工程卫生盘点（2026-10-14）：失效脚本 scripts/session-transcripts.ts 与根目录 0 字节残留日志
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 23ae759f7
read_paths: [scripts/session-transcripts.ts, scripts/quality/check-modified-file-notices.mjs]
write_paths: [scripts/session-transcripts.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0243-dead-script-and-residue-cleanup.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 清理失效脚本与根目录残留

## 目标

删除已不可运行的 `scripts/session-transcripts.ts`，并清掉根目录两个 0 字节残留日志。

## 范围

### 做

- 删除 `scripts/session-transcripts.ts`。依据：`8e4f93355` 把 `core/session-manager.ts` 拆为 `core/session-manager/` 目录，随后 `286403ffb`（2026-08-05）退役 `core/` 整棵子树，该脚本第 17 行 `import ... from "../packages/coding-agent/src/core/session-manager/index.js"` 自此无解析目标；`parseSessionEntries` 在全库已无定义（`grep` 0 命中），脚本名在仓库内（含文档、配置、CI）无任何引用方。
- 删除根目录 `wt-out.log`、`wt-err.log`（各 0 字节，worktree 工具残留，已由 `.gitignore` 的 `*.log` 覆盖，从未入库）。

### 不做

- 不改写脚本以适配新路径：`core/` 已整体退役且无等价导出，重写属独立议题；需要该能力时另立 Task。
- 不动 `.ua/` 知识图谱产物与 `temp/log/` 运行日志（体积议题，另议）。

## Given / When / Then

- Given：脚本引用的模块路径已不存在，全库无引用方。
- When：删除脚本与两个残留日志。
- Then：`knip` 的 unlisted dependencies 不再出现 `chalk`（该脚本的唯一来源）、Unresolved imports 归零；`bun run check` 保持全绿。

## 必须保持

- 不触碰任何生产代码、测试与门禁脚本行为。

## 测试与验证

- 定向：`bun run deadcode:report` 中 `session-transcripts.ts` 相关条目（unlisted `chalk`、unresolved import）消失。
- 质量检查：完整 `bun run check` 全绿。
- 用户流程：不适用（开发期脚本清理，无用户可见行为）。

## 验收分层

- 工程验证：通过；绑定 `bun run check`（exit 0）与 knip 报告前后对照。
- 技术评审：自审；风险为误删仍有用途的脚本，已以「无引用方 + 导入目标不存在」双向证据排除。
- 集成：main 串行。
- 人工功能验收：不适用。
- 发布：未授权；已记入 `.github/release-notes/v0.1.3.md` 的「其他」小节。

## 交付记录

- 实际修改：删除 `scripts/session-transcripts.ts`（406 行）、`wt-out.log`、`wt-err.log`。
- 实际运行：`bun run deadcode:report` 前后对照；完整 `bun run check`。
- 未运行及原因：未跑测试套件——删除的是无人引用的开发期脚本，无行为变化。
- Worktree：未拆出；单一串行改动，main 直接实施。
- 剩余风险：如后续需要会话转录分析能力，需按新会话目录结构重写。
