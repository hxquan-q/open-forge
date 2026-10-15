---
id: BUG-0016
type: bug
status: done
priority: P1
owner: apps/desktop
source: user-report
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0019]
depends_on: []
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 阶段性刷新后长时间白屏

## 用户流程

- Given：用户正在使用 Desktop，应用和 Renderer 已完成加载。
- When：应用在使用期间阶段性刷新/重载。
- Then：应用应维持可用界面或在短时间内恢复，不应长时间停留在空白页面。

## 实际行为

用户报告应用会阶段性刷新，随后页面长时间空白。相关日志/控制台同时出现：

```text
[plugin-agent] host ready
BrowserPanelView.tsx:163 Received `true` for a non-boolean attribute `allowpopups`.
```

本次补充报告再次提到这些线索；两张截图内容相同，未显示刷新发生瞬间或错误堆栈。`allowpopups` 警告本身另由 `BUG-0019` 跟踪，目前没有证据确认它与白屏或刷新存在因果关系。

## 期望行为

Renderer 不应无故重载；确需重载时应可靠完成初始化并恢复可见页面，加载失败应显示可恢复状态而非持续空白。

## 最小复现

1. 正常启动 Desktop 并进入任一工作页面。
2. 按用户报告的条件持续使用，记录每次刷新前的操作、活动插件/浏览器面板状态及时间。
3. 观察白屏持续时间、Renderer 是否重新加载、控制台首个错误和主进程日志。

目前尚未掌握稳定触发条件，步骤 2 需补充现场操作或可控复现。

## 影响

页面长时间不可用，用户可能误以为应用卡死或丢失当前工作；发生频率和是否需要强制重启尚未确认。

## 根因证据

- `apps/desktop/src/renderer/domains/plugins/components/PluginGlobalSlotHost.tsx:78` 起监听插件变化并触发插件快照重载；这属于插件宿主内部 reload，不等同于整个 Renderer 刷新。
- `BrowserPanelView` 的 `allowpopups` React 警告是独立可见诊断，尚无调用链证据表明它会触发整页重载或造成白屏。
- `remote-desktop-host.ts` 中存在特定远程宿主错误后的 `window.location.reload()`，但未确认用户是否运行该宿主，也未证明与此报告有关。

2026-09-25 复现定位：渲染进程入口 `main.tsx` 的 `bootPaintedPromise` 依赖双层
`requestAnimationFrame`，而窗口被最小化或被 Windows 遮挡检测判为隐藏时
`document.visibilityState === "hidden"`，Chromium 会暂停 rAF——此时发生任何重载
（HMR、插件快照重载、远程宿主错误重载），`Promise.all` 的门闩永不释放，渲染进程
被锁死在启动骨架屏（`AppBootLoadingView`）。通过 CDP 实测：窗口最小化状态下
`location.reload()` 后 rAF 在 3s+ 内不触发，`document.body` 仅剩骨架屏；将窗口
置前台后 rAF 恢复、启动完成。用户侧表现即「刷新后长时间空白」。

根因置信度：高（可复现的阻塞机制已确认；不排除报告场景下另有刷新触发源）。

## 回归测试

- `apps/desktop/src/renderer/shared/lib/committed-paint.test.ts` 已覆盖
  `waitForCommittedPaint` 的 hidden 短路（`skipped-hidden`）与 `timeoutMs: null`
  不下放 visible 路径的合同，本次直接复用该实现。
- 端到端验证：CDP 连接 dev 实例，最小化窗口后触发 `location.reload()`，
  渲染进程在 `document.hidden === true` 下依然完成挂载，body 渲染出完整
  导航与会话内容而非骨架屏。

## 修复与验证

- 修复：`main.tsx` 的启动绘制等待改用既有 `waitForCommittedPaint({ timeoutMs: null })`，
  隐藏时立即放行（无可绘制画面），可见时仍等待两个真实帧后再向主进程上报 painted。
- 测试：`bun run test -- src/renderer/shared/lib/committed-paint.test.ts`（既有用例，
  语义未变）+ 实测最小化窗口重载恢复。
- 检查：见交付说明。
