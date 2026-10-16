---
id: BUG-0119
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: RESEARCH-0027; WebContents MaxListenersExceededWarning 与 trackOwner 源码核对
related_requirement: []
related_plan: []
related_tasks: [TASK-0276]
related_issues: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 终端 owner 与事件订阅的生命周期监听器未成组解绑

## 用户流程

- Given：同一 Desktop WebContents 打开终端。
- When：页面导航释放 owner，随后再次打开终端；或反复打开并关闭终端。
- Then：期望旧 owner/订阅监听器被释放；当前实现保留尚未触发的监听器，重复注册后产生超限警告。

## 实际行为与期望行为

2026-10-12 14:23:38 dev/main/2026-10-12.log:1333–1343 报 11 个 destroyed 监听器，栈指向 trackOwner。同一警告被 console 与 diagnostics 各记一次，不是两次独立故障。期望导航、崩溃、关闭及模块 teardown 时解除同组监听，保持 PTY 回收语义。

## 环境与失败证据

Windows dev；当前源码 HEAD a4ccf2938。`apps/desktop/src/main/ipc/terminal.ts:85` 的 trackOwner 为 destroyed/did-navigate/render-process-gone 各注册 once。release 只删 Set 与 disposeOwnedBy，不移除另外两个监听；导航清掉 Set 后再次 open 又注册。attachSubscription 也为 destroyed/did-navigate 注册 unsubscribe，但无配对解绑，CLOSE 仅 dispose terminal。

## 最小复现

待隔离 IPC/WebContents 测试模拟正常 OPEN → did-navigate → OPEN 多轮，观测 listenerCount 不应递增；另覆盖 OPEN → CLOSE 的订阅释放。日志与现行源码支持缺陷，尚未执行该隔离复现，不声称已量化内存泄漏。

## 影响与根因证据

P2，监听闭包保留、重复清理与告警；不据此认定是另一次 Renderer 崩溃的原因。相关历史 `1f2a7a524`、`0710cd6a1`（2026-09-21）引入终端订阅及崩溃回收，目标文件未检索到后续修复监听成组解绑的提交。置信度：清理缺口高，具体保留量与用户触发次数待验证。

## 回归测试

通过公开 IPC handler 的受控 WebContents/终端服务替身，覆盖导航后重开、显式关闭、renderer 崩溃及 unregister；断言监听数量有界、旧订阅不再转发且 PTY 被正确回收。不得通过提高 MaxListeners 上限掩盖。

## 修复与验证

- 修复：未实施；本轮只分析并立案，无实施 Task。
- 验证：保留日志栈与现行生命周期接线核对。
- 未运行：隔离回归、完整 check、真实用户终端操作；当前请求为日志调查。
- 关联调查：[RESEARCH-0027](../research/RESEARCH-0027-dev-log-audit.md)。
