---
id: RESEARCH-0052
type: research
status: done
priority: P1
owner: coordinator
source: user-request; upstream openvetta/open-vetta 641aaf694..314065cac 对照
created: 2026-11-27
updated: 2026-11-27（同日补记 0.6.32 增量与批次落地状态）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032, PLAN-0014]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 上游 0.6.20–0.6.31 增量提交分诊（641aaf694..314065cac）

## 问题与范围

用户询问上游适配进度。[PLAN-0032](../plans/PLAN-0032-upstream-vetta-desktop-ui-alignment.md) 的参照基线是 `upstream/dev@641aaf694`（0.6.20 开发中），上游此后前进到 `314065cac`（0.6.31 开发中）。本记录把这段增量逐提交对照本仓现状，分成五类，供后续按主题建 Task 时直接取用。

范围是 `641aaf694..upstream/dev` 的 125 个实质提交。该区间共 170 个提交，去掉 11 个 merge 和 34 个发版流水提交（版本号推进、发布说明定稿、标记已发布）后剩 125 个。

本记录只做分诊，不建 Task、不改代码。PLAN-0032 基线之前的 P1–P9 阶段进度不在范围内。

口径沿用 [REQ-0008](../requirements/REQ-0008-selective-upstream-nonmobile.md)、[PLAN-0014](../plans/PLAN-0014-selective-upstream-nonmobile.md) 和 PLAN-0032：

- 不移植移动端、远程控制、配对、中继。
- 不照搬上游发版流程、版本号和品牌。
- 不削弱 [ADR-0132](../../docs/adr/0132-unattended-permission-tiers-on-scheduled-tasks.md) 的无人值守权限分层。
- 删除功能和新增依赖由用户拍板（PLAN-0032 的 D6 口径）。

## 事实来源

- 上游：分诊时 `upstream/dev@314065cac`（2026-11-26 提交）；2026-11-27 维护时上游已到 `f977794b3`（0.6.32），增量 8 个提交见文末「0.6.32 增量补记」。本仓：分诊时 `main@045a987ab`，维护时 `main@1fe300f27`。共同祖先 `d217984c7`。
- 提交清单：`git log --no-merges --format='%h %s' 641aaf694..upstream/dev`，剔除标题以 `chore(release):`、`docs(release):` 开头的 34 个。下文各类 sha 合计 125 个，已用脚本核对无重复、无遗漏。
- 单个提交的原意：`git show <sha>`；标题批量取：`git log --no-walk --format='%h %s' <sha...>`。
- 本仓现状：源码、类型和既有 Task 记录。下文路径行号对应 `main@045a987ab`。

证据分两级，下文逐条标注：

- **已核对**：协调者本人读过本仓对应源码或跑过 `rg`、`git merge-base` 确认。
- **未标注**：来自分诊时的只读子代理报告，结论和落点未逐条复核。按这类条目建 Task 时，先在 Task 内复核再动手。

## 当前结论

| 分类 | 数量 | 含义 |
|---|---|---|
| 已处理 | 34 | 已有 Task 移植完成，或正在进行 |
| 可直接采纳 | 20 | 本仓有同样的问题或缺口，结构没有分叉，按上游思路补 |
| 改写后采纳 | 17 | 值得做，但本仓结构已分叉，要按本地结构重写 |
| 需用户拍板 | 22 | 新功能、删除既有功能或打包范围，不能由 Agent 定 |
| 不用跟 | 38 | 本仓没有对应功能、已有等价实现或与品牌相关 |

### 已处理（25 个）

