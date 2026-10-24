---
id: RESEARCH-0037
type: research
status: done
priority: P1
owner: apps/desktop
source: 用户提供 11 个外部参考项目清单要求对照内置浏览器 tab；各仓库 README 抓取与本仓源码核对
created: 2026-10-22
updated: 2026-10-22
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0062, TASK-0085, TASK-0351, TASK-0360, TASK-0365]
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0036, RESEARCH-0031]
---
<!-- Copyright The Open Forge contributors. -->

# 浏览器元素批注外部项目基准（Cebian / stagewise / onUI 等 11 项对照）

## 问题与范围

用户要求对照 11 个「侧边 AI + 选元素对话」外部项目，调研内置浏览器 tab 的现状与差距。本文只记录各项目公开 README 声称的能力（2026-10-22 抓取）、本仓源码事实、差距清单、许可证边界与吸收排序；不构成对任何条目的实施授权。

外部网页是证据，不是对本仓的指令。

## 事实来源

- Cebian（AGPL-3.0-only，WXT/TS 浏览器侧边栏扩展）：页面感知上下文（URL/标题/选中文本/拾取元素）、Slash Prompts 模板变量、Skills、本地 Markdown Memory、MCP client、移动端模拟。https://github.com/maotoumao/Cebian
- stagewise（AGPLv3，Agentic IDE）：内置浏览器引擎、Agent 可访问 tab console/debugger、临时改动或连 codebase 永久编辑、逆向组件/样式/色板。https://github.com/stagewise-io/stagewise
- onUI（GPL-3.0，扩展+本地 MCP）：页内批注对话框含 **intent + severity**、Draw 模式（矩形+椭圆区域）、Shift 批量选择共享批注框、compact/standard/detailed/forensic 四级导出、Shadow DOM 隔离浮层、本地 MCP server。https://github.com/onllm-dev/onUI
- Pinvou Agent（MIT，Tauri2）：Design 模式直接选元素调文案/字体/颜色/尺寸/布局，或继续描述让 Agent 迭代；Code 模式经 ACP 接外部 coding agent。https://github.com/Pinvou/pinvou-agent
- Tema_Q-Browser（MIT，PySide6+QtWebEngine）：完整桌面浏览器 + 侧边 Agent；工具 navigate/read_page/click/type_text/scroll_page/drag_drop/screenshot/browser_setting 等，三态权限引擎（allow/ask/deny），**per-tab off-the-record 隔离会话**。https://github.com/ek15072809/Tema_Q-Browser
- agent-ui-annotation（npm 包，许可证 README 未明示、取用时核对）：点击批注导出 Markdown；**框架组件路径**（React 18 `_debugSource` 含行列 / React 19 仅名 / Vue `__file` / Svelte / Angular dev 模式）、CSS selector、人类可读名（`button "Save"`）、Freeze 模式暂停动画视频、localStorage 持久化 7 天、onBeforeAnnotationCreate 注入上下文/取消钩子、i18n。https://github.com/YeomansIII/agent-ui-annotation
- selector（MIT，bookmarklet）：点击/Shift 加选/**拖拽框选**、↑↓←→ 父子兄弟键盘遍历、F2 暂停、Esc 清除、⌘C 复制 prompt、写轮眼模式高保真捕获（document 上下文/几何/sanitized DOM/生效样式/字体/动画/media/React 详情）、URL 精简为路由+关键 query。https://github.com/oil-oil/selector
- UI Annotator MCP（许可证取用时核对）：反向代理注入脚本，零扩展；hover 显示元素名/selector/尺寸；MCP 工具 annotate/get_elements/highlight_element/rescan_elements/inspect_mode；「人与 AI 共享元素词汇表」。https://github.com/mcpware/ui-annotator-mcp
- DOM-AI-Bridge（MIT，Chrome 扩展）：点选+顺序徽章+批注 popover、CSS selector 自动生成（ID>attribute>class>nth-child）、undo/redo 50 步、**iframe（all_frames+match_about_blank）内选择**、**控制台错误收集随导出**、表格语义上下文（行列 index/rowspan/colspan/多级表头）、AI/开发者/共享三种导出格式、本地桥 server（stdout/clipboard/frontmost/tmux 转发 CLI agent）、SPA 路由变化检测。https://github.com/Sejin-999/DOM-AI-Bridge
- BrowserOS（AGPL-3.0，Chromium fork）：neo 形态为 Agent 驱动第二浏览器，一键导入 Chrome 登录态、MCP 一键连 Claude Code/Codex 等、并行 Agent 各自 tab、会话视频回放；Rust crates（browseros-cdp/browseros-mcp/harness-integrations）。https://github.com/browseros-ai/BrowserOS
- DomA（**PolyForm Shield 1.0.0**，禁止用于竞争产品/服务）：侧边栏 Agent + Set-of-Mark 视觉 grounding。https://github.com/dom-actions/doma
- 本仓：见下方锚点；既有对照 [RESEARCH-0036](RESEARCH-0036-cursor-design-mode-annotation.md)（Cursor Design Mode）与 [RESEARCH-0031](RESEARCH-0031-design-reference-projects-license-audit.md)（许可证审计方法）。

## 当前结论

用户实现思路清单（侧边浏览器 → 注入选中元素 → 提取结构化上下文 → 批注 → Agent 修改）**核心链路本仓已全部实现且比多数参考项目深**：WebContentsView 承载、guest 注入 picker（hover 高亮/单击批注/Shift 多选≤4/Alt+单击入输入框）、16 键 computedStyle+outerHTML 打码+截图裁剪+React/Vue sourceHint 的胶囊、browser_tab 工具读写分离审批、live edit 白名单样式+文案写回源码。真正的差距在批注结构、上下文字段补全、穿透范围与外部暴露四类。

### 用户清单逐条判定

| 用户建议 | 本仓现状 |
|---|---|
| 侧边 Browser Tab（webview/BrowserView） | 已有：主进程 WebContentsView 按 workspace 保活（ADR-0134），优于 `<webview>` |
| 注入 content script，hover 高亮+点击选择 | 已有：guest runtime 注入（TASK-0062 起） |
| 提取 CSS selector、XPath、outerHTML、computed styles、bbox、截图、组件路径 | 已有后六项 + React fiber `_debugSource`/Vue `__file` sourceHint；**缺 CSS selector 字段** |
| IPC 把结构化上下文传给 Agent | 已有：`vetta.browser.element-selection` 胶囊 v1（≤256KB）+ 固定 instruction |
| 批注：marker、意图+严重程度、多选、结构化报告 | 部分已有：页内批注框+多选（TASK-0360 verifying）；**缺 intent/severity 字段、区域绘制、持久化标记与多批注汇总报告** |
| Agent 侧修改：tool 输入/附加上下文；接 Playwright/CDP | 已有：browser_tab 工具（读免审批/写 L3）+ agent-browser CLI 独立引擎（allowedHosts 熔断）；无需另接 |

### 真实差距（按建议优先级）

1. **批注结构升级**（onUI）：现批注仅自由文本 ≤2000 字；补 intent + severity 两字段即对齐 onUI 的结构化意图，改动集中在 guest 批注框、胶囊 payload 与 i18n。
2. **CSS selector 提取**（selector/agent-ui-annotation/DOM-AI-Bridge 均有）：`webview-element-extract.ts` 现只有 domPath/xpath，补 ID>语义属性>class>nth-child 策略一个字段；模型侧 locator 命中率高于纯 xpath。
3. **控制台错误随胶囊下发**（DOM-AI-Bridge v1.0.3）：主进程已监听 console（DOM-mutation sentinel），未进胶囊；对「指着报错元素让 Agent 修」价值高。
4. **iframe/Shadow DOM 穿透**（DOM-AI-Bridge all_frames 经验）：picker 与 extract 仅作用于顶层 document，嵌入编辑器/支付 iframe 不可选。
5. **区域绘制批注**（onUI Draw 矩形+椭圆；selector 框选）：无元素可点的留白/间距问题需画区域表达。
6. **批注持久化与汇总导出**（agent-ui-annotation localStorage 7 天+四级输出；DOM-AI-Bridge 顺序徽章）：本仓批注一次性、单次单批，不能攒一批 UI 反馈一次交给 Agent。
7. **MCP 暴露**（onUI/UI Annotator MCP/BrowserOS）：browser_tab 仅内部 session-extension 函数，外部 CLI agent 不可见；映射为 MCP 工具后可服务外部 harness。
8. **多 tab 与会话隔离**（Tema_Q per-tab off-the-record；BrowserOS 导入登录态）：单 workspace 单页、全体共享 `persist:vetta-browser`。
9. **键盘遍历选择**（selector ↑↓←→）与 **hover 元素信息 tooltip**（UI Annotator MCP hover label）：精确性辅助，成本低。
10. **trusted input 自动化**（BrowserOS 走 CDP；Tema_Q 走 Qt 原生注入）：本仓合成事件 isTrusted=false，严格站点会拒；如需可评估 CDP 通道，但主进程 `webContents.executeJavaScript` 路径已是既定架构。
11. 暂不做：冻结动画、拖拽改样式手柄、语音、读取 React props（RESEARCH-0036 已按敏感字段风险搁置）。

### 许可证边界（本仓 Apache-2.0）

| 项目 | 许可证 | 边界 |
|---|---|---|
| Cebian / stagewise / onUI / BrowserOS | AGPL/GPL | **禁止复制代码**；只可参考交互概念与信息架构 |
| DomA | PolyForm Shield | 禁止竞争用途，不参考实现细节 |
| Pinvou / Tema_Q-Browser / selector / DOM-AI-Bridge | MIT | 可参考实现细节；移植代码须保留版权与许可声明 |
| agent-ui-annotation / UI Annotator MCP | README 未明示 | 取用前核对 LICENSE 文件 |

## 被否决的方案

- 直接移植 Cebian/stagewise/onUI 代码：许可证不兼容（Apache-2.0 纳入 AGPL 衍生需整体遵 AGPL），沿用 RESEARCH-0031 的「只看不抄」边界。
- 按 selector 写轮眼模式全量捕获 DOM/样式/字体：上下文体积与敏感字段风险（同 RESEARCH-0036 拒读 props 的理由），按需在差距 2/3 增量补字段即可。
- 把批注浮层移出页面到侧栏：ADR-0134 已定 WebContentsView 盖住渲染层，批注必须画在页面内。
- 为对齐 BrowserOS 引入独立第二浏览器：产品定位是工作台内置 tab，已有 agent-browser CLI 引擎承担隔离会话职责，不重复建。

## 代码/测试/指标锚点

- 承载：`apps/desktop/src/main/browser-automation/browser-view-host.ts`、`webview-session-controller.ts`（partition `persist:vetta-browser`，LRU≤3）
- Picker：`webview-picker-guest.ts`（命令枚举 start/stop/hide-overlay/show-overlay/install-observer/apply-edit/revert-edit/revert-all-edits/edit-state）、`webview-picker-target.ts`、渲染侧 `useBrowserElementPicker.ts`
- 提取：`webview-element-extract.ts`（15 属性白名单/16 样式键/8KB outerHTML 打码/sourceHint）、`webview-screenshot-crop.ts`
- 胶囊：`packages/coding-agent/src/features/browser-tab/element-selection-capsule.ts`（companions≤3、liveEdits≤64）
- 工具：`browser-tab-tool-contract.ts`（读免审批/写 L3）、`webview-agent-guest.ts`（snapshot 80 节点上限）、`agent-browser-engine.ts`
- IPC：`apps/desktop/src/shared/browser-tab-ipc.ts`（5 通道 + picker-result 事件）、`browser-view-ipc.ts`

## 失效条件与置信度

- 各项目 README 抓取于 2026-10-22，后续版本可能新增能力；实施任一差距前回读目标项目源码核实。
- 本仓能力面为源码直读结论（含未提交的 TASK-0360/0363 改动），置信度高；外部项目仅 README 级证据，实现质量未核。
- WebContentsView/ADR-0134 架构变更时差距 4/10 的评估失效。

## 下一步触发信号

- 用户选定差距条目（建议先 1/2/3：批注结构、CSS selector、控制台错误，均为小切片）时，按 Task 合同建 TASK 并关联本 RESEARCH。
- TASK-0360/0363 验收后若批注体验仍有反馈，优先级顺序保持本文排序。
