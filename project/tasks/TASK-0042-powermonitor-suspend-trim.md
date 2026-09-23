---
id: TASK-0042
type: task
status: draft
priority: P2
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-8
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main, apps/desktop/src/main/conversations, apps/desktop/src/main/agent-teams]
write_paths: [apps/desktop/src/main, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# powerMonitor 定向清理：suspend/lock-screen 免费收缩点

## 目标

powerMonitor 目前只用 resume 信号（auth/updater/pet-idle-guard）。suspend/lock-screen 是「用户必然无感」的免费清理点：对非热窗口做主动收缩——idle 会话降级驱逐、此刻一次性 working-set trim（唯二被认可的 trim 时机），resume 时懒回填。

## 范围

### 并发评估

- 结论：支持——主进程生命周期 + 驻留管理，与其他任务无写路径交集；P2 防御性收益，排队即可。

### 做

- suspend/lock-screen 事件 → 非热驻留收缩（idle resident 降级、隐藏 webview/窗口内容驱逐）；
- 仅在此刻允许一次性 working-set trim（RESEARCH-0004 否决项的唯一例外窗口）；
- resume → 懒回填，不在 resume 路径做同步重建；
- suspend/唤醒前后 PerfMonitor 快照记录峰谷差。

### 不做

- 不做定时/空闲主动 `EmptyWorkingSet`（伪优化，仅在 suspend/lock 事件点例外）；
- 不改磁盘持久化与驻留上限参数；
- resume 后不阻塞首帧。

## Given / When / Then

- Given：应用开着多个会话与隐藏窗口
  When：系统 suspend 或锁屏后解锁
  Then：锁屏期间非热驻留被收缩，resume 后按需懒回填；用户无感、无数据丢失、无交互卡顿

## 必须保持

- 收缩只释放热驻留/隐藏进程，不动持久化；
- resume 路径懒加载，不引入同步重建停顿；
- 驱逐对象均可透明重建（URL/状态已在 atom 或磁盘）。

## 测试与验证

- 定向测试：模拟 suspend/lock-screen 事件后驻留计数与进程计数断言；
- 用户流程：多会话+浏览器页签开着→锁屏→解锁→继续操作无感；
- 质量检查：`check:quick`；PerfMonitor suspend 前后快照对比。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
