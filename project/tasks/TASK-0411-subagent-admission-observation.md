---
id: TASK-0411
type: task
status: verifying
priority: P1
owner: runtime-subagents/coding-agent
requirement: REQ-0002
plan: PLAN-0026
source: user-request; RESEARCH-0047
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0411-subagent-admission-observation
worktree: ../open-forge-wt/task-0411-subagent-admission-observation
base_commit: 6bb27d048c5dccade7decafde58f4eeb8ec6686c
read_paths: [packages/runtime-subagents/, packages/coding-agent/, packages/runtime-core/src/observation/, docs/adr/0087-tool-catalog-generations-and-subagent-observation-boundary.md, project/]
write_paths: [packages/runtime-subagents/src/contracts.ts, packages/runtime-subagents/src/subagent-dispatcher.ts, packages/runtime-subagents/src/subagent-pool.ts, packages/runtime-subagents/src/subagent-run.ts, packages/runtime-subagents/src/scheduling-observation.ts, packages/runtime-subagents/test/coordinator-admission-observation.test.ts, packages/runtime-subagents/test/support/fixture.ts, packages/runtime-subagents/README.md, packages/coding-agent/src/composition/subagent/runtime.ts, packages/coding-agent/src/composition/subagent/session-assembly.ts, packages/coding-agent/src/runtime-contracts/subagent-observability.ts, packages/coding-agent/test/composition/subagent-admission-observation.test.ts, packages/coding-agent/test/runtime-core/session-initialization-profile.test.ts]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 子代理准入、排队与收尾释放的安全观测

## 目标

从现有子代理正常入口观察为何等待/拒绝、等待多久、何时准入以及何时释放逻辑调度槽，明确收尾宽限耗尽；不改变持久快照、队列行为或并发默认值。

## 范围

### 并发评估

- 结论：条件支持，与 TASK-0410 写域独立；execution parallel，Coordinator 在独立 Task Worktree 写入。
- Branch：`task/TASK-0411-subagent-admission-observation`；Worktree 由仓库 CLI 创建；前置依赖无；最终集成 0411 → 0410。
- 共享 Project/发布索引仅 Coordinator 在主检出维护；不改 0410 的 OCR policy/peripheral 或 runtime-tools 导出。

### 做

- 在 runtime-subagents 公开 options 增加可选安全 scheduling callback，使用类型化事件记录 queued/admitted/rejected/settling/released 和收尾 deadline；只带 parent/child id、generation、计数、等待/持有时长和稳定 reason。
- 使用调度器当前 owner 与 clock，安全隔离 callback 错误；不对每次快照更新全历史扫描，不把提示词/task/title/路径/错误正文纳入事件。
- CodingAgentSubagentRuntime 转发 callback，session assembly 接入既有 observationPublisher，内核保持零 workspace 依赖。
- 保留 BUG-0001 的默认 10 秒有界收尾；释放原因明确区分正常完成和宽限到期，不能声称逻辑槽释放证明真实 Provider/Tool 退出。

### 不做

不改变默认 3、spawn/followUp 满额拒绝、workflow FIFO、通知恰好一次、generation/恢复/持久化或 Team 权限；不修改 UI/Prompt，不添加新全局 Agent 调度器。

## Given / When / Then

- 一项正在运行、批量后续等待 → 前项完成 → queued/admitted/released 事件顺序、计数与等待时长符合真实行为，后项按 FIFO 启动。
- 单次 spawn 满额 → 拒绝 → 记录容量原因且不创建/泄漏子代理；后续请求仍可用。
- 排队项取消 → 事件 → 从未启动；中断活跃项尚未 idle → 不提前归还逻辑槽，直至正常 settled 或原有收尾宽限到期。
- 子操作忽略 abort/idle → fake clock 推进 10 秒 → 记录 deadline 与释放原因，后续队列继续，dispose 有界。
- 观察回调抛错、恢复后 followUp、身份 rekey → 正常操作 → 业务/交付不变，事件身份与 generation 正确，无私有内容泄露。

## 必须保持

所有原角色、工具/usage/stop、错误、取消、通知与持久化语义；runtime-subagents 仍无 workspace 依赖；默认和公共工具 Schema 不变。

