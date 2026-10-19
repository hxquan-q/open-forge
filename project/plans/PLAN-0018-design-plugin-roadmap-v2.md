---
id: PLAN-0018
type: plan
status: draft
priority: P1
requirement: REQ-0005
owner: packages/plugins
source: user-request；外部仓库 LICENSE 与官方文档调研（2026-10-18，见 RESEARCH-0031）
created: 2026-10-18
updated: 2026-10-18
related_requirement: [REQ-0005]
related_tasks: [TASK-0046, TASK-0055, TASK-0058]
related_issues: [ISSUE-0008]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 设计插件统一路线图 v2（去品牌 × 安全 × 设计能力 × 可借鉴代码）

## 背景与目标

目标 [Requirement](../requirements/REQ-0005-openforge-independent-release-and-compliance.md)：设计插件（现 `packages/plugins/presets/vetta-ui-design/`，P2 后为 `packages/plugins/presets/openforge-design/`，下文用 `<plugin>/` 指代）完成用户可见去品牌、安全加固，并吸收业界现成模块补齐源码定位、元素拾取与视觉编辑写回能力。许可证与参考项目审计依据见 [RESEARCH-0031](../research/RESEARCH-0031-design-reference-projects-license-audit.md)。

相对 v1（PLAN.md，会话内草稿、未入台账；本篇为该路线图首个入库版本）的变更：

1. 不发布 npm：`@openforge/*` 只作内部 scope，所有 workspace 包 `"private": true`，去掉 TASK-0046 的阻塞（该 Task 已于 2026-09-25 按用户决策「暂不注册 npm org」记 blocked，与本计划一致）；
2. 新增「参考项目矩阵」与可直接复用的代码；
3. 阶段重排为 P0–P8。

本计划只给方案，状态为 `draft`，**不进入实施**：没有执行脚本、没有修改或推送用户仓库。实施需用户另行授权，并按切片先建 Task。设计能力阶段（P5–P7）启动时如需独立 Requirement 再按记录路由补建。

### 落盘核对（2026-10-18，入库时修正与核实）

- **基线修正**：方案原文写的基线 `main（6c02ce2）` 在本仓 git 历史不可解析（可能来自调研会话的 worktree 提交）；落盘时基线为 `main` HEAD `2aab4c002`，上游 merge-base `b590c7e`（openvetta/open-vetta）核实有效。（2026-10-18 补正：`6c02ce2d0` 实为 origin/main 的 dev→main 晋升合并提交，落盘时本地尚未 fetch origin/main 才不可解析；本仓开发基线仍以本地 main 为准。）
- **代码锚点**：插件侧 20 个锚点全部核实存在——`engine/vite.config.mjs`、`src/vetd/layout-probe.ts`、`test/layout-probe.test.ts`、`src/history/{turn-history,history-client,restore}.ts`、`src/history/HistoryDrawer.tsx`、`history-runner/src/runner-entry.ts`、`src/canvas/{selection-ask,frame-raster,FrameContextMenu,theme-tokens,ThemePalette}`、`src/preview-mode/{PreviewDialog.tsx,preview-client.ts}`、`src/export/export-design.ts`、`src/notes/{annotate,handoff,notes-store}.ts`、`test/entry-lazy-surfaces.test.ts`，以及 `src/design-systems/{apply,catalog-sync,remote-catalog}.ts` 与 `apps/desktop/src/shared/desktop-brand.ts`。
- 许可证结论来自 GitHub 仓库元数据（license 字段）和 LICENSE 原文，核对时间 2026-10-18 台北时间；产品功能描述来自官方文档或博客的检索结果。标「未核实」的条目在采用前需要复核。非法律意见。

## 当前事实

### 已定命名（沿用 v1，按「不发布 npm」更新）

| 项 | 名称 |
| --- | --- |
| 插件 id / 目录 | `openforge-design` / `packages/plugins/presets/openforge-design/` |
| 显示名 | 「Open Forge 设计」/ "Open Forge Design"（经 `apps/desktop/src/shared/desktop-brand.ts` 插值） |
| 工作态 / 分享包 | `.frgd/`（目录）/ `.frgdz`（zip） |
| agent 工具 | `design_create` `design_screenshot` `design_status` `design_install` `design_notes` `design_history` `design_restore` `design_export` `design_commit`，新增工具见功能设计 |
| DOM 属性 | `data-frgd-src="frames/x.tsx:L:C"`、`data-frgd-comp`、`data-frgd-frame/overlay/overlay-label/scroller` |
| 环境变量 | `VETD_*`→`FRGD_*`；`VETTA_*`→`OPENFORGE_*` |
| 包 scope | `@vetta/*`、`@vetta-org/*` → `@openforge/*`（仅内部，不注册、不发布） |
| IPC / 协议 | `openforge:<domain>:*`；`openforge-plugin://` `openforge-media://` `openforge-file://` `openforge-host://` `openforge-theme://`；深链 `openforge://` |
| 插件包后缀 | `.ofpkg`（碰撞未核实） |
| 历史作者 / trailer | `Open Forge Design <design@openforge.local>` / `openforge-history:` |
| manifest | `design.json`，`type: "openforge-design"`，`schemaVersion: 3` |

### 不发布 npm 带来的新风险：依赖混淆（dependency confusion）

`@openforge` 在 npm 上没有被注册（registry 检索 scope:openforge 当前 0 个包）。一旦有任何依赖没有走 workspace 解析，包管理器就会去公共 registry 拉取，攻击者可以抢注同名包。处置：

- 所有内部依赖统一写 `workspace:*`；
- 在 `bunfig.toml` / `.npmrc` 里把 `@openforge` scope 指向一个不存在的私有 registry（例如 `registry=http://127.0.0.1:9/`），保证该 scope 永远不会解析到公网；
- CI 中检查 `bun.lock` 里不出现 `@openforge/*` 的 registry 解析；
- （可选，成本低）防御性地注册 npm org，但不发布任何包。

第三方插件开发者拿不到 npm 上的 SDK：改为把 `@openforge/plugin-sdk`、`@openforge/plugin-cli` 打成 tarball 随应用分发，或通过 `openforge plugin init` 脚手架复制源码。这一项列入 P8 文档。

