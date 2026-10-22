---
id: BUG-0139
type: bug
status: verifying
priority: P2
owner: desktop
requirement: REQ-0002
plan: PLAN-0020
source: RESEARCH-0035; user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0020]
related_tasks: [TASK-0357]
related_issues: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 插件HostedRoute能力在模块重载后未注册

## 用户流程与实际行为

正常受影响入口启动/加载/重载，出现Cannot grant unregistered capability；期望功能正常且失败可诊断、不会误报成功或污染其他运行。

## 环境与失败证据

Windows、本地Open Forge 0.1.3；dev/render/2026-10-21.log:48–131 共29条。证据来源与版本边界见[RESEARCH-0035](../research/RESEARCH-0035-fourteen-day-log-performance-audit.md)。仅日志证明发生，不提前宣称当前冷启动或唯一根因已复现。

## 最小复现与根因证据

待TASK-0357用隔离夹具验证正常入口与重载/失败路径。候选为制品布局/初始化代次/测试数据根或类型所有权；不通过真实用户状态试错。

## 影响

对应功能不可用、结果误判或日志诊断失真，严重度按优先级记录；未推断用户事故数。

## 回归测试

覆盖本Task合同中的正常→失败/重载→恢复流程，旧实现红/修复后绿；不弱化安全和原有错误/取消语义。

## 修复与验证

- 修复：待实施，关联TASK-0357。
- 测试/检查：待执行。
- 未运行：真实Desktop、Provider、SSH及发布不在当前授权中。

## 2026-10-22 TASK-0357 实现与隔离回归

同一document共享host/service/registration owner，initializer重评估替换闭包，整页reload自然建立新所有者；逐个登记保证部分失败可逆序回滚。真实宿主bind/open的模块重载与失败重试在旧实现复现两红→6文件12例绿。组合受资源竞争时beforeAll图谱加载超时，改为collection期静态导入，未放宽时限。

定向与独立复审通过；候选完整check通过，组合测试最终结果见PLAN-0020。相关Task为TASK-0357，本地main原子提交绑定；仍待真实用户流程验收，未发布。
