---
id: BUG-0053
type: bug
status: verifying
priority: P1
owner: ai
source: upstream comparison and regression fixtures
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0149]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 兼容网关省略思考块初始签名时被拒绝

## 用户流程与实际行为

有效 thinking start 未带 signature，后续可携带 signature_delta；旧实现返回 error 而非 stop。

## 期望行为

正常入口按既有合同完成；只修复本条缺口，保留原有安全、错误和恢复行为。

## 环境与失败证据

Open Forge 0.1.3，调查基线 1cbe27c53，Windows；只使用 fixture/临时文件，没有真实用户状态或 Provider。两条新增有效流断言在旧实现失败；适配后 18 个 conformance 测试通过，错误类型签名仍拒绝。

## 最小复现与回归测试

使用仓库 Node runner 运行 `packages/ai/test/provider-conformance.test.ts` 中相关用例；具体命令与结果见 TASK-0149。测试不得删除断言、跳过或延长超时换取绿灯。

## 根因证据与影响

TypeBox 把 content_block_start.signature 设为必填。

## 修复与验证

候选适配归 TASK-0149；定向证据不等于已集成。完整检查、隔离验证、兼容风险与提交由 Task 继续回填；保持 verifying，不宣称真实机器/模型验收通过。
