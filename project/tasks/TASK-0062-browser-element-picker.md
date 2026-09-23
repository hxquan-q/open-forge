---
id: TASK-0062
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: parallel
branch: task/TASK-0062-browser-element-picker
worktree: ..\open-forge-wt\TASK-0062-browser-picker
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts, packages/theme-ui/src/activity, packages/plugins/plugin-sdk/src/prompt-attachment.ts]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/browser-automation, apps/desktop/src/main/window-manager.ts]
exclusive_paths: []
depends_on: [TASK-0059]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Browser 元素点选与草稿 capsule

## 目标

在内置 WebView 上实现元素点选：picker 模式悬停高亮、点击拦截不触发页面动作；选中生成 `vetta.browser.element-selection` capsule 附加到输入草稿（不自动发送），含裁剪截图；同时落地供 picker 与 `browser_tab` 共用的 WebView 会话控制器（`pageRevision`/`elementRef`）。

## 范围

### 并发评估

- 结论：条件支持——与 Canvas lane（0060→0061）并行；TASK-0063 依赖本任务的会话控制器，串行其后。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0060、TASK-0061、TASK-0064。
- 前置依赖：TASK-0059（capsule schema、IPC/preload 桩、`browser-element-picker` 快捷键注册、i18n 骨架）。
- 冲突文件/独占路径：`window-manager.ts` webview 接线与 0063 共享 → 0063 串行依赖本任务，不并行。
- 集成负责人：coordinator。

### 做

- WebView 会话控制器（主进程侧）：绑定 workspace↔WebView 身份、当前 URL/title、`pageRevision`（导航/DOM 变更递增）、`elementRef` 生成与校验；供 0063 复用。
- Browser tab 改为常驻可挂载：移除 `useMeta` 的 `browserUrl` 门控，空态显示地址栏。
- Picker 模式：工具栏按钮 + `browser-element-picker` 快捷键开关；webview 内悬停高亮 overlay；点击拦截（`preventDefault`/`stopPropagation`，不触发页面 click）；webview 聚焦时按键经 `before-input-event` 透出。
- capsule 提取：受控 `executeJavaScript` 或 preload 桥返回受限结构化数据（schema 0059 已冻结：role/accessibleName/attributes 白名单/domPath+xpath/computedStyle 白名单/outerHTML≤8KB/周边文本≤2KB）；剥离脚本与事件属性、遮蔽表单敏感值。
- 裁剪截图：按元素 bounding rect × devicePixelRatio 换算 `capturePage` 区域，长边上限 1600px PNG，存会话图片缓存并作为 image attachment。
- 草稿附件：走既有 `composer.attach`/`PluginPromptAttachment` 通道，单次只允许一个 capsule；composer 中可见可移除；发送时随 `PromptRequest` 序列化。
- 页面导航/刷新后 picker 状态与旧 ref 处理：revision 递增，picker 保持可用，旧 capsule 的 ref 标记可能失效。

### 不做

- 多选/框选/页面标注/语音（Phase 2）。
- `browser_tab` 动作实现（TASK-0063）。
- console/network 采集（non-goal）。
- Release Notes（coordinator 统一写）。

## Given / When / Then

- Given：Browser tab 打开一个页面；When：用户点 picker 按钮或按 `mod+shift+d` 并点选输入框；Then：页面不发生点击副作用，草稿区出现一个 Browser 元素附件，含 url/title/role/domPath/裁剪截图。
- Given：已附加 capsule；When：用户不发送直接再选一个元素；Then：新 capsule 替换旧的（单 capsule 限制）。
- Given：选中后页面发生导航；When：Agent 之后用 capsule 里的 `elementRef` 操作；Then：因 `pageRevision` 变化返回 `stale_reference`（由 0063 消费，本任务只保证 ref/revision 正确生成）。
- Given：picker 激活中；When：用户再次按快捷键或点退出；Then：恢复正常浏览，无残留 overlay。

## 必须保持

- 点选不触发页面业务动作；overlay 不读取/不回传表单敏感值、Cookie、token。
- 不暴露任意 JS 执行面给渲染层或 Agent。
- 选区附件只进草稿，绝不自动发送。

## 测试与验证

- 定向测试：capsule 提取字段/上限/脱敏；domPath+xpath 稳定性；裁剪坐标换算（含 devicePixelRatio>1 与滚动偏移）；单 capsule 替换；picker 进出与点击拦截。
- 用户流程：开 Browser→导航→picker→点选→草稿出现附件（含截图）→发送后 Agent 收到结构化上下文。
- 质量检查：组件/合同测试 + `bun run test:impact -- <files>` + `check:quick`；webview 真实交互用本地 fixture 定向 Electron E2E。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
