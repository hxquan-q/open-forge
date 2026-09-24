---
id: TASK-0099
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0009
source: PLAN-0009 需要的 ADR（ADR-0130 候选）
execution: parallel
branch: task/TASK-0099-canvas-live-preview-loopback-server
worktree: ../open-forge-wt/task-0099-canvas-live-preview-loopback-server
base_commit: 6a94d6dad6091715443e5f9622661f6ba02dacf3
read_paths: [apps/desktop/src/main, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/shared/store, apps/desktop/src/shared, docs/adr]
write_paths: [apps/desktop/src/main/canvas-server, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/shared]
exclusive_paths: []
depends_on: [TASK-0096]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
related_requirement: [REQ-0001]
related_plan: [PLAN-0009]
related_tasks: [TASK-0096, TASK-0097, TASK-0098, TASK-0100]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas → Browser Tab 实时试跑（本地回环伺服）

## 目标

HTML artifact 可一键在右栏 Browser Tab 中以完整浏览器环境运行，突破 `<webview>` 沙箱对 `connect-src`、外链跳转和媒体的限制；页面运行后用户仍可用既有元素选取器把 DOM/CSS 上下文送回 Agent 驱动下一轮修改。

## 背景事实

- 内置 Browser Tab 遵循 ADR-0129 仅接收 HTTP/HTTPS 页面，校验经 `assertAllowedBrowserUrl`。
- 切 Tab 与载入地址的入口 `openUrlInActivityWorkspaceAtom` 已存在（`apps/desktop/src/renderer/shared/store/browser-atoms.ts`），并在 `usePortsTabPanelModel.ts:98` 有既有用法——本 Task **只接线，不新建原子**。
- 元素选取器快捷键 `mod+shift+d` 与 i18n 骨架已冻结在共享注册表（ADR-0129 后果段明确「后续 Task 只接线」）。
- `CanvasTabPanel.tsx` 是预览容器（局部组件 `CanvasPreview`），跳转按钮落在此文件。
- 主进程目前**没有**静态资源伺服模块。
- ADR-0129 §3 确立 `<webview>` HTML artifact 的安全基线（独立进程、CSP deny、无 Node、导航拦截）——本 Task 的 Browser 路径是**并列的第二条预览路径**，不是对它的放宽。

## 范围

### 并发评估

- **并发结论**：**支持并发**
- **执行方式**：parallel（独立 Worktree）
- **可并行 Task**：TASK-0100（无共享写路径）
- **前置依赖**：TASK-0096（Canvas 容器结构稳定）；实际与 TASK-0097 / TASK-0098 争夺 `CanvasTabPanel.tsx`，需在集成时串行
- **冲突文件/独占路径**：无独占；`CanvasTabPanel.tsx` 为共享热点，集成顺序需排在 TASK-0097 / TASK-0098 之后或之前连续完成
- **Branch**：`task/TASK-0099-canvas-loopback`
- **Worktree**：`..\open-forge-wt\TASK-0099`
- **集成负责人**：Coordinator
- **集成顺序**：TASK-0096 之后；与 TASK-0097 / TASK-0098 串行集成（同一容器文件）

### 做

- **ADR 判定（先行步骤）**：实施前确认是否需要新增 **ADR-0130（Canvas 本地试跑回环伺服与双向编辑契约）**。按 CONVENTIONS 第 262 行标准（难以逆转、无上下文会令人意外、存在真实取舍）判断；若确立，先写 ADR 再实现。
- **主进程回环伺服**：新增静态资源服务模块，把 `canvas/<workspaceId>/<artifactId>/` 以**只读**方式挂载到本地临时回环端口，形如 `http://127.0.0.1:<port>/canvas/<workspaceId>/<artifactId>/index.html`。
- **安全约束**：
  - 仅监听 `127.0.0.1`，不对外网卡开放。
  - 严格路径归一化与词法校验，拦截 `..` 穿越与符号链接逃逸到 canvas 根之外。
  - 只读，拒绝一切写入方法。
  - 端口占用时选择可用端口，不使用固定端口。
  - 只伺服当前 workspace 的 canvas 目录。