## 参考项目矩阵（§2）

分类说明：**①可拷贝**：MIT/Apache/BSD，可以把代码合入闭源商用 Electron。MIT/BSD 要保留版权与许可文本；Apache-2.0 还要保留 NOTICE（如果上游有）并标注修改。**②只看**：AGPL/GPL/MPL 文件级 copyleft，或 source-available/专有/无许可。可以学习思路，不复制代码。MPL 组件可以作为独立进程原样使用。**③仅产品思路**：闭源商业产品。

| 项目 | 许可（已核） | 类别 | 借什么 | 接入 openforge-design 的位置 | URL |
| --- | --- | --- | --- | --- | --- |
| dyad `@dyad-sh/react-vite-component-tagger` | Apache-2.0（dyad 主仓 Apache-2.0，`src/pro/` 为 FSL-1.1-ALv2；本包不在 pro 下；根目录有 NOTICE） | ① | Vite 插件，用 `@babel/parser` + `estree-walker` + `magic-string`，给 JSX 注入 `data-dyad-id="file:line:column"` 和 `data-dyad-name`。和现有 instrumentation v2 几乎同构，体量约百行 | `<plugin>/engine/vite.config.mjs` 中现有的 `data-vetd-source` Babel 注入，改为 `engine/plugins/source-tagger.mjs` | https://github.com/dyad-sh/dyad/tree/main/packages/@dyad-sh/react-vite-component-tagger |
| Onlook `packages/parser`（code-edit） | Apache-2.0 | ① | `src/code-edit/{style,text,move,insert,remove,group,layout,image,transform}.ts`：基于 Babel AST 的结构化改码（改 Tailwind class、改文本、移动/插入/删除/成组），外加 `ids.ts`（稳定 id 生成与去重） | 新建 `<plugin>/src/inspector/ast-edit/`。原实现以 `data-oid` 定位节点，需要适配成 file:line:col 加指纹重定位。依赖 `@onlook/utility`、`@onlook/constants`，要剥离 | https://github.com/onlook-dev/onlook/tree/main/packages/parser |
| Onlook `packages/penpal` | Apache-2.0（底层 penpal 库 MIT，未逐一核实版本） | ① | 父窗口与 iframe 之间的类型化 RPC（parent.ts / child.ts） | `<plugin>/engine/src/bridge.ts` 与 `<plugin>/src/canvas/bridge-client.ts`（frame 改为独立 origin 后的 postMessage RPC） | https://github.com/onlook-dev/onlook/tree/main/packages/penpal |
| Onlook 新 Mac 桌面版 | 源码尚未公开：官方文档称「准备在接下来几周开源」，与旧仓不是同一代码库 | ③（发布后复核许可） | 思路：项目放在 git worktree 中，agent 只改 worktree，产出以 PR 形式离开 | 对应历史与分支设计（F4） | https://docs.onlook.com/developers 、 https://docs.onlook.com/developers/architecture |
| Onlook 旧桌面版 onlook-dev/desktop | Apache-2.0（最后推送 2025-07-17） | ① | Electron 下的 webview 注入、写回代码的流程（老架构） | 只作参考 | https://github.com/onlook-dev/desktop |
| code-inspector-plugin | MIT（v2.0.9） | ① | 支持多构建器（vite/webpack/esbuild/turbopack）的源码定位注入，以及「点击 DOM 打开 IDE 并定位光标」 | 「在 IDE 中打开」功能：`<plugin>/src/canvas/FrameContextMenu.tsx` 调宿主 IPC，宿主用 launch-editor 风格的实现（launch-editor 的许可未核实） | https://github.com/zh-lx/code-inspector |
| react-grab | MIT | ① | 元素拾取 overlay，以及「把 UI 元素连同上下文复制给 agent」的上下文格式：组件栈、HTML 片段、样式 | `<plugin>/engine/src/` 下新建 picker 模块；上下文打包进 `<plugin>/src/canvas/selection-ask.ts` | https://github.com/aidenybai/react-grab |
| bippy | MIT | ① | 安全读取 React fiber（组件名、props、owner 链），可绕开 React 19 已移除的 `_debugSource` | `<plugin>/engine/src/bridge.ts`：选中时读取 `data-frgd-comp` 对应的 props | https://github.com/aidenybai/bippy |
| react-scan | MIT | ①（按需） | 渲染性能高亮 | 可选的「性能视图」开关 | https://github.com/aidenybai/react-scan |
| LocatorJS `@locator/babel-jsx`、`@locator/runtime` | MIT（以各包 package.json 为准；仓库根目录没有 LICENSE 文件） | ① | 「元素 / 父组件」切换选择（Alt+点击上溯组件）的交互 | `<plugin>/src/canvas/selection-ask.ts` | https://github.com/infi-pc/locatorjs |
| click-to-component | MIT | ①（思路为主） | Option+点击打开源码，右键弹出组件栈菜单 | 同上 | https://github.com/ericclemmons/click-to-component |
| react-dev-inspector | MIT | ①（思路为主） | 同类方案 | — | https://github.com/zthxxx/react-dev-inspector |
| Excalidraw `@excalidraw/excalidraw` | MIT | ① | 嵌入式手绘白板组件，可导出 PNG/SVG/JSON | 草图层：`<plugin>/src/notes/`、`<plugin>/src/canvas/NotesLayer.tsx` | https://github.com/excalidraw/excalidraw |
| screenshot-to-code | MIT | ① | 图片或截图转 HTML/Tailwind/React 的提示词与评测方法（backend/prompts，路径未逐一核实） | `<plugin>/agent/skills/openforge-design/references/image-to-ui.md` + 新工具 `design_import_reference` | https://github.com/abi/screenshot-to-code |
| open-lovable | MIT（抓取依赖 Firecrawl 云 API） | ①（流程）/ 注意服务条款 | 「URL → 抓取 → 生成 React 复刻」的流程与提示词 | `design_import_reference` 的 URL 模式；抓取改用本地 offscreen 窗口截图加 DOM 快照，不依赖 Firecrawl | https://github.com/firecrawl/open-lovable |
| bolt.diy | MIT | ① | 流式 action 解析（LLM 输出里的文件写入与命令块）、文件锁、diff/回退 UI | 对照 `<plugin>/src/history/turn-history.ts` 的「一轮一提交」做 diff 预览 | https://github.com/stackblitz-labs/bolt.diy |
| bolt.new | MIT（2024-12 后基本不再更新） | ①（旧） | 同上，以 bolt.diy 为准 | — | https://github.com/stackblitz/bolt.new |
| OpenUI（wandb） | Apache-2.0 | ① | 同一 UI 多版本并排展示，HTML 到多框架的转换提示词 | 多方案生成（F6）的提示词参考 | https://github.com/wandb/openui |
| LlamaCoder | MIT | ①（思路） | 单文件 React 生成加 Sandpack 预览 | 只作参考 | https://github.com/Nutlope/llamacoder |
| Sandpack | Apache-2.0 | ①（但不建议作为引擎） | 浏览器内打包预览。默认依赖 CodeSandbox 托管的 bundler，自托管的许可与可行性未核实 | 评估结论见 F17：不替换现有 vite 引擎，最多用于「分享包网页预览」 | https://github.com/codesandbox/sandpack |
| WebContainers | webcontainer-core 仓库为 MIT，但只是文档和 issue 仓库；API 商用需要 StackBlitz 商业许可（未核实具体条款） | ②/③ | 浏览器内 Node | 不采用：Electron 本身有 Node | https://github.com/stackblitz/webcontainer-core |
| Storybook | MIT | ①（格式兼容即可，不嵌入） | CSF3 的 story 格式 | 组件页（F8）：`x.frgd/components/*.stories.tsx` 写成与 CSF3 兼容 | https://github.com/storybookjs/storybook |
| Puck | MIT | ① | 组件拖放面板的配置模型（components config、fields 定义） | 组件插入面板：`<plugin>/src/canvas/` 下新建 `ComponentsPanel.tsx`，插入动作走 Onlook 的 `insert.ts` | https://github.com/puckeditor/puck |
| Craft.js | MIT（最后推送 2025-02） | ①（思路） | 节点树编辑器的数据模型 | 只作参考（代码优先，不维护独立节点树） | https://github.com/prevwong/craft.js |
| GrapesJS | BSD-3-Clause（packages/core/LICENSE） | ① | 样式管理器的分区设计（布局 / 排版 / 装饰） | 视觉编辑面板的信息架构（F3） | https://github.com/GrapesJS/grapesjs |
| Plasmic | 仓库根目录 MIT；`platform/` 为 AGPL-3.0（LICENSE.platform.md） | 根目录包①，platform 编辑器② | 只看：画布编辑器交互 | — | https://github.com/plasmicapp/plasmic |
| Webstudio | AGPL-3.0 | ② | 样式面板、token 交互思路 | — | https://github.com/webstudio-is/webstudio |
| Penpot | MPL-2.0 | ②（可作独立进程使用） | 官方 MCP（现位于 penpot 主仓 docs/mcp，`npx @penpot/mcp@stable`；旧的 penpot-mcp 仓库已归档，MPL-2.0），Plugin API | 导出到 Penpot：作为外部 MCP 进程接入宿主的 `packages/runtime-mcp`，不复制代码 | https://github.com/penpot/penpot 、 https://help.penpot.app/mcp/ |
| tldraw SDK | tldraw license（生产环境需要许可证 key / 商业许可） | ② | 无限画布、agent 画布交互 | 不采用 | https://github.com/tldraw/tldraw |
| tldraw make-real | 仓库没有 LICENSE 文件（视为保留所有权利），已归档，依赖 tldraw SDK | ② | 思路：画草图 → 「Make Real」→ 旁边生成一个可运行 frame | F10 | https://github.com/tldraw/make-real |
| tldraw computer | GitHub 上未找到公开仓库（tldraw/tldraw-computer 不可见） | ③ | 节点式工作流画布 | 不采用 | — |
| cursor-talk-to-figma-mcp | MIT | ① | Figma 插件加本地 WebSocket 中继，让 agent 读写 Figma | Figma 桥（F15）：新建 `<plugin>/src/figma/` | https://github.com/grab/cursor-talk-to-figma-mcp |
| Theatre.js | `@theatre/core` Apache-2.0；`@theatre/studio` AGPL-3.0 | core ①，studio ② | 原型动效时间轴（关联度低） | 暂不纳入 | https://github.com/theatre-js/theatre |
| Builder.io SDK、Mitosis | MIT | ①（关联度低） | Mitosis 的组件跨框架编译 | 暂不纳入 | https://github.com/BuilderIO/builder 、 https://github.com/BuilderIO/mitosis |
| Builder.io Visual Copilot / Fusion | 专有 | ③ | Figma 转代码时映射到现有组件库 | F7 | https://www.builder.io |
| Google Stitch | 专有 | ③ | 无限画布、一次生成最多 5 个屏或变体、URL 提取设计系统、DESIGN.md 导入导出、MCP/SDK、导出到 Figma（可编辑图层） | F6 / F7 / F14 | https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/ |
| v0 Design Mode | 专有 | ③ | 选中预览中的元素，用视觉面板或自然语言修改，结果作为新的代码版本 | F3 / F4 | https://v0.app/docs/design-mode |
| Lovable Visual Edits | 专有 | ③ | DOM 映射到 JSX，直接改 Tailwind，不经过 LLM（不耗额度），然后热更新 | F3 | https://lovable.dev/blog/visual-edits |
| Figma Make | 专有 | ③ | 点选编辑（样式、间距、文本）、可编辑的任务计划、prototype 嵌入 | F3 / F13 | https://www.figma.com/make/ |
| Cursor Design Mode | 专有 | ③ | 选中时发送「元素身份（xpath、组件、属性、计算样式、fiber props）+ 截图」，支持框选区域、多选、语音、并行子 agent；设计侧栏改样式后由 agent 写回 | F2 / F3 | https://cursor.com/docs/agent/design-mode |
| Paper.design | 专有 | ③ | 以 HTML/CSS 为画布原生介质；MCP 读写画布、同步 token 与内容；WebMCP | F11 / F14 | https://paper.design/docs/mcp |
| Pencil.dev（pen.dev） | 专有（.pen JSON 格式有公开文档） | ③ | agent 优先的 MCP（get_app_state / read_skill / execute / get_style），无界面 CLI，可版本管理的 JSON 设计文件 | F11 | https://docs.pencil.dev/for-developers/the-pen-format |
| Claude Design | 专有 | ③ | 画布、评论、直接编辑；导出 ZIP/PDF/PPTX/HTML；「交给 Claude Code」时携带 README 和构建提示 | F12 / F16 | https://support.claude.com/en/articles/14604416-get-started-with-claude-design |
| Claude Artifacts | 专有 | ③ | 单文件可运行产物，可分享 | 分享包网页预览 | — |
| Magic Patterns | 专有 | ③ | 从 Figma / Storybook / GitHub 导入设计系统；Select Mode 精确修改 | F7 | https://www.magicpatterns.com/blog/introducing-design-systems |
| Subframe | 专有 | ③ | 和代码库原生同步的 React 画布，组件与 token 检查，接入编码 agent | F7 / F8 | https://www.subframe.com/ |
| Framer AI、Same.new、Polymet、Tempo Labs、UX Pilot、Uizard | 专有（本轮未逐条核实功能） | ③ | 一般性思路：线框到高保真、设计稿出码、站点复刻 | 不单独立项 | — |

