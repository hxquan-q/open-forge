---
id: BUG-0036
type: bug
status: verifying
priority: P3
owner: apps/desktop
source: verify:ui Dev Profile 实测（Agent Team 组队流程）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-09-25
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 组队草稿点击操作区外任意位置即静默丢弃，无确认、不可恢复

## 用户流程

- Given：智能体页点击「创建团队」进入组队态，已拉拢若干成员并填写团队名称；
- When：用户误点（或习惯性点击）成员卡片、`data-assembly-region` 标注区
  （头部按钮区 / 阵容栏 / 智能体列表）以外的任意空白位置；
- Then：应保留组队草稿，或在草稿非空时先确认再退出。

## 实际行为

- 页面级 `pointerdown` 监听命中操作区外任意元素即调用 `cancelAssembly()`：
  组队横幅消失、已拉拢成员与已填团队名称全部清空，无确认弹窗、无
  Toast、无撤销入口；
- 实机验证时一次指向「保存团队」的点击落空后草稿即被丢弃，从用户视角
  表现为「点了保存什么都没发生」，无任何反馈提示草稿已弃。

## 期望行为

- 草稿为空时允许点空白直接退出；
- 草稿非空（已有成员或已填名称）时点空白应先确认，或退出后保留草稿 /
  提供「恢复上次草稿」入口。

## 环境与失败证据

- 应用版本：dev main；OS：Windows。
- 代码证据：`apps/desktop/src/renderer/domains/agent-teams/components/AgentCenterView.tsx`
  第 48–62 行——`document.pointerdown` 命中非 `[data-team-card]` 且非
  `[data-assembly-region]` 即 `cancelAssembly()`，注释表明当前为有意设计
  （「点到操作区以外的任何地方都该收起来」），但未区分草稿是否为空。
- 实机证据：2026-09-25 verify:ui dev 实测，组队态下拉拢 2 位成员、填入名称
  「测试小队」后，一次点击未命中保存按钮 → 组队态静默退出、草稿全失；
  随后完整重走流程（重新拉拢 + 填名 + 保存）可正常创建，排除后端失败。

## 最小复现

1. 智能体页 → 创建团队；
2. 点击任意两位智能体卡片拉拢成员，填入团队名称；
3. 点击成员卡片区 / 头部按钮区以外的任意空白（如页面边距、分隔带）；
4. 组队态直接退出，草稿不可恢复。

## 影响

- 组队草稿是多点操作产物（选成员、命名、可能含任务书编辑），一次误点
  全丢，重填成本高且无任何提示说明发生了什么；
- 与删除确认对话框（「此操作无法撤销」）的防误触标准不一致：删除有确认，
  丢弃草稿反而没有。

## 根因证据

有意设计的行为（代码注释自述），根因是取消路径未按草稿空/非空分级：
空草稿点空白退出合理，非空草稿复用同一无确认路径。置信度高——代码与
实机现象一致。

## 回归测试

- 草稿非空时对 `document` 派发操作区外 `pointerdown` → 组队态保留或弹出
  确认；草稿为空时同样操作 → 组队态退出。两条断言分别钉死分级行为。

## 修复方向

1. 非空草稿 + 操作区外点击 → 复用现有确认对话框确认后退出；
2. 退出后把草稿存入会话级暂存，重新进入组队态时提示恢复；
3. 最小改动：仅空草稿允许点空白退出，非空草稿只能经「退出组队」按钮
   显式放弃。

## 修复与验证

- 采用修复方向 1：非空草稿 + 操作区外点击 → 复用现有确认对话框确认后退出。
  - `team-assembly.ts` 新增 `assemblyBaseline()`（新建草稿的种子是空草稿，编辑
    草稿的种子是按当前团队重放的快照）与 `sameAssemblyDraft()`（trim 后等价
    视为未改动；成员顺序按序比对，因为顺延队长取首位）。
  - `useAgentCenterModel` 基于二者导出 `assemblyDirty`：种子找不到对应团队
    （已被删除）时按脏处理，交给确认而不是静默丢。
  - `AgentCenterView` 的 `pointerdown` 分级：干净草稿点空白照旧直接退出；
    脏草稿改为回调 `onDiscardAssemblyDraft`，由 `AgentCenterPage` 经既有
    `confirmDialogAtom` 弹危险确认，确认后才 `cancelAssembly()` + 清除选中。
  - 中英文案：`center.discardAssemblyTitle/Message/Confirm`。
- 回归测试：
  - `team-assembly.test.ts`：种子比对（新建/编辑/种子缺失）、空白输入不算
    改动、阵容/队长/任务书实质改动判脏。
  - `useAgentCenterModel.test.tsx`：新建拉拢成员转脏、编辑草稿移出再拉回
    同一成员恢复干净、改名转脏。
  - `AgentCenterView.test.tsx`：干净草稿点空白照旧退出；脏草稿点空白回调
    确认而非直接 `cancelAssembly`（该用例已对旧实现验证为红）。
  - `AgentCenterPage.test.tsx`：连接层触发确认框，确认后才退出组队并清选中。
- 验证：`run-vitest.mjs` 定向 4 文件 32 用例与 `agent-teams/` 目录 79 用例全绿；
  `check:quick` 通过。真实路由级 UI 验证（verify:ui）未运行，待验收时复核。