- **Renderer 接线**：HTML 预览栏增加「在浏览器打开」按钮；点击后经 `openUrlInActivityWorkspaceAtom` 激活 Browser Tab 并载入回环地址。
- **闭环联动回归**：验证页面在 Browser Tab 运行后，`mod+shift+d` 元素选取器仍能拾取 DOM 并生成既有 capsule（本 Task 只做回归验证，不改选取器实现）。
- 文案走 i18n；生命周期上服务须随窗口 / 应用退出正确释放。

### 不做

- **不降低 `<webview>` 沙箱基线**：默认预览仍在强沙箱中，回环路径是显式发起的第二条路径。
- 不伺服 canvas 目录以外的任何路径。
- 不给回环服务写权限。
- 不新建 Tab、不改选取器实现、不改 `browser_tab` 工具合同。
- 不把回环地址持久化为用户可编辑配置（除非 ADR-0130 明确要求）。

## Given / When / Then

- Given：Agent 创建了一个含 JS 与外部 `fetch` 的 HTML artifact，在 Canvas 中受沙箱限制无法完整运行
- When：用户点击预览栏的「在浏览器打开」
- Then：右栏切到 Browser Tab 并载入 `http://127.0.0.1:<port>/canvas/<workspaceId>/<artifactId>/index.html`；页面脚本与网络请求正常执行

- Given：回环服务已启动
- When：请求 `http://127.0.0.1:<port>/../../../etc/passwd`（各种编码变体）
- Then：一律拒绝，不返回 canvas 根之外的任何文件内容

- Given：回环服务已启动
- When：Browser Tab 中的用户按下 `mod+shift+d` 并点选页面控件
- Then：与既有行为一致，生成 DOM/CSS 上下文 capsule 附加到草稿框

- Given：用户从未点击「在浏览器打开」
- When：查看 Canvas HTML 预览
- Then：仍走 `<webview>` 强沙箱，行为与本次改动前一致

## 必须保持

- ADR-0129 Browser 仅接收 HTTP/HTTPS 的校验路径（`assertAllowedBrowserUrl`）不被绕过或放宽。
- `<webview>` HTML 沙箱的安全基线、CSP 与导航拦截不变。
- `mod+shift+d` 元素选取器与既有 capsule 结构不变（ADR-0129 后果段：只接线，不改注册表 / locale / IPC 聚合文件）。
- `browser_tab` 工具合同与审批分级不变。
- canvas 目录的只读事实源语义不变。

## 测试与验证

- **单元测试**：路径归一化与穿越拦截（含 URL 编码、`..`、绝对路径、符号链接）；端口占用时的回退；内容类型推导；只读约束（对写方法返回拒绝）。
- **生命周期测试**：服务随窗口关闭释放，端口不再占用；重复开启不泄漏监听器。
- **集成测试**：创建 HTML artifact → 触发跳转 → Browser Tab 激活且 URL 正确。
- **安全测试**：目录穿越用例矩阵必须全部拒绝。
- **用户流程**：HTML artifact → 在浏览器打开 → 页面可交互 → `mod+shift+d` 拾取元素。
- **质量检查**：`bun run check`。真实 Electron 行为如需验证，须用户明确授权后走 `verify:ui:*`，本 Task 不默认运行。
- **命令**：
  ```bash
  bun run test:impact -- apps/desktop/src/main/canvas-server/
  bun run check
  ```

## 交付记录

