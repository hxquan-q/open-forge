---
id: BUG-0195
type: bug
status: in_progress
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan:
source: user-report-2026-11-19 + 主进程日志
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0087, BUG-0194]
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话数据文件缺失后仍出现在列表中，重命名必失败并抛内核级错误

## 用户流程

- Given：版块首页（Allstar 自主开发）的某项目卡片，卡内含团队会话行，其协调会话（coordination）文件已不在磁盘上。
- When：用户在会话行尾「···」菜单选择「重命名」，输入名字并提交（用户 2026-11-19 17:58 确认曾主动试用该功能）。
- Then：标题更新成功。

## 实际行为

重命名失败，渲染端弹出「重命名失败」toast，会话标题不变。主进程在同一时刻收到 `vetta:agent-teams:rename-session` 并抛错。主进程日志：

```text
[error] [agent-team-sessions] failed to load team session { teamSessionId, error:
  'Error: No RuntimeHost session backend owns <VETTA_HOME>\agent\sessions\--<编码后的项目 cwd>--\<编码后的会话 id>.conversation.jsonl' }
[error] [console] Error occurred in handler for 'vetta:agent-teams:rename-session':
  Error: Team session could not be loaded: <teamSessionId>
  at AgentTeamSessionService.readInternal
  at AgentTeamSessionService.readConversationSessionState
  at TeamRuntimeManager.createCoordinationRuntime
  at CatalogRoutedRuntimeHostSessionBackend.createAssembly
```

同一条会话在列表里可见、可再次点击重命名，每次都以同一错误失败，用户没有任何自助恢复手段。

## 期望行为

- 只改标题的管理操作不得依赖完整恢复会话；会话文件缺失时应给出可读原因（例如「会话数据文件已丢失」）并指明只能删除该条目，而不是抛内核内部错误。
- 数据文件已不存在的团队会话不应以正常会话出现在版块/侧栏列表中；或至少标记为不可用。

## 环境与失败证据

- Windows 11 x64；桌面端 0.1.5 开发线，HEAD `4c3903435`；2026-11-19 用户报告。
- 失败时刻：`2026-11-19T17:22:42`，`vetta:agent-teams:rename-session`。
- 磁盘事实（本次实测，仅目录/文件名，未读取会话正文）：
  - 该会话在所有权索引（`<VETTA_HOME>/conversation-ownership.v1.json`）中有 1 条 `coordination` + 3 条 `member` 登记，指向同一分片目录；
  - 该分片目录存在但**为空**，登记指向的 `.conversation.jsonl` 不存在；
  - 全数据目录内搜索该文件名无结果，说明不是被移动到别处。
- 同类会话不止一条：同一项目分片登记 24 条、磁盘 0 个文件；另一个已废弃项目分片登记 10 条、目录整体不存在。仍在使用的三个项目分片登记数与文件数一致（36/36、8/8、5/5 量级），可作对照组。
- 基线对照：同一条团队会话在数据文件存在时（2026-11-16 日志有 `session created` 与成功 `get-session completed`）可正常打开；用户 2026-11-19 18:00 实机反馈，在数据完好的项目（aimes / xiaoai）里改名**成功** → 缺陷只在数据文件缺失的条目上触发，不是重命名功能整体失效。

## 最小复现

1. 取一条团队会话，记录其 `coordinationSessionPath`。
2. 在应用关闭状态下把该 `.conversation.jsonl` 移走（保持所有权索引不变）。
3. 启动应用，进入版块首页，对该会话行执行「重命名」。
4. 观察：toast「重命名失败」，主进程日志为上述 `No RuntimeHost session backend owns …` / `Team session could not be loaded`。

## 影响

- 该条目上的**所有**需要加载会话的操作都必然失败：重命名、打开、发送消息、改模型设置；用户只能删除后重建。
- 失败信息是内核内部实现细节（`No RuntimeHost session backend owns <本机绝对路径>`），既不可理解也不可行动，且日志会持续累积同一条错误。
- 优先级 P1 的依据：受影响条目在本机为 34 条（24 + 10），一次误删/一次清理即可批量产生；且列表不会自愈。

## 根因证据

分三层，置信度不同，不混为一谈。

**A. 为什么这次重命名失败（确定，代码可证）**