| Task | 上游提交 |
|---|---|
| [TASK-0516](../tasks/TASK-0516-git-panel-flat-polish.md) | `3239d8e23` `060b589a1` `4b169ab54` `994d3d88d` `73305d477` |
| [TASK-0529](../tasks/TASK-0529-session-open-failure-feedback-loop.md) | `972c6cdcb` `223a8c6a3` `a1cb2d2fb` |
| [TASK-0530](../tasks/TASK-0530-cli-model-resume-precedence.md) | `8e6d9dfe2` |
| [TASK-0531](../tasks/TASK-0531-telemetry-dead-code-removal.md) | `21f04ae88` `4a3dc19e0` |
| [TASK-0532](../tasks/TASK-0532-diagnostics-export-dialog.md) | `2c376e998` `925ce0cdc` |
| [TASK-0533](../tasks/TASK-0533-main-window-navigation-refine.md) | `9741f73ae` |
| [TASK-0534](../tasks/TASK-0534-toaster-portal-above-dialogs.md) | `39f3bdc88` |
| [TASK-0498](../tasks/TASK-0498-plugin-ui-widening.md) | `2f2464e30`（`count` 已移植，`aria-pressed` 有意保留） |
| [TASK-0535](../tasks/TASK-0535-release-notes-into-update-feed.md) | `e4af417d9` `cc5167f01` `6b2f3d075` `82dd6fa3f` `3d734aa54` `fba430225` |
| [TASK-0536](../tasks/TASK-0536-upstream-functional-bug-fixes.md) | `245f0dc4f` `057b22c1d` `50d6f5f86` `29e678a97` |
| [TASK-0537](../tasks/TASK-0537-streaming-ipc-performance.md) | `f0c003de0` `61c5c72ce` `4dc9f15f8` |
| [TASK-0538](../tasks/TASK-0538-compute-render-performance.md) | `01ceb15c1` `566455dae` `15b901f49` `82f7ab230` |
| [TASK-0539](../tasks/TASK-0539-design-gallery-iframe-budget.md) | `d99e32377` `57e3136a1` `867179b27`（含基线前漏项） |
| [TASK-0543](../tasks/TASK-0543-upstream-perf-trio-adaptation.md) | `502fe4dc5` `770602579` `ac62b5c2d` |

TASK-0535 只移植更新说明的 Markdown 渲染、外链转系统浏览器和开发预览，不做上游的多版本说明管道：本仓走 generic/R2 更新渠道，没有上游依赖的 `fullChangelog`。

### 可直接采纳（26 个）

（维护注记 2026-11-27：本节原为 26 个，其中功能错误 4 个已由 [TASK-0536](../tasks/TASK-0536-upstream-functional-bug-fixes.md) 落地、性能 9 个已由 [TASK-0537](../tasks/TASK-0537-streaming-ipc-performance.md)/[TASK-0538](../tasks/TASK-0538-compute-render-performance.md)/[TASK-0539](../tasks/TASK-0539-design-gallery-iframe-budget.md) 落地——含基线前漏项 `d99e32377`；落点行号等实施证据以各 Task 交付段为准，下文保留体验与低价值两组候选。）

功能错误，价值最高（4 个）——**已全部落地，见 TASK-0536**：`057b22c1d` `245f0dc4f` `50d6f5f86` `29e678a97`。

性能（9 个）——**已全部落地**：`f0c003de0` `61c5c72ce` `4dc9f15f8`（TASK-0537）；`01ceb15c1` `566455dae` `15b901f49` `82f7ab230`（TASK-0538）；`867179b27` `57e3136a1`（TASK-0539）。

**基线之前的漏项**：`d99e32377`（画廊风格墙静止时不给每张卡挂 iframe）是 `641aaf694` 的祖先（已用 `git merge-base --is-ancestor` 核对），不在这 125 个里；已随 `867179b27`、`57e3136a1` 一起由 TASK-0539 落地。

体验（11 个）——**其中 9 个已随 TASK-0542 落地**（`e9b6945f8`、Mermaid 四个、theme-ui 小修中的 `808d86ecd`/`807d43b81`/`fef618780`；另 `d2d267722` 纯重构一并逐字移植）；输入预测两个（`ec42f4d02`/`e1d4baa74`）为功能增强未实施，`f76d0958b` 浅色取舍待用户拍板：

- `e9b6945f8` 回复中输入文字，发送按钮切成「添加到队列」时输入框高度跳动。落点 `InputBarToolbar.tsx:195`。
- Mermaid 四个，落点 `packages/theme-ui/src/markdown/MermaidBlock.tsx:25,32,35-42`、`preview-policy.ts:32-45`、`MarkdownImage.tsx:40`：
  - `b8bd42467` 复制与另存的图没有白底。
  - `a73f1524d` 深色主题下没有强制浅色配色和灰色画布。
  - `da7a476a5` 图操作没收进代码块顶栏，图片受 `max-h-96` 限高。
  - `3686687a6` 没有按 `viewBox` 算固有尺寸。
