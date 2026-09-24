---
id: BUG-0020
type: bug
status: done
priority: P2
owner: apps/desktop; packages/coding-agent
source: user-report
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 同一会话中的 Canvas 操作连续被通道占用错误拒绝

## 用户流程

- Given：用户在一个会话中请求 Agent 创建或更新 Canvas 内容。
- When：同一会话连续触发两次 Canvas 操作。
- Then：若操作可安全串行，应排队并依次完成；若不允许并发，应返回明确可恢复状态，不能让后续有效操作无条件失败。

## 实际行为

用户报告两次 Canvas 操作均被拒绝，错误内容为“Canvas 通道在当前会话被占用”。目前没有附带会话事件、请求 ID 或两次调用之间的时间间隔，无法判断是第一项操作仍在运行、锁未释放，还是合法的串行请求被错误拒绝。

## 期望行为

同一会话的 Canvas 调用应遵循明确的并发合同：安全操作可串行完成；冲突写入应保留冲突检测并给出可重试反馈；成功或失败后的通道锁都应及时释放。

## 最小复现

1. 在同一会话中请求 Agent 执行一项 Canvas 创建或更新操作。
2. 第一项完成后立即再次请求 Canvas 操作；若第一项仍运行，记录两次操作的重叠关系。
3. 检查第二项结果、通道占用状态及第一项终态后的恢复行为。

## 影响

用户无法完成连续 Canvas 请求；若拒绝来自未释放的占用状态，当前会话可能持续无法使用 Canvas。

## 根因证据

- 当前源码检索未找到错误文案“Canvas 通道在当前会话被占用”，因此尚未定位负责拒绝的锁/调度实现。
- `packages/coding-agent/src/features/artifacts/artifact-tool.ts:23` 注册 Canvas artifact 工具入口；Desktop 侧 `apps/desktop/src/main/artifacts/canvas-artifact-service.ts:90` 管理 artifact 服务，但现有证据不能证明这两处就是该通道占用错误的发出位置。
- 当前工作区已有未提交的 Canvas 相关实现与测试变更；调查应在保留这些改动的前提下追踪完整调用链，不得覆盖或回滚它们。

根因置信度：低；两次拒绝由用户报告确认，锁所有权、串行语义与释放时机未知。

## 回归测试

- 已补充（均先红后绿）：
  - `apps/desktop/src/main/artifacts/canvas-artifact-service.test.ts`：同一 artifact 的两次并发 `applyUpdate`（模型并行工具调用、用户与 Agent 同时保存的形态）都必须完成，版本序列 `[1, 2]`、最新内容有效。
  - `packages/toolkit/test/atomic-write.test.ts`：24 个并发写同一目标文件全部成功、无 `.tmp` 残留。

## 修复与验证

- 根因：不存在所谓「Canvas 会话通道锁」。拒绝来自文件层原子写的临时文件命名——旧实现临时名只带 pid（`<target>.<pid>.tmp`），同一进程内并发写同一版本文件会共用同一临时路径：先完成的一方 rename 把路径搬走，后写方 rename 直接 ENOENT；Windows 上第二个仍打开的句柄会让 rename 以 EPERM/EBUSY 失败（「文件被占用/正在使用」）。误差以「通道被占用」形式暴露在连续 Canvas 操作上。
- 修复（`packages/toolkit/src/atomic-write.ts`）：临时文件按调用的 pid+序号唯一命名；同进程内对同一目标路径的异步写串行排队，重叠 rename 不再互相冲掉；跨进程仍依赖唯一临时名与调用方协调。文档注释同步说明该约束。
- 提交：测试 `590fa67a1` + 修复 `a771f6c1f`（分支 `worktree-agent-ae8aa7e4727ba35e8`，待集成）。
- 测试：desktop 两文件 26/26、toolkit 1/1 通过；红测实证：回退修复源码后 toolkit 用例 1/1 失败。
- 检查：12 个变更文件 `bun run check:quick` 全绿。
- 未运行及原因：未实机复现「连续两次 Canvas 操作」的完整 UI 流程——未获 UI 验证授权；文件层并发与 Canvas 服务层并发两条合同均已覆盖。
- 剩余风险：跨进程并发写同一 artifact 不在本次串行化范围（现有调用均在 Desktop 主进程内）；若未来引入多进程写路径需另评估。
