---
id: TASK-0135
type: task
status: done
priority: P2
owner: apps/desktop
requirement: []
plan: []
source: user-request（2026-09-29）：对标 Cursor agent 的对话归档——直接对话与项目会话缺少存档能力，会话与任务一多就难以找回需要的历史
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
conflicts_with: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/settings/, apps/desktop/src/shared/conversation-tags.ts, packages/theme-ui/src/project/, packages/theme-ui/src/settings/]
write_paths: [apps/desktop/src/shared/archived-sessions.ts, apps/desktop/src/main/conversations/, apps/desktop/src/main/ipc/, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/settings/, apps/desktop/src/renderer/shared/store/, apps/desktop/src/shared/i18n/locales/, packages/theme-ui/src/project/, packages/theme-ui/src/settings/, project/tasks/, .github/release-notes/v0.1.3.md]
exclusive_paths: []
created: 2026-09-29
updated: 2026-09-29
---
<!-- Copyright The Open Forge contributors. -->

# 会话归档：直接对话与项目会话的归档能力

## 目标

用户提出：大量任务与对话后很难准确找到需要的会话历史，需要对标 Cursor agent 的对话归档。项目此前已有归档（设置「已归档」页），会话没有；本任务给会话补上同等的归档能力——侧栏右键「归档会话」→ 从侧栏隐藏但完整留在磁盘 → 设置页统一回看、恢复或永久删除。

## 范围

### 做

- 归档仓库：main 单写者 JSON（`~/.openforge*/desktop-app/archived-sessions.json`），原子写 + 变更广播，写失败保持内存一致；纯模型层负责解析（坏条目丢弃、按路径去重、外版本按空）、归档/取消归档/清标记（幂等，`archivedAt` 单调不回退，新→旧排序）。
- IPC 合同 `vetta:archived-sessions:list|archive|unarchive|forget` + preload `window.vetta.archivedSessions`（含 `onChanged`），renderer 侧 hydrate + 订阅同步。
- 侧栏：默认会话列表与项目分组同时按归档集合过滤（含「还有 N 个」折叠计数）；会话右键菜单新增「归档会话」——运行中禁用并说明「请先停止运行中的会话」，只读上下文与 agent team 会话不提供；归档成功 Toast 带「查看已归档」跳转设置页。
- 从侧栏删除会话时同步清掉归档标记，避免归档页残留指向已删会话的死项。
- 设置「已归档」页重组为「已归档项目 / 已归档会话」双分节；会话行展示名称与归档时间，支持取消归档与确认后永久删除（删除会话文件 + 清标记）。
- i18n zh/en 全量文案；发布说明并入 v0.1.3。

### 不做

- 不改既有 `session-archive`（加密导出/导入 `.ofar`）语义——与本功能同名不同物，不复用不合并；
- 不做批量归档、自动归档（按活跃度/时间）与归档后的搜索集成，等真实反馈再立项；
- 归档不改写会话文件本身，不影响历史、搜索、导出与恢复链路；
- agent team 会话不提供归档入口（生命周期由协调器管理）。

## Given / When / Then

- Given 侧栏有若干会话；When 用户右键一个空闲会话选择「归档会话」；Then 该会话从默认列表与项目分组即时消失，磁盘文件与历史不受影响，Toast 提供「查看已归档」入口。
- Given 某会话正在运行；When 用户打开其右键菜单；Then「归档会话」呈禁用态并说明需先停止运行中的会话。
- Given 设置「已归档」页有已归档会话；When 用户点击「取消归档」；Then 该行即时消失，会话回到侧栏原来的项目/列表。
- Given 同上；When 用户点击删除并确认；Then 会话文件被永久删除且归档标记清除；在确认框取消则两者都不动。
- Given 某会话处于归档状态；When 用户在侧栏的会话管理里删除它；Then 归档索引同步清除该路径，归档页不残留死项。

## 必须保持

- 归档只影响侧栏可见性与归档索引：不重写会话 jsonl、不动 tag 与置顶状态；
- 归档/取消归档幂等：重复归档同一路径不产生重复行，同刻归档按路径定序，列表顺序不抖动；
- 归档仓库容错：坏条目丢弃、外 schema 版本按空处理、写盘失败回滚内存广播但仍返回当前快照；
- 项目分组「运行中」指示仍按未过滤的真实会话判定（归档不改变项目运行态）；
- 所有用户可见文案走 i18n（zh/en）。

## 测试与验证

- 模型层 10 例（解析容错/去重/幂等/排序/清标记）；仓库 7 例（原子写、广播语义、单调 `archivedAt`、失败保持内存）；
- IPC 通道合同（通道名与退订）；侧栏过滤（默认列表 + 项目分组折叠计数）4 例；右键菜单组件 6 例 + 菜单模型 4 例（归档载荷、Toast 跳转、只读/team 隐藏、运行中禁用）；
- 设置页模型 3 例（新→旧与日期格式化、取消归档、确认后删除并清标记）；
- 质量检查：`check:quick`、定向 vitest、`test:impact`、根 `check`、desktop `typecheck`。
- 不运行 `verify:ui:*`（未获用户授权）。

## 交付记录

- 2026-09-29 交付（主工作区串行执行，branch main；三批提交：`8229fa904` 持久化与 IPC 合同 → `0b05d5399` 侧栏归档 → `3be4caeeb` 设置页管理）：
  - 模型 + 仓库 + IPC + preload：`archived-sessions.ts` 纯模型 10 例、`archived-sessions-store.ts` 7 例、preload 通道合同 1 例，全通过。
  - 侧栏：默认列表与项目分组过滤（`withoutArchivedSessions`）+ 折叠计数 4 例；右键菜单组件 6 例、菜单模型 4 例；删除会话同步清标记（`useProjectsPanelMenusModel` 测试断言）。
  - 设置页：「已归档」页重组为项目/会话双分节，`useArchivedSessionsSettingsModel` 3 例全通过；`ArchivedProjectsSettings.tsx` 旧容器删除、由 `ArchiveSettings.tsx` 统一承载。
  - 验证：归档族 9 个测试文件 43 例全通过；desktop `tsc --noEmit` exit=0；`check:quick` exit=0（含新文件声明头补齐）。
  - 发布说明已并入 `.github/release-notes/v0.1.3.md`（新增×2、改进×1、其他×1）。
  - 跟进（同日，用户反馈「团队对话不能够归档」）：归档入口此前显式排除 agent-team 会话，且设置页「已归档」的删除对团队会话会走普通会话删除——主进程以「Conversation is managed by Agent Team」拒绝，团队会话一旦归档即成删不掉的死行。已修复（`3b6cf56da`）：团队会话可归档，名字取团队标题（未命名回落团队占位名），归档快照新增可选 `team` 身份，设置页删除改走团队级删除并广播团队列表刷新。回归测试 +7 例（菜单模型 2、侧栏过滤 1、设置页 1、模型 2、仓库 1），归档族 9 文件 50 例全通过；`check:quick`、desktop `tsc` 通过；影响面跑 1 例 preload 导入超时（单跑 1.8s、目录组 12 文件 45 例全通过，判定并发重负载假红）；根 `check` 因并行工作区在途文件（`main/browser-automation/*`）的格式/类型红未过，非本任务文件。
