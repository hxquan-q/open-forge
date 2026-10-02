---
id: BUG-0055
type: bug
status: verifying
priority: P1
owner: coding-agent + desktop knowledge
source: upstream comparison and regression fixtures
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0162]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 知识库工厂未转发宿主提示词来源

## 用户流程与实际行为

生产工厂与产品工厂均未转发 createPromptRuntimeSources；测试包装器的备用 resolveSystemPromptOptions 掩盖了缺口。

## 期望行为

正常入口按既有合同完成；只修复本条缺口，保留原有安全、错误和恢复行为。

## 环境与失败证据

Open Forge 0.1.3，调查基线 1cbe27c53，Windows；只使用 fixture/临时文件，没有真实用户状态或 Provider。旧实现的注入/转发断言失败；适配后 Desktop 装配 1 例与知识会话/批处理 3 例通过。外部 custom composition 兼容仍须复核。

## 最小复现与回归测试

使用仓库 Node runner 运行 `apps/desktop/src/main/knowledge/processing-session-factory.test.ts；packages/coding-agent/test/knowledge-processing-session.test.ts` 中相关用例；具体命令与结果见 TASK-0162。测试不得删除断言、跳过或延长超时换取绿灯。

## 根因证据与影响

默认组合需要宿主提供来源；两个工厂装配点遗漏该选项。

## 修复与验证

候选适配归 TASK-0162；定向证据不等于已集成。完整检查、隔离验证、兼容风险与提交由 Task 继续回填；保持 verifying，不宣称真实机器/模型验收通过。
