---
id: BUG-0087
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main 2026-10-09 至 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# Team 会话 coordination 文档不可读时 delete-session 同样失败，僵尸会话无法自助清理

## 用户流程

- Given：侧边栏存在一个 agent team 会话条目（本例 `55809d85-…`），其 coordination conversation 文件已丢失、损坏或文件锁超时。
- When：用户打开该会话（get-session）、对其发消息（send-message）或尝试删除它（delete-session）。
- Then：删除应清掉该条目的索引、运行时引用与常驻状态；实际打开报 `Conversation not found`、发送秒败、删除也报 `Team session could not be loaded`——会话打不开也删不掉。

## 实际行为

同一 team sessionId 上三类操作全部失败且互相强化：`get-session` 返回 `ConversationStorageError: Conversation not found`（5 次）与 `Timed out acquiring conversation file lock`（3 次）；`send-message` elapsedMs 0–1ms 秒败；`delete-session` 抛 `Team session could not be loaded: <id>`（4 次）。bootstrap 时 `failed to warm team session` 与 `team session runtime restore rolled back` 同步出现。

## 期望行为

会话文档不可读时，删除路径仍能完成尽力清理：abort 在途轮次、删除 repository 索引与 ownership 记录、移除常驻状态，使该条目从侧边栏消失；不可读的事实以提示形式告知，而不是把整个删除操作拒绝掉。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\OpenForge\OpenForge\versions\0.1.3`），Windows。
- `temp/log/main/2026-10-09.log`、`2026-10-10.log`：`agent-teams-ipc`/`agent-team-sessions`/`console` 中 `get-session`/`delete-session`/`send-message` 对 `55809d85-4773-4dd6-9e5d-3f6247be3997` 的成串失败；render 日志同见 `delete-session` 冒泡为 uncaught error。
- 该机同时存在两个安装（`%LocalAppData%\Programs\vetta` 与 `D:\Coding\OpenForge`）共用 `C:\Users\Chenxuhua\.openforge`，文件锁竞争为上游诱因之一（同一日志另见 `ConversationOwnershipConflictError`），但删除不可用与诱因无关，是删除路径自身的缺陷。

## 最小复现

1. 建立一个 agent team 会话并退出应用。
2. 删除（或改名）该会话的 coordination `*.conversation.jsonl`，或人为持有其文件锁。
3. 重新打开应用，对该会话执行删除 → 报 `Team session could not be loaded`，条目仍在侧边栏。

## 影响

任何原因（跨实例锁、文件丢失、损坏）造成的不可读 team 会话都会永久残留，用户没有任何自助清除手段；同时 `get-session` 持续报错形成误导性噪音。

## 根因证据

- [`team-session-service.ts`](../../apps/desktop/src/main/agent-teams/team-session-service.ts) `deleteSession`（约 1147 行）第一步 `await this.read(...)`；`read` 在约 896 行对加载失败统一包成 `Team session could not be loaded: <id>`。
- 因此 read 失败时其后的 `repository.delete`、`ownershipCatalog.removeByTeamSession`、`sessionState.remove`、`teamResidency.forget` 全部跳过——僵尸条目被「读取失败」本身锁死。
- 置信度：高（代码路径确定，错误文案与日志逐字一致）。

## 回归测试

`apps/desktop/src/main/agent-teams/team-session-delete.test.ts`（4 例）：coordination 文件缺失但 legacy 索引可回（日志同款）、全文档缺失仍可删、member 路径被外部实例持租约不阻断其余清理、read 成功路径严格语义不变（member 删除冲突仍阻断）。前三例在旧实现下同报 `Team session could not be loaded` 红基线，修复后 4/4 绿。

## 修复与验证

- 修复：见 [TASK-0226](../tasks/TASK-0226-team-session-degraded-delete.md)。`deleteSession` 对 `read` 失败降级：`sessionState`/legacy repository 兜底枚举 runtime 路径、per-path best-effort 删除、索引三件套必达；正常路径严格语义逐行保留。
- 测试：定向 4 例过；impact desktop 侧 182 例过（同 BUG-0086 注明的 4 个既有套件红除外）。
- 检查：`check:types`/`check:lint` 全绿；`check:quick` 被 `.ua/` 既有 guard 残留阻断（非本改动）。
- 验证边界：teamId 不可解析时 ownership 记录可能残留（已留 warn，极端损坏场景）；侧栏实机删除僵尸会话属人工验收。
