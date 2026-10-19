---
id: TASK-0322
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0322-autonomous-development-runtime
worktree: unassigned（已集成，待推送后清理）
base_commit: 399fdf1ff2bb0f77b9362efe751f2c87722af662
read_paths: [project, scripts/worktree, scripts/quality, docs/dev, package.json]
write_paths: [scripts/agents, schemas/agents, project/autonomy-policy.json, project/agents.json, package.json, biome.json, scripts/quality/check-lint.mjs, scripts/quality/autonomy-entrypoints.test.mjs, .github/release-notes/v0.1.3.md, project/tasks/TASK-0322-autonomous-development-runtime.md]
exclusive_paths: [scripts/agents, schemas/agents]
depends_on: []
conflicts_with: [TASK-0130, TASK-0153, TASK-0154, TASK-0197, TASK-0218, TASK-0223, TASK-0276]
integration_status: integrated
created: 2026-10-19
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发运行协议与可信执行

## 目标与范围

Open-Forge-only。实现严格校验的策略/运行合同/证据、单写者调度、原子存储、带代次租约、依赖与写范围冲突、执行器适配、取消和可信结果。完整目标由 PLAN-0019 约束，本 Task 不是最终交付终点。

必要测试接线同本 concern：根脚本暴露 agent CLI 与 test:agents，既有 test:quality 纳入新测试；Biome 纳入新实现与 JSON 合同。它们增加覆盖，不修改测试强度或既有工作流触发面。

## 并发评估

条件支持：与主工作区 TASK-0321 写范围隔离，使用独立 Task Worktree；共享合同内部串行，不派发子 Agent。Coordinator 最终集成，不覆盖 quality/desktop-packaged 在途文件。

TASK-0197 的历史宽范围包含 project/tasks；登记串行集成冲突，不改写其合同。worktree:check 的历史缺失工作树告警与当前新工作树尚未创建分别记录，不清理他人工作树。

发布说明按当前 0.1.3 手写历史格式追加一句内部改动；不引入与手写正文冲突的碎片、不迁移整份历史。共享该版本说明的旧 parallel Task 已登记串行集成冲突。

## Given / When / Then

- Given ready Task 和合法合同，When claim→run→review→verify，Then 生成绑定代码/策略/实际进程的证据。
- Given 过期租约、重复事件、损坏状态或伪造结果，When 恢复或集成，Then 拒绝且不覆盖已有记录。
- Given 取消、超时或子进程失败，When 结束运行，Then 清理进程树并留下可恢复终态。

## 必须保持

不调用真实 Provider 或读取真实账号；不触发发布；不新增依赖；不削弱现有守卫；缺失记录拒绝自动放行。运行器不把工作目录当作安全沙箱，实际模型执行必须具备受控执行环境。

## 测试与验证

- 定向：仓库 Node Vitest runner 运行 scripts/agents 的合同、状态、CLI/子进程与 Git 连续流程。
- 用户流程：doctor→plan→claim→run→review→verify→status；临时仓库内验证完整公开入口。
- 质量：check:quick、test:impact、test:quality、完整 check；未跑项明确记录。

## 验收分层与交付记录

- 工程验证：核心定向与完整 check 通过；全量受影响测试存在一项未改动包超时，待复验归属，不宣称整体绿灯。
- 技术评审：自审；未调用独立模型或子 Agent，不把自审称为独立评审。
- 集成：本地 main 已集成；主工作区已有其他任务改动。
- 人工功能验收：内部工具按既定软件合同验收；真实模型运行另行记录。
- 发布：未授权，不以用户要求实施推断 tag/Release/稳定晋升授权。
- 实际修改、命令、风险：随实施补录。

## 实施中的实际证据（2026-10-19）

- Worktree 由标准入口创建，实际基线为 `399fdf1ff2bb0f77b9362efe751f2c87722af662`（创建前 main 已由在途 CI Task 前进）；没有复制主工作区脏文件。`bun install --frozen-lockfile` 成功，3044 包，未改变 lockfile。
- 已实现：严格 JSON Schema 子集、策略/执行器/运行合同/租约/模型结果 Schema；HMAC 校验和单写者原子状态；带代次租约和过期进程拒绝回收；受控环境变量、真实进程树取消；配置与代码绑定的实现/独立评审；实际断言统计验证与公开 CLI。
- 存储回归：新增“状态文件丢失不得视为空队列”测试先出现行为断言失败，再修复后通过；不是编译错误充当 red。
- 定向验证：`scripts/agents` 8 文件 / 38 例、质量入口接线 3 例通过；连续 Git/子进程流程已验证实现提交、跨身份评审、实际候选断言、过期 review 拒绝。完整 `test:changed` 的质量阶段实际为 47 文件 / 567 例通过，工作区测试仍在执行。
- 完整 `bun run check` 的两次中间版本及最终版均通过（最终日志：系统临时目录 `open-forge-task-0322-check-final-20261019.log`，exit 0）。最终版纳入实际 lint 目标、证据导出 Schema 与子进程后代清理测试。
- 连续 Git 场景最初触发 5 秒测试超时；没有调高超时或删断言，通过合并 Git 元数据读取、消除重复快照后定向场景通过。
- `node scripts/agents/cli.mjs doctor` 实际输出 contractValid=true、targetLevel=4、level=0、readyForModelExecution=false；尚未配置的模型与沙箱没有伪装成可运行。
- 全量 `test:changed` 第二次运行的质量阶段 47 文件 / 567 例通过；`packages/runtime-node/src/host/command-executor.test.ts` 在并行静态检查时 5 秒超时，其余模块尚在继续。该文件未修改；不能仅凭路径归属宣称存量失败，等待独立复验。
- 未完成：该全量结果收尾/超时复验、父计划后续调度/信号/复盘/发布集成，以及真实外部运行。当前测试使用受控外部进程，不证明真实模型质量或 OS/VM 隔离。
- 没有启动真实模型、运行中 Desktop、生产服务或发布操作。配置中的模型执行默认禁用；费用/模型白名单/沙箱/签名与发布权限须有真实来源。

## 2026-10-20 组合验证与集成

- 来源链：cf79dd504 → 47b1e8e86 → c22ccc1c5 → 33992b0be → 8e14b3bcd → ff408a28e → 8846e7f30。按 WAIVER-0005 在本地 main 合并，保留每项原子修复；未推送或发布。
- 冻结候选树 3e067fa1a2d62e6ac9b9599c8481cd0837c8efc9 经完整 test:changed --base origin/dev：46 包全部通过，2077.1 秒；CLI 238 通过 / 14 跳过，Desktop 5278 通过 / 17 跳过，未新增 skip 或改变断言/超时。日志为系统临时目录 open-forge-autonomy-integrated-test-changed-20261019.log。
- 七个他人 temp 文件仍原位未跟踪；来源和候选校验未发生其他代码变化。仅更新本次集成管理记录，最终完整 check 仍须在合并提交前通过。
- 本 Task 保持 verifying，真实执行/评审、UI 与外部服务接入仍未验收；完整目标和恢复条件见 VERIFY-0019，不能把本地软件验证当成真实 L4。
