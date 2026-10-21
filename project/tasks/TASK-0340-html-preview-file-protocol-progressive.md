---
id: TASK-0340
type: task
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source: RESEARCH-0034; BUG-0135
related_requirement: []
related_plan: []
related_tasks: [TASK-0341, TASK-0339]
related_issues: []
related_bugs: [BUG-0135]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 74877ddef
read_paths:
  - packages/theme-ui/src/activity
  - apps/desktop/src/renderer/domains/file-preview
  - apps/desktop/src/renderer/domains/activity-panel/components/previews
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/main/file-protocol.ts
  - apps/desktop/src/shared/file-protocol.ts
  - apps/desktop/src/preload
  - docs/adr
  - project
write_paths:
  - packages/theme-ui/src/activity/HtmlPreviewView.tsx
  - apps/desktop/src/renderer/domains/activity-panel/components/previews/HtmlPreview.tsx
  - apps/desktop/src/renderer/domains/file-preview/components/TextPreviewRenderer.tsx
  - apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.tsx
  - apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.test.tsx
  - apps/desktop/src/renderer/domains/file-preview/preview-assets.ts
  - apps/desktop/src/renderer/domains/file-preview/preview-assets.test.ts
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/fs-types.ts
  - apps/desktop/src/preload/apis/system.ts
  - project/tasks/TASK-0340-html-preview-file-protocol-progressive.md
  - project/tasks/README.md
  - project/bugs/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/theme-ui/src/activity/HtmlPreviewView.tsx
  - apps/desktop/src/renderer/domains/file-preview/preview-assets.ts
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# HTML 预览：文件协议资源解析、渐进呈现与变更刷新

## 目标

让文件树里的 HTML 预览按真实文件位置解析相对资源，恢复 CSS、JS、图片的目录语义并消除开发态误请求 Renderer dev server 的问题；取消「全部加载完才可见」的整页透明门槛；合并目录变更事件，在内容未变时保持 iframe，并为被引用的 CSS/JS/图片提供刷新策略。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0341 共享 Tasks 索引与 Release Notes，且本 Task 横跨 `packages/theme-ui`、renderer 与 main 的目录监听。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无；`vetta-file://`（ADR-0027）与 `createLocalFileUrl` 已存在。
- 冲突文件/独占路径：`HtmlPreviewView.tsx` 与新增的 `preview-assets.ts` 为本 Task 独占；`fs.ts` 只增加可选文件名参数，不改现有广播语义。
- Branch：`main`。
- Worktree：不拆出；预览组件、renderer 读取链路与 main 监听需要一起验证。
- 集成负责人：当前 Coordinator。
- 集成顺序：TASK-0339 之后、TASK-0341 之前。

### 做

1. `HtmlPreviewView` 增加可选 `src` 与 `revision`：有 `src` 时用 `<iframe src>` 加载真实文件，加载状态用独立轻量指示；无 `src`（活动面板/插件传入的字符串）继续走 `srcDoc` 与现有 chrome 注入。
2. 移除 `opacity-0` 门槛：iframe 首帧即可见，`onLoad` 只表示加载阶段结束；加载指示不覆盖页面内容。
3. `TextPreviewRenderer` 的 HTML 分支把 `sourcePath` 继续下传；新增 `preview-assets.ts` 负责把绝对本机路径或 `ssh://` 路径映射成 `createLocalFileUrl`，非文件来源（http/https、data 等）返回 `undefined` 并回退 `srcDoc`。
4. `usePreviewBodyModel` 为 HTML 记录内容版本与资源版本：目录事件到达时重读 HTML；内容变化才更新内容；内容未变但变化文件属于该 HTML 引用的资源时只递增资源版本（触发 iframe 重载）；无关文件保持现状。
5. `preview-assets.ts` 提供从 HTML 文本里提取被引用资源路径的纯函数（`src` / `href` / `url(...)`，忽略绝对 URL、协议相对 URL 与 `#` 锚点），供上述判定与资源目录监听共用。
6. main 的目录监听把本次防抖窗口内收集到的文件名随广播一起发出（`broadcastDirChanged(dirPath, fileNames)`）；preload 的 `onDirChanged` 增加可选第二参数，既有只读目录路径的消费者不受影响。
7. renderer 额外监听被引用资源所在的子目录（有上限），任一变化即递增资源版本；卸载时与 HTML 目录一起释放。
8. 测试：`preview-assets` 纯函数用例（本机路径、Windows 盘符、`ssh://`、中文与 `#`/`?`、被引用资源提取）；`usePreviewBodyModel` 用例（内容变化更新、内容未变保持、被引用资源变化递增版本、无关写入不变化）；`HtmlPreviewView` 传 `src` 时不再使用 `srcDoc`、无 `src` 时保持原行为。
9. 更新 Tasks/Bugs 索引、本 Task 交付记录与当前版本发布说明。

