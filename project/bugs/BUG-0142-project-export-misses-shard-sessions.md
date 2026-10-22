---
id: BUG-0142
type: bug
status: done
priority: P1
owner: apps/desktop
source: 用户现场日志（2026-10-22，WeChat 传输 2026-10-22.log）+ TASK-0361 验收追问「导入项目只有项目其他都没有」
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0361]
related_issues: [ISSUE-0034]
related_bugs: []
depends_on: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 项目导入（.openforge.zip）不带任何会话：导出只扫旧版项目内会话目录，分片会话全丢

## 现象（用户日志）

- `[project-export] imported normal project from D:\...\kitAnalysis\齐套分析.openforge.zip → D:\...\common\齐套分析 (missing-sources=0)`
- 用户观察：导入后**只有项目本身，其他（会话等）都没有**。

## 根因（代码证据）

`apps/desktop/src/main/ipc/project-export.ts`：

- 导出/导入只处理 `<项目>/.vetta/sessions/*.jsonl`（存量兼容目录，见 `session-catalog-roots.ts` 注释「会话曾短暂落在这里」）。
- 现行会话落点早已迁到全局分片目录 `codingAgentSessionShardPath(projectDir)`（`<agentDir>/sessions/--编码路径--`），导出侧不读分片 ⇒ 打包 0 条会话；导入侧 `missing-sources=0` 仅指工作区文件恢复完好。
- 导入侧对 `.vetta/sessions` 已有 cwd 重写机制（`rewriteJsonlFile(oldRoot,newRoot)`），可直接复用。

## 期望

- 导出：同时打包项目分片目录的全部会话 jsonl（与 `.vetta/sessions` 并集，去重按文件名）。
- 导入：分片会话恢复进 `<新项目>/.vetta/sessions`（目录 catalog 已识别）并重写 cwd；恢复后广播列表变更（或经项目注册刷新）使用户即时可见；锁文件/临时文件照旧排除。
- 回归：导出→导入 round-trip 含分片会话；旧包（无会话）导入不回归。

## 关联

用户在 TASK-0361（项目迁移包 .ofar）验收语境下发现；该功能（.openforge.zip）与迁移包是两条入口，本 BUG 修复 .openforge.zip 通道的会话缺失。

## 修复与验证

- 修复：`apps/desktop/src/main/ipc/project-export.ts` 导出侧新增 `addShardSessionsToZip`——把 `codingAgentSessionShardPath(projectDir)` 分片目录的全部 `.jsonl` 追加进 zip 的 `<rootDir>/.vetta/sessions/`，与项目内既有 `.vetta/sessions` 按文件名并集去重（同名时项目内文件优先）；只收 `.jsonl`，`*.lock` / `*.tmp` 等过程文件天然不入包。manifest 不加新字段，旧版导入端天然兼容。导入侧保持既有「解到新项目同名目录 + `rewriteAbsolutePathsAfterImport` 重写 cwd」不变，另在项目注册完成后对 `<新项目>/.vetta/sessions` 下每个 jsonl 广播 `emitConversationListChanged({ cwd: resolveSessionListCwd(projectDir), sessionPath })`。
- 广播取舍记录：不冗余。会话目录没有 watcher，项目导入流程本身不触发列表刷新；`main/ipc/session.ts` 订阅 `onConversationListChanged` 广播 `SESSIONS_CHANGED` 是侧栏刷新的唯一入口，与 `project-migration-service` 导入同款处理。旧包无 `.vetta/sessions` 时自然零广播。
- 测试（先红后绿）：新增 `apps/desktop/src/main/ipc/project-export.test.ts` 3 例——①含分片会话的项目导出→zip→导入：新项目 `.vetta/sessions` 出现重写 cwd 的会话（存量 + 分片）、列表变更事件按条广播（2 条，cwd 均为新项目根）、lock/tmp 不入包；②同名会话去重：项目内文件优先且分片副本不重复入包；③旧包（仅工作区文件、无会话）导入不回归：项目恢复、注册、零广播。旧实现下 ①②红（`shard.jsonl`/`solo.jsonl` 不在包内）、③绿（基线）。
- 验证（Windows，仓库 Node runner）：定向 `run-vitest.mjs --run src/main/ipc/project-export.test.ts` 3/3 绿；`test:impact` 直接种关联用例 3/3 绿；相关既有测试 `project-migration-service` / `session-archive-service` / `session-paths` / `session-paths.remote` 共 4 文件 37 例绿；`bun x tsc --noEmit -p apps/desktop/tsconfig.json` 0 错；根目录 `bun run check:quick` 通过（exit 0）。
- 发布说明：`.github/release-notes/v0.1.3.md`「修复」段补一条。修复提交标题：`fix(desktop): 项目导入带上分片会话并即时刷新（BUG-0142）`（哈希见提交历史/任务回执）。
- 未验证项：未跑真实 Desktop 人工导入验收（`verify:ui:*` 未获授权）；分片目录非 jsonl 附件类文件不随包迁移，与单会话 `.ofar` 迁移包能力（含附件）存在差异，属既有通道边界而非本次回归。