- 输入预测两个，本仓已有该功能（`chat-atoms.ts:408`、`useSuggestionBubblesModel.ts:14`）：
  - `ec42f4d02` 第一条建议只进 placeholder，没有内联预测、Tab 填入和 Esc 放弃。`DefaultInputBarConnector.tsx:135`、`useInputBarSources.ts:125-126`。
  - `e1d4baa74` 开关还在实验区，上游移到个性化。`AgentSettingsView.tsx:93-106`。
- theme-ui 小修四个：
  - `808d86ecd` 用量环提示没用 `createPortal`，会被活动面板遮挡。`packages/theme-ui/src/chat/ContextRingView.tsx:86`。
  - `807d43b81` 输入栏聚焦描边压淡。`packages/theme-ui/src/chat/MessageInputView.tsx:58`。
  - `f76d0958b` 活动面板浅色底色改用 card。`ActivityPanelFrame.tsx:19`、`TabBar.tsx:183`。
  - `fef618780` 用量环轨道颜色。`ContextRingView.tsx:49-51`。
  - 后三个是观感取舍，是否跟上游由用户定，放进同一个 Task 时一并确认。

价值偏低（2 个）：

- `c06d02e3a` 监听 `models.json` 外部改动，不重启刷新模型。本仓没有 watcher（已核对），落点 `apps/desktop/src/main/models/model-settings-host.ts:27`、`apps/desktop/src/main/ipc/settings.ts:51`。上游的动机是 Magpie 从外部写这个文件，本仓没有这个写入方，只对手工编辑有用。
- `99f06b428` 会话历史摘要带创建时间。`packages/runtime-core/src/contracts.ts:370-387`、`packages/coding-agent/src/sessions/legacy/catalog.ts:112-123`。要配合侧栏按创建时间排序（`6ca4b9479`）才有意义。

### 改写后采纳（14 个）

- `5fd12b81f` Kimi 预设分国际站与国内站。本仓只有国际站，用 `PROVIDER_KEYS` 重映射，要加 `kimi-cn` 别名并提升 catalog 版本。落点 `apps/desktop/src/main/models/presets/catalog.ts:61`、`presets/models-dev.ts:87`。
- `69edb1958` 基于预设人设自建的智能体不被插件预设认领。`apps/desktop/src/main/agent-teams/plugin-agent-preset-reconcile.ts:235` 已修主体，但 `findLibraryProfile` 没排除用户自建档案，`findPresetAgent` 没有 claims/taken 去重。后一个缺口能否实际触发未证实。
- 侧栏三个。本仓固定按项目分组、只按 `modifiedAt` 排序，结构已分叉：
  - `6ca4b9479` 平铺展示与按创建或回复时间排序。`apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/ProjectsPanel.tsx:23,60`、`ProjectGroupsSection.tsx:16`、`services/sidebar-session-order.ts:29-40`。
  - `5428d5f18` 本仓没有 `SidebarSectionActionButton`，标题按钮没有 `focus-visible`。`packages/theme-ui/src/project/DefaultConversationSectionView.tsx:39-65`、`AddProjectMenuTriggerView.tsx:36-46`。
  - `6f301eb5f` 对话区空列表常驻本仓已有；「添加项目」触发器结构不同。
- `cd80a2b17` 较早的用户消息也能编辑重发，后续对话留作另一个版本。本仓只能改最后一条，走 `replaceLastUserMessage`。`useUserMessageActions.ts:188,190`、`useSessionMessageSender.ts:328`、`preload/apis/session.ts:310`。这是本组里最大的一项。
- `be92ee50e` `d6cea463a` `4d4e9dd6b` `f2c779da1` `eb61be3a8` 用户消息操作按钮移到气泡左侧并居中。本仓操作区在页脚右侧，还分只读和可编辑两套组件。`SessionUserMessage.tsx:93-98,119-139`、`ReadonlyUserMessage.tsx:40-44`、`UserMessage.tsx:123-139`。
- Windows 按钮组三个：
  - `069cad7fa` `packages/ui/src/button-group.tsx:22` 已有 glass/flat/ghost 三种外观（来自 [TASK-0497](../tasks/TASK-0497-ui-sdk-base-exports-and-first-components.md)，已核对）。但上游同一提交还在 `apps/desktop/src/renderer/styles.css` 加了 `:root[data-platform="windows"] [data-slot="button-group"][data-variant="glass"]` 去玻璃规则，本仓没有（已核对）。子代理判为已有等价，协调者改判为部分缺失。本仓 CSS 已在用 `:root[data-platform="mac"]` 这类选择器，可照同样写法补。
  - `4b7cb3a17` 是 `069cad7fa` 之前的组件内写法，已被后者取代，按后者的 CSS 方案实现即可。
  - `4e0914d70` 本仓已有 `chromeButtonGroupVariant`（`packages/theme-ui/src/shared/platform.ts:10`），`SpaceSwitcher.tsx:89` 已使用。`HeaderActionBarView.tsx:656`、`HeaderActionOverflowMenu.tsx:122` 的按钮组没传 variant，`SettingsMenuTriggerView.tsx:29` 不是 `ButtonGroup`。
