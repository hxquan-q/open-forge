---
id: TASK-0324
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0322, TASK-0323]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0324-autonomous-feedback-release
worktree: ../open-forge-wt/task-0324-autonomous-feedback-release
base_commit: 47b1e8e86f0c7a8a503930545e6429e501a64db9
read_paths: [scripts/agents, schemas/agents, scripts/release, project, docs/dev, docs/desktop/windows-auto-update.md]
write_paths: [scripts/agents, schemas/agents, project/agents.json, package.json, AGENTS.md, LESSONS.md, docs/dev/agent-rules/autonomy.md, .github/release-notes/v0.1.3.md, project/tasks/TASK-0324-autonomous-feedback-release.md]
exclusive_paths: [scripts/agents, schemas/agents]
depends_on: [TASK-0323]
conflicts_with: [TASK-0322, TASK-0323, TASK-0130, TASK-0153, TASK-0154, TASK-0197, TASK-0218, TASK-0223, TASK-0276]
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发反馈、复盘与发布控制

## 目标与范围

续接 TASK-0323，补齐信号去重/任务建议、每日变更复盘输入、带真实证据的教训计数与三日期晋升候选、决策摘要、用量记账、候选/稳定发布与灰度暂停/恢复。全部复用现有 Task 与发布合同；不新增 GOAL 台账或另一套产品更新器。

直接扩展已有控制器的操作模块；外部 CI、发布和遥测以受信服务签名回执进入控制面，模型文本不能证明它们已执行。发布器使用固定命令数组和幂等键；响应丢失后先查询/对账，不能盲目重发。

## 并发评估

条件支持：独立 Task Worktree，串行依赖 TASK-0323 的已提交代码；本会话不派发子 Agent。共享运行器/Schema/版本说明和历史宽范围 Task 已登记冲突；Coordinator 最后统一按依赖集成。

## Given / When / Then

- Given 同一来源的重复信号，When 重新采集，Then 不生成重复任务或重复计数；外部文本只成为待调查数据，不能直接创建 ready Task。
- Given 可核实的提交或失败运行，When 记录教训并每日复盘，Then 输出规则、原因、证据与 Seen 日期；不足三日期不晋升，达到门槛只生成需治理审查的候选。
- Given 配置或身份缺失，When 统计用量或摘要，Then 报告 unknown/未执行，不将未知费用计成零。
- Given 已集成且重新验证的最终提交和可信 CI/签名制品，When 发布，Then 固定意图与幂等键，并只在实际服务回执后记录已发布。
- Given 遥测缺失/过期、样本不足或崩溃率超阈值，When 灰度评估，Then 停止推进；实际暂停仍待发布器确认，不能把本地 pause-required 写成服务已暂停。
- Given 发布响应丢失或进程清理未确认，When 恢复，Then 对账/验证外部签名证明后再清除阻断，不靠旧 PID 或空状态继续。

## 必须保持

模型、发布、签名和生产访问默认关闭；用户已答复没有隔离 VM/runner、签名与监控环境，因此本任务只进行软件合同与受控进程/文件系统演练，不宣称真实 L4。不得创建对外评论、付费调用、真实发布或修改账户预算。

## 测试与验证

Node runner 覆盖信号重放、证据有效性/日期去重、未知用量、签名篡改与错对象、发布幂等/响应丢失、缺失遥测暂停和清理恢复；使用临时真实 Git/子进程与测试专用密钥。定向 → impact/quality → check:quick/完整 check；实际环境验收由 TASK-0325 单列。

## 验收分层与交付

- 工程验证：质量套件 54 文件 / 597 例及完整 check 通过；技术评审：自审，真实独立模型未配置。
- 集成：pending；人工功能验收：内部控制器按明确软件合同验证，真实自主运行另列。
- 发布：未授权、未执行；不能用模拟回执代替真实服务。
- 实际文件、命令、结果、未运行项和恢复条件随实施记录。

## 交付记录

- Open-Forge-only；Worktree 基于 TASK-0323 的 `47b1e8e86` 创建，冻结安装成功（3044 包，39.95 秒），未修改锁文件。
- 新增信号/经验/服务回执/发布输入的闭合合同，接通公开 CLI 与根脚本。信号仅产生调查建议，夜间材料明确标记未执行模型复盘；LESSONS.md 初始为空，不预填历史。经验用真实可达 commit 或失败运行按证据日期计数，三日期只生成需治理的候选。
- 增加 CLI reported 用量与决策摘要；未知成本保持 null，缺失检查明确列入 Not run，部分 token 统计不宣称完整账单。
- 发布前核对最终集成证据、已提交版本、三平台 CI/签名回执和实际制品字节。固定受信发布器命令采用持久意图与幂等键；版本/渠道跨 run 预留，响应丢失只对账、不重发。
- 受控真实 Node 发布器演练覆盖发布→持有→推进→实际暂停回执→明确恢复后重开观察窗口；中断后经资源所有者签名撤销并提升 generation，旧运行不能复写状态。发布器、模型及 Provider 在实际配置中仍关闭，测试专用私钥只在临时目录生成。
- 回归先红后绿：样本不足不能掩盖其他平台崩溃回归；不同 run 不能重复发布同版本/渠道；缺失检查计划不能输出空 Not run。
- 定向最终 4 文件 / 15 例通过；随后新增版本预留用例纳入质量套件。`bun run test:impact -- scripts/agents/feedback.mjs scripts/agents/services.mjs scripts/agents/release.mjs scripts/agents/usage.mjs scripts/agents/operations.mjs scripts/agents/cli.mjs scripts/agents/runner.mjs` 实际重跑 54 文件 / 597 例，全通过；日志 `open-forge-task-0324-impact-20261019.log`（系统临时目录）。
- `bun run check` 初版及最终版 exit 0；最终日志 `open-forge-task-0324-check-final-20261019.log`。根指南 8074 字节，声明/规则/Schema/质量接线检查通过，未放宽基线。当前版本 0.1.3 发布说明已补内部条目。
- `doctor` 实际输出 level=0、readyForModelExecution=false、publisherConfigured=false。未调用真实 Provider、未运行真实 UI/独立视觉评审、未发布、未上传、未创建监控自动化。真实平台、服务回执签发与密钥托管仍未具备，受控演练不能证明 L4。
- 父计划全量测试先前的 CLI wasm 路径/信任诊断、Desktop resourcesPath 及部分进程超时仍由后续任务诊断；不宣称整仓测试已绿，不把本 Task 提交视为全目标完成。
