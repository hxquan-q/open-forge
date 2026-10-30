---
id: BUG-0158
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: TASK-0407 / code-mode-audit-2026-10-30 §四 F01/F02（含 F02b）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0414]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 新建 code 会话的布局初始化身份与次数错误

## 用户流程

- F01：已处 code 会话并手动改过布局，从版块再次新建同项目 code 会话 → 应重新初始化（左收右开对半分）。
- F02：新会话页初始化后手动调整布局，发送首条消息经路由过渡到会话提交 → 手动选择应保留（同一创建只初始化一次）。
- F02b：从 work 会话打开**已有** code 会话 → 不应初始化。

## 实际行为

- F01：`active` 保持 true，无 false→true 边沿 → 不初始化，沿用旧布局。
- F02：过渡中 active 真假真抖动 → 同一创建被当两次进入，手动布局被覆盖回 `{收左,开右,628}`。
- F02b：false→true 边沿 → 既有会话打开也被初始化。

## 环境与失败证据

- 基线 `98f7de9e6`；独立探针复现（TASK-0407 §四 F01/F02/F02b）。
- 根因：`useCodingSessionLayout` 的初始化绑定 `useCodingLayoutActive()` 布尔边沿（`prevRef` 只记布尔），创建身份缺失（`useCodingSessionLayout.ts:63-84`）。

## 最小复现

见三条用户流程（探针 `code-mode-behavior.probe.log`）。

## 影响

版块最常走的演示开场路径布局不可预期（P1）；无数据损坏。

## 根因证据

报告 §11.1 复核一致。

## 回归测试

- 意图红 3：连续新建各自初始化（F01）；首条消息过渡后手动布局保留（F02）；打开既有 coding 会话不初始化（F02b）。
- 保留现状：团队路由与新会话页（开发档）边沿初始化；离开不回写。
- 创建入口：`beginCodingSessionCreation` 写档并登记意图（Allstar model 断言）。

## 修复与验证

- 修复：`workspace-mode-atoms.ts` 新增 `codingSessionCreateIntentAtom`（cwd+nonce）与 `beginCodingSessionCreation(cwd)`（写 coding 档 + 登记意图）；Allstar `onStartNewSession` 改走该入口。`useCodingSessionLayout` 判定改返回语境（session/team/new-session/null），初始化分两路——意图驱动（nonce 消费一次，贯穿新会话页到会话提交）+ 边沿驱动（仅 team 与 new-session 语境保留）；已提交 coding 会话不再走边沿（F02b）。
- 测试：布局套件整文件红 7（新语义含意图原子不存在时的收集态）→ 绿 7/7；Allstar 模型意图断言通过（8/8）；相邻面（Allstar View、entry-points、sidebar workspace-view、workspace-mode-atoms、nav-prefetch）39/39。
- 检查：`check:quick` 通过（ratchet new=0）。完整 check 留批次收尾。
- 未运行及原因：实机三条流程（连续新建/首条消息/打开既有）待用户人工验收；团队创建意图不在本片（保留边沿现状）。