### 需用户拍板（22 个）

四项都还没有决定。写本记录时已向用户提出，未获答复。

**1. 自动化结果经 IM 投递（11 个）**：`3de267efb` `3d9980de9` `e0c7b6989` `798b726db` `cd159db43` `ef2f17e6d` `088ab6191` `4343d3df1` `3bcacee33` `eab87356f` `fc5dab24d`。

- 本仓整条链路为零，属于新功能。定时任务只把回复截 500 字写进执行记录（`apps/desktop/src/main/scheduler/task-executor.ts:226,234,258`）；`apps/desktop/src/shared/automation.ts:70` 的 `ScheduledTask` 没有通知字段。
- [ADR-0155](../../docs/adr/0155-automation-run-target-and-schedule-model-v2.md) 第 104 行写明上游 `notifyClaw`/webhook 通知不在该 ADR 范围，后续独立决策（已核对）。
- 本仓保留了 `apps/im-gateway`（Go），IM host 在 `apps/desktop/src/main/im-host/`。
- 如果决定做，各提交的状态：
  - `3de267efb` `3d9980de9` `798b726db` `ef2f17e6d` `3bcacee33` 可移植。
  - `e0c7b6989` `cd159db43` 要按本仓 v2 任务模型重新设计。
  - `088ab6191` `4343d3df1` `eab87356f` `fc5dab24d` 是该功能的后续修复和测试，随功能一起决定。
- 落点建议：投递目标作为 `ScheduledTask` 上的独立可选字段，不放进 `runTarget` 或 `schedule`；贯通 `automation.ts:97,115`、`scheduler-service.ts:190,210`、`v1-shape-adapter.ts:25,47,79`、`packages/coding-agent/src/features/scheduled-tasks/automation-package/export.ts:25` 和 `types.ts:23`；触发点在 `task-executor.ts:256` 写记录之后。
- 权限：投递只发已生成的文本，不触发工具调用，不碰 ADR-0132 的分档。投递目标只能由用户配置，不进模型可写路径。
- 未证实：本仓对未知帧是记录后忽略（`apps/im-gateway/cmd/im-gateway/host.go:501`），和上游握手期能力协商的时序不同，是否影响回执需在设计时核对。

**2. Windows ARM64 打包（4 个）**：`d9e1e9dbb` `e9c38e6f2` `e2424ea4c` `f83a60e7c`。

- `apps/desktop/scripts/desktop-build-environment.mjs:14` 的 `SUPPORTED_PLATFORM_TAGS` 不含 `win32-arm64`。
- `desktop-build-environment.test.mjs:78` 有一个用 `win32-arm64` 断言校验失败的用例。
- 没有 `dist:win:arm64` 脚本。
- 本仓是否有意排除 ARM64 没找到依据；`apps/desktop/src/main/inno-windows-update.ts` 是否存在没查。`d9e1e9dbb` 改的是上游发版流水线，本仓发版线独立，即使做也不照搬。

**3. 上游删掉、本仓还在的功能（7 个）**：