## 候选方案与取舍（基于参考项目）

**源码定位：注入 file:line:col 还是把稳定 id 写进源码？** Onlook 把 `data-oid` 写进源码，Dyad 和 code-inspector 在构建期注入行列号。结论：构建期注入 `file:line:col`，不污染源码（采用 Dyad 方案）。行列号在编辑后会漂移，用两种方式补偿：每次 HMR 后 bridge 重新上报当前选中元素的新定位；AST 改码时用「标签名 + 祖先路径 + 文本指纹」重新定位。不采用 Onlook 的 oid 写入，因为 agent 改代码时容易删掉或复制这些 id。

**React 19 已移除 fiber 的 `_debugSource`。** 只能靠 Babel 注入属性取得源码位置；组件名和 props 用 bippy 读取 fiber。

**视觉编辑要尽量绕开 LLM。** Lovable 和 v0 的经验是：直接改 Tailwind class 或文本的确定性编辑走 AST，不耗模型、毫秒级生效；只有需要语义判断的修改才交给 agent。

**agent 上下文包。** 参考 Cursor 和 react-grab，选中一个元素时发给 agent 的内容固定为：`{locator, component, props 摘要, 计算样式摘要, outerHTML 片段（截断）, 选区截图}`。

**引擎不换。** 保留每份设计一个本地 vite 的方案，不换 Sandpack 或 WebContainers，详见 F17。

