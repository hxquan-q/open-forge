---
id: BUG-0061
type: bug
status: investigating
priority: P1
owner: ssh-transport
source: TASK-0172 deferred probe experiment
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0169, TASK-0172]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 失效后的迟到 SSH 探测会恢复旧连接状态

## 用户流程

Given：某主机正在连通性探测；When：用户修改或删除主机，宿主调用 invalidate，随后旧探测返回；Then：旧代次结果不能覆盖失效后的状态或新配置的探测结果。

## 实际与期望行为

实际事件序列为 `connecting → disconnected → connected`。期望旧 probe 不再改变当前代次状态；更新后的状态只能由新代次操作确定。

## 环境与失败证据

2026-10-02，Windows / Node v26.3.1，基线 `c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa`。通过 Node VM 执行转译后的真实 `ssh-connection-manager.ts`，仅用可控的 SshConnection 替身返回 deferred probePlatform Promise；无需文件 I/O 或 SSH 服务器。

实际输出：

```json
{"afterInvalidate":"disconnected","afterOldProbe":"connected","events":["connecting","disconnected","connected"]}
```

## 最小复现

1. 实例化真实 SshConnectionManager；resolveHost 返回测试主机，替身 probePlatform 返回未兑现 Promise，onStatusChanged 记录状态。
2. `const pending = manager.probe("probe")`。
3. `manager.invalidate("probe")`，此时 getStatus 为 disconnected。
4. 兑现旧 probePlatform Promise，然后 await pending。
5. getStatus 变回 connected。若旧 Promise 拒绝，当前源码同样会无代次检查地进入 unverifiable 分支（该拒绝分支为源码推导，本轮没有实跑）。

## 根因、影响与置信度

`probe()` 在 await 前后没有 host/连接代次核验；`invalidate()` 只删除连接 Map 并广播 disconnected。宿主 ssh-host-service **已调用 invalidate**，不是漏接按钮/服务调用。源码和成功迟到探针共同确认状态覆盖，置信度高；不据此宣称实际远端已连接、命令重放或用户数据泄漏。

## 回归测试

归入已有 [TASK-0169](../tasks/TASK-0169-ssh-connection-lifecycle.md)，不新造重复生命周期任务。新增延迟成功、延迟失败、新旧探测交错、删除/同 target 重建测试，并按真实 runner/manager 边界验证资源失效。

## 修复与验证

未修复；只实跑成功迟到的最小状态实验。真实 ssh2 池失效、在途握手与转发释放尚待 Task 回归，不使用用户主机做验证。
