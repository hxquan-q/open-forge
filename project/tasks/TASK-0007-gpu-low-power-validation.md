---
id: TASK-0007
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: current desktop performance changes and release notes
execution: parallel
branch: forge/dev
worktree: unassigned（直接在 forge/dev 主工作区执行）
base_commit: forge/dev
read_paths: [apps/desktop, packages/plugins/presets/vetta-ui-design]
write_paths: [apps/desktop, packages/plugins/presets/vetta-ui-design]
exclusive_paths: []
depends_on: [TASK-0004]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-22
---
<!-- Copyright The Open Forge contributors. -->

# Desktop GPU 低功耗验证

## 目标

验证流式回复、后台窗口、新会话页、桌宠、画布和装饰件的动效降频/暂停/静态 fallback 不会破坏用户可见状态。

## 验收

- 前台/后台切换能暂停和恢复循环动效；
- 流式文本、工具状态、终态和输入不受影响；
- WebGL context、帧耗时和 GPU 使用有基线；
- 降级不是只隐藏 loading，而是资源实际停止或受控；
- macOS/Windows 至少有定向验证计划。

## 实施摘要（2026-09-22）

- 五条验收逐条绑定代码与测试证据，落盘 [`../verification/VERIFY-0002-desktop-gpu-low-power.md`](../verification/VERIFY-0002-desktop-gpu-low-power.md)。
- 补齐画布流体资源门控的回归测试（`vetta-ui-design/test/fluid-canvas.test.ts` 新增 4 用例）：
  共享循环 ≤24fps 节流（帧耗时受控）、IntersectionObserver 视野外跳过并可恢复、
  `.vetd-interacting` 缩放/平移期间跳过、reduced-motion 只画一帧不进循环。
- 其余路径由既有测试覆盖并全部复跑通过：失焦暂停（7）、步进指示器（5）、
  流式文本（9）、frame 活动态（12）、装饰件回落（10）、输入占位轮播（2）、
  离屏停绘与 deadline（2+5）、性能快照（8）、桌宠命中降频（2）。
- WebGL 事实：仅终端活动格可选 webgl2（非活动格退 canvas、丢失不重试），
  装饰件/画布流体均为 2D canvas 或静态；空闲会话 WebGL context 数为 0。
- `check:quick` 通过。未运行：Electron 实机 E2E / `verify:ui:*`（需用户授权且无 UI 行为变更）、
  macOS 硬件实测（本机为 Windows；定向计划与判定标准已写入 VERIFY-0002）。