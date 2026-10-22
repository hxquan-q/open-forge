---
id: TASK-0364
type: task
status: in_progress
priority: P2
owner: desktop
requirement: REQ-0022
plan: null
source: 外部代码审查（同事静态审查，用户转达）
related_requirement: [REQ-0023, REQ-0024]
related_bugs: []
execution: serial
branch: task/TASK-0364-weknora-er-fixes
worktree: .
base_commit: 2a74e7fc1
read_paths: [apps/desktop, docs/devflow]
write_paths: [apps/desktop/src/main/weknora, apps/desktop/src/main/ipc/dialog.ts, apps/desktop/src/renderer/domains/weknora, apps/desktop/src/renderer/domains/conversation/hooks/useProviderBalance.ts, project/tasks/TASK-0364-weknora-er-fixes.md]
exclusive_paths: [apps/desktop/src/main/weknora, apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: [TASK-0343, TASK-0344, TASK-0345, TASK-0346, TASK-0348]
integration_status: pending
created: 2026-10-21
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 外部审查修复轮：取图上限 / 缓存淘汰 / 导出覆盖保护 / 分页终止 / 删除竞态 / 余额缓存

## 目标与来源

来源：同事对已合并批次的**静态代码审查**（未运行分支），经用户转达两份同文意见；队长逐条对代码核实后，用户 2026-10-21 拍板处置。完整核实与裁定见 `docs/devflow/EXTERNAL-REVIEW-2026-10-21.md`（过程文档，本地排除）。

**用户裁定**：全修便宜项（F1~F5 + F6 只修一半）；F7 不修（B 端不过度防御）；F3 翻转此前「盘上同名静默覆盖=接受」裁定；F4 需真实 API 实测背书；CI 红为仓库级 Actions 预算问题，不处置（本地验证自证）。

**分支说明**：PR #18（`task/TASK-0342-weknora-suite`，本批六 feature）已被用户合并进 `dev`（merge commit `1b25abff0`）。本任务自最新 `origin/dev` 切新分支，cherry-pick 修复提交；旧分支保留作安全网。**编号更正（2026-10-22）**：立项时 dev 最大为 TASK-0348，故取 TASK-0349；随后 dev 侧新增了自己的 `TASK-0349-session-management-export-import`，与本任务**撞号**。本分支尚未 push，经用户 CP2 放行后改为 **TASK-0362**，分支同步改名 `task/TASK-0362-weknora-er-fixes`；并已本地合并 `origin/dev@2a74e7fc1`（`base_commit` 随之更新）。**二次编号更正（2026-10-22 11:26）**：dev 随后又新增 `TASK-0362-browser-view-bounds-follow-layout`（BUG-0144），与本任务第二次**撞号**；经用户确认后改为 **TASK-0364**，分支同步改名 `task/TASK-0364-weknora-er-fixes`（旧远端分支删除），并已合入 `origin/dev@ebc598989`。

## 范围与并发

- **串行**三票：A（kb-citation：F1 取图 20MB 上限 / F2 缓存 64 条 FIFO）→ B（session-management：F3 盘上同名防覆盖+自动序号 / F4 导出分页终止加固 / F5 删除在途切会话竞态）→ C（model-usage：F6 只缓存成功结果）。
- 红线照旧（CONSTRAINTS C1~C8）：WeKnora 侧零改动、Key 不进任何产物、文案走 i18n、无新 IPC 面、无新依赖。
- **F4 前置考证已完成**（`docs/devflow/weknora-session-management/research/limit-probe.md`）：只读实测 limit=50/200 均被接受；上游 v0.8.2 `clampMessagesPageSize` 钳制区间 `[1,200]`、50 原样放行——「被钳到 20 导致静默截断」不成立，但加固仍执行（不再依赖未承诺的服务端分页细节，代价为每轮导出多一页请求）。
- 与既有 Task 的写域重叠已登记 `conflicts_with`（同批 feature 的台账，串行集成）。

## Given / When / Then 与最低验证

- **Given** 服务端返回超大文件；**When** 引用弹层取图；**Then** 缓冲前按 content-length 拒绝（不读进内存）、无头时按 byteLength 兜底，抛归一化错误走既有占位回退。
- **Given** 长会话浏览 >64 张引用图；**Then** 缓存条目上限生效、最旧 FIFO 淘汰，未淘汰条目仍命中不重发。
- **Given** 导出目标目录已有同名文件；**When** 导出/批量导出；**Then** 自动加序号写入，不覆盖已有文件，`written` 返回实际路径。
- **Given** 服务端按被钳制的 limit 返回短页；**When** 导出长会话；**Then** 继续按游标翻页直至空页/无新消息，导出仍为全量。
- **Given** 删除请求在途；**When** 用户切到另一会话；**Then** 删除完成后新打开的会话不被清空（单删/批删同）。
- **Given** 余额查询返回带 errorCode 的结构化失败；**Then** 结果不入 60s 缓存，面板重开可重新请求。

最低验证层级：主进程取图闸与写盘序号为主进程单测（假 fetch/假 fs）；分页终止为纯函数穷举（假 loadPage）；删除竞态为 hook 级用例；余额缓存为 hook 级用例。命令：`bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts src/main/weknora/ src/main/ipc/ src/renderer/domains/weknora/` + `bun x tsc --noEmit -p apps/desktop/tsconfig.json`。

## 验收与交付

工程侧：票 A、票 B、票 C 全部完成并通过队长独立复核；**独立 tester 复验轮通过**（7 个 `.er-verify` 文件 35 条用例，票面全量 100 文件 730/730、conversation 域 202 文件 1118/1118、tsc 0）。相对 `1b25abff0` 对同事 19 个文件 diff 为空。

**已知限制（复验发现，裁定接受、不另开票）**：
- FAIL-F4-1：同一 `created_at` 被分页切开时，更早的同刻消息拿不到。属「时间戳游标 + 服务端严格早于语义」的固有限制（API 无复合游标，客户端无从补救），非本轮 F4 引入；同秒消息恰好跨页、pageSize=50 下低频。
- 无 `created_at` 时只拉首屏一页（实测消息均带该字段）。
- F3 为写盘前探测、非原子 `wx`（TOCTOU 窗口）；B 端单人选目录下接受，未来并发写同目录需重议。

人工侧：实机验收（须完整重启 `bun run dev`，ENVIRONMENT 坑 4）——取图上限、导出同名加序号、长会话导出全量、余额失败后恢复可直观验证。

## 交付记录

| 提交 | 票 | 内容 |
|---|---|---|
| `6db8f32d8` | A·F1 | getFileData 加 20MB 体积上限（content-length 预检 + byteLength 兜底） |
| `e7bef2c78` | A·F2 | fileClient 取图缓存加 64 条上限，FIFO 淘汰最旧 |
| `0adfcbe36` | B·F3 | 批量导出写盘前探测同名文件，自动加序号防静默覆盖 |
| `811c7d414` | B·F5 | 删除在途切会话时按最新会话 id 判定，不误清新会话 |
| `89dac615b` | B·F4 | 导出拉全改用真实终止条件（去「短页即止」+ 游标不前进守卫） |
| `b982c2dc1` | B·F3 闭环 | 批量导出写盘结果按输入顺序回映射，改名不再漏计会话 |
| `631f79995` | C·F6 | 余额只缓存非 errorCode 结果（supported:false 仍缓存；配置版本入键不做） |
| `22b3ee3d4` | 复验 | ER 轮独立复验用例 35 条（7 文件，F1~F6） |

推送回执：待 push 后回填（用户授权后）。