- 实际修改：
  - 新增 `apps/desktop/src/main/canvas-server/`：`canvas-preview-paths.ts`（URL ↔ 路径字面合同、入口选择、内容类型、包含性判定）、`canvas-preview-server.ts`（`127.0.0.1` 只读回环伺服、授权集、realpath 双重包含检查）、`canvas-preview-desktop.ts`（单例启停与 artifact 判定），以及三份测试共 49 例。
  - `apps/desktop/src/shared/canvas-ipc.ts`：新增 `vetta:canvas:open-in-browser` 通道与 `DesktopCanvasOpenInBrowserRequest/Result`；`canvas-browser-contracts.test.ts` 同步冻结 channel 名单。
  - `apps/desktop/src/main/ipc/canvas.ts`：新增 handler，窗口 teardown 释放伺服；`apps/desktop/src/main/main.ts`：退出清理纳入伺服释放。
  - `apps/desktop/src/preload/apis/canvas.ts`、`apps/desktop/src/preload/api-types/canvas.ts`：暴露 `canvas.openInBrowser`。
  - `useCanvasTabModel.ts` / `CanvasTabPanel.tsx`：HTML 预览栏「在浏览器打开」按钮，成功后走既有 `openUrlInActivityWorkspaceAtom` 切 Browser Tab；选中态不是 HTML 或文件缺失时不渲染按钮。
  - i18n：`activityPanel.canvas.openInBrowser`、`openInBrowserFailed`（zh/en）。
  - `docs/adr/0130-canvas-loopback-preview-server.md`（新 ADR，实施前先写）；发布说明 `.github/release-notes/v0.1.1.md`。
- 实际运行：
  - `bun ../../scripts/quality/run-vitest.mjs --run src/main/canvas-server/`（apps/desktop 下）：3 文件 49 例全绿（含目录穿越矩阵、写方法 405、未授权 artifact 403、符号链接逃逸 404、端口启停释放、新版本热更新、回环地址仍通过 `isAllowedBrowserTabUrl`）。
  - `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/activity-panel/components/canvas-tab/CanvasTabPanel.test.tsx src/preload/apis/canvas-browser-tab.test.ts src/shared/canvas-browser-contracts.test.ts`：3 文件 14 例全绿（含「在浏览器打开」用户流程、失败提示不切走预览、非 HTML 不显示入口、preload channel 映射）。
  - `bun run check`：见集成记录（本 Task 交付时先在 worktree 内跑 `check:quick`，合并后跑完整 `check`）。
- 未运行及原因：
  - `verify:ui:*` 真实 Electron 验收：本次未获用户明确授权，按根 `AGENTS.md` 不默认运行。
  - `mod+shift+d` 在回环页上的真实点选：选取器实现、快捷键注册表与 Browser 侧 WebView 接线本次一行未改，回环地址经同一个 `openUrlInActivityWorkspaceAtom` 进入同一 Browser Tab，故以「地址仍通过 `isAllowedBrowserTabUrl`」+ 既有选取器测试作为回归证据，真实点选留给后续 UI 验收。
  - 全量 `apps/desktop` 套件（821 文件）中 `src/main/runtimes/runtime-archive-installer.test.ts` 仍有 2 例失败：本机 `tar` 是 bsdtar，不支持该用例使用的 GNU `--force-local` 选项。已在主检出复现同样失败，确认与本次改动无关；其余失败（`runtime-host-capabilities`、`model-call-frame-contract`、`provider-observation`、`cli-runtime-canary`）在全量并发跑时超时，单独重跑全部通过。
  - 本 Task 的 worktree 由 `bun install --frozen-lockfile` 初始化，Electron 二进制未下载导致 4 个依赖 `electron-log` 的测试文件在 import 阶段报「Electron failed to install correctly」；补写 `node_modules/electron/path.txt` 后它们全部通过（属 worktree 环境修复，不涉及仓库文件）。
- 剩余风险：
  - 单主窗口假设：伺服挂在窗口 `closed` 的 IPC teardown 上；将来并列多窗口需要改成引用计数（已记入 ADR-0130）。
  - 端口可被本机其它进程访问：只暴露用户显式打开过的 artifact 内容，不含凭据；这是「完整浏览器环境」的固有代价。
  - URL 的工作空间段是 `encodeCanvasWorkspaceBucket` 的 base64url bucket（而非 workspaceId 原文），与 Task 正文的 `canvas/<workspaceId>/<artifactId>/index.html` 形态在语义上一致、字面上不同；原因见 ADR-0130 §2。
