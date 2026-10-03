---
id: BUG-0072
type: bug
status: verifying
priority: P1
owner: desktop
source: RESEARCH-0022; TASK-0191 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0191]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 自动跟随中的半途滚动位置被错误记住

## 用户流程与复现

列表正在跟随最新消息且高度仍在测量，离开再打开会话。应该继续定位尾部；旧实现恢复半途 scrollTop=120 并关闭跟随。

## 环境与证据

Open Forge 0.1.3 / Windows / jsdom；Node runner + Desktop config 的 useMessageFeedScrollModel.test.tsx，active=false/true 两个新用例失败，14 个既有用例通过。失败明确为 restoreStateFrom 半途快照与 followOutput=false。

## 根因、影响与回归

captureState 无条件缓存跟随期间的位置。只在读者主动浏览历史时保存，并在跟随期间清除缓存。已有缓存回归保留所有断言，补 wheel 输入以明确它测试的是主动浏览，而非程序跟随；firstItemIndex 分页偏移不变。

## 修复与验证

见 TASK-0191/TASK-0187；未启动真实 UI，不将组件测试等同于实机体验接受。