## 功能设计（每项标注阶段、文件、工作量、风险）

### F1 源码定位 v2（P2，0.5 人周，含在 P2 估算内）

做法：把 dyad tagger 移植为 `<plugin>/engine/plugins/source-tagger.mjs`。属性改为 `data-frgd-src`、`data-frgd-comp`；跳过 Fragment；只在 dev serve 注入；文件路径相对设计根目录。

文件：`<plugin>/engine/vite.config.mjs`（替换原 Babel 注入）；`<plugin>/engine/src/bridge.ts`；`<plugin>/src/vetd/layout-probe.ts`（P2 后改名为 `src/bundle/layout-probe.ts`）；`<plugin>/test/layout-probe.test.ts`。

合规：文件头保留 Apache 许可声明，加 "Modified by The Open Forge contributors"；NOTICE 追加 dyad 条目（dyad 根目录 NOTICE 中的相关内容）。

验收：随机抽 100 个 JSX 节点，定位与 AST 一致；导出产物里没有 `data-frgd-*`。

风险：`.tsx` 需要 Babel 的 typescript、jsx 插件选项；性能比原注入更好，因为 magic-string 不重新生成整个文件。

### F2 元素拾取与 agent 上下文包（P2 末 + P3，1–1.5 人周）

做法：react-grab 风格的 overlay：悬停高亮、单击选择、Alt+点击上溯父组件（LocatorJS 交互）、Shift+拖拽框选区域、多选（Cursor）；用 bippy 取组件名和 props；截图复用现有的 `<plugin>/src/canvas/frame-raster.ts` 并裁剪到选区。

文件：`<plugin>/engine/src/` 下新建 picker 模块；`<plugin>/src/canvas/selection-ask.ts`、`SelectionAskBadge.tsx`、`attach.ts`。

验收：多选 3 个元素、发起「让它们一致」的请求时，agent 收到 3 个完整上下文包；上下文包大小不超过 8KB（截图走附件）。

风险：iframe 改为独立 origin 后，overlay 必须运行在 frame 内部，通过 RPC 上报。

### F3 视觉编辑面板 + AST 写回（P3，3–3.5 人周）

做法：面板信息架构参考 GrapesJS 样式管理器和 Cursor 设计侧栏：布局 / 尺寸 / 间距 / 排版 / 颜色（主题 token）/ 外观；修改映射为 Tailwind class 增删，复用 Onlook `code-edit/style.ts` 的思路与代码；文本直接在画布上双击编辑，对应 Onlook `text.ts`；移动、删除、成组对应 `move.ts` `remove.ts` `group.ts`；写回用 recast 或 magic-string 尽量保持原格式，写入走 P0 引入的「每份设计一个写队列」并做哈希比对（CAS）。

文件：新建 `<plugin>/src/inspector/`：`InspectorPanel.tsx`、`ast-edit/`（移植自 Onlook）、`tailwind-map.ts`；宿主侧解析在主进程或 worker 中执行（插件 FS API 读写）。

合规：Onlook 文件逐个保留 Apache 声明并标注修改；NOTICE 追加 Onlook（上游是否有 NOTICE 文件未核实）。

