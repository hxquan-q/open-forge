<!-- Copyright The Open Forge contributors. -->
# ADR-0155：自动化运行会话策略与调度数据模型 v2

## 状态

已接受（2026-11-26，PLAN-0032 D4 拍板结果落地；参照上游 ADR-0127《automation-run-target-and-unattended-execution》重写——上游原编号 0127 与本地 ADR-0127《runtime-turn-admission-owns-waiting-prompts》同号不同题，本 ADR 取本地新编号）

## 背景

本地定时任务仍是 `prompt + cron + isOnce` 模型（`apps/desktop/src/main/scheduler/task-storage.ts`）：每次执行在「对话」下新建会话，高频任务刷满会话列表；无法让任务在某个项目里、或同一段上下文里持续推进；`interval` 只存在于渲染层编译产物（45/90 分钟这类不整除小时的间隔 cron 表达不了）；任务与绑定会话没有关系，删除会话时只清执行记录、任务本身照旧空跑。

上游 `0111d7cde` 等六个提交按「运行会话策略」重做了这套模型（上游 ADR-0127）。PLAN-0032 D4 已拍板：**只参照会话策略与界面交互，保留本地 ADR-0132 权限分层**——`permissionTiers`/`trigger` 字段保留，event/manual 触发、自动化包、Agent 定时工具继续可用，不引入上游「无人值守固定完全访问」。

本地独有而上游没有的维度：`trigger`（cron/event/manual 触发轴，PLAN-0012 / TASK-0118）、`permissionTiers`（ADR-0132）、自动化包 schema（`taskSchemaVersion=1`）、`skill` 引用与 Agent 定时工具透传。这决定了不能照抄上游模型与迁移。

## 决策

### 1. 调度判别联合替代裸 cron

`AutomationSchedule` 为判别联合：`once{at}` / `hourly{minute}` / `daily{hour,minute}` / `weekly{weekdays,hour,minute}` / `monthly{days,hour,minute}` / `interval{everyMinutes,startAt}` / `custom{cron}`。

- `interval` 与 `custom` 互斥同层；`everyMinutes` 上限一周；锚定 `startAt` 而非上次完成时刻，用户编辑间隔数字时重新锚定为当前时刻。
- 触发时刻计算是纯函数，放 shared 层（渲染与主进程共用），按本机时区。
- 校验必须覆盖全部 kind——上游 `isAutomationSchedule` 漏掉 `interval` 分支导致该档位经服务层创建必被拒（上游缺陷，静态证据确凿），本地实现直接补上。

### 2. 运行会话策略 runTarget

每个自动化声明 `runTarget`：`new-session{projectCwd}` 或 `same-session{projectCwd, sessionPath|null}`。

- `new-session`：每次执行在项目（或「对话」）下新建会话，会话名 `任务名 · MM-DD HH:mm`。
- `same-session`：绑定一个会话——可以是用户选择的已有会话，也可以是 `sessionPath: null` 时首次触发新建一次、首轮落盘后回写复用的会话。
- 绑定会话或目标项目被删除时，自动化**暂停**（`enabled: false` + `suspendedReason: "session-deleted" | "project-removed"`）并在界面提示原因，**不自动换新会话顶替**；恢复需用户重新选择会话/项目。

### 3. trigger 触发轴保留并与 schedule 分层

`trigger`（`cron | event | manual`，ADR-0132 时代的本地维度）保留：

- `trigger.type === "cron"`（含缺省）：`schedule` 必填，调度行为与上游一致。
- `event` / `manual`：不要求 `schedule`；存量此类任务上的 `cron` 字段迁移时丢弃——执行链路本就不为它们注册 cron（`scheduler.ts` 现状一致），丢弃不改变任何可达行为。
- 事件触发语义不变：错过不补跑、运行中跳过、`session.switched` 事件补发射点（现存死枚举顺手修复）。

### 4. 权限保留本地分层，明确拒绝上游「固定完全访问」

- 无人值守轮次在任务声明的 `executionMode` 下执行，不由自动化强制改写；`permissionTiers` 继续在既有审批管线上细化静默放行（ADR-0132），L4 与计费语境永远人工闸。
- **后果自负原则**：sandbox/inherit 下未授权能力会卡住等审批——这是用户显式选择的配置结果，界面在编辑表单给出提示，不暗中提权。
- 无人值守单轮否决 `ask_user_question`：prompt 请求携带 `unattended` metadata，模型调用装配层在该轮不注入提问工具。`new-session` 产物会话为 automation 场景（整会话无提问/计划模式，现状已具备）；`same-session` 用户共用会话保留普通场景，靠单轮否决兜底——此项为本地待补缺口（PLAN-0032 D4 核对结论）。

### 5. 并发、忙等与错过

- 同一自动化同时最多一次执行：触发时上次未结束记 `skipped`（reason `previous-running`），不排队累积；手动 Run now 撞上运行中直接报错提示。
- `same-session` 绑定会话正忙（用户正在对话）：等当前轮结束后作为**独立的一轮**运行，不用会话输入队列 followUp——那会把任务并进用户那一轮且拿不到自己的结果。
- 错过的触发**不补跑**：应用未运行靠心跳文件（`automation-scheduler-state.json`，60s 写一次 `aliveAt`）、系统休眠靠 powerMonitor suspend/resume，恢复时按窗口统计写入合并的 `missed` 记录（`missedCount/missedUntil`，reason `app-not-running | system-sleep`）；窗口起点顺延到 `max(任务更新时间, 上次运行时刻)` 避免把「任务还不存在」记成错过；错过的一次性任务随之停用。

