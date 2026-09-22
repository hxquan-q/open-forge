---
id: TASK-0007
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: current desktop performance changes and release notes
created: 2026-09-22
updated: 2026-09-22
depends_on: [TASK-0004]
---

# Desktop GPU 低功耗验证

## 目标

验证流式回复、后台窗口、新会话页、桌宠、画布和装饰件的动效降频/暂停/静态 fallback 不会破坏用户可见状态。

## 验收

- 前台/后台切换能暂停和恢复循环动效；
- 流式文本、工具状态、终态和输入不受影响；
- WebGL context、帧耗时和 GPU 使用有基线；
- 降级不是只隐藏 loading，而是资源实际停止或受控；
- macOS/Windows 至少有定向验证计划。

当前只记录验证需求，不宣称已有完整硬件实测通过。