验收：做 100 次随机 class 和文本编辑再 undo，文件字节级还原；动态 className（模板字符串或条件表达式）一律只读并提示「交给 agent」。

风险：Tailwind 任意值或自定义配置的映射覆盖不全，通过 theme.css 的 token 表兜底。

### F4 撤销 / 版本 / 分支（P3，1–1.5 人周）

做法：操作日志 undo 栈；agent 的一轮修改作为一个复合操作，对接 `<plugin>/src/history/turn-history.ts`；历史外置为 `~/.openforge/plugin-data/openforge-design/history/<designId>.git`（v1 §4.1）；参考 Onlook 的 worktree 和分支思路，新增「分支试验」：从某个版本分出变体，对应 F6。

文件：`<plugin>/src/history/undo-stack.ts`（新）；`history-client.ts`、`restore.ts`、`HistoryDrawer.tsx`；`<plugin>/history-runner/src/runner-entry.ts`。

验收：撤销跨越 agent 提交边界时自动转为 restore；分支切换后画布一致。

### F5 图层面板（P3，1 人周）

做法：bridge 收集带 `data-frgd-*` 的节点树，按 `data-frgd-comp` 折叠，与画布双向同步选中。

文件：`<plugin>/src/canvas/LayersPanel.tsx`（新）、`engine/src/bridge.ts`。

### F6 多方案生成（P5，1.5 人周）

做法：参考 Stitch（一次最多 5 个屏）和 OpenUI 的多版本并排；`design_create` 增加 `variants: n` 参数，或新增工具 `design_variants`；在画布上生成一个「变体组」，组内 n 个 frame 并排；宿主已有 `packages/runtime-subagents`，可以并行派发子 agent，每个子 agent 只写自己的 frame 文件；用户「采用」其中一个后，其余移入 `archive/`（仍保留在历史里）。

文件：`<plugin>/src/tools.ts`；`<plugin>/src/canvas/arrange.ts`（排布）、`DesignCanvas.tsx`；layout.json 增加 groups。

风险：并行写同一个 theme.css 会冲突，变体只允许写自己的 frame 和组件副本。

### F7 设计系统与组件库（P5，1.5–2 人周）

现状：插件已有 `<plugin>/src/design-systems/`（catalog、apply、remote-catalog）和设计包内的 DESIGN.md。

做法：参考 Magic Patterns 和 Subframe，增加三种导入来源——URL：offscreen 抓取后提取色板、字体和组件特征；Storybook：读 CSF；Figma Variables：只读 REST。参考 Stitch，DESIGN.md 与其「agent 友好的设计规则文件」保持格式兼容，可以导入导出（Stitch 的 DESIGN.md 是否有公开 schema 未核实）。

文件：`<plugin>/src/design-systems/apply.ts`、`catalog-sync.ts`、`remote-catalog.ts`；`<plugin>/src/canvas/DesignSystemDialog.tsx`。

风险：远端 catalog 拉取要防 SSRF 和注入，沿用 `DesignSystemDemo.tsx` 已有的 sandbox 策略。

### F8 组件页（Storybook 风格）（P5，1 人周）

做法：`x.frgd/components/*.stories.tsx` 采用 CSF3 子集（default export `{ component, args }` 加具名 story）；画布上的「组件页」frame 自动铺开所有 story；用户安装 Storybook 后可以直接打开这些文件（只做格式兼容，不嵌入 Storybook）。

文件：`<plugin>/src/bundle/discover.ts`（原 `src/vetd/discover.ts`）、`engine/src/routes.ts`。

### F9 参考图 / 截图 / URL 导入（P5，1 人周）

做法：新工具 `design_import_reference({image|url})`；图片作为附件，配上从 screenshot-to-code 改写的提示词，生成 frame；URL 用宿主 offscreen 窗口（`sandbox:true`）截图并取 DOM 快照，对应 open-lovable 的流程但去掉 Firecrawl。

文件：`<plugin>/src/tools.ts`、`agent/skills/openforge-design/references/image-to-ui.md`（新）、`apps/desktop/src/main/plugins/`（offscreen 能力已有）。

风险：抓取第三方网站涉及版权和服务条款，UI 上提示「仅作参考」。

### F10 草图层 → UI（P6，1.5–2 人周）

做法：嵌入 Excalidraw（MIT）作为画布上的标注和草图图层，存为 `x.frgd/sketch/*.excalidraw.json`；参考 make-real 的思路（不复制代码）：选中草图后点「生成界面」，导出 PNG 和元素 JSON 给 agent，在旁边生成 frame。

文件：`<plugin>/src/notes/`、`<plugin>/src/canvas/NotesLayer.tsx`、`NoteSurface.tsx`。

风险：Excalidraw 包体较大（约数 MB），需要懒加载，参考 `test/entry-lazy-surfaces.test.ts` 的懒加载门禁。

### F11 agent 优先的设计 MCP（P7，1.5–2 人周）

做法：参考 Pencil 和 Paper，把 openforge-design 暴露为本地 MCP 服务，供外部 Claude Code、Cursor、Codex 使用；工具：`get_app_state`（当前设计和选中）、`read_skill`（返回 SKILL.md）、`design_*`；走宿主 `packages/runtime-mcp` 和本地 socket 或命名管道，带每客户端授权确认。

风险：必须防止被本机任意进程调用，用 token 加首次连接确认。

### F12 评论 / 批注（P6，1 人周）

做法：已有 `<plugin>/src/notes/`（`annotate.ts`、`handoff.ts`、`notes-store.ts`）；评论锚定改为 locator + 指纹，增加 resolved 状态，「交给 agent」时把评论打包为任务；参考 Claude Design 的「评论即修改指令」。

文件：`<plugin>/src/notes/types.ts`、`annotate.ts`、`NotesDrawer.tsx`。

### F13 原型链接 / 流程（P6，1–1.5 人周）

做法：layout.json 增加 `flows: [{from:{frame, locator}, to:{frame}, trigger:"click"}]`；画布上可以从元素拖线到另一个 frame；预览模式（`<plugin>/src/preview-mode/`）中，点击元素按 flow 跳转；导出 HTML 原型时生成路由。

