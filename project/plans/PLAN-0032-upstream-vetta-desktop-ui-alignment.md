---
id: PLAN-0032
type: plan
status: draft
priority: P1
requirement: REQ-0008
owner: coordinator
source: user-request; openvetta/open-vetta@641aaf694
created: 2026-11-24
updated: 2026-11-24
depends_on: []
related_requirement: [REQ-0008]
related_plan: [PLAN-0014, PLAN-0012, PLAN-0025, PLAN-0003]
related_tasks: [TASK-0160, TASK-0193]
---
<!-- Copyright The Open Forge contributors. -->

# 参照上游 Vetta 的桌面体验对齐与新增面板前端统一

## 背景与目标

用户要求参照上游 Vetta 优化七个主题：自动化重做、桌面工作空间化、启动器（原 ⌘T 命令面板）、用量页、插件与 UI SDK、Git/Markdown 打磨、工程门禁；同时按统一思路调整本仓新增面板模块（记忆、智能客服 WeKnora、Allstar、Work 右栏）的前端排版。

本计划是 [REQ-0008](../requirements/REQ-0008-selective-upstream-nonmobile.md) 的增量批次，延续 [PLAN-0014](PLAN-0014-selective-upstream-nonmobile.md) 的择优适配原则：不整仓 merge，按主题参照重写或挑提交移植，保留 Open Forge 的品牌、权限、数据和既有功能。自动化部分与 [PLAN-0012](PLAN-0012-unattended-automation.md) 已交付的权限分层、自动化包和事件触发衔接，不另建状态机。

本轮只立项，不建 Task、不改代码。每个阶段开工前按任务入口建 Task，并在 Task 中重新核对本地 HEAD 与上游提交。

## 当前事实

### 固定基线

- 本仓调查基线：本地 `main@586782393`。
- 上游参照：`upstream/dev@641aaf694`（0.6.20 开发中，`.github/release-notes/` 覆盖 v0.5.58–v0.6.20）。
- 共同祖先：`d217984c7`（2026-09-22）。分叉后上游 1269 个、本地 1613 个非 merge 提交。`--cherry-mark` 显示两边没有等价补丁，本地以往的对齐都是重写式（如本地 `f5b390e25` 对应上游 `ed8b1af40`）。
- 下文提交号只用于定位上游原意，规模按提交 diff 估算，未试跑 cherry-pick。

### 上游这批 UI 的公共前置

上游的启动器、顶栏、Git 气泡、工作空间按钮组都建在三样底座上，本地目前都没有：

