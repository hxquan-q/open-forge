---
id: BUG-0054
type: bug
status: verifying
priority: P1
owner: toolkit
source: upstream comparison and regression fixtures
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0150]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 短暂文件占用使原子写入直接失败

## 用户流程与实际行为

目标临时被占用时 rename 抛 EPERM/EACCES/EBUSY；现有同路径队列无法解决 OS 级短暂占用。

## 期望行为

正常入口按既有合同完成；只修复本条缺口，保留原有安全、错误和恢复行为。

## 环境与失败证据

Open Forge 0.1.3，调查基线 1cbe27c53，Windows；只使用 fixture/临时文件，没有真实用户状态或 Provider。旧实现 6 个新增用例失败；适配后 7 个定向、22 个 Toolkit 全包测试通过。保留已有队列，不重开已解决的 BUG-0020。

## 最小复现与回归测试

使用仓库 Node runner 运行 `packages/toolkit/test/atomic-write.test.ts` 中相关用例；具体命令与结果见 TASK-0150。测试不得删除断言、跳过或延长超时换取绿灯。

## 根因证据与影响

唯一临时名/同路径队列已存在，但重命名没有有界重试。

## 修复与验证

候选适配归 TASK-0150；定向证据不等于已集成。完整检查、隔离验证、兼容风险与提交由 Task 继续回填；保持 verifying，不宣称真实机器/模型验收通过。