文件：`<plugin>/src/preview-mode/PreviewDialog.tsx`、`preview-client.ts`、`<plugin>/src/canvas/` 下新建 `FlowLinks.tsx`。

### F14 设计令牌同步（P5，0.5–1 人周）

做法：theme.css 是唯一的 token 来源；支持导入导出 DESIGN.md、W3C Design Tokens JSON（DTCG 格式）和 Figma Variables（只读）；参考 Paper 的「token 双向同步」。

文件：`<plugin>/src/canvas/theme-tokens.ts`、`ThemePalette.tsx`。

### F15 Figma / Penpot 桥（P7，2–3 人周，可选）

Figma：借用 cursor-talk-to-figma-mcp（MIT）的插件加 WebSocket 中继，用于导出到 Figma 和读取节点。远程 MCP 的 `generate_figma_design` 作为备选。Variables 写入需要 Enterprise，不做。Penpot：作为外部 `@penpot/mcp` 进程接入，不复制 MPL 代码。

文件：新建 `<plugin>/src/figma/`、`<plugin>/src/penpot/`。

### F16 交接到 IDE / 编码 agent（P7，0.5–1 人周）

做法：「在 IDE 中打开」：code-inspector 的思路，加上宿主的 launch-editor 实现；「导出为工程」：`.frgd` 转为 vite 工程，附带 README 和构建提示，参考 Claude Design 的 handoff。

文件：`<plugin>/src/export/export-design.ts`、`FrameContextMenu.tsx`。

### F17 引擎评估：Sandpack / WebContainers 与每份设计一个 vite

| 维度 | 本地 vite（现状） | Sandpack | WebContainers |
| --- | --- | --- | --- |
| 离线 | 可以 | 默认依赖托管 bundler | 需要 SharedArrayBuffer 加 COOP/COEP，商用要许可 |
| 真实 npm / 原生依赖 | 可以 | 有限 | 有限 |
| 安全隔离 | 需要自己做（P0/P2） | 跨域 iframe | 浏览器沙箱 |
| 与 Electron 的契合度 | 高（已有 Node） | 中 | 低 |

结论：保留本地 vite。可以做一个优化（P2b，可选，1 人周）：一个 engine 进程托管多份设计（按路由前缀区分根目录），降低每份设计一个 dev server 的内存与端口开销。Sandpack 只考虑用于分享包的轻量网页预览。

## 阶段

| 阶段 | 内容 | 主要借用 | 人周 | 依赖 |
| --- | --- | --- | --- | --- |
| P0 | 安全热修：历史 zip 路径穿越、导入后 npm install 一律 `--ignore-scripts` 并需确认、vite cors 收紧、fs.strict、iframe sandbox、主窗口 will-navigate 拦截、每设计写队列加原子写 | — | 1 | 无，建议立即开始 |
| P1 | 用户可见去品牌（locale、SKILL、designer.md、导出 logo、图标、stoat 形象图、上游 URL、`apps/desktop/package.json` 元数据）＋门禁（warn） | — | 2.5–3 | 无 |
| P2 | 插件改名、格式升 v3、`.frgd`/`.frgdz`、`design_*`、安全导入器、历史外置、源码定位 v2（F1）、frame 独立 origin 加 RPC、拾取器初版（F2） | dyad tagger、Onlook penpal、react-grab、bippy | 5.5–6.5 | P0 |
| P3 | 视觉编辑面板加 AST 写回（F3）、撤销 / 版本 / 分支（F4）、图层（F5）、拾取器完善 | Onlook parser code-edit、GrapesJS 思路 | 5–6（借用 Onlook 后由 5–7 下调） | P2 |
| P4 | 全仓内部标识 codemod（`@vetta*`→`@openforge`（仅内部）、`VETTA_*`、IPC、协议、org.vetta、`.vettapkg`）＋防依赖混淆 | — | 2–2.5（不再等 npm org） | P2 之后任意时间，可与 P3 并行 |
| P5 | AI 生成工作流：多方案（F6）、设计系统（F7）、组件页（F8）、参考导入（F9）、token（F14） | OpenUI、screenshot-to-code、Storybook CSF | 4–5 | P2 |
| P6 | 画布协作：评论（F12）、原型流程（F13）、草图层（F10） | Excalidraw | 3.5–4.5 | P2（F12 依赖 F1） |
| P7 | 生态：设计 MCP（F11）、Figma / Penpot 桥（F15）、IDE / 工程交接（F16） | cursor-talk-to-figma-mcp | 4–6 | P2 |
| P8 | 文档、ADR、docs-site、SDK tarball 分发说明、门禁切到 fail、第三方 NOTICE 汇总 | — | 1–1.5 | P1–P4 |
| P2b | （可选）单 engine 托管多份设计 | — | 1 | P2 |

合计：

- 必做（P0–P4 + P8）：17–20.5 人周。
- 可选（P5 + P6 + P7 + P2b）：12.5–16.5 人周。
- 快速见效选项（P0 + P1 + 门禁 warn）：约 3.5–4 人周，其中去品牌本身约 3 人周。

建议的发布节奏：v0.2 = P0 + P1；v0.3 = P2（格式切换，导入器上线）；v0.4 = P3 + P4；v0.5+ = P5–P7 按优先级挑选。

## 不做什么

- 不换预览引擎：Sandpack / WebContainers 不采用（F17）。
- 不复制 ② 类代码：Plasmic `platform/`、Webstudio、Penpot、tldraw、make-real、Theatre studio、dyad `src/pro/`；MPL 组件（Penpot MCP）只作外部进程原样接入。
- 不注册 npm org、不发布任何 npm 包（与 2026-09-25 TASK-0046 决策一致）；tldraw computer、Craft.js、LlamaCoder、Theatre、Mitosis 等低关联项不立项。
- 本计划轮次不编写、不执行任何脚本，不修改用户仓库，不推送。
- REQ-0005 修订草案（见下）未应用前，现行 REQ-0005「不盲目替换兼容标识」不做项继续生效。

## 合规与改名

### 引入第三方代码的合规清单

