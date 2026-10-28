---
id: PLAN-0026
type: plan
status: verifying
priority: P1
requirement: REQ-0002
owner: runtime-tools/runtime-subagents/coding-agent
created: 2026-10-28
updated: 2026-10-29
related_requirement: [REQ-0002]
related_tasks: [TASK-0410, TASK-0411]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 运行时共享资源准入与子代理调度观测

## 背景与目标

用户在 [RESEARCH-0047](../research/RESEARCH-0047-pi-codemode-worker-admission.md) 之后明确要求立项、创建 Plan/Task、开工作树完成。复用 [REQ-0002](../requirements/REQ-0002-runtime-performance.md) 的有界取消、可观察失败和资源预算目标，选择已有 OCR 共享 gate 作为生产接入点，不引入 codemode 产品能力。

完成两条可独立回滚的切片：共享 gate 的可取消、有界、公平准入及真实操作收敛记账；子代理排队、准入、拒绝、收尾与释放的无内容观测。既有子代理默认 3、工具窗口默认 4、OCR 默认 1、spawn 满额拒绝和 workflow FIFO 保留。

## 当前事实

- 基线 `main@052192d4568039ff9d304ee9b704f5db83553154`，工作区干净；沿已有图谱导航后回读当前源码。上一轮子代理 3 文件 20 例通过。
- `runtime-tools` 的 `AsyncExecutionGate` 只有 `run(operation)`；无限队列、等待不可取消、无 deadline/owner/观测，操作同步抛错不能正确回收槽位。
- OCR image/PDF 工具共用产品 gate；工具内部只有获准后检查取消，排队时取消仍等待前方长 OCR。Node 命令 Promise 在进程 close/启动 error 收敛，适合由 gate 跟踪底层操作生命周期。
- `runtime-subagents` 已有 FIFO、fail-fast spawn、settled 后补位和 BUG-0001 默认 10 秒有界收尾；不把逻辑 settled 等同于真实宿主资源消失。
- 子代理现有 observation 含快照/错误，缺少安全的准入/释放原因和等待时长；保持内核零 workspace 依赖，通过 callback 由 Coding Agent 发布。

## 候选方案与取舍

| 方案 | 决策 |
| --- | --- |
| 扩展现有 gate，旧调用兼容；OCR 显式选择预算与公平 | 采用；保留唯一容量 owner，真实生产入口可覆盖取消与队列竞争 |
| 新建全局 Agent 调度器或引入 Pi/codemode | 不采用；没有对应产品需求，会扩大权限、包边界和生命周期 |
| 所有资源统一变成一个总信号量 | 不采用；OCR、Agent 数、工具窗口并非同一种资源，容易形成父子等待环 |
| 取消后立即归还资源槽 | 不采用；调用方可先结束，底层操作仍未收敛时继续占槽并报告 draining |
| 默认让所有旧 gate 改公平/有界 | 不采用；通用 API 默认 FIFO/旧容量语义；OCR 在产品策略层明确选择每 session 轮转、有界等待和队列预算 |

OCR 初始策略：保持并发 1，最多 8 个等待请求（与现有 workflow 单批上限一致），等待最长 60 秒，按 session 轮转且 session 内 FIFO。该 60 秒只限制资源准入，不缩短既有 image 5 分钟/PDF 30 分钟执行时限；对过载明确报错，禁止自动重放有副作用操作。通用 gate 的所有新限制均为显式选入，避免影响知识库现有使用。

## 阶段

1. [TASK-0410](../tasks/TASK-0410-shared-resource-admission.md)：共享 gate 合同与实现、可取消/有界等待、可选 owner 轮转、无内容事件、OCR 正常入口接线和回归；记录 ADR-0151。
2. [TASK-0411](../tasks/TASK-0411-subagent-admission-observation.md)：子代理调度安全事件与产品 observation 接线，区分终态和调度释放，报告收尾宽限耗尽而不改变原有取消合同。
3. Coordinator 回收独立只读审查并修复，依次集成 0411 → 0410；补发布说明，跑定向/影响/跨包与完整检查后交付。

