---
id: BUG-0056
type: bug
status: verifying
priority: P1
owner: theme-ui tests
source: upstream comparison and regression fixtures
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 懒边界回归误将冷编译计入断言超时

## 用户流程与实际行为

settings barrel 的动态导入占用测试体 5 秒预算，冷编译导致结构合同超时；不代表 three.js 被静态求值。

## 期望行为

正常入口按既有合同完成；只修复本条缺口，保留原有安全、错误和恢复行为。

## 环境与失败证据

Open Forge 0.1.3，调查基线 1cbe27c53，Windows；只使用 fixture/临时文件，没有真实用户状态或 Provider。隔离树实际失败为 Test timed out in 5000ms。移到模块初始化阶段，保留 throwing three mock 和 lazy 壳身份断言；回归待完成。

## 最小复现与回归测试

使用仓库 Node runner 运行 `packages/theme-ui/src/settings/achievements/achievement-badge-lazy-boundary.test.ts` 中相关用例；具体命令与结果见 TASK-0148。测试不得删除断言、跳过或延长超时换取绿灯。

## 根因证据与影响

把大型模块图的 Vite 转换放进测试体；结构合同不是 5 秒产品性能 SLA。

## 修复与验证

候选适配归 TASK-0148；定向证据不等于已集成。完整检查、隔离验证、兼容风险与提交由 Task 继续回填；保持 verifying，不宣称真实机器/模型验收通过。