- 修仙主题 `e05510647` `5dee05a71`：`packages/themes/builtin/xianxia` 还在，是唯一的内置主题包。
- 成就 `1d6441c7a` `fb160d31d` `4195345a5`：`packages/theme-ui/src/settings/Achievement*` 和 `achievements/` 还在；`three`、`canvas-confetti` 依赖也还在（`apps/desktop/package.json`）。
- `d4c8c2ded` 移除 `html_to_pdf` 内置工具：本仓 coding-agent、runtime-node、cli-host 都还有，并出现在 `packages/coding-agent/src/features/scheduled-tasks/unattended-permission-tiers.ts`，删它会改动 ADR-0132 的分档清单。
- `04757b1cd` 上游把 `comfyui-media-provider`、`content-creation` 移出 development 档位；本仓 `packages/plugins/tenants.json` 的 development 档位两者都在，production 档位没看全。

**4. 桌宠已关闭的代码要不要清理**：`apps/desktop/src/shared/feature-flags.ts` 曾写死 `DESKTOP_PET_ENABLED = false`。上游 `f41786fb6` `223cdfa95` 是删除桌宠气泡及样式选项。该功能已按 TASK-0540 整功能移除，主进程/preload/渲染器/设置页/媒体资源与文档全部删除；这两个 sha 仍归入下面「不用跟」的桌宠 7 个。

### 不用跟（38 个）

- Magpie 服务商 10 个：`8721b7cec` `60e7fd8b4` `13cb135f7` `b93761b9c` `cdeb68e45` `e70acbb14` `634ffea2b` `5f28f7f9f` `e58596133` `24d4e93c3`。本仓 `rg -i magpie` 在源码中只命中 `packages/runtime-desktop/src/unavailable-model.ts:11` 一条注释。
- 桌宠 7 个：`62496f274` `0e620ab7c` `89fa8add6` `1a690eb68` `4f015c2eb` `f41786fb6` `223cdfa95`。功能已按 TASK-0540 移除，不需要再跟。
- 品牌与素材 11 个：应用图标 `49818d337` `1793f66d1` `cee202825` `e4edb55f3` `46625eacb` `9cf6fa0e1`；README 图 `38719a58d` `8379298c8` `6c8378425` `18b229239` `250685916`。本仓没找到应用图标选择功能，只做了粗查。
- 已有等价 4 个：
  - `f56937aac` `f4fac1eaf` Windows SSH：`apps/desktop/src/main/ssh/ssh-runtime.ts:63` 的 `createPlatformRunner` 在 win32 上走进程内 ssh2（[BUG-0049](../bugs/BUG-0049-windows-ssh-controlmaster-mux.md)，已核对）。只核实了这个生产入口。
  - `d2d267722` 纯重构，`packages/theme-ui/src/markdown/MarkdownImage.tsx:16-36` 已有同样的状态机和 generation 防过期（已核对）。后因 MermaidBlock 操作收进顶栏需共用该状态机，已随 TASK-0542 一并逐字移植 `image-actions.ts`。
  - `195cfcc44` `apps/desktop/src/main/plugins/plugin-protocol.ts:148` 已转发 `SegmentedControl`（已核对）。
- 前提不存在 3 个：
  - `9236a0385` 本仓会话行视图没有 `waiting` 字段（`apps/desktop/src/renderer/domains/project/hooks/stableSessionViews.ts`，已核对），等待态只在 `SpaceSwitcher` 的空间级汇总里有。
  - `34bad3091` 本仓没有气泡尾巴 CSS（已核对，`rg` 无命中）。
  - `613e2e20f` 本仓没有 `snapshot-feed.ts`（已核对）。只做了结构判断，没做运行时渲染计数。
- 纯测试 3 个：`1dac576c6` `bce62b00c` `4718ab3a0`。对应的功能移植时按本仓测试政策写，不单独跟。

### 分诊中发现的台账问题

两条均已于 2026-11-27 维护时修正：

- ~~TASK-0529 的「不做」一条把 `867179b27` 和 `5fd12b81f` 记成 Magpie 相关修复、本地无该功能~~——已改为正确的归属说明（前者 TASK-0539 已落地，后者在本记录改写后采纳清单）。
- ~~`project/plans/README.md` 的 PLAN-0032 一行仍写「D1–D7 待拍板，未建 Task、未实施」，PLAN-0032 状态仍是 `draft`~~——README 行与 frontmatter 均已更新为 `in_progress` 并反映拍板与批次进度。

### 0.6.32 增量补记（314065cac..f977794b3，2026-11-27）

上游推进到 0.6.32，增量共 8 个提交：

