---
id: VERIFY-0002
type: verification
status: done
owner: apps/desktop/packages/plugins
source: TASK-0007（REQ-0002 / PLAN-0002 第一阶段第 7 项）
created: 2026-09-22
updated: 2026-09-22
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_task: [TASK-0004, TASK-0007]
related_bug: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop GPU 低功耗策略验证

## 被验证的合同

v0.5.59 的动效降频/暂停/静态 fallback 不得破坏用户可见状态。按 TASK-0007 的五条验收逐条绑定证据。

1. 前台/后台切换能暂停和恢复循环动效。
2. 流式文本、工具状态、终态和输入不受影响。
3. WebGL context、帧耗时和 GPU 使用有基线。
4. 降级不是只隐藏 loading，而是资源实际停止或受控。
5. macOS/Windows 至少有定向验证计划。

## Given / When / Then

- Given 主窗口已安装 `installInactiveWindowAnimationPause`（`apps/desktop/src/renderer/main.tsx:22`）
  When 用户切到别的应用或窗口被完全遮住，再切回
  Then 仅 `iterations: Infinity` 的动画暂停/恢复；有限动画（入场/退场）不被动；CSS 动画只经样式暂停（`styles.css` 的 `data-inactive-paused` 规则），脚本动画 pause()/play()；标记 `data-animate-when-inactive` 的元素继续动。
- Given 模型正在流式输出
  When 进行中指示器（呼吸文字/状态点/波纹/转弧）与 frame 活动态并行展示
  Then 指示器按 steps(16)@1600ms（≈100ms 一步）合成器驱动且同相位；工具完成换类名后动画被取消；文字照常匀速放出；输入框占位轮播只在失焦时暂停。
- Given 离屏截图窗口/桌宠/装饰件任一降级路径
  When 资源离开使用状态
  Then 离屏窗口建窗即 `stopPainting`、空闲即销毁；流体画布共享单循环、末张注销 cancel、视野外/缩放平移中不出帧、reduced-motion 只画一帧；桌宠关闭或停用即销毁窗口；已移除装饰件的存量 id 回落「无」。

## 环境与输入

- Windows 11 Pro 10.0.26200 x64，Node 20+（run-vitest 经 Node 执行），Bun 1.4.2；
- vitest 环境：desktop=jsdom，vetta-ui-design=happy-dom；
- 不运行真实 Provider、不启动 Electron E2E（无 UI 变更；`verify:ui:*` 需用户明确授权）。

## 实际命令

```text
# 画布流体（含本次新增 4 用例：24fps 节流、视野外跳过并恢复、缩放平移跳过、reduced-motion 单帧）
cd packages/plugins/presets/vetta-ui-design && bun ../../../../scripts/quality/run-vitest.mjs --run test/fluid-canvas.test.ts
# frame 活动态链路 / 栅格化 / 离屏脚本
bun ../../../../scripts/quality/run-vitest.mjs --run test/frame-activity.test.tsx test/frame-raster.test.ts test/offscreen-raster.test.ts
# 失焦暂停 / 步进指示器 / 装饰件回落
cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run \
  src/renderer/shared/lib/inactive-window-animations.test.ts \
  src/renderer/shared/lib/live-animations.test.ts \
  src/renderer/shared/theme/ornament.test.ts
# 流式文本 / 输入占位轮播 / 时钟指示器
bun ../../scripts/quality/run-vitest.mjs --run \
  src/renderer/domains/conversation/components/blocks/TextBlockView.streaming.test.tsx \
  src/renderer/domains/conversation/components/input-bar/InputBarPlaceholder.test.tsx \
  src/renderer/shared/components/live-clock-indicators.test.tsx
# 离屏停绘与 deadline / 性能快照 / 桌宠命中降频
bun ../../scripts/quality/run-vitest.mjs --run \
  src/main/plugins/offscreen-capture-painting.test.ts \
  src/main/plugins/offscreen-capture-deadline.test.ts \
  src/main/app-monitor/perf-snapshot.test.ts \
  src/main/pet/pet-mouse-poll.test.ts
# 质量门禁
bun run check:quick
```

## 结果

全部通过（2026-09-22）：

