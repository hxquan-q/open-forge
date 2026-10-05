---
id: TASK-0206
type: task
status: done
priority: P1
owner: runtime-core
source: user-request（继续优化）；RESEARCH-0022 缺口 #4 第二片
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0205, TASK-0204, TASK-0152, TASK-0185]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f15036e935cab3f30f65e4485486a21d3f94d3b2
read_paths: [packages/runtime-core/src/runtime-host, packages/runtime-core/src/contracts.ts, packages/runtime-core/src/index.ts]
write_paths: [packages/runtime-core/src/contracts.ts, packages/runtime-core/src/index.ts, packages/runtime-core/src/runtime-host/runtime-host.ts, packages/runtime-core/src/runtime-host/runtime-host-session-operations.ts, packages/runtime-core/src/runtime-host/runtime-host-session-operations.attach.test.ts, project/tasks/TASK-0206-attach-session-snapshot.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0205]
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行，随本片提交）
created: 2026-10-04
updated: 2026-10-04
---
<!-- Copyright The Open Forge contributors. -->

# attach：一次订阅即得历史快照与运行中回合重放

## 目标、范围与适配策略

适配上游 9e18d7f845ba8301fe8dfc26fcaa5a490d4fd0da（缺口 #4 feed/attach 链第二片）：订阅与读历史是两次调用，中间持久化的内容会暂时丢失；历史投影先于事件发出更新，先读历史再订阅又可能与在线事件重叠。`attach` 在同一同步步骤内注册订阅、重放运行中回合并读取历史，消除空窗与重叠窗口。

1. `SessionAttachment` 合同：`{ unsubscribe, history, runningTurnId? }`；`SessionFacade.attach(sessionId, handler)`，RuntimeHost 转发，operations 实现为「subscribe → 拷贝 history → readCurrentTurnId」全部同步完成，不产生让出点。
2. 不给 relay 新增 `replay: "model-call" | "turn"` 选项：本仓 `subscribe` 的回放缓冲已经是「agent_start 起的 assistant + tool 事件、4096 有界尾部、usage.update 清空」，语义等价于上游 `replay: "turn"` 的有界版，不存在第二个更窄的默认回放面；引入无用选项属照搬上游形状。
3. 保留本仓内存保护：不引入上游无界 `recordTurnReplay`/`buffer.turn`（RESEARCH-0022 已否决）；不引入 `conversation.*` 事件系列，`runningTurnId` 沿用 TASK-0205 的 assistant 事件学习语义。

### 并发评估

- 结论：不支持并行（runtime-core 底座小片）
- 执行方式：serial
- 可并行 Task：无（contracts/operations 为共享写面）
- 前置依赖：TASK-0205（`readCurrentTurnId` 已合入 main）
- 冲突文件/独占路径：`project/tasks` 与 TASK-0197 泳道共享，已登记 conflicts_with
- Branch：main
- Worktree：无（主工作区串行）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：直接入 main；c28c4d4d1 IPC 片依赖本片

## 做 / 不做

做：contracts 合同 + 导出、operations.attach、RuntimeHost.attach 转发、operations 层红测先行（真实 relay 装配行为用例 + 调用顺序合同用例）。

不做：不接 IPC/desktop 消费端（后续片 c28c4d4d1 → 1203755a7 → feed reducer）；不动 relay、message-stream/投影层；不改既有 subscribe 行为；不引入 `conversation.*` 事件与无界回合缓冲。

## Given / When / Then

- Given 会话正在运行回合（agent_start 后 assistant 事件携带 turnId，工具已开始执行）；When 订阅方调用 `attach`；Then 同一次调用内收到本轮 in-flight 重放事件（assistant/tool，有界尾部）、`history` 为该时刻持久化历史的拷贝（非同一引用）、`runningTurnId` 等于运行中回合，且后续事件不再重复投递重放内容。
- Given 会话空闲（无运行回合）；When 调用 `attach`；Then 返回持久化历史与可用的退订函数，`runningTurnId` 缺省。
- Given 已 attach 的订阅方；When 调用返回的 `unsubscribe`；Then 后续事件不再投递给该 handler。