两项条件支持并发：代码写域独立，0410 的 Coding Agent 修改限于 OCR policy/peripheral；0411 限于 subagent runtime/assembly/observability。各用独立 Task Worktree，不并行写共享索引、ADR 索引或发布说明；Coordinator 维护管理记录，集成串行。

前置实测：全量 `worktree:check --all` 因 TASK-0344–0347 历史缺日期失败，无本批 scope 冲突；按 [WAIVER-0013](../decisions/waivers/WAIVER-0013-resource-admission-worktree-baseline.md) 隔离推进并逐 Task 检查。当前 0.1.3 已打 tag，按 [WAIVER-0014](../decisions/waivers/WAIVER-0014-resource-admission-release-fragments.md) 暂存未发布 0.1.4 碎片，不改已发布正文或版本。

执行调整：影响验证发现既有 profile 测试漏记 `createExplicitMemoryRuntime`，已在原 main 基线复现并由 0411 补齐原合同断言。两项实现仍独立；先集成 0411 让组合测试具备正确基线，再集成 0410，避免重复保留已定位的旧失败。

## 不做什么

不接入 codemode/QuickJS，不提升并发默认值，不改 Team 身份、用户输入队列、工具 Schema、提示词或持久化格式，不启动 UI/dev/真实 Provider，不读取用户状态或调用付费 API，不发布稳定版本。会话公平仅用于资源 gate，现有 workflow 队列继续 FIFO。

## 验证与回滚

使用仓库 Node runner；新增行为先以公开 gate/工具/coordinator 入口建立失败测试，再逐片实现。覆盖突发、队满、排队取消/超时、同步抛错、取消已返回但底层未结束、owner 公平与内部 FIFO、观察者抛错、启动失败、排队取消、恢复/复用、正常与超时收尾；使用显式同步点/可控时钟。

每 Task 定向和 `test:impact`，新公共合同和跨包接线按 `test:changed` 选择受影响包，最终 `bun run check`；失败归属以基线复跑而非删断言处理。不以软件测试宣称真实模型吞吐改善。每 Task 独立提交、可回滚，无数据迁移；开发候选与人工接受分开。

## 升级信号

新增 VM/浏览器资源有真实接入需求、底层 Promise 不能代表物理退出或观察到长期过载时另建 Task；不在本次为假想资源增加宿主进程管理框架。

## 需要的 ADR

[ADR-0151](../../docs/adr/0151-resource-admission-and-release.md) 记录 gate 的兼容扩展、调用结果与底层资源分离、OCR 显式策略以及保持子代理有界逻辑收尾的原因；沿 ADR-0077/0087 的所有权，不引入包或持久化迁移。

## 交付结果（2026-10-29）

- TASK-0411 源候选 ddf02a580 已通过 f9d906c24053ec1f1b5e76f8d66d4cd6cf54580e 集成本地 main；内部观测合同按自动化与独立审查验收，done。TASK-0410 源候选 619cd9c3b 随承载本记录的 merge 提交集成，保留真实 OCR 人工功能验收，verifying。
- 正常 OCR 工具连续流程、gate 取消/轮转/收敛、新子代理安全事件与实际产品 publisher 装配均通过；两项新上下文独立只读审查闭环，未宣称跨模型家族或真实 Provider 性能验证。
- 组合 test:changed 完整执行：coding-agent、runtime-subagents、runtime-tools、runtime-node、runtime-desktop、cli-host 全通过，2684 例通过；Desktop 6233 例通过、14 例失败。原基线独立临时检出逐例复现完全相同的 14 项，详见 [ISSUE-0035](../issues/ISSUE-0035-windows-desktop-test-baseline.md)。完整 bun run check 通过，不将跨包门禁写成全绿。
- 按 [WAIVER-0015](../decisions/waivers/WAIVER-0015-resource-admission-local-baseline.md) 仅完成本地集成；origin/dev 门禁保留，当前未推送，两个 Task 工作树保留待推送后清理。0.1.4 发布碎片已暂存，未发布。
- Plan 保持 verifying：真实 OCR/UI/Provider 未运行，等待功能接受；未扩张为无关 Desktop 修复或稳定发布。