1. 渲染端团队行把 `coordinationSessionPath` 一起发出去（`useAllstarDevHomePageModel.ts` 团队分支）。
2. IPC `vetta:agent-teams:rename-session` 强制要求该路径（`ipc/agent-teams.ts` `teamSessionMutationReference`）。
3. `AgentTeamSessionService.renameSession` 走 `coordinate()` → `readInternal()`：「先读到最新文档再改」。
4. 应用重启后该会话不在内存缓存，`readInternal` 进入冷分支，调用 `readConversationSessionState(id, path)`，用该路径**重建协调 runtime**。
5. `CatalogRoutedRuntimeHostSessionBackend.createAssembly` 对既有路径只认被 catalog 认领的会话；`FileConversationRuntimeSessionCatalog.ownsSession` 读不到文件即返回 `false`，两个路由都不认领 → 抛 `No RuntimeHost session backend owns …`。
6. `readInternal` 的 catch 把它统一包成 `Team session could not be loaded: <id>`，IPC 层原样透传 Error（只保 message），`cause` 链里的「文件不存在」不进入用户可见文案。

**B. 为什么它还在列表里（确定，代码可证）**

- 版块与团队侧栏的团队会话行由所有权索引驱动（`AgentTeamSessionService.listSessions` → `ownershipCatalog.listByTeam`），**不校验文件是否存在**；文件删了，登记还在，行就还在。
- 删除链路已有降级处理（BUG-0087 / TASK-0226：读不到文档时仍可安全清理），重命名没有对应降级——同一输入下「能删、不能改名」的不对称即由此产生。

**C. 文件最初为什么消失（未定，不伪造结论）**

- 已排除的路径：应用没有任何自动/定时清理会话的代码；项目硬删除流程（`deleteProjectFromDisk` → `deleteAllForCwd` → `project.remove` → `fs.delete`）会写配置，而本机配置自最后一次删除动作后未被改写；团队会话删除会清理所有权登记，而登记仍在。
- 已确认的事实：文件曾在 11-16 生成并成功读取，11-19 应用启动前已不存在；删除为进程级（回收站无对应 `$I` 记录）；同型事件 11-13 曾一次性发生在 8 个已废弃测试项目的分片上（对应项目目录同样已不存在）。
- 目前无法定位具体执行者与时刻：删除成功不打日志，NTFS 变更日志需管理员权限。本条不据此归因，保持「待调查」。

## 已排除：动作派发串线（2026-11-19 17:58 用户确认后关闭）

中间一度怀疑"点从版块移除却触发了重命名"。用户确认曾主动试用重命名功能，且日志可自洽，该分支关闭，结论回到「用户确实执行了重命名」：

- 全仓只有 4 处会调 `agentTeams.renameSession`，版块域内只有会话行「重命名」这一处；项目卡片的「从版块移除」走 `onRemoveFromBoard` → `project.removeAllstar`，两者没有共享路径。
- 日志里没有任何针对本项目的 `remove-allstar` 调用；同一时段该通道只有另一个项目的 `Project not found`（属 BUG-0196）。
- 「从版块移除」的幂等/静默问题与本案无关，已独立记录为 BUG-0196。

## 回归测试

计划两个用例，均须在修复前先红：

1. 服务级：给定所有权索引有 coordination + member 登记、磁盘分片为空，调用 `renameSession({ id, coordinationSessionPath })`——旧实现抛 `Team session could not be loaded`；修复后返回明确的可读错误或按约定降级改标题。
2. 投影级：给定同样的索引/磁盘状态，`listSessions` / 侧栏投影不再把该会话当作正常条目（或标记不可用），并覆盖「文件存在时行为不变」的对照用例。

## 修复与验证

- 修复：未开始。候选方向（待定，不在本记录内实现）——列表侧对账剔除或标记文件已不存在的登记；重命名侧对「文件缺失」降级为只更新索引标题并返回可读原因，与删除降级对齐。
- 测试：未编写。
- 检查：未运行。
- 未运行及原因：用户尚未授权修改主仓实现；本轮仅只读调查与建档。

## 相邻缺陷（未单独建档）

以下两点在本轮调查中发现，与本案同源但属独立 concern，等用户确认后再决定是否单独建档：

- 项目硬删除流程先执行会话清理、再执行注销登记（`deleteProjectFromDisk`）。当目标项目只登记在开发册、不在默认册时，`project.remove` 会直接抛 `Project not found`，流程停在半途，形成「会话已删、登记仍在、配置未变」的半完成状态；`deleteAllForCwd` 的 `{ deleted, failed }` 返回值也无人检查。
- `readConversationSessionState` 用 `process.cwd()` 与硬编码 `"full-access"` 重建协调 runtime，而不是会话记录里的 cwd 与执行模式；`ensureCoordinationRuntime` 随后因路径一致直接沿用该 runtime，导致重启后首个操作把协调 runtime 钉在宿主进程的工作目录上。