### 6. 执行结果三态

继承 TASK-0517 已落地语义并切换到 outcome 口径：`cancelled → aborted`、`failed → failed`（带 `error`）、其余 `success`；`updateTaskLastRun` 只有 `success` 记成功；失败且留下会话时计入 Dock 角标。执行记录字段扩为 `status(running/success/failed/aborted/skipped/missed)` + `error?` + `reason?` + `mode`（runTarget 快照）。

### 7. 模型选择

`modelKey` 保留；新增可选 `reasoning` 强度。默认「跟随默认」，每次触发时解析当时的默认模型；显式选择的模型不可用时本次执行记 `failed`，**不回退**。自动化轮次的模型不改变会话自身的模型选择。

### 8. 存量迁移（一次性、不可逆、留备份）

- 新文件 `automations.json`（`version: 2`）；迁移成功后旧 `scheduled-tasks.json` 改名 `.v1.bak` 保留；新文件已存在时绝不再读旧文件。写入沿用串行链 + tmp rename 原子写。
- cron 触发（含缺省）的旧任务：旧 cron 能还原档位的还原为 hourly/daily/weekly/monthly，对不上归 `custom`；`isOnce` 的旧 cron 取下一次匹配时刻转 `once.at`，已过期即停用。
- `runTarget` 一律 `new-session`，项目由旧 `cwd` 推断，认不出落「对话」。
- **`permissionTiers` / `trigger` / `executionMode` / `skill` / `modelKey` 原样保留**（与上游迁移丢弃权限字段的关键差异，D4 拍板）；`event`/`manual` 任务的 `cron` 丢弃。
- 旧执行记录不动，`record.mode` 缺省视为 `new-session`。

### 9. 侧栏会话组

`new-session` 产物会话在侧边栏按自动化折叠成组：同一任务 ≥2 条运行才成组，钉住会话不参与；组头显示任务名与运行次数，位置由最近一次运行决定；当前打开的会话在组内时自动展开。`same-session` 绑定会话不折叠，挂定时标记。具体落在本地侧栏哪一册（Work/Coding 工作区模式与 Allstar 版块归属）由实施 Task 按 `16e40c8e6` 归属规则细化，本 ADR 只锁定折叠语义。

### 10. 删除绑定会话与创建入口

- 删除绑定会话：确认对话框追加一行提示（自动化将暂停）；删除生效后对应任务置 `session-deleted` 暂停、指向该会话的执行记录清除；删除失败不影响会话删除本身。普通（非绑定）会话删除行为不变。
- 会话右键「基于此会话创建自动化」：预填 `same-session` + 当前会话，跳转自动化页新建分屏；团队会话不提供该入口。

## 与既有 ADR 的关系

| 轴 | 所有者 | 本 ADR 的态度 |
| --- | --- | --- |
| `permissionMode`（ADR-0123） | 会话 Runtime | 不变；automation 场景仍拒绝进入 Plan |
| `executionMode` | 任务/会话 | 保留三态语义；**不**像上游那样强制 full-access |
| `permissionTiers`（ADR-0132） | 定时任务 → 自动化会话 | 保留并随迁移原样携带 |
| `trigger`（PLAN-0012） | 定时任务 | 保留；与 schedule 分层（本 ADR §3） |

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| 照抄上游丢弃权限/执行模式字段 | 违反 D4 拍板；ADR-0132 分档与自动化包 capabilities 体系作废 |
| 错过触发补跑一次 | 补跑时刻与用户预期不符，高频任务开机集中爆发（与上游同判） |
| 绑定会话忙时用 followUp 排队 | 任务并进用户那一轮，拿不到独立结果（与上游同判） |
| interval 用 cron 近似 | 45/90 分钟等不整除间隔表达不了 |
| `same-session` 自动顶替被删会话 | 上下文静默丢失比暂停更危险；恢复必须是用户显式动作 |

## 后果

- 新增持久化：`automations.json`（version 2）与 `automation-scheduler-state.json`；旧数据缺失读取路径即迁移路径本身，回滚靠 `.v1.bak` 备份，不依赖改写用户数据。
- 自动化包 `taskSchemaVersion` 需升 2：包内任务携带 schedule 判别联合与 runTarget；`taskSchemaVersion=1` 的旧包导入时按 §8 同规则转换。capabilities 白名单不变。
- preload `ScheduledTask` 类型补 `trigger` 字段（现存类型层缺口顺手修复）。
- IPC 面扩展：绑定/解绑会话、suspendedReason 展示所需字段随迁移同步加宽，renderer atoms 类型对齐。
- 上游 `notifyClaw` / webhook 通知、`8d4c182cb` CLI 适配不在本 ADR 范围，后续独立决策。
- 界面按 PLAN-0032 P9 拆 Task 实施：列表+详情分屏沿用 P4 布局、schedule 编辑器改为判别联合直编（不再经 cron 编译）、runTarget 选择器、会话组侧栏投影。
