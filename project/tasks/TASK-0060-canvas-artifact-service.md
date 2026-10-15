---
id: TASK-0060
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: PLAN-0006 Canvas artifact service workstream
execution: parallel
branch: forge/dev
worktree: unassigned（原 ..\open-forge-wt\TASK-0060-canvas-service 目录已淘汰；实现在 forge/dev 主工作区，随 c1f931648 落地）
base_commit: forge/dev
read_paths: [apps/desktop/src/main, packages/coding-agent/src/features/artifacts, packages/runtime-core/src/task, packages/runtime-storage/src/conversation]
write_paths: [apps/desktop/src/main/artifacts, apps/desktop/src/main/agent-runtime, packages/coding-agent/src/features/artifacts, packages/coding-agent/test]
exclusive_paths: []
depends_on: [TASK-0059]
conflicts_with: []
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0059, TASK-0061]
related_issues: [ISSUE-0006]
related_bugs: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Canvas artifact 服务与 `artifact` 工具实现

## 目标

实现 Conversation/Task 双生命周期的 artifact 管理服务与 `artifact` Agent 工具：文件写入本机管理目录 `canvas/`（按 workspace 分桶），descriptor 经 `artifact.descriptor.recorded` 持久化，版本单调、checksum 防冲突；「保存到项目」复制并重指 uri。

## 范围

### 并发评估

- 结论：条件支持——与 Browser lane（0062→0063）和 0064 可并行；共享接缝由 TASK-0059 预切。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0062、TASK-0064。
- 前置依赖：TASK-0059（工具合同、IPC/preload 桩、组装根装配点）。
- 冲突文件/独占路径：无新增共享文件；组装根与 IPC 注册已在 0059 完成。
- 集成负责人：coordinator；集成顺序：先于 TASK-0061 合入。

### 做

- Canvas Store：应用数据区 `canvas/<workspaceId>/` 目录管理、原子写入、缺失检测、`get`/`list` 读取面。
- 会话级 artifact 写入路径：`create`/`update` 不要求活动 Task；`attach_to_task` 复用 `desktopTaskActivityService.attachToActiveTask`，无活动 Task 返回 `no_active_task`。
- `update` 语义：要求 `baseVersion`；内容 sha256 与 descriptor.checksum 不一致或 baseVersion 落后 → 拒绝或强制新版本，禁止覆盖写历史。
- 外部修改：Canvas 打开时与 `update` 前做 checksum 比对；对可见 artifact 加文件 watcher，外部变更导入为新版本并标记「外部更新」。
- 「保存到项目」：复制到项目内目标路径（走现有项目根校验/SSH 写入路径），descriptor `uri` 重指项目文件、版本延续；目标冲突显式报错；本机副本保留为历史快照，单向不双写。
- `artifact` 工具 handler 实现挂到 0059 的 host function 接缝。
- 取消/超时：`create`/`update`/保存到项目可取消，半途不产生半成品 descriptor（先写文件再记事实）。

### 不做

- Canvas UI / renderer（TASK-0061）。
- 自动 GC、artifact 搜索、多 workspace 迁移。
- Git 任何操作。

## Given / When / Then

- Given：普通会话无活动 Task；When：Agent 调 `artifact.create` 写 Markdown；Then：文件落管理目录，`artifact.descriptor.recorded` 落会话事件（无 `sourceTaskId`），重开会话可恢复。
- Given：artifact v2 已投影；When：Agent 用 `baseVersion=1` 调 `update`；Then：返回 `stale_version`，不产生新版本，文件未被覆盖。
- Given：artifact 已保存到项目且用户在外部编辑器改了文件；When：Canvas 打开或 watcher 触发；Then：外部内容导入为新版本并标「外部更新」，旧版本仍可查。
- Given：目标项目路径已存在同名文件；When：保存到项目；Then：显式冲突报错，不覆盖。

## 必须保持

- 文件内容是事实源；descriptor 事件可重建、不存内容正文。
- `recordTaskFacts` 的会话归属校验语义不变。
- 普通聊天不因 artifact 产生而创建 Task（ISSUE-0006 边界）。

## 测试与验证

- 定向测试：store 原子写/缺失/枚举；版本单调与 stale 拒绝；checksum 冲突；无 Task 写入；attach_to_task 在无 Task 时明确失败；保存到项目的复制/重指/冲突/SSH 路径；watcher 外部变更导入。
- 用户流程：Agent create → list/get 可见 → update 出新版本 → 保存到项目 → 重开会话恢复 → 外部编辑 → 新版本导入。
- 质量检查：`bun scripts/quality/run-vitest.mjs --run` 新增测试；`bun run test:impact -- <files>`；`bun run check:quick`。

## 交付记录

- 实际修改：在 Desktop 主树集成 Canvas artifact store/service、Agent 工具与宿主接线；保持会话 artifact 不依赖活动 Task，版本/checksum 冲突显式拒绝，保存到项目不覆盖目标文件。
- 实际运行：`bun run --cwd packages/coding-agent test test/runtime-core/session-execution-result-policy.test.ts test/features/artifacts/artifact-version-policy.test.ts`（10 项通过）；`bun run --cwd apps/desktop test src/main/agent-runtime/function-extension-source.test.ts src/main/artifacts/canvas-artifact-service.test.ts src/main/artifacts/canvas-session-scan.test.ts src/main/artifacts/canvas-store.test.ts src/main/ipc/canvas-browser-tab.test.ts`（21 项通过）。
- 未运行及原因：完整 `bun run check` 尚未运行，待本批任务集成后统一执行。
- Release Notes：候选文案应由 Coordinator 按本次交付和用户可见影响核实后纳入当前 Desktop manifest 对应的 `.github/release-notes/v0.1.1.md`；不再等待首发版本切换，也不修改上游已发布的 Vetta Release Notes。
- 剩余风险：等待 TASK-0061 UI 集成及整批完整质量检查。
