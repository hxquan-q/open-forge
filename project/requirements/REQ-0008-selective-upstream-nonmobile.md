---
id: REQ-0008
type: requirement
status: ready
priority: P1
owner: coordinator
source: user-request
created: 2026-10-02
updated: 2026-10-28
related_plan: [PLAN-0014, PLAN-0025]
---
<!-- Copyright The Open Forge contributors. -->

# 保留 Open Forge 差异的非手机上游能力适配

## 用户问题与结果

用户希望获得原始 Vetta 的非手机改进，但直接覆盖会丢失 Open Forge 已有功能、兼容行为与正在进行的工作。结果应是可独立验证/回滚的适配，而非版本号或整仓同步。

## 范围

择优引入稳定性、模型兼容、资源/MCP/团队准备、目标模式、消息展示、项目工具与 Windows 沙盒完整性；逐项判定 adopt/adapt/retain/defer。实施依赖与文件证据以 [PLAN-0014](../plans/PLAN-0014-selective-upstream-nonmobile.md) 为准。

2026-10-28 新增“MCP 重试 → 画布卡顿、闪白修复 → 真实图片素材 → 设计方向与质量检查”串行批次，见 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md)；本次仅立项，尚未实施。

## 不做什么

不移植手机协作、移动端、P2P/中继/远程桌面；不重置品牌、版本、凭据或用户状态；不削弱质量/安全规则；不发布、上传或调用真实 Provider/用户主机。纯装饰变更不替换既有设计。

## Given / When / Then

- 已有 Open Forge 项目、配置、会话和定制 → 采用一项上游能力 → 原有数据、权限、错误/取消/usage/stop 与用户流程保持，新行为有测试证据。
- 工作区存在用户/其他 Agent 修改 → 调查并实施 → 只在明确归属范围写入；并行时使用独立 Task Worktree，不夹带提交。
- 更新涉及共享协议/存储 → 实施 → 先检查生产者、消费者及兼容路径，不能靠删功能或放宽校验通过检查。

## 必须保持与验收

保留 Windows ssh2、原子写队列、MCP 延迟/回收、历史窗口化、团队唤醒/审批和独立发布身份。每个 Task 先记录合同再实现，区分工程完成、集成、人工接受与发布。错误复现、定向/影响面测试、完整检查及剩余风险必须可追溯；没有执行的验证不算通过。

## 风险与失效条件

持续变化的主树不能作为固定验收快照；上游提交号、主树 HEAD、公开接口或既有差异变化后重新核对，不自动沿用以前的适配结论。