### 不做

- 不扩展 Canvas 回环服务为多文件项目服务，不为预览开放 `file://` 或整盘 HTTP 服务。
- 不放宽 `assertPathReadableForPreview` 的可读边界，不改 `vetta-file://` 的授权模型。
- 不改 `browser_tab` 的 URL 白名单（仍然只接受 http/https）。
- 不重写用户 HTML 的脚本加载顺序，不内联或替换外部资源。
- 不启动 Desktop、不运行 `verify:ui:*`。

## Given / When / Then

- Given `site/index.html` 相对引用 `css/styles.css` 与 `js/app.js`，When 在文件树中预览，Then iframe 的 `src` 为 `vetta-file://local/.../index.html`，相对资源请求落在 `vetta-file://` 而不是 Renderer 地址。
- Given 内容来自活动面板或插件的 HTML 字符串（没有文件路径），When 预览，Then 继续使用 `srcDoc`，行为与当前一致。
- Given 一个子资源被人为延迟，When 预览打开，Then 页面首帧即可见，加载指示独立显示并在 `onLoad` 后消失。
- Given 同一目录里写入一个无关文件，When 事件到达，Then iframe 不重载，滚动位置保持。
- Given HTML 自身被修改且内容变化，When 事件到达，Then 预览加载新内容。
- Given HTML 内容未变但被引用的 `css/styles.css` 被修改，When 事件到达，Then 资源版本递增并重载 iframe。
- Given 路径包含中文、空格、`#` 或 `?`，When 生成预览 URL，Then 每段正确编码且文件可加载。
- Given 预览目标不可读，When 通过 `vetta-file://` 请求，Then 仍然返回 403。

## 必须保持