## 测试与验证

- 影响验证补充（2026-10-28，先记范围再编辑）：`test:impact` 的 profile 测试漏了既有 `createExplicitMemoryRuntime` 字段；在无本轮运行时代码的 main@6bb27d048 同文件复跑同样 1 失败，现行源码来源 a13c1759a。补齐期望字段并验证工厂引用保留，不修改 profile 实现、不删除/过滤旧断言，作为本切片验证合同维护。

- 定向：公开 coordinator 连续流程 + Coding Agent 产品组装 observation；显式 deferred/fake clock，无任意 sleep。
- 现有 API/scheduling/terminal-state/recovery/shutdown/delivery 测试作为兼容基线；`test:impact`、跨包 `test:changed`、`check:quick`、完整 `bun run check`。
- 新观测先红后绿；没有真实 Provider/UI 验证权限，不把 Fake 运行称为真实模型性能测试。

## 验收分层

- 工程验证：隔离候选通过；实际命令和范围见交付记录。
- 技术评审：独立只读审查已完成；P2 无 sessionFile 身份丢失已先红后绿修复，deadline/epoch 覆盖与 hook 类型已补齐，最终无未解决 P1/P2。
- 集成：pending。
- 人工功能验收：不适用；这是不改变产品交互/模型行为的内部诊断合同，按事件、隐私、兼容回归及独立审查验收，不声称用户已确认。
- 发布：稳定发布未授权。

## 功能验收包

- 入口：原子代理 spawn/workflow/interrupt；诊断由已有 observation port 接收。
- 预期：能区分容量拒绝、队列等待、取消收尾和宽限到期释放，且无任务内容/路径。
- 不通过表现：观察失败阻塞执行、终态事件冒充实际资源退出、重复通知、计数或身份失真。

## 交付记录

- 工作树：标准 CLI 创建 `../open-forge-wt/task-0411-subagent-admission-observation`，冻结安装成功，目标 `worktree:check` 通过；实际基线 `6bb27d048`。源码候选 `ddf02a58026b5487b848e320d0f5c0618faae5ec`，无工作树未提交变更；尚未集成/清理。
- 实际修改：安全 scheduling callback、独立 admissionId、真实绑定身份事实、排队/容量/收尾/释放事件、epoch 保护与产品 publisher 接线；快照/通知/默认保持。补既有 profile 测试字段和工厂引用断言，无 profile 运行时改动。
- 红绿：初始正常连续流程缺事件失败→通过；异步 callback 拒绝产生 unhandled→隔离；审查发现合法无文件句柄 followUp 身份丢失，回归先红后绿。自然 stop deadline 和旧 epoch 延迟各有 fake-clock 回归。
- 定向：runtime-subagents 全包 `bun ../../scripts/quality/run-vitest.mjs --run`，9 文件 49 例通过；产品 assembly/控制工具 3 文件 15 例通过。
- 影响：`bun run test:impact -- packages/runtime-subagents/src/scheduling-observation.ts packages/runtime-subagents/test/coordinator-admission-observation.test.ts packages/coding-agent/src/composition/subagent/session-assembly.ts packages/coding-agent/test/composition/subagent-admission-observation.test.ts packages/coding-agent/test/runtime-core/session-initialization-profile.test.ts` exit 0，产品相关 30 文件 108 例、子代理相关 9 文件 49 例及直接测试通过（有重叠，不相加宣称唯一总数）。
- 检查：`check:quick` 和最终完整 `bun run check` exit 0；首轮新增/改动文件声明头遗漏已修复，未放宽基线。完整检查包含 lint、五组类型与 guards/mobile lint。
- 协作：只读调查 `/root/subagent_observation_fixture` 提供最小生产 assembly 接缝与 generation 时序；独立审查 `/root/review_subagent_admission` 复核最终实际 diff，未执行测试或写代码，不冒充跨模型家族评审。
- 未运行/边界：跨包 `test:changed` 在组合候选执行；未授权 UI/真实 Provider，未测真实模型吞吐。`released` 只证明调度槽释放，宽限耗尽不等于物理资源退出。
