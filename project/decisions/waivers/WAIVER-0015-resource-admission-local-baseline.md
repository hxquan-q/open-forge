---
id: WAIVER-0015
rule: project/collaboration/development-workflow.md 的本地集成要求全跨包测试全绿的 Policy
status: active
owner: PLAN-0026-coordinator
reason: PLAN-0026 的 test:changed 完整运行中 Desktop 7 文件 14 例失败，独立临时检出原基线 6bb27d048 在相同宿主逐例复现完全相同的失败集合；不将共享资源任务扩大为远端 shell 与后台刷新修复
risk: Windows Desktop 广域门禁仍红，基线一致不能证明所有组合风险为零；相关存量测试与环境根因待 ISSUE-0035 定位
compensation: 仅允许 TASK-0410/0411 已验证候选的本地 main 集成；新行为及公开入口流程、全部六个其他受影响包、完整 check 和独立只读审查通过；保留全量红灯与精确基线结果，不改断言、超时、skip、测试选择器或生产代码消除无关失败；不豁免开发分支推送或任何发布授权
created: 2026-10-29
expires: 2026-11-04
---
<!-- Copyright The Open Forge contributors. -->

# 资源准入候选的本地集成基线例外

范围只含 TASK-0411 的 ddf02a58026b5487b848e320d0f5c0618faae5ec 和 TASK-0410 的 619cd9c3bcf2e4acb8e3af1f55e46c68db1a9250，以及对应管理记录和未发布说明碎片；不适用其他 Task。TASK-0411 已按定向影响测试和完整 check 合入，组合跨包运行在 TASK-0410 合并候选上执行。

## 证据与边界

- 完整命令 bun run test:changed --base 6bb27d048：六个非 Desktop 包全通过，2684 例通过；Desktop 1102 文件通过、7 文件失败、4 文件既有跳过，6233 例通过、14 例失败、18 例既有跳过。完整运行 exit 1，不记作全绿。
- 本地 shared clone 固定原基线 6bb27d048c5dccade7decafde58f4eeb8ec6686c，在独立 Temp 目录冻结安装后重跑这七个文件，14 例失败、17 例通过、3 例既有跳过；与候选的 14 个完整测试名称排序后逐项相等。新 gate/observation 源码在基线不存在，workspace 链接指向基线自身。
- 详情与复现见 [ISSUE-0035](../../issues/ISSUE-0035-windows-desktop-test-baseline.md)。初次 node_modules 内检出的 TSX 对照因 JSX 转换差异无效，未作为 UI 归因证据。
- 定向新行为、正常工具入口、实际产品 assembly、兼容回归和独立审查已完成；完整 bun run check exit 0。所有失败断言与执行强度保留。

本条只处理本地集成的测试流程 Policy，不扩张 Git 授权 Invariant。origin/dev 推送须满足原有完整批次门禁，当前不推送；不触及 origin/main、upstream、tag、Release、真实 Provider、用户实例或真实状态。保留 Task 工作树，待失败解决及 dev 推送后按既有流程清理。到期不自动续期，归因/修复另立 Task，不把本条变为全仓测试基线豁免。
