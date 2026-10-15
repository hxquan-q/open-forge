---
id: TASK-0204
type: task
status: done
priority: P1
owner: runtime-core
source: user-request（继续参考上游完善）；RESEARCH-0022 缺口 #6 前置片
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0190, TASK-0152]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 40ef4e9aca773e3c3cbb017ad784169ebad6d2ed
read_paths: [packages/runtime-core/src/contracts.ts, packages/runtime-core/src, packages/agent/src, apps/desktop/src/main/scheduler, apps/desktop/src/main/ipc, apps/desktop/src/main/agent-teams, apps/cli-host/src]
write_paths: [packages/runtime-core/test/session-event-producers.test.ts, scripts/quality/check-session-event-tombstones.mjs, scripts/quality/session-event-tombstones.test.mjs, scripts/quality/check-guards.mjs, scripts/quality/quality-gates.test.mjs, project/tasks/TASK-0204-session-event-producer-registry.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行，随本片提交）
created: 2026-10-04
updated: 2026-10-04
---
<!-- Copyright The Open Forge contributors. -->

# 会话事件生产者登记表与墓碑守卫

## 目标、范围与适配策略

适配上游 4067e4e7b（删无生产者死类型）与 e0c24f4ab（登记表 + 墓碑守卫）的本仓等价，按本仓证据收窄：

1. **删除两个经查证无生产者的死类型**：`message.final` 与 `toolcall.args`（全仓 src 无构造点；仅消费分支与测试手造引用残留——正是上游所述"死分支让运行时纠正逻辑从未生效"风险，relay 的 message.final 终态纠正分支即 RESEARCH-0022 #3 指认处，TASK-0190 已按 assistant done 纠正）。`message.delta`/`thinking.delta`/`toolcall.start` 有真实生产者（`apps/desktop/src/main/scheduler/task-executor.ts`），**保留**——不照搬上游删除，遵守"不删仍在使用的协议"边界。
2. **生产者登记表**（`satisfies Record<type, Producer>`）：合同新增/删除类型时编译失败强制同步登记；`it.each` 核实登记文件确实构造该事件。登记范围含 desktop 生产者（file 路径相对仓库根，放宽上游的 runtime-core 内相对路径约定并保留同等核实力度）。
3. **墓碑守卫**：`check-session-event-tombstones.mjs` 拦截已删除类型字符串残留（含测试 cast），挂入 `check:guards`；首两条墓碑即本次删除的两类型。

不做：不删 message.delta/thinking.delta/toolcall.start、不改事件载荷、不动 desktop scheduler 旧事件生产、不引入上游 conversation.* 事件系列、不约束 feed reducer（本仓无 feed）。`message.final`/`toolcall.args` 的删除覆盖合同 union、`RuntimeSessionObservationEvent` 观察层成员与 `mapRuntimeSessionObservationEvent` 转发分支（观察层两成员同样经查证无生产者，转发 switch 穷尽依赖二者同步删除）。

### 并发评估

- 结论：不支持并行（合同守卫小片）
- 执行方式：serial
- 可并行 Task：无（`scripts/quality/check-guards.mjs` 为共享写面）
- 前置依赖：无
- 冲突文件/独占路径：无运行时源码改动；`project/tasks` 与 TASK-0197 泳道共享，已登记 conflicts_with
- Branch：main
- Worktree：无（主工作区串行）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：直接入 main；后继 feed/attach Task 依赖本登记表

## Given / When / Then

- Given `SessionEvent` 合同 25 个非 assistant 通道类型各有（或应有）明确生产文件；When 新增或删除合同类型；Then 登记表 `satisfies Record` 编译失败强制同步登记。
- Given 登记表条目指向的源文件不再构造该事件；When 运行定向测试；Then `it.each` 源码匹配失败，暴露"类型仍在合同但生产者已消失"的死分支风险。
- Given 未来某类型被删除；When 代码库任何位置（测试、适配器、cast）残留该类型字符串字面量；Then `check:guards` 的墓碑守卫判负，防止死协议经测试断言复活。

## 必须保持

- 登记表类型全集与 `SessionEvent` union 严格一致（satisfies 编译期约束）；不登记 assistant 通道（AssistantSessionEvent 由 @vetta/ai 协议驱动）。
- 生产者条目必须真实：file 指向实际构造点，literal 仅在观察转名构造时使用；不为通过检查编造条目。
- 墓碑表条目只增不删（上游约定）；当前为空表不表示永久为空。
- 不降低既有门禁；守卫以增量方式加入 `check:guards`。

## 测试与验证

- 定向：`packages/runtime-core` 新增登记表测试；`scripts/quality` 墓碑守卫脚本单测（node-test 入口按仓库惯例）。
- 质量：完整 `bun run check`（守卫挂载后全仓跑）。
- 证据回填：登记表每条目的生产文件以 grep 证据为准，逐条核对后写入。

## 验收分层

- 工程验证：通过（2026-10-04）。定向与 impact 见验证进展；完整 `bun run check` exit 0（types/lint/guards 含新墓碑守卫全绿）；修改声明头 ratchet new=0。
- 技术评审：自审完成——死类型判定以全仓 grep 构造点为证（两个类型零生产者）；删除后由编译器列出全部消费方逐一处理，行为保持论证：所有被删消费分支的语义均已由在世路径承担（assistant done/usage.update），与上游 4067e4e7b 删除语义一致；保留 message.delta/thinking.delta/toolcall.start 遵守"不删仍在使用的协议"边界。
- 集成：integrated（main 主工作区串行，随本片提交）。
- 人工功能验收：不适用（死分支清退无行为变化；开发期守卫）。运行时行为与删除前一致——被删分支从未被真实事件触发。
- 发布：v0.1.3「改进」已补条目（清退+守卫）。

## 验证进展（2026-10-04）

- 生产者核实（grep `type: "<literal>"` 构造点，排除测试）：25 个合同类型逐一定位。`message.final` 与 `toolcall.args` 全仓 src 无生产者（仅 observation 定义、转发分支与消费残留），确认为死类型；`message.delta`/`thinking.delta`/`toolcall.start` 的唯一生产者为 `apps/desktop/src/main/scheduler/task-executor.ts`（保留并跨包登记）。
- 删除实施：合同 union、`RuntimeSessionObservationEvent` 两成员、`mapRuntimeSessionObservationEvent` 转发分支、relay 的 message.final 终态纠正死分支（assistant done 分支已承担同语义）、session-retry 死分支、desktop 消费方（app-monitor、perf-snapshot、ipc/session、通知控制器、pet policy、remote-control、renderer 事件控制器、插件桥、codec 白名单）；`session-events.ts` 注释与 relay 注释同步去引用。测试按上游先例改真实事件（assistant done / usage.update），TASK-0190 的 `assistantFinal` 死事件用例由相邻真实 done 用例覆盖后删除。
- 墓碑守卫首轮全仓扫描抓到 7 处编译器盲区残留（codec 白名单 2、relay types 注释 2、手造事件测试 3）——正是该守卫的目标盲区，逐一清理后 new=0。
- 定向验证：runtime-core 5 文件 51 项、登记表新测试 23 项、coding-agent retry 2 项、desktop pet/notification/remote/host-contract 4 文件 14 项、queue 12 项、cli-host adapter 16 项、墓碑单测 3 项全部通过；`test:impact`（7 个生产文件）命中 runtime-core 21 文件 123 项通过。
- `bun run check:types` exit 0；修改声明头 ratchet new=0（11 个首次修改文件补 `Modified by`，2 个 fork 新文件带 `Copyright`）。
- 发布说明：v0.1.3「改进」补一条（死分支清退 + 守卫）。

## 交付记录

- 实际修改：runtime-core（contracts/session-observation/session-events/session-retry/relay/types/observation-bridge/index + 5 个测试 + 新登记表测试）；desktop（app-monitor、perf-snapshot、ipc/session、通知控制器、pet policy、remote-control、useSessionEventController、plugin-host-bridge、session-event-codec + 4 个测试）；cli-host（rpc-session-event-adapter）；quality（新 check-session-event-tombstones.mjs + 单测，check-guards 与 test:quality 挂载）；发布说明 v0.1.3；本记录与焦点表。
- 实际运行：见验收分层；全部定向/impact/check 证据在验证进展。
- 未运行及原因：真实模型与 UI 实机验证不适用（删除的是从未被真实事件触发的分支，行为零变化）。
- 剩余风险：`session-observation.ts` 观察层其余成员与插件协议 `tool-call-args`（plugin-sdk wire 面）仍有无生产者成员（vetta-ui-design preset 的消费分支从此不触发——删除前即如此）；其清退随 RESEARCH-0022 #4 feed/attach 适配片按同法处理。desktop scheduler 的 message.delta/thinking.delta/toolcall.start 生产链路保留，删除需先迁移其消费方，属 feed/attach 片范围。
- 后继：RESEARCH-0022 推荐顺序下一片为 feed/attach 适配（attach 订阅 + 历史快照 + 整轮重放），登记表与墓碑是其合同前置。
