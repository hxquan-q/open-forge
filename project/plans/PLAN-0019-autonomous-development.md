---
id: PLAN-0019
type: plan
status: in_progress
priority: P1
requirement: REQ-0019
owner: project/agent-workflow
created: 2026-10-19
updated: 2026-10-20
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发全流程实施与验收

## 背景与目标

落实用户“跑完全流程不分批次”的要求。范围来自 REQ-0019、下载目录 v2 参考文档和本会话优化方案；以下切分仅表达实施依赖，不是分批向用户交付或缩小目标。

## 当前事实

- 原调查基线 main `a7ef4874d`，实施基线已核对为 `399fdf1ff`；REQ-0004/PLAN-0004 已覆盖任务合同与人工接受，新增机制保持兼容。
- scripts/worktree、三平台质量门禁、Desktop packaged/upgrade、发布说明碎片已存在。
- TASK-0321 的触发精简已在实施基线，未覆盖或回退。主工作区另有他人 temp/ 未跟踪文件，保持原位，不夹带提交。
- ISSUE-0029 的最近已核实作业因 Actions 预算未启动（run 39235716508 / job 118004157996）；没有新的远端绿灯，不调整账户预算。
- PLAN-0019 的来源链 `cf79dd504` → `47b1e8e86` → `c22ccc1c5` → `33992b0be` → `8e14b3bcd` → `ff408a28e` → `8846e7f30` 已按 WAIVER-0005 合并到本地 main 的合并提交 `80ad98655`，组合 test:changed 46/46 包通过，合并前完整 check exit 0。Task 保持 verifying，真实环境验收另列。
- 用户已明确没有隔离 VM/runner、模型与独立评审配置、签名/监控环境。实际配置 level=0、模型与发布器 disabled；目标 L4 仍未达到。

## 候选方案与取舍

采用仓库协议、确定性执行与可替换模型进程；不把多厂商 CLI、Git notes 或提示词当作安全边界。运行记录采用单写者、原子持久化和租约 fencing，Task 继续是语义合同。跨机器共享存储以后只能在明确的存储合同上扩展，不能把普通本地锁称为分布式锁。

## 实施依赖与 Owner

1. TASK-0322：协议、运行状态、租约、策略、执行与可信证据核心。
2. TASK-0323：仓库入口、测试/设计/治理门禁、独立评审与集成接线。
3. TASK-0324：信号、复盘、摘要、发布控制与故障恢复全链路。
4. TASK-0325：实际部署条件核验、运行演练、完整检查和最终逐项审计。

共享合同及同一 scripts/agents 目录串行；TASK-0321 已在实施基线，保留其触发边界。只在用户或适用规则明确授权时使用多 Agent；本计划当前由单 Agent 执行。本地组合候选的有限流程例外登记 WAIVER-0005，完整影响验证不豁免。

## 完整审计矩阵

| 项 | 完成证据 | 当前状态 |
|---|---|---|
| 策略、运行合同、证据 Schema 与拒绝非法输入 | scripts/agents/contracts/schema、schemas/agents；597 例质量套件 | 软件通过，组合 46/46 包通过 |
| Task 领取、依赖/路径冲突、租约代次与恢复 | leases/prepare/queue/services；真实临时 Git/进程 | 软件通过，真实 sandbox 回收未验 |
| 执行器适配、隔离、身份、取消与用量 | adapters/runner/process/usage；doctor 明确关闭 | 实现/评审适配和软件限制已测；OS 隔离与真实模型未验 |
| 独立评审、实际测试结果、集成提交绑定 | evidence/verify/integrate；实际组合提交、目标前进与空报告拒绝 | 临时环境通过，真实独立模型未运行 |
| 七类闸门与未知分类处理 | policy/approval；累积风险与外部 Ed25519 批准 | 软件通过，分类保守，不等于语义完备 |
| UI 规则、行为与视觉证据 | design 增量检查与 D01–D11；运行覆盖缺失时拒绝 | 源审计已接线，真实 UI/视觉适配未接入，未验收 |
| 信号去重、目标调度、停滞与熔断 | feedback/queue/orchestrate；事件重放与有界周期 | 本地入口通过，外部采集/主动循环未部署 |
| 复盘、三日期晋升候选、每日摘要 | feedback/usage；真实提交/失败日期、空成本和三日期测试 | 软件通过；nightly 是材料，真实模型复盘未执行 |
| 候选/稳定发布、灰度、监控缺失暂停 | release/services；真实受控 Node 发布器、丢响应/幂等/清理回执 | 软件协议通过，实际 CI/签名/发布/遥测未部署 |
| 规则入口、文档、Release Notes、质量接线 | AGENTS/CLAUDE/GEMINI/Cursor、LESSONS、质量脚本 | 597 例与分项 check 通过，组合 46/46 包通过；合并前完整 check exit 0 |
| 集成与真实自主运行 | 七提交来源链；任务与组合记录 | 已合并本地 main `80ad98655`，未 push/dev 发布；实际自主运行未执行 |
| 真实稳定发布与 L4 验收 | 明确授权、签名、平台、监控、发布证据 | 未执行，不以本地测试替代 |

## 不做什么

不把内部试点当最终完成，不修改真实用户配置，不绕过七类闸门，不调高检查基线或 CI 预算，不把模拟模型成功报告为真实模型质量。

## 验证与回滚

使用真实临时文件系统/Git/子进程与受控外部适配器；行为风险覆盖权限、取消、重放、进程失败、状态损坏、失效证据、无遥测、发布幂等。先定向，再 impact/quality，最后完整 check。仅本 Task 路径原子提交；未验收 worktree 保留。实现可按 Task 提交回退；外部发布另按既有恢复合同。

## 升级信号与 ADR

自治等级由实际验收证据提升，缺失外部条件单列。持久化、可信执行与权限隔离的长期取舍在接口收敛时登记 ADR，不以 ADR 替代实现。

## 验证续接

TASK-0322 的历史全量 test:changed 为 43/46 通过，runtime-node 原文件隔离复验通过；后续 BUG-0107、BUG-0132、BUG-0133 修复后，冻结候选树 `3e067fa1a2d62e6ac9b9599c8481cd0837c8efc9` 的组合 test:changed 达到 46/46 包通过，2077.1 秒。管理记录订正后的合并前完整 check exit 0（39.8 秒，`open-forge-autonomy-integrated-final-check-20261020.log`）；实际模型、隔离 UI、发布和监控仍未验收。详细审计见 [VERIFY-0019](../verification/VERIFY-0019-autonomous-development-audit.md)，不能把本地软件绿灯写成真实 L4。
