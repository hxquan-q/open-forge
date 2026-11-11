---
id: PLAN-0031
type: plan
status: verifying
priority: P1
requirement: REQ-0033
owner: desktop
created: 2026-11-10
updated: 2026-11-11
related_requirement: [REQ-0033]
related_tasks: [TASK-0482]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Windows 电脑操作实施

## 背景与事实

用户已授权主仓实施，要求安装即可使用；现有 winhands 0.4.1/MIT 位于工作区外，仅作只读参考。实际主仓从干净 `chenxvhua` 的 `dafb0520d15c6cf29403f56aa6c41a567a1f942f` 建立独立分支，既有分支和远端保持不变。执行 Task：TASK-0482。

## 候选方案与取舍

1. 用户配置外部 Python/winhands：成本低，但违反用户确定的开箱可用合同，不采用。
2. 随包私有后端，复用 winhands：采用；先核实 MCP 的图像、权限、取消与生命周期，适用则复用，不另造 Agent Loop。
3. 重写 UIA/物理输入引擎、虚拟机/独立桌面：首版不采用。

Windows 原生窗口管理与 Vetta 显示由 Desktop 所有。任意 Python run 无法提供仅观察/窗口级权限，因此正式暴露的执行合同必须按观察/后台动作/物理输入明确分层，不能靠扫描 Python 字符串宣称隔离。后端适配和打包方式以源码调查后记录的 ADR 为准。

## 阶段与依赖

1. 随包后端和确定性协议：版本/依赖/许可、资源定位、构建阻断、进程与图像/错误/取消。
2. 宿主控制：默认关闭、会话授权、输入独占、暂停/接管/停止、目标实例身份及隐藏恢复台账。
3. 产品入口：独立页面、用户可识别目标/会话选择、Vetta 显隐置顶、托盘停止/找回、必要快捷键。
4. 连续流程/组件/打包验证、独立只读审查、根 check、发布说明与验收包。

同一共享写域串行实施，调查和最终只读评审可独立进行。没有并行实现 Worker，不新建主仓外 Worktree。

## 验证与回滚

边界使用 fake transport、窗口适配器和可控同步点；测试数据/缓存/构建产物仅写主仓或授权工作区的专用临时目录。运行仓库 Node Vitest runner、test:impact 或 test:changed、check:quick 及完整 check；后端本机仅跑无桌面访问的合同/依赖自检。不得为检查启动用户实例或真实付费 Provider。

默认关闭，无用户配置迁移；回滚功能分支原子提交即可停用新入口；隐藏台账不能在回滚前无条件删除，应先恢复受控窗口。未获授权不执行真实桌面恢复。

## 升级信号与 ADR

现有 MCP 若不能在执行前强制权限、撤销阻断或等待真实进程停止，记录具体缺口再采用受管适配；不静默放宽安全边界。随包运行时、结构化执行与隐藏兼容策略已记录 [ADR-0154](../../docs/adr/0154-windows-computer-use-bundled-backend.md)。后端/安装包构建成功和真实桌面验收必须分别记录，不相互替代。