## 必须保持

- 重放缓冲 4096 有界尾部与 usage.update 清空语义不撤销；工具事件 display-only、不设 terminalReason（TASK-0205 合同）。
- 订阅、重放、历史读取之间无让出点：注册先于历史读取，事件不可能落在快照与订阅之间。
- 首个 assistant 事件到达前 `runningTurnId` 为 undefined 属真实语义（TASK-0205 已记录的窗口），消费端在后续片处理。
- 既有断言与测试不放松；TASK-0204 墓碑/登记表门禁保持绿。

## 测试与验证

- 红测先行：新建 `runtime-host-session-operations.attach.test.ts`——
  1. 真实 relay 装配：运行中 attach 断言重放事件、历史拷贝与 runningTurnId；空闲 attach 断言无 runningTurnId；退订后不再投递。
  2. 顺序合同（fake relay）：subscribe → 重放 → history 的调用次序，history 为拷贝，unsubscribe 接线。
- 定向：新测试文件 + relay/operations 相关文件；`test:impact`。
- 质量：一轮编辑后 `check:quick`；完成代码任务后完整 `bun run check`。

## 验收分层

- 工程验证：通过（2026-10-04）。红测先行（`operations.attach is not a function` 判红 → 转绿）；attach 测试 2/2；relay 全文件 + attach 定向 10/10；`test:impact`（contracts/operations/runtime-host）命中 runtime-core 20 文件 115 项通过；根 tsgo 干净；`check:quick` 通过（修订一处测试签名格式后复跑绿）。
- 技术评审：自审完成——与上游 9e18d7f84 行为逐项对照：attach 原子性等价（注册/重放/历史读取同同步步骤）；回放内容按本仓适配（本仓 subscribe 回放即整回合有界尾部，等价上游 `replay:"turn"` 的有界版，不引入无用选项与无界 `buffer.turn`）；`runningTurnId` 来源差异沿用 TASK-0205 结论（assistant 事件学习 vs 上游 conversation.turn.started，首个 assistant 事件前窗口 undefined 属真实语义）；`history` 为拷贝非同引用（上游同）。
- 集成：integrated（main 主工作区串行，随本片提交）。
- 人工功能验收：本片无直接用户可见 UI；消费端接线后随整链验收（IPC → desktop 切换 → feed reducer 后续片）。
- 发布：v0.1.3「改进」已补条目（注明消费端随后续片）。

## 验证进展（2026-10-04）

- 红测：`registers the subscriber, replays the running Turn and reads history in one synchronous step` 与空闲用例首跑 `operations.attach is not a function` 判红；实现后转绿。
- 首轮 `check:quick` 仅测试文件签名格式判红（Biome 换行），改为 `AssistantMessageEvent` 参数类型后复跑绿；无行为变化。
- `test:impact` 首跑误带 `src/index.ts` 触发脚本公共合同保守回退（全仓面），按 TASK-0205 先例改为对 contracts/operations/runtime-host 定向 impact；index.ts 导出由根 tsgo 与完整 check 覆盖。

## 交付记录

- 实际修改：`packages/runtime-core/src/contracts.ts`（`SessionAttachment` 合同 + `SessionFacade.attach`）、`src/index.ts`（导出）、`runtime-host/runtime-host.ts`（转发）、`runtime-host/runtime-host-session-operations.ts`（attach 实现）、新增 `runtime-host-session-operations.attach.test.ts`、发布说明 v0.1.3、本记录与焦点表。
- 实际运行：见验收分层工程验证。
- 未运行及原因：desktop/cli-host 消费端未接线（后续片），实机接入场景随整链验收；完整 `bun run check` 于提交前运行。
- Worktree：未拆出（主工作区串行小片）。
- 剩余风险：`runningTurnId` 在回合首个 assistant 事件到达前为 undefined（真实语义，消费端需结合 isStreaming 处理）；运行中回合的重放为本仓有界尾部（4096、usage.update 清空），整回合超出上限或已过上一模型调用时，持久化部分以 history 为准、活动消息以事件携带的 partial 快照为准——消费端（feed reducer 后续片）不得假设重放覆盖整回合。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