- 通用按钮组 `ButtonGroup`（[556fd7ad7](https://github.com/openvetta/open-vetta/commit/556fd7ad7)）；
- 键帽组件 `VettaKbd`（[11a71308b](https://github.com/openvetta/open-vetta/commit/11a71308b)）；
- 声明式顶栏插件动作合同（[7e0a8b130](https://github.com/openvetta/open-vetta/commit/7e0a8b130)）。

### 各主题的本地现状

| 主题 | 本地现状 | 与上游的关键差别 |
|---|---|---|
| 启动器 | `apps/desktop/src/shared/shortcuts.ts` 中 `open-command-menu` 默认 `mod+k`；`mod+n` 已用于 `new-session` | 上游默认 ⌘T，按最近打开排序、置顶进行中会话、玻璃质感、独立设置页；并删除了双击修饰键快捷面板 |
| 自动化 | `apps/desktop/src/main/scheduler/task-storage.ts` 仍是 prompt + cron + isOnce 模型；`a8f8bffaf` 已接入 [ADR-0132 无人值守权限分层](../../docs/adr/0132-unattended-permission-tiers-on-scheduled-tasks.md)、自动化包和事件触发 | 上游 `0111d7cde`（上游 ADR-0127 run target）按运行会话策略重做，新增间隔重复、侧栏会话组；但无人值守运行固定使用完全访问 |
| 工作空间 | 本地只有 Work/Coding「工作区模式」和 Allstar 两册；团队会话按 `16e40c8e6` 进入 Allstar 版块 | 上游 `d6f9906c4`（上游 ADR-0155）新增工作空间分组、`ctrl+1..9` 切换，团队会话按 Team ID 归属 |
| 用量 | `apps/desktop/src/renderer/domains/settings/components/useUsageSeries.ts` 读云端 `/usage/me/series`，依赖登录 token，未登录不显示 | 上游 `7ef3f6d20`（上游 ADR-0156）移除 vetta-serv，改用本机 app-monitor 数据；页面用 `chart.js ^4.5.0`，本地 desktop/theme-ui/ui 无图表依赖 |
| 顶栏 | `apps/desktop/src/renderer/domains/conversation/components/chat-view/ChatHeaderActionsView.tsx` 为固定按钮，插件无法声明 | 上游有 `registerHeaderAction` 与 `ui.slot.header-action` 权限，支持收纳、拖动排序、过窄进更多菜单 |
| 插件 API | `apps/desktop/src/main/plugins/plugin-api-version.ts` 为 2.13.0 | 两边自 2.8.0 起各自编号；上游 2.9–2.11 是顶栏动作与 `useMeta`，与本地同号版本含义不同 |
| theme-ui 导出 | 少量聚合入口 | 上游 `107d85bbc`（上游 ADR-0148）改为按文件细粒度导出，`packages/theme-ui/package.json` +690 行；不跟进则每次移植都要改写 import |
| Git/Markdown | 公式与富内容预览已有（TASK-0157 / `f5b390e25`）；`2dd10fc5b` 的字面路径与重命名部分已由 [TASK-0193](../tasks/TASK-0193-git-literal-history-paths.md) 吸收 | 上游另有代码块与表格统一外框、拉取/推送按钮组、顶栏分支与未提交变更气泡 |
| 工程门禁 | 无测试卫生与断言深度守卫；插件宿主转发清单无合同测试；`release-notes.mjs` 是碎片汇编式 | 上游 `c629e7242` 新增两项守卫与棘轮基线；`dde5bfb2a` 把转发清单纳入门禁（上游 v0.6.10 曾因清单缺口导致 Git 插件加载失败） |

### 本地新增面板现状

分层样板是 `apps/desktop/src/renderer/domains/computer-use/ComputerUsePage.tsx`：Page 只接线，`use*Model` 输出视图数据，展示组件纯渲染。

- **记忆** `apps/desktop/src/renderer/domains/memory/MemoryPage.tsx`：261 行单文件，页面自己持有纠正/遗忘弹窗状态（:16–20）；搜索用原生 `<input>`（:68）；详情区块接在列表下方（:146）；容器 `max-w-3xl p-6`（:30），与页面外层 `px-8 pb-8` 规范不一致。
- **WeKnora** `apps/desktop/src/renderer/domains/weknora/components/WeKnoraPageView.tsx`：Props 接口约 33 个平铺字段（:47）；侧栏收起动画自写；会话栏固定 `w-64`。页面边距是 `apps/desktop/DESIGN.md:283` 登记的特例，保留。
- **Allstar** `apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx`：分层已合规，页头「打开项目 / 新建会话」是零散按钮。
- **Work 右栏** `apps/desktop/src/renderer/domains/workspace-mode/components/WorkWorkspacePanel.tsx:110`：固定 `w-[340px]`，窗口窄于 640px 时直接 `hidden`。Coding 侧此时有底部抽屉替代（:107 注释），Work 侧没有任何入口。

### 编号与署名约束

- `scripts/quality/check-modified-file-notices.mjs` 以 `git merge-base upstream/dev HEAD` 为基线。移植进来的上游文件不改变 merge-base，会按 fork 修改处理，需要带修改声明头。
- 本地 ADR 最大编号 0154，上游 0151–0158 与本地撞号；上游 ADR-0127 也与本地 ADR-0127 同号不同题。按 [ADR 编号规则](../../docs/adr/README.md)，移植的上游决策取本地最大编号 +1，正文注明上游原编号。

## 候选方案与取舍

- **按主题参照重写 + 小提交直接移植（采纳）**：底座组件、守卫脚本、启动器排序等改动面小、与本地无冲突的提交直接 cherry-pick 后适配；顶栏、自动化、工作空间这类与本地合同交叉的改动参照重写。
- **整体 merge 上游（否决）**：两边各自演进 1200+ 提交，`apps/desktop` 与 `packages/*` 双向大改，冲突面无法在一个可回滚切片内收口，且会带入移动端和发布流程。
- **只改本地面板、不引入上游底座（否决）**：本地面板也需要按钮组、键帽和列表+详情布局；先各自手写再替换，会把同一份工作做两遍。
- **推进顺序**：底座组件 → 外壳（启动器、顶栏）→ 功能页 → 把本地面板套进同一套布局。本地面板是用户最关心的部分，底座就绪后立即做，不等外壳全部完成。

## 待拍板决策

以下决策影响对应阶段能否开工。未拍板时，只推进不依赖它的阶段。

| # | 决策 | 推荐 | 阻塞阶段 |
|---|---|---|---|
| D1 | 移植文件的署名口径：上游原文件进入本仓后按 fork 修改加声明头 | 沿用现有 notice 门禁，移植文件统一加修改声明头，不为移植另开豁免 | P2 起所有移植 |
| D2 | theme-ui 是否跟进上游按文件细粒度导出（上游 ADR-0148） | 跟进，作为 P2 的第一个 Task，避免每次移植改写 import；组件名中的 `Vetta` 前缀按 [PLAN-0003](PLAN-0003-open-forge-rebrand.md) 品牌口径在同一 Task 内定 | P2 |
| D3 | Plugin API 版本号 | 本地从 2.14.0 续编，上游新增的顶栏、`useMeta` 能力在本地重新登记版本说明 | P7、P9 |
| D4 | 自动化：上游无人值守固定完全访问，与本地 ADR-0132 冲突 | 只参照会话策略与界面，保留 `permissionTiers` 与 `trigger`；event/manual 触发、自动化包、Agent 定时工具继续可用 | P9 自动化数据模型 |
| D5 | 工作空间：与「工作区模式」命名、Allstar 归属、团队会话归属的关系 | 先统一命名；空间只作用于普通册，Allstar 不纳入；团队会话保持本地 `16e40c8e6` 的版块归属 | P9 工作空间 |
| D6 | 两项删除：双击修饰键快捷面板（`c38c0a3c5`，约 −2.7k 行）；启动器默认键 ⌘K → ⌘T | 由用户定；默认键无论如何都走可配置 keybinding，已有用户的自定义绑定不被覆盖 | P3 |
| D7 | 用量页：新增 `chart.js` 依赖；本机用量页与账户页云端用量并存还是替换 | 先核实 Open Forge 云账号用量接口是否仍可用；依赖新增需用户同意 | P6 |

### 拍板结果（2026-11-25，用户全部接受推荐方案）

- **D3 接受**：本地 Plugin API 从 **2.14.0** 续编；上游顶栏动作、`useMeta` 等能力进入时显式登记版本说明。解开 P7、P9。
- **D4 接受**：保留本地 ADR-0132 权限分层，仅参照上游自动化界面与会话策略交互；`permissionTiers`/`trigger` 字段保留；不引入「无人值守固定完全访问」；先核对「无人值守轮次不提供 ask_user_question」与「失败不记成功」等价行为。解开 P9 自动化，需新 ADR。
- **D5 接受**：工作空间只作用于普通册，Allstar 不纳入，团队会话保持本地 `16e40c8e6` 的 Allstar 版块归属；命名统一先行。解开 P9 工作空间，需新 ADR。
- **D7 接受**：新增本机 app-monitor 用量页与云端用量**并存**（云端留账户页，本机入设置/用量）；新增 `chart.js ^4.5.0` 依赖；首用无月份数据返回空数组；核查团队会话用量归属。解开 P6。

决策证据与备选分析：[RESEARCH-0051](../research/RESEARCH-0051-plan-0032-decisions-brief.md)。

## 阶段

每个阶段开工前建 Task，标注改动归属（Upstreamable / Open-Forge-only / Compatibility）。下表规模为改动行数估算。

### P1 工程门禁（无前置，小到中）

- ✅ 移植测试卫生与断言深度守卫（[c629e7242](https://github.com/openvetta/open-vetta/commit/c629e7242)）：`check-test-hygiene.mjs`、`check-test-assertion-depth.mjs` 及棘轮基线（753 文件存量快照）。接入 `check:guards` 与 `test:quality`；棘轮只允许变好。（TASK-0495）
- ✅ 插件宿主转发清单合同测试（[dde5bfb2a](https://github.com/openvetta/open-vetta/commit/dde5bfb2a)、[58d368a56](https://github.com/openvetta/open-vetta/commit/58d368a56)）：`plugin-protocol.ts` → `plugin-protocol-contract.test.ts` 显式映射已进 `test:impact`（vitest `related` 无法覆盖 `readFileSync` 类契约测试）；清单与真实导出当前同步，无缺口。（TASK-0495）
- ✅ 双语发布说明（[06b431c3c](https://github.com/openvetta/open-vetta/commit/06b431c3c)）只借鉴机械校验思路：`release-notes-format.mjs` 按本地四段格式重写判定集——非允许 `##`/小节外条目/占位记号/空小节判负，超长/内部引用/工程黑话打 warning 不判负。存量 7 份说明 0 problems，~144 条 warning 留待清理专项。（TASK-0496）

### P2 UI SDK 底座（依赖 P1、D1、D2；1–2k 行）

- 组件：`ButtonGroup`（556fd7ad7，样式迭代 1cdb283d2、8353a62d7、ce89aada1、3ad290027、0c177dc97）、`VettaKbd`（11a71308b）、`Stepper`（8cdbc3ae6）、`ColorSwatchPicker`（3b6827f49）、`SessionTopItem`（890597ac1）、`StepSlider`（ebc127be6）。
- plugin-ui 开放（a50993e86、448165e57），同步转发清单与插件文档，按 D3 登记版本。
- 已有快捷键展示统一改用键帽组件，快捷键定义仍在 `SHORTCUT_ACTIONS`。

### P3 启动器（批 1 依赖 D6；批 2 依赖 P2；各约 1k 行）

- 批 1：最近打开排序（662dd4c7b）→ 置顶进行中会话并标注项目（96e81c3d9）→ 保留刚跑完未打开的会话（2cbcbfa6d）；默认键（5b81b82fa）与启动器内 `mod+n` 直接新建会话（8be9329e8）按 D6 处理。
- 批 2：玻璃质感（6e27995cf、9f755faf9、6eb9fd12b）；启动器设置页（fc41fcddf，跟进 3a363c258、ea90c3083、141ef08e6），文案走 i18n。

### P4 通用「列表 + 详情」布局与本地面板第一批（依赖 P2）

- 在 theme-ui 抽一个列表 + 右侧详情分屏布局：详情可拖宽（复用现有 ResizeHandle），容器宽度不足时详情独占整页（参照 [3e161ba8e](https://github.com/openvetta/open-vetta/commit/3e161ba8e) 的 `@container` 做法）；内置加载、空、错误、降级四种状态与滚动渐隐。记忆、WeKnora、自动化三处共用。
- **记忆**：拆为 Page / `useMemoryPageModel` / 纯展示 View 三层，弹窗状态进 model；详情改右侧分屏；切换与搜索改用 SegmentedControl 与现有输入组件；外层边距对齐 `px-8 pb-8`。
- **WeKnora**：平铺 props 收成 view model 对象；会话栏复用 ResizeHandle 与折叠，去掉自写收起动画；批量操作与导出进按钮组；保留 DESIGN.md 登记的边距特例。

### P5 本地面板第二批（依赖 P2、P4）

- **Allstar**：页头「打开项目 / 新建会话」改为按钮组，卡片网格保持现有密度。
- **Work 右栏**：按容器宽度切换布局，窄屏补抽屉入口（与 Coding 侧行为一致）；四个分节改用 CollapsePanel。

### P6 用量页（依赖 P2、D7；约 3.8k 行）

- 数据层（e83df2e76）：app-monitor 按模型、按小时统计 token，按月落盘（`months/<YYYY-MM>.json`），IPC `getUsageReport`。新增持久化文件需定义旧数据缺失时的读取路径。
- 页面（8eda12ea4，`settings/components/usage/`）、小票（e560e4016）、连续使用与高峰时段（36522aab9）。
- 核查团队会话成员的用量是否计入；与账户页云端用量的关系按 D7 处理。

### P7 顶栏按钮组（依赖 P2、D3；2.5–3k 行）

- 参照 7e0a8b130 重写：新增 `renderer/domains/header-actions/` 与 theme-ui 顶栏视图，替换 `ChatHeaderActionsView.tsx` 的固定按钮。
- 扩展字段（b669f73ae）、收纳与调整模式（234885a88、8efa385a8、ffe0d5e90）、过窄收进更多菜单（25c43ece2）。
- 排序持久化键名用本仓品牌前缀；新增 `ui.slot.header-action` 权限按最小集合声明，并与宿主授权取交集。

### P8 Git/Markdown 打磨（依赖 P2；气泡依赖 P7）

- 代码块与表格统一外框（29ba5969b、4866771a5）手工合进本地流式渲染（`builtin-renderers.tsx`），不覆盖本地隔离渲染与计算预算。
- 提交图操作：2dd10fc5b 剩余的提交图操作与详情浏览，先与本地 `CommitDetailPane` 比对，只补缺口。
- 活动面板按钮改用宿主按钮组（54fb4d5a9、d25fa3cc8、aeae24785）。
- 顶栏分支与未提交变更气泡（fb5539dcf、f04c041c4、66ca7d7d8），P7 完成后做。

### P9 拍板后的结构性改动（依赖 D4/D5 及 P4、P7）

- **自动化数据模型**：会话策略重做（0111d7cde）、间隔重复与触发时刻计算（5e07c8bd1、84d2ab40b）、侧栏会话组（865d97823）、会话右键创建自动化（f940900be）、删除绑定会话前提示（b67141f40）。先核对本地是否已有「无人值守轮次不提供 ask_user_question」（dc6ea54d5）与「失败不记成功」（c83d5c220）的等价行为，没有则在本阶段最先移植。存量定时任务必须有迁移路径；需新 ADR。
- **工作空间**：工作空间分组（d6f9906c4），依赖「会话在等用户」数据链统一（b1f91c704）与按钮组、键帽；活动面板按工作空间声明可用性（62b2749f8，上游 ADR-0158）与本地 `6c9e717ea` 的页签元信息宿主冲突，需合并设计；需新 ADR。

自动化界面的列表 + 详情分屏（d324bac37）不等 P9：P4 布局就绪后，可先把本地权限分层、自动化包、事件触发 UI 迁进新详情面板，数据模型不变。

## 本地面板统一规则

P4、P5 及后续新增面板都按这套规则做，Task 审查时逐条核对：

- **分层**：Page 只接线，`use*Model` 输出视图数据对象，纯展示组件放 theme-ui；样板是 `ComputerUsePage.tsx`。
- **骨架**：页头（标题、说明、右侧按钮组）→ 工具条（SegmentedControl + 搜索）→ 内容（列表，或 `auto-fill` + `minmax` 网格）→ 详情（右侧分屏，窄屏独占）。
- **状态**：加载、空、错误、降级四种状态用统一组件，不各页自写。
- **快捷键**：进 `SHORTCUT_ACTIONS` 走可配置 keybinding，用键帽组件展示。
- **视觉**：遵循 `apps/desktop/DESIGN.md`。字号只用 10/11/12/13/14/15/20+ 七档；1px 边框 + 背景透明度分层；卡片无阴影，浮层才用阴影；页面外层 `px-8 pb-8`，已登记特例保留。
- **文案**：用户可见文案（含 title、aria）走 i18n。

## 不做什么

- 不移植移动端、远程控制 v2、配对、中继与 iOS/Android 相关改动。
- 不改上游已发布的 Release Notes，不引入上游发布端点与版本号。
- 公式、富内容预览本地已有，不重做；双语发布说明不替换本地发布说明结构。
- 不削弱 ADR-0132 无人值守权限分层，不为跟进上游放宽插件权限。
- 不重排已有 ADR 或 Plugin API 版本号。
- 未拍板的删除（D6）与新依赖（D7）不先行实施。

## 验证与回滚

- 中间编辑：`bun run check:quick -- <file...>`。
- 行为变化：定向测试 + `bun run test:impact -- <file...>`；公共合同、跨包或删除时按测试政策运行 `test:changed`。
- 阶段完成：`bun run check`。
- UI 视觉验证（`verify:ui:*`）与真实桌面验收需当前任务单独授权；未授权时只报告源码与组件级证据。
- 每个 Task 原子提交，可单独回退。新增持久化（用量月文件、自动化新模型、工作空间存储）先定义旧数据读取路径，回滚不依赖改写用户数据。

## 升级信号

出现以下情况时暂停当前阶段，回到本计划或用户重新拍板：

- 移植提交与本地同一热文件反复冲突，说明需要先重评边界。热点：`apps/desktop/src/shared/shortcuts.ts`、en/zh 的 `settings.json`/`common.json`/`chat.json`、`useRootLayoutModel.ts`、`main/ipc/session.ts`、`main/main.ts`、`plugin-api-version.ts`、`plugin-sdk/src/ui.ts`、theme-ui 与 ui 的 `package.json`、`app-monitor-service.ts`、`check-guards.mjs`、`release-notes.mjs`、`quality.yml`。
- 移植要求改变权限分层、会话协议、Agent 状态机或存量数据格式。
- 新守卫的基线无法在不放宽断言的前提下建立。
- 上游参照提交被改写或撤回，或本地 HEAD 已有等价实现。

## 需要的 ADR

- P9 自动化数据模型：参照上游 ADR-0127（automation run target），说明与本地 ADR-0132 权限分层的关系，取本地新编号。
- P9 工作空间：参照上游 ADR-0155、ADR-0158，说明与工作区模式、Allstar 版块的边界，取本地新编号。
- P2 若跟进细粒度导出（D2），评估是否需要参照上游 ADR-0148 记录导入约定。
- 其余阶段只是界面与组件适配，不新增 ADR。