| 验收 | 证据 | 用例 |
| --- | --- | --- |
| 1 前后台暂停/恢复 | `inactive-window-animations.ts` + 7 用例：切换暂停恢复、CSS 动画不碰播放接口、脚本动画暂停恢复、失焦期入场动画播完、失焦期迟到动画补扫、他处暂停不误放、豁免标记 | 7/7 |
| 2 流式/工具/终态/输入 | `TextBlockView.streaming.test.tsx`（匀速放出、词边界、链接整体出现）；`live-animations.test.ts`（steps(16) 同相位、换类名取消重挂、仅 opacity/transform、reduced-motion 不动）；`frame-activity.test.tsx`（三种活动态、终态 updated）；`InputBarPlaceholder.test.tsx`（切走暂停切回继续）；`live-clock-indicators.test.tsx` | 9+5+12+2+3 全过 |
| 3 基线 | GPU/进程：`perf-snapshot.test.ts` 8 用例（Main/Renderer/GPU 归类、Turn 关联），采样已进诊断包 `perf-snapshot.json`；硬件基线沿用 VERIFY-0001（RTX 3060 Laptop，0.5.58 空闲约 2.4GB/25%）。帧耗时受控点：指示器 steps(16) 合成器驱动（约 10 帧/s，主线程零开销）、流体 ≤24fps 节流。WebGL：本应用仅终端活动格可选 webgl2（`select-terminal-renderer.ts`：非活动格退 canvas、上下文丢失不重试、关硬件加速全退），空闲会话 WebGL context 数为 0，装饰件/画布流体均为 2D canvas 或静态 | 8/8 |
| 4 资源实际停止 | 离屏：`offscreen-capture-painting.test.ts`（建窗即 stopPainting）+ `offscreen-capture-deadline.test.ts`（超时销毁、卡死请求不永久排队）；流体：共享单循环末张 cancel + 视野外/缩放平移跳过 + reduced-motion 单帧（本次新增）；装饰件：五枚常驻动画已移除、存量 id 回落 none（`ornament.test.ts` 10 用例）；桌宠：关闭/停用即 `destroyPetWindow`、命中检测降频（`pet-mouse-poll.test.ts`） | 2+5+4+10+2 全过 |
| 5 跨 OS 计划 | 见下节 | — |

`check:quick`（Biome + 架构守卫）通过。工作区既有的 `nul` 保留名杂项文件会触发 Biome 内部 IO 提示，不影响门禁结论，未触碰。

## macOS/Windows 定向验证计划

单元/组件层不区分 OS；硬件实测按下列场景执行（macOS 为毛玻璃整窗重合成的特有主因，优先级更高）：

- **macOS（优先）**：① 空闲露窗：活动监视器 GPU 历史应接近 0%（v0.5.59 前约 60%）；② 流式回复期间：GPU 峰值较 0.5.58 同场景下降，指示器仍可见地呼吸；③ 切到其他应用 30s 再切回：转圈图标停在同一帧、切回立即续转、消息无损；④ 画布 frame 活动态：流体在缩放/平移瞬间的静止与恢复；⑤ 导出诊断包比对 `perf-snapshot.json` 的 GPU 进程 CPU。
- **Windows（本机可执行）**：① 任务管理器 GPU 列对比前后台流式期间占用；② DWM 场景下遮挡最小化后 GPU 进程 CPU 归零；③ 终端多开时仅活动格持有 WebGL（其余格 canvas 渲染无黑屏）。
- 采样工具：系统 GPU 监视 + 诊断包 `perf-snapshot.json`；不引入新观测代码。

## 未运行的验证与原因

- Electron 实机 E2E / `verify:ui:*`：需用户明确授权，且本任务无 UI 行为变更（仅测试补齐）。
- macOS 硬件实测：本机为 Windows，无法执行；已给出可复现的定向计划与判定标准。
- 全量 `bun run check`：本轮改动仅 1 个测试文件 + 项目文档；`check:quick` + 定向测试已覆盖，提 PR 前可全量核对。

## 剩余风险

- 失焦暂停的补扫间隔 2s 意味着失焦瞬间新挂载的无限动画最多多转 2s；正确性不受影响（测试已锁定）。
- 并排盯着任务跑时转圈图标静止是已声明的产品取舍（v0.5.59 发布说明）。
- macOS 毛玻璃收益的量化数据依赖上述计划在真实硬件执行后回填。
