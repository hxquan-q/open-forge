---
id: TASK-0075
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: BUG-0006; RESEARCH-0006; ISSUE-0011
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/browser-automation]
write_paths: [apps/desktop/src/main/browser-automation, project/bugs/BUG-0006-browser-picker-root-element.md]
exclusive_paths: []
depends_on: [TASK-0062]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 拒绝 Browser 点选 html/body 与满屏容器

## 目标

修复 BUG-0006：内置 Browser picker 不再把空白点击或满屏装饰层收成整页 capsule。

## 范围

### 做

- 抽出可单测、可注入 guest 的 `chooseInAppBrowserPickTarget`。
- 拒绝 `html`/`body` 以及面积 ≥ 视口 80% 且自身不是交互控件的容器。
- 优先 `elementsFromPoint` 里最深的可见交互节点；选不中则保持 picker 武装。

### 不做

- 真实 WebView 坐标 E2E（留给定向 Electron 验证）。
- 改 capsule schema 或审批流。
- 不占用 `TASK-0072`（该编号已留给 WebContentsView 迁移）。

## Given / When / Then

- Given：页面是满屏 body + `#go` 按钮，点击落在空白；When：picker `onClick`；Then：不产生 html/body capsule，picker 仍打开。
- Given：点击 `#go`；When：收集；Then：目标是 button。
- Given：满屏装饰 div 包裹按钮，点击按钮中心；When：收集；Then：目标是 button。

## 测试与验证

- `webview-picker-target.test.ts`、`webview-picker-guest.test.ts`
- `bun run test:impact -- <files>` + `bun run check:quick -- <files>`

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

内置浏览器点选不再把空白或满屏容器收成整页截图，草稿附件回到具体控件。

## 交付记录

- 实际修改：抽出 `chooseInAppBrowserPickTarget` 并注入 guest；拒绝 html/body 与满屏非交互容器；选不中保持 picker。`browser_tab.navigate` 成功后立即 `bumpRevision`。
- 实际运行：`webview-picker-target` 4、`webview-picker-guest` 3、`in-app-browser-tab-host` 9，均通过。`check:quick` 对本切片文件通过。
- 未运行及原因：真实 WebView 坐标 E2E 需 `verify:ui:*` 授权。
- 剩余风险：面积阈值 80% 对「本来就要选大卡片」的页面会拒绝，用户需点到内部控件。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：测试级复跑 picker 两个声明套件；并为用户面准备了一个可复现的夹具（见下），但**点选动作未能驱动**，原因同 TASK-0072。

| 合同条款 | 本次读数 |
|---|---|
| Given 满屏 body + `#go` 按钮、点击落在空白；Then 不产生 html/body capsule、picker 仍打开 | 由 `webview-picker-target.test.ts` 断言（根元素/满屏容器拒绝逻辑）；**真实点击未驱动** |
| Given 点击 `#go`；Then 目标是 button | 同上（目标解析）；**真实点击未驱动** |
| Given 满屏装饰 div 包裹按钮、点击按钮中心；Then 目标是 button | 同上（穿透满屏装饰层判定）；**真实点击未驱动** |
| 合计 | 浏览器域 **7 文件 / 62 例通过**（与 TASK-0072 同一批） |

**已就绪但未消费的夹具**：本任务在 Debug profile vettaHome 内新增 `fixtures/browser-page/picker-server.ts`（`Bun.serve`，端口 **8793**，不进仓库），两条路由均实测 **HTTP 200**：

- `/plain`：满屏 `body` + 居中 `#go`（`GO-PLAIN`）——用于「点空白不产生 html/body capsule」；
- `/deco`：满屏 `position:fixed; inset:0` 装饰 div 包裹 `#go`（`GO-DECO`）——用于「点按钮中心命中 button」。

夹具已跑通，但驱动点是 guest 页面内的鼠标点击，而 guest 是原生 `WebContentsView`，本轮已证其不可被 Playwright 读取/驱动（见 TASK-0072 的通道边界实测）。故夹具保留备用：**任何能操作真实鼠标与截图的回合（用户手动，或将来打通 guest 通道）都可直接用它复现三条条款**。

- **未覆盖**：三条 Given 的**真实点击判定**，全部。
- **关闭建议**：修复逻辑（拒绝 html/body 与满屏容器）在单测级被直接断言，夹具也已备好；缺的是用户面点击取证。建议与 TASK-0072 一并裁定：用户自行肉眼走查一次，或接受测试级口径。
