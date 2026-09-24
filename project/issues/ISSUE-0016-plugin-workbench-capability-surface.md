---
id: ISSUE-0016
type: issue
status: draft
priority: P2
owner: packages/plugins/apps/desktop
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop `plugin-sdk` contributes.views/widget/services/bus 对照）
created: 2026-09-24
updated: 2026-09-24
related_tasks: []
depends_on: [RESEARCH-0010]
---
<!-- Copyright The Open Forge contributors. -->

# 插件「住进工作台」能力面扩展（panel 视图 / widget / 常驻服务 / 总线）

## 背景与已知事实

- RESEARCH-0010 §3 证实：PI-Desktop 插件 manifest `contributes` 覆盖 views（嵌进 work-panel 列的隔离页）、`ui.shape:"widget"`（透明无边框悬浮窗）、services（≤4，utilityProcess 常驻，broker 统一生命周期）、bus{publish,subscribe}（声明式 topic，payload 是数据不是能力）。
- 本仓库 plugin-sdk 现状（`packages/plugins/plugin-sdk/src/`）：
  - **已有**：13 个 `ui.slot.*` 贡献点（`workspace-view` 路由级整页、`activity-tab`、`bottom-panel`、`message`、`tool-call`、`turn-card` 等）+ `service-provider.ts` 外部服务 7 态生命周期 + `app.actions.register`（插件提供桌面 action）+ `agent.*` 深能力面；
  - **没有**：work-panel **列内嵌**视图（现有 `workspace-view` 是整页路由不是列内）、floating widget 贡献点、声明式常驻服务 manifest 面、插件↔插件 pub/sub 总线。
- 约束：插件容器格式已定 `.vettapkg`（ADR-0121）+ Module Federation React 组件体系，不引第二格式；悬浮 pet 窗口是第一方功能（`pet-window.ts`，已下线保留接口）。

## 未决问题

1. 四项能力是否都要、按什么顺序：panel 列内嵌视图最接近现有 `activity-tab`/panel 体系；widget/services/bus 是新表面。
2. panel 列内嵌视图与现有 `workspace-view`（整页路由）如何分工：并存两种形态还是收敛？
3. floating widget 的窗口模型：独立 BrowserWindow（仿 pet）还是 renderer 内浮层；权限与降级语义。
4. pub/sub bus 的权限模型：PI 的「manifest 声明 topic、broker 路由、发布者不回环、payload 是数据不是能力」是否照搬；与 `app.actions`（插件已可注册/调用 action）的分工。
5. 每项扩展与 `PLUGIN_API_VERSION`、manifest Schema、ADR-0121 的同步要求。

## 候选方案及取舍

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 逐项独立立项（推荐） | 每项独立 Requirement+ADR，按价值排序落地；views 先行（最接近现状） | 四项四个周期，生态能力补齐慢 | 单项设计被后续项推翻的概率低 |
| B 一次性扩 manifest 贡献面 | 一次对齐 PI 全貌 | 大合同变更；widget/services/bus 的宿主进程模型未验证 | 过早固化，回归面大 |
| C 不扩展，引导插件走 workspace-view+app.actions 现有面 | 零成本 | 与「插件是工作台一部分」的生态方向有差距 | 生态诉求积累后补课成本更高 |

## 推荐方案

A：按 views → services → bus → widget 顺序逐项评估立项。views 复用现有 slot/panel 体系增量最小；services 可在 `service-provider.ts` 生命周期上加 manifest 声明面；bus 需独立权限设计；widget 放最后（窗口模型最重）。

## 决策触发条件

- 用户确认插件生态要向「工作台一部分」方向演进；或
- 出现具体插件需求（如数据库面板、CI 状态推送、语音常驻服务）需要其中某项能力。

## 后续可能拆出

- Requirement/ADR：panel 列内嵌视图贡献点（`ui.slot.*` 新增或扩展）；
- Requirement/ADR：声明式常驻服务（manifest `services` + 复用 service-provider 生命周期）；
- Requirement/ADR：插件 pub/sub 总线（topic 声明、broker 路由、权限边界）；
- Issue 或 Requirement：floating widget 窗口模型评估。
