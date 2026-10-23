---
id: BUG-0148
type: bug
status: fixed
priority: P1
owner: apps/desktop
source: VERIFY-0022 R4（2026-10-23 复核）
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0027]
related_tasks: [TASK-0390]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 设置页保存的记忆策略没有进入普通新建与恢复会话

## 现象

`MemoryControlService.setPolicy` 持久化 settings.json，但 `resolveDesktopSessionConfig` 仅透传显式 `config.memoryPolicy`；正常新建/恢复不读取保存值，`createDesktopExplicitMemoryRuntime` 遇 undefined 退出——设置页启用后普通会话仍无记忆 Feature。

## 修复合同

- 宿主（主进程）在普通新建与恢复时读取保存的策略、解析身份/预算并注入 session 配置；不依赖 Renderer 自述。
- 覆盖 off/explicit/automatic 与策略切换；显式传入的 config.memoryPolicy 优先于保存值。
- 旧 memoryMode/rollover 路线不受影响（ADR-0149 正交）。

## 回归要求

设置启用→普通新建→记住→退出→恢复→召回的连续入口测试；策略切换与会话隔离。

## 处置记录

- 2026-10-23：TASK-0390 修复完成——宿主策略入口 policy-entry（设置读取/降级/显式优先）接入 desktop-conversation-service 单一 resolve 路径（新建与恢复共用）；policy-entry 5 例全绿。
