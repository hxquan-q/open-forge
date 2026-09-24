---
id: BUG-0022
type: bug
status: investigating
priority: P1
owner: apps/desktop; packages/runtime-node
source: user-report; screenshot; source inspection
related_requirement: []
related_plan: [PLAN-0001]
related_tasks: [TASK-0016, TASK-0019]
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 当前环境无法启用沙盒执行模式

## 用户流程

- Given：用户在本机项目中创建或继续会话，并希望以受限沙盒运行命令。
- When：用户打开输入区的执行模式选择器并尝试选择“沙盒受限”。
- Then：受支持的本机环境应能启用沙盒；若当前安装确实不具备沙盒能力，应显示明确原因和可恢复指引，不能让用户误以为权限隔离已经生效。

## 实际行为

用户报告此前讨论的权限与沙盒没有实现。截图中“沙盒受限”选项灰显不可选，“完全访问”处于选中状态。截图没有展示禁用提示/沙盒探测结果，因此无法判断是缺少 Windows sandbox host、能力探测失败，还是安装包未包含所需组件。

## 期望行为

受支持的 Desktop 安装应提供可工作的本机沙盒模式；不可用时，产品应明确告知原因和实际执行模式。沙盒模式与逐工具审批应分别呈现，不能把“完全访问”误解为仍有路径隔离。

## 最小复现

1. 在当前 Windows Desktop 本机项目中打开输入区的执行模式选择器。
2. 尝试选择“沙盒受限”。
3. 记录 `window.vetta.config.get()` 返回的 `sandbox.status/reason/details`、host binary 探测结果和应用安装类型；确认沙盒选项为何被禁用。

## 影响

用户无法选择受限执行模式，且当前会话显示为“完全访问”；在原因解释不足时，用户可能错误判断命令执行的隔离边界。优先级为 P1，直到验证当前执行路径和安全提示。

## 根因证据

- `apps/desktop/src/renderer/domains/conversation/hooks/useExecutionModeSelectorModel.ts:70` 查询主进程沙盒能力；`:83-105` 在沙盒不可用或远程项目时禁用该选项，并以完全访问作为有效模式。
- `apps/desktop/src/main/sandbox/capability.ts:325` 探测 Windows sandbox host；缺少 host 或其能力不足会返回 `status: "unavailable"`，`:351-361` 对缺失的强制隔离能力 fail closed。
- `packages/runtime-node/src/sandbox/commands/windows-host.ts:46` 解析 Windows host 路径；仓库实现依赖可解析的 host binary，不能仅凭 Renderer 中的选项断言沙盒功能完全不存在。
- `TASK-0016` 的交付记录包含 L0-L4 Tool Risk/Approval、Project Trust 与 Desktop 审批 UI；这是逐工具授权，不等同于操作系统/进程沙盒，也不能证明当前会话的每项操作都已通过真实端到端验证。
- 当前未取得用户这台实例的 sandbox capability 快照或 host 探测日志，具体不可用原因未确认。

根因置信度：中；禁用选择器的行为由截图与代码共同确认，具体安装/探测失败原因待收集。

## 回归测试

- 尚未新增。定位后覆盖受支持本机环境启用沙盒、能力缺失时清楚说明且不能误选、远程项目不可用时仍保持明确提示；执行边界需由 Runtime/host 集成合同验证，不能只测 Renderer 选项状态。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
