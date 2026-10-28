---
id: BUG-0155
type: bug
status: verifying
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: TASK-0407; openvetta/open-vetta@724655809a,fdc02645c
related_requirement: [REQ-0008]
related_plan: [PLAN-0025]
related_tasks: [TASK-0407]
related_issues: []
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 画布布局回写触发重载，手势与失败栅格交接不安全

## 用户流程与期望

保存布局与视口时 frame 不重载；从 frame 内开始缩放时保持 iframe 布局与输入目标；栅格重截失败后显示实时内容，并能手动恢复。

## 独立症状与失败证据

基线 `6ebd359b567da1ac46e37327c5178bc9c53fca50`，Windows，Bun 1.4.2。测试使用临时设计、Vite 与假截图边界，不访问真实用户状态。

| 症状 | 可失败证据与重复结果 | 根因定位 |
|---|---|---|
| manifest 回写 | `engine-hmr.test.ts`：50 次布局/视口 JSON 写入，实际 Tailwind/Vite 管线发出 59、64 条 update/full-reload 消息，期望 0；TSX/CSS 正对照各有更新 | `@source` 包含 design.json；bridge 的 `vite:beforeUpdate` 会触发 reload |
| 手势停放 | `frame-handoff.test.tsx`：两次得到 `display:none`，期望 `block` | iframe 随 live=false 被移出布局，无法保持原输入目标 |
| 失败后旧图 | `frame-raster.test.ts`：已有旧位图→invalidate→离屏截图失败，两次 `isMounted=false`，期望 true | failures 不参与挂载/live/raster 选择，旧图继续顶替当前内容 |

命令（插件目录）：`bun ../../../../scripts/quality/run-vitest.mjs --run test/engine-hmr.test.ts test/frame-raster.test.ts test/frame-handoff.test.tsx -t "50 次布局|旧位图重截失败|手势期间停放"`。

HMR 夹具写真实临时文件，并驱动 Vite watcher 边界避开 OS 合并/抖动；消息数受重复文件事件影响，不将其写成真实浏览器导航次数。DOM 只证明状态交接，不能证明跨进程滚轮连续性。首次收集缺 plugin-sdk 产物与完整 config 缺测试依赖均为夹具准备失败，不计作 Bug 复现。

## 首屏边界

当前首屏使用 React.lazy，预加载适配另由 TASK-0407 的组件测试覆盖。尚未授权真实 UI/首屏采样，不把上游耗时当成本仓数据，不将本记录三个已复现问题的证据替代首屏性能结论。

## 修复与验证

- 独立审查发现直接回写夹具未覆盖 `queuedAtomicWrite` 的临时文件。补正常保存链并将一份 temp 保留 120ms（超过生产 watcher 的 60ms）；修复前仍产生 2 条更新，修复后为 0，TSX/CSS/新增帧正对照有效。
- 修复正式 manifest/temp 的统一排除判据，生产配置与夹具共享 watcher；不误排嵌套同名 JSON。
- 候选提交 `dd7feffcd`，插件全包 117 文件、763 用例通过，类型检查、构建、完整根检查通过。独立审查 `/root/canvas_final_review` 的 P2 已修复并复审，无新阻断。
- 一次全局禁止 iframe 导航的测试配置使 bridge 用例超时，已撤销全局改动并限于两个外壳 DOM fixture；单独复验与全包重跑均通过。
- 真实 Desktop、真实 iframe 输入及冷/热各 10 次性能样本未执行，不宣称 UI/性能验收完成；最终集成仍 pending，细节见 TASK-0407。