- `vetta-file://` 的协议形态、MIME 映射、`Access-Control-Allow-Origin: *`、本机与 SSH 支持不变。
- `assertPathReadableForPreview` 仍是唯一可读边界，预览隔离与 iframe `sandbox` 属性不回退。
- 非 HTML 预览（Markdown、代码、JSON、插件预览）行为不变。
- 目录监听仍是引用计数的，`watchDir` / `unwatchDir` 的配对语义不变；广播的第一个参数仍是目录路径。
- 活动面板的 HTML 预览仍能注入滚动条与 `color-scheme` chrome。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/file-preview/preview-assets.test.ts apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.test.tsx`。
- 组件回归：`bun scripts/quality/run-vitest.mjs --run packages/theme-ui/src/activity/HtmlPreviewView.test.tsx`（若该文件此前不存在则新建）。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：组件测试覆盖 `src`/`srcDoc` 两条路径、渐进呈现、事件合并与资源刷新；真实 Desktop 首帧与请求归属留人工验收。

## 验收分层

- 工程验证：定向测试 3 个文件 / 30 例通过（desktop 27、theme-ui 3）；`test:impact` 全绿；根 `tsgo` 与 Desktop 增量类型检查通过；`check:quick` 通过（`ratchet new=0`）。
- 技术评审：待执行（串行自审：`src` 模式不再注入 preview chrome，属已知取舍已记录）。
- 集成：实现 `1f555175b` 已推送 origin/dev 并核对远端（同批 `f2728086a`）。
- 人工功能验收：待验收；需要在真实 Desktop 中打开多文件 HTML 项目，观察资源归属、首帧与刷新行为。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 文件树 → 点击工作区中的 `.html` 文件。
- 操作步骤或 AI 任务输入：打开多文件 HTML 项目；修改被引用的 CSS；写入无关文件；修改 HTML 内容。
- 预期行为与最终产物：样式与脚本生效、首帧不等待全部资源、无关写入不打断、修改后按约定刷新。
- 不通过表现与已知限制：相对资源仍命中 Renderer dev server；页面在全部资源完成前保持空白；资源变化后预览停留在旧状态。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `packages/theme-ui/src/activity/HtmlPreviewView.tsx`：`content` 改为可选并新增 `src` / `revision`；`src` 模式用 `<iframe src>` 并以 `src + revision` 作 key 触发确定性重载，`srcDoc` 模式保持 chrome 注入；移除 `opacity-0` 整页门槛，加载态改为 `aria-busy` + 顶部 `data-preview-loading` 细进度条（语义色 `bg-muted` / `bg-foreground/30`，通过 DESIGN D01）。
  - `apps/desktop/src/renderer/domains/activity-panel/components/previews/HtmlPreview.tsx`：向 `HtmlPreviewView` 透传 `src` 与 `revision`。
  - `apps/desktop/src/renderer/domains/file-preview/preview-assets.ts`（新增）：`previewFileUrl` 把本机绝对路径与 `ssh://` 映射为 `vetta-file://`，对已有协议、相对路径与非文件来源返回 `undefined` 回退 `srcDoc`；`extractPreviewAssetReferences` 提取 `src` / `href` / CSS `url(...)`，忽略锚点、协议相对与外链，剥掉 `?query` / `#fragment`；`collectPreviewAssets` 绝对化引用路径、排除 HTML 自身目录、资源目录上限 8；`matchesPreviewAssetChange` 在主机给出文件名时按「目录 + 文件名」精确比对，拿不到文件名时只对资源子目录保守判定。
  - `apps/desktop/src/renderer/domains/file-preview/components/TextPreviewRenderer.tsx`：HTML 分支把 `sourcePath` 映射为 `previewFileUrl(sourcePath)` 并下传 `revision`。
  - `apps/desktop/src/renderer/domains/file-preview/hooks/usePreviewBodyModel.tsx`：新增 `revision` 与内容等价短路（重读内容未变时既不更新界面也不递增版本）；按 `collectPreviewAssets` 额外 watch/unwatch 被引用资源目录；目录事件先做路径归一化，HTML 目录变化重读、命中被引用资源才递增 `revision`。
  - `apps/desktop/src/main/ipc/fs.ts`：防抖窗口内收集 `filename`，随 `DIR_CHANGED` 一起广播；监听错误与最后一个消费者释放时清理待发文件名。
  - `apps/desktop/src/preload/fs-types.ts`：`onDirChanged` 增加可选 `fileNames` 第二参数，既有只读目录路径的消费者不受影响。
  - 测试：新增 `preview-assets.test.ts`（15 例：URL 映射、引用提取、目录解析、上限、命中判定）与 `HtmlPreviewView.test.tsx`（3 例：`src` 代替 `srcDoc`、`srcDoc` 路径保留、首帧可见无 `opacity-0`）；`usePreviewBodyModel.test.tsx` 增加 6 例（内容未变保持、内容变化递增、脚本变化递增、资源目录保守刷新、无关写入不动、`sourcePath` 下传）。
- 实际运行：`bun run --cwd apps/desktop test src/renderer/domains/file-preview/preview-assets.test.ts src/renderer/domains/file-preview/hooks/usePreviewBodyModel.test.tsx` → 2 files / 27 tests passed；`bun run --cwd packages/theme-ui test src/activity/HtmlPreviewView.test.tsx` → 3 tests passed；`bun run test:impact` → desktop 84 files（83 passed / 1 skipped，488 tests passed）、theme-ui 3 tests passed；`bunx tsgo --noEmit` → 通过；`bun run --cwd apps/desktop typecheck:incremental` → 通过；`bun run check:quick` → 通过（`ratchet new=0`；首轮报 4 个文件缺声明头与加载条使用 zinc 调色盘，已补头并改用语义色后复跑通过）。
- 未运行及原因：未启动 Desktop、未运行 `verify:ui:*`，首帧与请求归属仍需真实 Electron 环境人工确认；完整 `bun run check` 留待 TASK-0341 完成后一次执行。`packages/theme-ui` 包级 `bun run check` 在本机存在与本次改动无关的存量报错（`JSX` 命名空间、`import.meta.dirname` 等），本次以根 `tsgo` 为准，未追改。
- Worktree：未拆出；预览组件与监听链路串行修改。
- 剩余风险：`src` 模式下不再注入 preview chrome（滚动条样式与 `color-scheme` 由页面自身决定）；这是换取真实目录语义的已知取舍。
