---
id: BUG-0087
type: bug
status: done
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main 2026-10-09 至 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []

created: 2026-10-12
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# Team 会话 coordination 文档不可读时 delete-session 同样失败，僵尸会话无法自助清理

> 状态说明：下文早期方案与通过记录均为历史。本轮已获授权并实现独立于当前配置/恢复的安全删除与缺团队定义后的管理入口，定向回归通过；完整检查仍有仓库既有阻断，用户黑盒反馈暂未遇问题，并请求本地保存；完整门禁及集成仍未满足，保持 in_progress。2026-11-16 最终续接证据见文末，不将早期吞错方案当作当前合同。

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

## 2026-11-16 反馈与回归补测（未修复）

- 用户通过左侧对话列表删除 Agent Team 会话，确认框关闭后行仍在。主进程日志显示 coordination 无 RuntimeHost 后端认领、进入降级清理并输出 stopped；这些输出不证明整个删除已完成。
- 只读核验两条目标会话：每条均有 1 主控 + 3 成员所有权登记，登记所指会话文件及 legacy 文档均不存在。未读取聊天正文；文件何时、由谁删除不在本轮结论内。
- 当前 `deleteSession` 在无内存/legacy 文档时取得的 `session` 为 undefined，跳过受 `if (session)` 保护的 `removeByTeamSession`；团队列表却从所有权索引生成，故正常返回后仍可列出孤儿登记。实机当次内存态未直接观察，确定性测试验证此条件路径。
- 原“所有文档源都缺仍清理索引”用例没有预置所有权登记，只断言 legacy 清理与 runtime 不调用，不能证明目标从团队列表消失；已改名澄清，不删除该基线。
- 在 [TASK-0226](../tasks/TASK-0226-team-session-degraded-delete.md) 续接中加入真实临时索引与 legacy 仓库的回归：预置主控 + 3 成员登记及同团队另一会话，经 `listSessions → deleteSession → listSessions` 验证；当前删除返回成功后列表仍含目标，新用例明确失败，原 5 例通过。
- 本次仅补测试，未修改生产删除实现或清理真实数据。保留红灯，不标为修复、验收通过或发布。

## 2026-11-16 删除合同澄清（待实现与验证）

### 删除历史不依赖当前配置或成功恢复

- 历史会话的管理生命周期独立于 Agent/团队配置生命周期。修改 Agent 名称、提示词、模型或团队成员，移除 Agent/团队，项目移动、删除或取消登记，都不应仅因这些变化使旧会话失去删除能力。
- 删除不是“恢复运行旧会话”：不得以当前 Agent/团队仍存在、项目目录仍有效、coordination 文档可加载或 RuntimeHost 可重新认领为删除前提；不得为了删除而启动模型、重建 Agent 或恢复成员 runtime。
- 对仍在运行的会话，停止/释放必要资源仍属于删除职责；文件锁、外部实例租约、权限与 I/O 失败应保留明确错误或部分完成反馈，不能将“不依赖成功恢复”解释成绕过资源安全约束。

### 保留的是删除范围安全，不是当前 Agent 身份校验

- 服务应确认用户选中的历史会话，以及属于它的主控、成员文件和关联登记，避免误删其他会话。这是稳定会话标识与关联关系核实，不是校验当前 Agent 配置是否存在或与历史一致。
- 所有权索引在这里用于定位历史关联资源；不能把缺少完整团队文档等同于缺少全部关联证据。索引、请求路径与会话标识冲突时，应按可解释错误处理，不猜测身份或扩大删除范围。
- 会话文件路径的合法性、应用管理范围及外部输入校验仍须保留；项目工作目录的存在/登记状态不是删除历史的准入条件。删除会话不能递归删除普通项目目录；应用自建会话专属产物目录若随会话回收，必须另有明确且可验证的范围边界。

### 待验证场景与证据分层

- 已有失败回归仅证明“文档全缺但所有权登记仍在”的条件缺陷，尚未覆盖下列配置变化流程，也未修复产品行为。
- 待补回归：会话结束后修改 Agent 配置；移除 Agent 但团队仍在；移除 Agent 导致团队定义也消失；项目移动/缺失/取消登记。各场景均应能管理并删除目标历史，同时保留其他会话。
- 管理入口也是待核对风险：当前 `team-sidebar-conversation-projection.ts` 先枚举现存团队定义再查历史；`agent-team-store.ts` 删除 Agent 在部分情况下会连带移除团队定义，可能使旧历史不再被该入口枚举。这是源码已核的条件性风险，不是本次两条会话的已证实成因，不将其描述为已经实机复现。
- 后续修复需覆盖删除服务与可管理入口；不得只移除一个 `if (session)`、只强刷列表或补 Toast 就宣称整个合同满足。本次只更新缺陷与任务合同，不自动授权生产修复或真实数据清理。

## 2026-11-16 授权修复续接（实现与定向回归已落实，门禁待满足）

