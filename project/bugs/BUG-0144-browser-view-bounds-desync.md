---
id: BUG-0144
type: bug
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source:
related_requirement: []
related_plan: []
related_tasks: [TASK-0362]
related_issues: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器在侧边栏与页签切换后错位、溢出，开发态重复加载变慢

## 用户流程

- Given：开发态 Desktop 已打开会话，活动面板里的内置浏览器正在显示一个页面（例如 `http://localhost:8080/`）。活动面板宽度是固定像素，不随左栏变化。
- When：收起或展开左栏；或切走浏览器页签再切回来；或在开发态里反复挂载同一地址。
- Then：原生页面应仍铺在浏览器占位洞里，不盖住对话或左栏，不在隐藏期间被压成空白；同一地址的在途加载不应被第二次 `loadURL` 打断。

## 实际行为

左栏一切换，页面相对占位洞平移：洞是空的或只剩一截，原生页面盖到对话、工具条或其他部件上。再切一次，错位换到另一侧，溢出更明显。切走页签再回来时，页面会空白或停在被压扁后的布局里（右栏文字被挤成逐字竖排）。开发态下同一地址会加载两次，第一次被 `ERR_ABORTED` 打断，首屏明显变慢，偶发停在空白。

## 期望行为

占位洞平移、变宽或从隐藏恢复后，原生视图的原点与尺寸跟洞一致。洞还没有尺寸（页签 `display: none`）时不把上次的有效矩形写成 0。同一地址已经在加载时，再次 attach 复用这一次加载。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：Desktop 0.1.3，基线 `3576afb39`，Windows，用户在 `bun dev` 里复现。
- 失败测试/CI 用例与命令（若适用）：修复前无用例覆盖「只平移不上报」和「在途同 URL 不二次 loadURL」。
- CI run URL 与脱敏后的关键输出（若适用）：无。用户截图显示浏览器洞空白，以及页面内容盖出面板。
- 基线对照或重跑结果：待本任务的回归测试先红后绿。

## 最小复现

1. 启动 Desktop dev，打开带活动面板的会话，在内置浏览器打开一个本地页面。
2. 收起左栏。页面与浏览器洞错开，原生层盖住相邻界面。
3. 再展开左栏。错位方向变掉，部件溢出到洞外。
4. 切到别的活动页签再切回浏览器。洞里空白，或页面按被压扁的宽度重排。
5. 开发态下观察同一地址的加载：首次导航会被第二次 `loadURL` 中止，完成变慢。

## 影响

内置浏览器在左栏收起/展开、拖左栏宽度、切换活动页签之后无法对准占位区域。原生 `WebContentsView` 不被面板裁剪，错位时会直接盖住对话和其他控件。开发态首屏加载被重复导航拖慢。

## 根因证据

- 左栏占位宽度在点击时一步切到终值，滑动只走 `transform`（`packages/theme-ui/src/layout/SidebarDock.tsx`）。活动面板宽度是固定像素，浏览器占位洞的宽高不变，只有 `x` 变。
- `useBrowserPanelModel` 只靠占位元素自己的 `ResizeObserver` 上报 `getBoundingClientRect`。`ResizeObserver` 不通知纯平移，主进程 `setBounds` 停在旧原点。
- 非活动页签的停靠容器是 `hidden`（`display: none`，`ActivityTabSurface.tsx`）。尺寸变成 0 后仍会 `setBounds`，原生视图被压扁；恢复时若漏掉下一次位置回报，洞就是空的，页面留在错误坐标。
- 开发态 React `StrictMode` 会把 attach effect 跑两遍。`InAppBrowserViewHost.attach` 在 `getURL()` 还没变成目标地址时再次 `loadURL`，第一次导航以 `ERR_ABORTED` 让位。

## 回归测试

- `apps/desktop/src/shared/browser-view-bounds.test.ts`：0 尺寸矩形不可上报，相同矩形不重复上报。
- `apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.test.tsx`：祖先尺寸变化导致占位洞平移时上报新原点；0×0 不上报；页签重新显示后上报新位置。
- `apps/desktop/src/main/browser-automation/browser-view-host.test.ts`：在途的同一 URL 不第二次 `loadURL`；0 尺寸 `setBounds` / 再次 attach 不覆盖上一次有效矩形。

## 修复与验证

- 修复：见 TASK-0362。占位洞平移会重报原点；0 尺寸不再压扁原生视图；在途同一 URL 不重复加载。
- 测试：desktop 定向 33 例通过。
- 检查：完整 check 未跑。
- 未运行及原因：用户接手实机验证。主进程改动需重启 dev。