- 发版流水 3 个跳过：`f977794b3`（版本推进）、`3749c7f4a`、`14dc99f5b`（发布说明定稿）。
- 已落地 2 个（[TASK-0541](../tasks/TASK-0541-windows-crossdrive-and-font-fixes.md)）：`59f124232` 设计引擎跨盘画布空白、`168a38bb2` Windows 字体显式 Segoe UI/微软雅黑。
- 待用户拍板 3 个（像素插画外观项，纯装饰）：`0357d928d` 工作空间弹窗像素风插画、`930580a72` 诊断包弹窗海底像素插画、`a0afcfedc` webp 类型声明上移（前两个的配套）。本仓是否跟随由用户决定。

下一轮分诊以 `f977794b3` 为新锚点。

## 被否决的方案

- **整体 merge 或批量 cherry-pick 上游这段提交**：违反 REQ-0008 的择优原则。PLAN-0032 已记录两边没有等价补丁（`--cherry-mark`），本仓历来是按主题重写；这 125 个里有 38 个本仓根本不需要，22 个要先拍板。
- **只按上游发布说明逐条对照**：发布说明不反映本仓现状，会把已有等价实现当成缺口（如 Windows SSH、`SegmentedControl` 转发），也看不到 `d99e32377` 这类基线之前的漏项。
- **把删除类提交当作清理直接跟**：修仙主题、成就、`html_to_pdf` 在本仓仍是在用或保留的功能，删除属于产品取舍，按 D6 口径交用户定。
- **把自动化 IM 投递当作普通移植**：本仓链路为零，且 ADR-0155 明确把通知留给后续独立决策，需要先定做不做，再按 v2 任务模型设计。

## 代码/测试/指标锚点

- 复现提交清单与计数：
  - `git rev-list --count 641aaf694..upstream/dev` 得 170。
  - `git rev-list --count --merges 641aaf694..upstream/dev` 得 11。
  - `git log --no-merges --format='%h %s' 641aaf694..upstream/dev` 共 159 行，其中 34 行是 `chore(release):`、`docs(release):`。
- 基线前漏项的判定：`git merge-base --is-ancestor d99e32377 641aaf694` 退出码 0。
- 上游原意：`git show <sha>`；只看某文件用 `git show <sha> -- <path>`。
- 本仓落点见各条目的路径和行号，对应 `main@045a987ab`。
- 本次没有运行测试或构建，也没有性能实测。性能类条目的判断依据是代码结构（是否存在合批、缓存或分段逻辑），不是测量数据。

## 失效条件与置信度

- 上游 `dev` 越过 `f977794b3` 后，新增提交需要另做增量分诊；125 个主体条目的分诊结论仍以 `314065cac` 版为准。
- 本仓 `main` 越过 `045a987ab` 后，路径行号可能偏移，建 Task 时重新定位。TASK-0535 提交后，更新弹窗相关 6 个提交的状态以该 Task 记录为准。
- 置信度：
  - 高：标注「已核对」的条目；已处理的 22 个（有 Task 记录和提交）；Magpie、品牌素材、纯测试这三组不用跟的判断。
  - 中：未标注的可直接采纳和改写后采纳条目。缺口是否存在、落点是否准确来自子代理报告，未逐条复核。
  - 低：`69edb1958` 的去重缺口能否实际触发；`613e2e20f` 是否真的没有对应的重渲染问题；IM 网关未知帧时序的影响。
- 性能类条目没有基线数据。如果实施前的测量显示本仓没有可感知的问题，对应条目可以降级或不做。

## 下一步触发信号

- 用户对四项拍板作出决定后，把结果写回 PLAN-0032，再排实施顺序。决定做自动化 IM 投递时需要新 ADR。
- 用户要求开始实施时，按主题建 Task。建议顺序是功能错误 4 个、性能 9 个加 `d99e32377`、体验 11 个，再到改写后采纳的各组；每个 Task 开工前在 Task 内重新核对本仓 HEAD 与上游提交。
- 用户反馈团队会话模型被改回、自定义请求头丢失、csh 主机连不上或长工具调用时界面卡顿时，对应条目直接提为修复 Task。
- 上游 `dev` 明显前进时，以 `f977794b3` 为新基线做下一轮增量分诊。