- 续接原 [TASK-0226](../tasks/TASK-0226-team-session-degraded-delete.md)，不另建重复工单；本轮先实跑原 6 例得 5 过/1 红，证实“正常返回但 orphan 登记仍在”。侧栏缺团队定义新回归也先红，属于独立条件性入口缺陷，仍不声称这是用户两条目标会话当次的成因。
- 删除现在只基于历史 ID 与关联证据解析资源，不调用恢复型 read、当前 Agent/团队/模型/项目配置；有索引无文档时仍枚举并清理目标主控/成员登记。无索引/legacy 时可只读协调文件验证历史身份，不创建 runtime。已有运行资源先停止、在途构建等待并纳入删除；与 read/rename 共用原有会话事务 lane，防止删除后重新登记。
- 侧栏联合枚举持久历史团队 ID 与现存定义。删除 Agent 连带移除最后的团队定义后，历史仍可从原有对话/项目列表管理；缺头像不阻断删除，取消项目登记回落默认列表，不要求普通项目目录存在。
- 目标 ID/主控路径、跨 session/team 关联有冲突时在停止/删除前拒绝。有效 legacy 回归另证实首次回填会覆盖冲突身份，已增加整批关联核实，不能用 legacy 改认其他历史。runtime 的路径、权限与租约守卫保留，文件仍存在时不会把 SESSION_NOT_FOUND/ENOENT/未认领当成功；只有确认已缺失才幂等。
- 错误与部分完成：任意租约/权限/I/O 失败传播到既有侧栏 catch/Toast，ownership 保留供重试；可能已删前面的文件，不伪装跨文件原子删除。普通项目内容与其他历史保留，不递归回收项目/工作空间目录。
- 回归覆盖：真实临时索引、有效 legacy、原生 Conversation 文件与真实租约、真实 Store 配置编辑/Agent 移除/团队消失、真实模型偏好变更、项目移动/缺失/取消登记、冲突防误删、持久化失败/重试、重复删除、read/rename/成员构建并发及离线身份读取。已有 Renderer Hook 回归验证成功刷新与失败 Toast；未改 UI 组件。定向阶段 9 文件 69/69，补齐后删除文件 26/26；最终组合及完整检查见 Task 末尾新结果，不累计重复执行数。
- 完整 check 已实际执行并发现本测试的类型兼容问题，已修正再验；其他 root/desktop 类型、过期 waiver 及未改文件声明头问题保留在 Task。本轮不绕过门禁、不擅自修无关路径或强行提交/集成。
- 最终候选组合实跑 **9 文件 71/71 通过**，其中删除回归 26/26；最终完整 `bun run check` 仍 exit 1，本次引入的测试类型错误已修正且不再报告，剩余均为 Task 所列未修改路径的类型、过期 waiver 与声明头问题。未绕过门禁，Task/Bug 保持 in_progress、未暂存/提交/集成，人工验收未进行。
- 0.1.4 已有发布 tag，修复候选写入下一未发布版本碎片 `.github/release-notes/fragments/v0.1.5/task-0226-team-session-delete.md`；不修改已发布说明、不升版、不发布。用户运行实例未操作，需在后续包含修复的构建中人工验收。
- 不承诺恢复已缺失聊天，不确定文件最初消失原因；普通单 Agent 删除失败无反馈、归档删除缓存及全局配置文件损坏不与本缺陷混为同一根因。真实应用/Provider/数据、impact/全量测试均未操作。

## 2026-11-16 用户黑盒反馈与本地保存

- 用户亲测反馈会话删除目前未遇到问题，并请求本地提交；这是用户反馈，不是 Agent 运行真实应用的验证。未提供版本/场景明细，不扩大为本合同全部组合的人工验收。
- 按该新请求将本任务改动原子保存到当前本地分支，保留完整 check 的既有失败记录；不将用户黑盒通过等同于全仓门禁通过，不强行集成/发布。以承载本记录的提交绑定本次保存，详细范围见 TASK-0226。
- 原“未提交、人工验收未进行”是前一阶段状态；当前已收到正向用户黑盒反馈，完整工程门禁及集成仍未满足，Bug/Task 保持 in_progress。没有远程 Git、真实数据操作或新的运行实例操作。

## 2026-11-18 关闭

- 修复已随 `4fb65a823` 进入 `chenxvhua` 历史；定向回归 9 文件 71/71（删除 26/26），用户实机黑盒验证
  会话删除未遇问题，用户指示随 TASK-0226 一并收口。
- 不计入本条判据的既有阻断：完整 `bun run check` 仍受 WAIVER-0011/0012 过期与其他未修改路径类型错误
  影响，均非本次改动引入；按记录不扩修、不宣称全仓门禁已绿。
- 未覆盖仍不承诺：不恢复已缺失的聊天内容；全局配置文档本身损坏导致的侧栏读取失败属另一根因；
  删除非跨文件原子事务，租约/权限/I/O 冲突继续明确拒绝；普通单 Agent 删除失败反馈见 BUG-0191。
- `integration_status: pending` 属任务侧字段，本条改动尚未合入 `origin/dev`。
