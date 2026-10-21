---
id: BUG-0135
type: bug
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source: 用户提供的文件树 HTML 预览慢与资源加载异常现象；当前源码只读核对
related_requirement: []
related_plan: []
related_tasks: [TASK-0340]
related_issues: []
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 文件树 HTML 预览丢失文件目录语义，并用「加载完才可见」放大白屏

## 用户流程

- Given：工作区里有一个真实的多文件 HTML 项目（例如 `real-site/index.html` 引用 `css/styles.css` 与 `js/*.js`），用户在文件树中点击该 HTML。
- When：预览面板加载这个文件。
- Then：页面按浏览器正常进度逐步绘制；相对路径的 CSS、JS、图片按该 HTML 所在目录解析；修改被引用的样式或脚本后预览能刷新；无关文件写入不打断当前预览。

## 实际行为

- 上游 `usePreviewBodyModel` 已经拿到 `sourcePath`，但 HTML 分支没有继续传递：`TextPreviewRenderer` 直接渲染 `<HtmlPreview content theme />`，最终 `HtmlPreviewView` 用 `<iframe srcDoc>` 呈现。
- `srcDoc` 文档按规范继承宿主页面的 base URL，因此 `css/styles.css`、`js/app.js` 这类相对引用会被解析到 Renderer 的地址，而不是文件所在目录。
- 开发态下 Renderer 由 Vite dev server 提供，任意路径都返回同一份约 529 字节的 `index.html`，于是相对资源既不报错也不生效：页面看起来「能打开」，但样式和脚本全是错的，并且每次请求都要多付一次 dev server 往返。
- iframe 在 `onLoad` 之前被设为 `opacity-0`，任何慢子资源（外部 CDN、大图、阻塞脚本）都会把整页空白时间拉长到最后一个资源完成；用户无法区分「还在加载」与「加载失败」。
- 目录变更监听只广播目录路径、不广播文件名；内容字符串不变时 `srcDoc` 也不变，iframe 不会重载，因此被引用的 CSS/JS 单独变化时预览保持旧状态。监听本身还是非递归的，`css/`、`js/` 子目录的写入根本不会触发事件。

## 期望行为

- 磁盘上的 HTML 预览使用仓库已有的 `vetta-file://` 文件协议直接加载真实文件，恢复 CSS、JS、图片的目录语义；无法映射到文件的内容（插件/活动面板传入的 HTML 字符串）保留 `srcDoc` 路径。
- iframe 首帧即可见，加载状态用独立的轻量指示表达，不再用整页透明等待 `onLoad`。
- 合并同一目录的连续写入；HTML 内容未变且不涉及被引用资源时保持现有 iframe（不重置滚动与页面状态）；被引用的 CSS/JS/图片变化时按约定刷新。
- 预览隔离、可读路径边界和现有 `assertPathReadableForPreview` 授权不回退。

## 环境与失败证据

- 应用版本：Desktop 0.1.3（当前 main）。
- 操作系统：Windows 11 Pro 10.0.26200。
- 复现夹具：用户工作区内的多文件静态站点（`index.html` + `css/styles.css` + `js/*.js`），以及自包含单文件 HTML 对照。
- 失败证据（源码可指认）：`apps/desktop/src/renderer/domains/file-preview/components/TextPreviewRenderer.tsx:23` 丢弃 `sourcePath`；`packages/theme-ui/src/activity/HtmlPreviewView.tsx:107` 的 `opacity-0` 门槛；`apps/desktop/src/main/ipc/fs.ts:342` 的 `broadcastDirChanged(dirPath)` 只带目录。
- 未执行：本轮未启动 Desktop 实测首帧时间与资源请求归属，结论基于源码与既有 dev 行为。

## 最小复现

1. 准备 `site/index.html`，其中用相对路径引用 `site/css/styles.css`。
2. 在文件树中点击 `site/index.html`。
3. 观察预览：样式不生效；开发态下 DevTools 中相对资源请求落在 Renderer dev server；页面在全部资源完成前一直空白。

## 影响

- 真实项目型 HTML 无法预览，用户会误判为「预览坏了」或「页面写得不对」。
- 自包含 HTML 也会因为 `opacity-0` 门槛而出现不必要的白屏，慢外链尤其明显。

## 根因证据

- `packages/theme-ui/src/activity/HtmlPreviewView.tsx:95` 的 `HtmlPreviewFrame` 只接受 `srcDoc`，没有 `src` 载体。
- `apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.tsx:125` 已经计算 `sourcePath={item.path ?? item.url}`，链路在 `TextPreviewRenderer` 处断掉。
- `apps/desktop/src/main/file-protocol.ts:17` 的协议注释明确写明：「凡需整页带资源地预览项目内 HTML 走本协议」；`shared/file-protocol.ts:13` 的 `createLocalFileUrl` 已按段编码绝对路径，支持本机与 `ssh://` 远端。
- `apps/desktop/src/main/ipc/fs.ts:371` 的 `watch(resolved, (_eventType) => ...)` 没有使用 `filename` 参数，`broadcastDirChanged` 也只发送目录字符串。

## 回归测试

- 带本地 CSS/JS/图片的最小项目在预览中资源全部命中 `vetta-file://`，不再发往 Renderer 地址。
- 首帧可见：受控延迟的慢资源不会让页面在 `onLoad` 前保持隐藏。
- 无关写入保持 iframe；HTML 内容变化、被引用资源变化按约定刷新。
- 不可读路径仍被拒绝（沿用 `assertPathReadableForPreview`）。

## 修复与验证

- 修复：`TASK-0340` 已实施——文件型 HTML 改走 `vetta-file://` 的 `src` 模式（`preview-assets.ts` 负责映射与资源解析），取消 `opacity-0` 门槛并改为独立加载条，主进程广播文件名、renderer 按被引用资源判定刷新。
- 测试：新增 `preview-assets.test.ts`（15 例）与 `HtmlPreviewView.test.tsx`（3 例），`usePreviewBodyModel.test.tsx` 增加 6 例；desktop 定向 2 文件 / 27 例与 theme-ui 3 例全通过。
- 检查：`test:impact`、根 `tsgo`、Desktop 增量类型检查与 `check:quick` 均通过；完整 `check` 与真实 Desktop 验收待后续。
- 未运行及原因：真实 Desktop 上的首帧与资源归属实测未执行，需在获得 UI 验证授权后按验收包人工确认。
