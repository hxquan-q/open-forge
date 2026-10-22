---
id: BUG-0137
type: bug
status: blocked
priority: P1
owner: desktop
requirement: REQ-0002
plan: PLAN-0020
source: RESEARCH-0035; user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0020]
related_tasks: [TASK-0352]
related_issues: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 安装版Windows沙箱二进制缺失或定位失败

## 用户流程与实际行为

正常受影响入口启动/加载/重载，出现sandbox unavailable / binary_not_found；期望功能正常且失败可诊断、不会误报成功或污染其他运行。

## 环境与失败证据

Windows、本地Open Forge 0.1.3；default/main/2026-10-21.log:1522。证据来源与版本边界见[RESEARCH-0035](../research/RESEARCH-0035-fourteen-day-log-performance-audit.md)。仅日志证明发生，不提前宣称当前冷启动或唯一根因已复现。

## 最小复现与根因证据

待TASK-0352用隔离夹具验证正常入口与重载/失败路径。候选为制品布局/初始化代次/测试数据根或类型所有权；不通过真实用户状态试错。

## 影响

对应功能不可用、结果误判或日志诊断失真，严重度按优先级记录；未推断用户事故数。

## 回归测试

覆盖本Task合同中的正常→失败/重载→恢复流程，旧实现红/修复后绿；不弱化安全和原有错误/取消语义。

## 修复与验证

- 修复：待实施，关联TASK-0352。
- 测试/检查：待执行。
- 未运行：真实Desktop、Provider、SSH及发布不在当前授权中。

## 2026-10-22 核查结论

复核对应既有[BUG-0022](BUG-0022-desktop-sandbox-mode-unavailable.md) / TASK-0159的受控制品缺失（链接以仓库实际同号文件为准）。sandbox/bin不存在；清单sourceCommit和三份SHA-256均为null。用户确认尚无可信来源。当前安全阻断符合预期，本轮没有沙箱产品代码修复；继续由TASK-0352等待来源，不能记作已完成。
