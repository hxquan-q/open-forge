---
id: BUG-0160
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: TASK-0407 / code-mode-audit-2026-10-30 §四 F03
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0417]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 文件面板消费其他项目遗留的编辑目标

## 用户流程与实际行为

- Given：项目 A 的会话留下全局 `aiEditTarget`（`/project-a/private.ts`），When：挂载项目 B 的文件面板，Then：B 的内嵌详情被设为 A 的路径（应不消费）；编辑目标切页签同样不按来源过滤。

## 环境与失败证据

- 基线 `98f7de9e6`；独立探针复现（TASK-0407 §四 F03，合成路径）。§11.3 收敛（TASK-0416）已消除 work 语境暴露，本条为 code↔code 跨项目残留。
- 根因：`AiEditTarget` 不携带来源身份（接口只有 path/at，cwd 仅用于路径解析）；`useFollowAiFileEdits` 挂载即消费全局目标，`useFollowAiActivity` 的编辑分支不做来源过滤（shell 分支已有 cwd 过滤对照）。

## 最小复现

1. code 会话 A 编辑文件 → 切到 code 会话 B（另一项目）→ B 文件页签详情指向 A 的文件。

## 影响

用户误以为 AI 正在改当前项目。无真实文件读取（探针为合成数据）。

## 根因证据

报告 §11.1 复核一致；本轮源码复核确认接口缺身份字段。

## 回归测试

- 工厂：目标携带来源 `cwd`。
- 消费：跨项目目标挂载不消费、不切页签；同 cwd 目标照常跟随（既有用例带 cwd 复验）。

## 修复与验证

- 修复：`AiEditTarget` 增 `readonly cwd: string | null` 并由工厂随目标携带；`useFollowAiFileEdits`（Context workspace）与 `useFollowAiActivity` 编辑分支按 `target.cwd === workspace.cwd` 过滤。
- 测试：红 2（跨项目不消费/不切页签）→ 绿；全套件 23/23（含 atoms 工厂 cwd 断言与既有用例带 cwd 复验）。
- 检查：`check:quick` 通过（ratchet new=0）。
- 未运行及原因：实机跨项目走查待用户；会话粒度（同项目多会话）隔离仍按 cwd 近似（会话 cwd 相同即视为同源），与 shell 分支同口径。