- 引入代码时，每个文件头保留原许可声明，并加 "Modified by The Open Forge contributors"（与 NOTICE 现有方案一致）。
- 根目录 NOTICE 新增「Third-party code incorporated」小节：dyad（Apache-2.0，附带其 NOTICE 中的相关内容）；Onlook（Apache-2.0）；react-grab、bippy、LocatorJS、Excalidraw、cursor-talk-to-figma-mcp、screenshot-to-code 的提示词（MIT，附版权行）；GrapesJS（BSD-3，如果复制了代码）。
- 安装包里的第三方许可清单（TASK-0055、VERIFY-0005）同步更新。
- 禁止复制的：Plasmic `platform/`、Webstudio、Penpot、tldraw、make-real、Theatre studio、dyad `src/pro/`。
- 门禁扩展：`scripts/quality/check-no-upstream-brand.mjs` 只查品牌；再增加一个 license 检查（逻辑：扫描文件头里的 SPDX 标识，命中 AGPL/GPL/FSL/MPL 时失败，白名单另行维护）。

### 改名映射表（按长度从长到短依次替换；已按「不发布 npm」更新）

| # | 旧 | 新 | 类别 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `@vetta/plugin-vetta-ui-design` | `@openforge/plugin-openforge-design` | 包名 | private |
| 2 | `@vetta/plugin-vetta-actions` | `@openforge/plugin-openforge-actions` | 包名 | private |
| 3 | `@vetta/plugin-cowart-vetta` | `@openforge/plugin-cowart` | 包名 | 先确认 cowart 的许可 |
| 4 | `@vetta-org/` | `@openforge/` | scope | 原本面向第三方的 SDK 改为 tarball 分发，不上 npm |
| 5 | `@vetta/` | `@openforge/` | scope | 全部 `workspace:*`，scope 指向不可达的私有 registry |
| 6 | `vetta-design-engine` | `openforge-design-engine` | engine 包 | private |
| 7 | `vetta-ui-design` | `openforge-design` | 插件 id / 目录 / skill | 宿主做一次性 id 迁移 |
| 8 | `vetta_ui_design` | `openforge_design` | MF remoteName | |
| 9 | `vetta-actions` | `openforge-actions` | 插件 id | |
| 10 | `"vetta-design"` | `"openforge-design"` | manifest type | 读取端两者都认 |
| 11 | `design@vetta.local` | `design@openforge.local` | 历史作者 | |
| 12 | `vetta-history:` | `openforge-history:` | trailer | 读取端两者都认 |
| 13 | `vetta-plugin://` 等 5 个 | `openforge-plugin://` 等 | 协议 | 持久化 URL 做一次性迁移或保留只读别名 |
| 14 | `vetta://` | `openforge://` | 深链 | 与现有路由合并 |
| 15 | `"vetta:` / `'vetta:` / `` `vetta: `` | 同位置换成 `openforge:` | IPC | |
| 16 | `.vettapkg` | `.ofpkg` | 插件包 | 读取端兼容；碰撞未核实 |
| 17 | `org.vetta.android` / `org/vetta/android` | `io.github.hxquanq.openforge.android` | Kotlin | |
| 18 | `vetd_create` 等 9 个 | `design_create` 等 | 工具 | 旧名只在回放时作别名 |
| 19 | `data-vetd-source` | `data-frgd-src`（值改为 file:line:col，属于重写，不是替换） | DOM | F1 |
| 20 | `data-vetd-` | `data-frgd-` | DOM | |
| 21 | `VETD_` | `FRGD_` | env | |
| 22 | `VETTA_` | `OPENFORGE_` | env | 过渡期用 `readEnv(new, legacy)` |
| 23 | `.vetdz` | `.frgdz` | 分享包 | |
| 24 | `.vetd.d` | （不替换，只在 legacy 迁移代码中出现，加入白名单） | 旧格式 | |
| 25 | `.vetd` | `.frgd` | bundle | |
| 26 | `vetdz` / `vetd`（常量） | `frgdz` / `frgd` | 常量 | |
| 27 | `Vetd`（TS 标识符） | `Frgd` | 标识符 | 机械替换；以后可人工改为 `Design*` |
| 28 | `vetd`（目录、变量） | `frgd`；目录 `src/vetd/` → `src/bundle/` | 标识符 | |
| 29 | `VETTA_LOGO_DATA_URL` | `BRAND_LOGO_DATA_URL` | 资产 | 图片内容需替换 |
| 30 | `Open Vetta Desktop` / `Vetta Desktop App` / `Vetta Desktop` | `{{brand}}` 插值 | 文案 | |
| 31 | `Open Vetta` / `OpenVetta` / `open-vetta` / `openvetta` | `Open Forge` / `OpenForge` / `open-forge` / `openforge` | 文案 / URL | |
| 32 | `Vetta`（独立单词） | `{{brand}}` 或 "Open Forge" | 文案 | |
| 33 | 其余 `VETTA` / `vetta` | 逐条人工处理 | 兜底 | |

需要人工处理的 URL：

- `apps/desktop/src/renderer/domains/settings/components/useSubscriptionCardsModel.ts:11` 的 pricing 地址；
- `apps/kotlin/shared/src/commonMain/kotlin/org/vetta/android/app/AppPreferences.kt:104` 的 API 地址；
- `packages/remote-control/schemas/remote-frame.schema.json:3` 的 `$id`；
- README 和 docs 中的 docs、download、Discord 链接；
- GitHub 仓库设置里的 homepage。

### REQ-0005 修订草案（本计划采纳后应用，当前未生效）

文件：`project/requirements/REQ-0005-openforge-independent-release-and-compliance.md`。用下面的内容替换原条款「不盲目替换 `APP_RUNTIME_NAME`、`@vetta/*`、`VETTA_*`、`vetta:`、`.vettapkg` 等兼容标识」：

> **上游标识与兼容策略（修订，2026-10-18）**
>
> 1. 目标：Open Forge 的发布产物（安装包、asar、插件 bundle、文档站、应用商店元数据）和仓库中的源码、配置、文档，不再出现上游的品牌名和格式名（Vetta / Open Vetta / openvetta / vetd / vetdz / vettapkg / vetta-ui-design / `@vetta/*` / `@vetta-org/*` / `VETTA_*` / `VETD_*` / `vetta:` / `vetta-*://` / `org.vetta`），第 3 条白名单中的文件除外。
> 2. 兼容只能通过以下方式实现，不能靠保留旧标识：导入器（读取 `.vetd` / `.vetd.d` / `.vetdz` / `-share.vetd` / `.vettapkg`）；一次性迁移代码（`~/.vetta`→`~/.openforge`、插件 id、引擎目录、历史 trailer、持久化的 URL 协议、APP_RUNTIME_NAME 与凭据键）；有期限的过渡读取层，例如 `readEnv(new, legacy)`，必须注明在哪个版本移除。这些代码要集中放在明确的目录或文件中，并配有测试夹具。
> 3. 白名单由 `scripts/quality/brand-allowlist.json` 维护，至少包括：LICENSE、NOTICE（Apache-2.0 §4(d) 要求保留上游署名）、第 2 条所述的兼容代码及其夹具、`bun.lock`、CHANGELOG 中的历史条目、`legacyProductNames`、第三方名称（Codex `codex-windows-sandbox-host`、pi-mono、Expo 等）。新增白名单条目需要在 PR 中写明理由，并经品牌或合规负责人批准；过渡层条目必须带到期版本。
> 4. 门禁：`scripts/quality/check-no-upstream-brand.mjs` 在 CI 中同时检查源码树和打包产物；P1 阶段只告警（warn），P8 起命中即失败（fail）。
> 5. 包发布：当前不向 npm 发布任何包。所有 workspace 包设为 `"private": true`，内部依赖一律使用 `workspace:*`；`@openforge` scope 必须配置为不可解析到公共 registry，以防依赖混淆。第三方插件 SDK 以随应用分发的 tarball 或脚手架方式提供。TASK-0046 由「注册 npm org」改为「防依赖混淆配置」。
> 6. Apache-2.0 §4(b)：修改文件的声明沿用 NOTICE 中描述的 "Modified by The Open Forge contributors" 方案，由 `check-modified-file-notices.mjs` 保证覆盖率（关联 ISSUE-0008 / TASK-0058）。改名产生的修改，以及引入的第三方 Apache 代码（dyad、Onlook 等），都适用这一要求，并在 NOTICE 中补充第三方条目。

### 脚本逻辑（规划，本轮不编写、不执行）

`scripts/rebrand/rename.mjs`：读取 `rebrand-map.json`（内容即改名映射表，按 phase 分组，长串优先）和 `brand-allowlist.json`；用 `rg --json` 收集命中位置；在内存中执行替换，并检测替换后标识符是否与已有标识符冲突；默认 dry-run，输出各类别的计数和 diff 预览；加 `--apply` 才写入（要求 git 工作区干净，会执行 `git mv`，不提交，不改 bun.lock）；包名和 import 改用 ts-morph 处理。

`scripts/quality/check-no-upstream-brand.mjs`：检查规则 `/\bvetta\b|open-?vetta|openvetta|\bvetd(z)?\b|\.vettapkg|@vetta(-org)?\/|\bVETTA_|\bVETD_|data-vetd-|vetta-[a-z]+:\/\/|org\.vetta/i`；两种模式：`--source`（源码树）和 `--artifact <dir>`（打包产物）；白名单条目带 reason 和 expires；`--warn` 模式只告警。

新增 `scripts/quality/check-third-party-license.mjs`：扫描 SPDX 头和来源注释，阻止 AGPL/GPL/FSL/MPL 代码进入仓库。

## 未核实事项

- Onlook 新桌面版何时开源、采用什么许可（目前文档只说「接下来几周」）。
- Onlook 根目录是否有 NOTICE 文件；penpal 库的许可版本。
- Sandpack 自托管 bundler 的许可与可行性；WebContainers API 商用条款的具体内容。
- Stitch 的 DESIGN.md 是否有公开 schema。
- `.ofpkg` 是否与已有格式撞名；launch-editor 的许可。
- Framer AI、Same.new、Polymet、Tempo Labs、UX Pilot、Uizard 的功能，本轮未逐条核实。
- screenshot-to-code 提示词所在的具体路径。
- 防御性注册 npm org 是否值得做：成本低，但不是必需。

## 验证与回滚

- 每阶段按切片建 Task 交付：定向测试 + `bun run test:impact` / `test:changed` → `check:quick` → 涉多包时 `check`（按质量门禁选最小充分范围）。
- P0 安全项以攻击复现为失败基线（zip 路径穿越样本、导入包携带 install 脚本、CORS/导航拦截用例），修复后旧实现必红。
- F1/F3 验收即回归合同：100 节点定位一致、100 次编辑 undo 字节级还原、导出产物无 `data-frgd-*`。
- 回滚：P0/P1 按提交回退；P2 格式 v3 切换依赖导入器保留 `.vetd`/`.vetdz` 读取，旧设计可重新导入；品牌门禁 P1 只 warn、P8 才 fail，中间不阻断主干；P4 codemod 默认 dry-run，`--apply` 要求干净工作区且用 `git mv` 可整体回退。

## 升级信号

- Onlook 新桌面版开源 → 复核许可，重评 F3/F4 是否直接借用其新架构。
- 任一 ① 类上游仓库改许可证 / 归档 → 触发矩阵复核（失效条件见 RESEARCH-0031）。
- 上游 openvetta 再做品牌 / 协议迁移 → 改名映射表需增补。
- Sandpack 自托管条款明朗 → 重评分享包网页预览。
- 用户决定发布 npm / 注册 org → P4 防依赖混淆策略与 TASK-0046 重启评估。

## 需要的 ADR

对应阶段启动时先写 ADR 再实施：

1. 内部 scope `@openforge` 不发布 + 防依赖混淆（不可逆、有真实取舍）——P4 前。
2. 保留「每设计一个本地 vite」引擎、不采用 Sandpack / WebContainers（F17）——P2 前。
3. 构建期注入 `file:line:col`、不把稳定 id 写进源码（F1 取舍）——P2 前。
