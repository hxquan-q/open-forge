---
name: Open Forge Desktop
description: 桌面工作台的设计系统 —— 暗色默认、token 化、克制动效
colors:
  # 以下为「出厂默认」外观：主题 mono（界面名 Default）+ 暗色模式。
  # 三套主题 × 两个模式的完整矩阵见正文 ## Colors。
  workbench-black: "#121212"
  toolplate: "#1d1d1d"
  toolplate-raised: "#1c1c1c"
  shade: "#181818"
  bone-white: "#e4e4e4"
  bone-white-ink: "#08080a"
  bench-ink: "#d0d0d0"
  graphite: "#808080"
  groove: "#303030"
  rule: "#2a2a2a"
  stop-signal: "#ff5b5b"
  running-green: "#10b981"
  waiting-amber: "#f59e0b"
typography:
  body:
    fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif'
    fontSize: "0.875rem"
  label:
    fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif'
    fontSize: "0.6875rem"
    fontWeight: 500
  mono:
    fontFamily: '"SF Mono", "Fira Code", monospace'
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  tight: "10px"
  list: "12px"
  card: "14px"
  section: "16px"
  wide: "20px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.bone-white}"
    textColor: "{colors.bone-white-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-default:
    backgroundColor: "{colors.bench-ink}"
    textColor: "{colors.workbench-black}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-destructive:
    backgroundColor: "rgb(239 68 68 / 0.1)"
    textColor: "#ef4444"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  select-trigger:
    backgroundColor: "{colors.toolplate}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  dialog:
    backgroundColor: "{colors.toolplate-raised}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  switch:
    backgroundColor: "{colors.groove}"
    rounded: "{rounded.full}"
    height: "18.4px"
    width: "32px"
---
<!-- Modified by The Open Forge contributors. -->

# Design System: Open Forge Desktop

> 本文件是 **agent 改动 `src/renderer/**` 任何 UI 时的必读硬性规范**，不是参考手册。
> 单一事实源：`src/renderer/styles.css` 的 CSS 变量与 `@theme inline` 块，以及
> `src/renderer/shared/theme/themes/` 的主题注册表。
> 任何与本文件冲突的现存代码 = 待清理的债，**不要**当作范例复制。
>
> 本文件同时是 Impeccable 的 `DESIGN.md`：上方 YAML frontmatter 是机器可读的 token 层
> （token 为准，正文提供使用语境），标题使用规范英文名以便工具解析，正文保持中文。

## 触发场景

修改/新增以下任何内容时，先把本文件读完：

- `src/renderer/**/*.tsx`、`src/renderer/**/*.css`
- `shared/components/ui/**`（shadcn 基础件）
- 任何包含 `className=` 的 React 文件
- 任何使用 `motion/react` 的动画

---

## Overview

**Creative North Star: "The Workbench"（工作台）**

这是一套**工具**的视觉系统，不是展厅。北极星取 local-first 的字面含义：工具摊开在用户自己的台面上，伸手可及、标识清晰、不加装饰。工作台的美学前提是**长期使用**——用户会在这里连续待上数小时，所以这套系统把可读性、状态可见性和视觉安静度放在表现欲之前。暗色是出厂默认，因为工作台通常在长时间专注的场景下使用；近黑的台面降低整屏亮度，让内容本身成为唯一亮点。

视觉上，系统由**无彩刻度**主导：`mono` 主题（界面名 Default）把主色压成骨白与纯黑，其余全部是中性灰阶。颜色在这里不是氛围，而是**信号**——只有「运行中 / 待处理 / 错误」三种语义才配得到色相。这与产品承诺里「可审查胜过魔法」一致：界面上任何一处颜色都应当在回答一个问题，而不是在营造一种情绪。

结构上，系统靠 **1px 边框 + 背景透明度**分层，而不是靠阴影和圆角堆叠。卡片默认完全无阴影，深度是浮层的专属信号。控件刻意做小（按钮高 24–36px，标签字号 11–13px），把像素留给内容。动效只做反馈、不做表演。

**Key Characteristics:**

- 无彩主导：默认主题零色相，颜色只承担语义
- 平坦分层：1px border + bg 透明度，卡片恒 0 阴影
- token 单一入口：颜色/阴影/圆角只从 `@theme inline` 取，禁止硬编
- 运行时主题化：3 套主题 × 明暗，全部由 CSS 变量驱动，token 自动适配
- 小尺寸高密度：控件偏小，字号梯度严格限定在 7 档
- 动效克制：hover 上限 2px 位移，无装饰性循环动画

---

## Colors

一套由 CSS 变量驱动的**运行时主题化**色板：三套主题（`mono` / `sand` / `default`）× 两个模式（dark / light）。下方 frontmatter 锚定的是**出厂默认**组合（`mono` + dark）——这是新用户看到的外观。

色板性格：默认组合完全没有色相，主色是骨白而非彩色；`Classic` 的 indigo 与 `Coral` 的珊瑚红是可选外观，不是品牌主色。

### Primary

- **Bone White**（`#e4e4e4` / `rgb(228, 228, 228)`）：默认主题在暗色模式下的主色。实心主操作按钮、选中态、当前项标记。它之所以是"骨白"而不是纯白，是为了在近黑底上不产生刺眼的边缘晕光——纯白实心按钮在长时段使用中会持续拉走注意力。
- **Bone White Ink**（`#08080a` / `rgb(8, 8, 10)`）：主色之上的前景色。带一点点蓝，避免与真正的中性黑混淆。

### Neutral

- **Workbench Black**（`#121212` / `rgb(18, 18, 18)`）：台面本底。页面背景。
- **Toolplate**（`#1d1d1d` / `rgb(29, 29, 29)`）：卡片与面板面。比本底亮 11 级，足以分层又不产生"浮起"感。
- **Toolplate Raised**（`#1c1c1c` / `rgb(28, 28, 28)`）：浮层面（popover / dialog / dropdown）。注意在默认主题下它比 Toolplate **更暗**——浮层靠边界的清晰度建立层级，而不是靠变亮。
- **Shade**（`#181818` / `rgb(24, 24, 24)`）：`muted` 面。用于内嵌区块、表头、禁用背景。
- **Bench Ink**（`#d0d0d0` / `rgb(208, 208, 208)`）：正文前景。压到约 82% 亮度而非近白，同样是为了长时段阅读。它同时是 `button-default` 的底色（前景反相成按钮）。
- **Graphite**（`#808080` / `rgb(128, 128, 128)`）：次要文字、icon 静默态、placeholder。
- **Groove**（`#303030` / `rgb(48, 48, 48)`）：输入槽底、hover 面（`accent`）、开关轨道。
- **Rule**（`#2a2a2a` / `rgb(42, 42, 42)`）：分隔线与边框。全局恒 1px。

### Secondary / Tertiary

默认主题不定义彩色副色。`Classic` 主题保留 indigo（暗 `#6366f1` / 亮 `#4f46e5`），`Coral` 主题保留珊瑚红（`#e0583c`，明暗同值）——它们只存在于这两套可选主题中。

### 语义色

只有三种语义允许色相，且只有前两种可以用 Tailwind 原色：

| 语义 | 类 | 触发条件 |
| --- | --- | --- |
| 成功 / 运行中 | `bg-emerald-500/15` `text-emerald-400` | 已启用、运行中、连接成功 |
| 警告 / 可更新 | `bg-amber-500/15` `text-amber-400` | 版本可更新、待办、超时 |
| 错误 | **必须用 `destructive` token**，禁止 `red-*` | 删除、失败、不可逆操作 |

其他业务标签色（"自定义"、"实验"、"Beta"）一律用 `bg-primary/10 text-primary` 或 `bg-accent/60 text-muted-foreground`，不要引入 `violet-*` / `sky-*` / `pink-*`。

> **已知例外**：`Button` 的 `destructive` variant 目前仍在用 `bg-red-500/10 text-red-500`（见 `packages/ui/src/button.tsx`），与本表冲突。改动相关组件时就近迁移到 `destructive` token；不要去复制它。

### 主题矩阵

`src/renderer/shared/theme/themes/index.ts` 的 `DEFAULT_THEME_ID = "mono"`。`applyTheme()` 把 `data-mode`（`light`/`dark`）与 `data-theme`（主题名）写到 `<html>`，并把全部 token 作为 inline CSS 变量写进 `documentElement.style`；未记录的 mode 回落 `dark`。

| 主题 id | 界面名 | 暗色 primary | 亮色 primary | 暗色本底 | 亮色本底 |
| --- | --- | --- | --- | --- | --- |
| `mono` | Default | `#e4e4e4` | `#000000` | `#121212` | `#ffffff` |
| `sand` | Coral | `#e0583c` | `#e0583c` | `#202020` | `#f0f1f2` |
| `default` | Classic | `#6366f1` | `#4f46e5` | `#14161e` | `#ffffff` |

两个必须知道的事实：

1. **`styles.css` 的 `:root` 不是出厂外观**——它是 `Classic` 的暗色值，只作为冷启动前的兜底；`applyInitialTheme()` 在 React 挂载前就会用默认主题覆盖它。
2. **`data-theme` 是主题名，不是明暗**。明暗走 `data-mode`。写 `[data-theme="light"]` 不会命中任何东西。

### Named Rules

**The Token-Only Rule.** 颜色只有一个合法来源：通过 `@theme inline` 暴露的 token 工具类及其 `/N` alpha 变体。任何 hex / `rgb()` / `hsl()` 字面量、Tailwind 默认调色盘、自定义 `style={{ color }}` 都违规。

**The Achromatic Default Rule.** 默认主题不带任何色相。想"加点颜色让界面好看点"时，正确答案是调整层级与间距，不是引入色相。

**The One Signal Rule.** 语义色每屏最多出现一次作为主信号。同时出现"运行中 + 待处理 + 错误"三个彩色标记时，用户就不再能一眼定位问题所在。

**The Alpha Ladder Rule.** 透明度只允许 `/5 /10 /15 /20 /25 /30 /40 /50 /60 /70 /80` 这些档位，例如 `bg-primary/10`、`border-border/40`、`text-muted-foreground/60`。随手写 `/37` 会让透明度体系失去可预测性。

---

## Typography

**Display / Body Font:** `-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif`
**Mono Font:** `"SF Mono", "Fira Code", monospace`

**Character:** 默认使用系统原生 UI 字体栈，不加载任何 web font。这是一个刻意的一致性选择：桌面应用要与操作系统自身的设置、菜单、对话框并置，任何自定义字体都会在这个并置中显得突兀——而且会引入加载闪烁。字体的个性不来自字形，而来自极度克制的字重与字号阶梯。`--font-serif`（Georgia）虽在 token 契约中声明，但桌面 renderer 的界面几乎不使用衬线体。

用户可在外观设置中选择本机已安装的界面/代码字体；这是明确的阅读偏好例外，不改变出厂字体栈或字号阶梯，不下载/分发字体。代码与终端保持等宽候选，缺字继续沿默认栈回退，恢复默认随当前主题生效。

### Hierarchy

仅使用以下七档，**不要**自创：

- **Stat**（`20px`+）：统计数字、超大计数。
- **Title**（`15px`）：页面区块标题。
- **Body**（`14px`，`text-sm`）：正文与控件文本的主力档。Button 基础类即 `text-sm font-medium`。
- **Body Small**（`13px`）：菜单项、列表项、下拉项（`DropdownMenuItem` 用 `text-[13px]`）。
- **Caption**（`12px`，`text-xs`）：密集标签、Select 触发器与选项、Tooltip、表格单元格。
- **Micro**（`11px`）：分组标签、SegmentedControl 项。
- **Nano**（`10px`）：极小角标。

### Named Rules

**The Seven-Step Rule.** 字号只允许 `10 / 11 / 12 / 13 / 14 / 15 / 20+` 七档。需要"再大一点"时，说明层级设计还没想清楚，而不是需要一个新档位。

**The Monospace-Is-For-Data Rule.** 等宽字体只用于代码、数据、测量值和路径。不要用它来给界面"加技术感"——那是戏服。

> **已知例外，分两类**：
> 1. **输入基元的移动端惯用法（合规，勿改）**：`input` / `textarea` 类基元用 `text-base … md:text-sm`——窄窗下 16px 防止 iOS 聚焦缩放，≥768px 回落 14px。共 6 处：`packages/ui/src/input.tsx`、`apps/desktop/src/renderer/shared/components/ui/textarea.tsx`，以及 `packages/theme-ui/src` 的 `BatchTasksTaskApprovalView.tsx`、`BatchProjectFoldersFieldView.tsx`、`KnowledgeRenameDialogView.tsx`、`TeamDialogsView.tsx`。自查时不要把它们判为违规。
> 2. **shadcn 标题底座（待归位）**：`DialogTitle`（`packages/ui/src/dialog.tsx`）与 `DrawerTitle`（`packages/ui/src/drawer.tsx`）同为 `text-base`（16px），落在七档之外。改动各自组件时归位到 15px。

---

## Layout

桌面优先的密度模型。页面外层留白 `px-8` + `pb-8`；`AppFrame` 自身另有 `p-2` 内衬，侧栏"经典"样式会抵消它以贴住窗口边缘。

**间距尺度**（key 对应 frontmatter 的 `spacing`）：

- **tight**（`10px` / `gap-2.5` / `px-2.5`）：紧凑卡片网格、Select 触发器左右内衬。
- **list**（`12px` / `gap-3` / `px-3`）：标准卡片网格、紧凑列表项左右内衬。
- **card**（`14px` / `px-3.5`）：标准卡片内衬。
- **section**（`16px` / `gap-4` / `p-4`）：大块统计、Section、宽松卡片与设置面板。
- **wide**（`20px` / `gap-5`）：Section 之间的呼吸。
- **page**（`32px` / `px-8` / `pb-8`）：页面外层。

**padding 选择：**

| 容器 | padding |
| --- | --- |
| 紧凑列表项（h≈40） | `px-3 py-2.5` |
| 标准卡片 | `px-3.5 pt-3 pb-3` |
| 宽松卡片 / 设置面板 | `p-4` |
| 页面外层（page container） | `px-8` + `pb-8` |
| Popover 内 menu item | `px-2.5 py-1.5` |

**grid gap：**

| 内容 | gap |
| --- | --- |
| 紧凑卡片网格 | `gap-2.5` |
| 标准卡片网格 | `gap-3` |
| 大块统计 / Section | `gap-4` ~ `gap-5` |

grid 自适应：`grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`（小卡）/ `minmax(320px,1fr)`（行式列表）。**禁止**写死 `grid-cols-3`。

**响应式：** 项目未覆盖 Tailwind 断点，因此使用其默认值（`sm 640` / `md 768` / `lg 1024` / `xl 1280` / `2xl 1536`）。这是 Electron 桌面应用，主战场是 1024–1600 宽度；不要在组件里假设手机宽度。

### Named Rules

**The Rhythm Rule.** 同一页只用一个间距节奏，且标题上方的空间永远大于下方。标题下方的间距小于上方时，标题会被读成上一块内容的尾巴。

**The No-Fixed-Grid Rule.** 卡片网格一律用 `auto-fill` + `minmax` 自适应。写死列数会在用户拉窄窗口时立刻破版。

---

## Elevation & Depth

**默认平坦。** 这是本系统最鲜明的一条主张：卡片、面板、列表项在静止态**没有任何阴影**，深度完全由 1px 边框加背景透明度建立。这套系统里阴影不是"看起来更立体"的装饰手段，而是**浮层的专属信号**——它回答"这一层浮在内容之上"这个具体问题。

`styles.css` 提供完整的 8 档阴影 token（`--shadow-2xs` 到 `--shadow-2xl`），但只有最上面几档被使用：

### Shadow Vocabulary

- **`shadow-md`**（`0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 2px 4px -1px hsl(0 0% 0% / 0.18)`）：浮层面。Popover、DropdownMenu、SelectContent、Toast、floating bar。
- **`shadow-lg`**（`0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 4px 6px -1px hsl(0 0% 0% / 0.18)`）：更高一层的浮层，以及拖拽中的元素。
- **其余档位**（`2xs` / `xs` / `sm` / 默认 / `xl` / `2xl`）：token 已定义但界面基本不用。不要为了让某个元素"更突出"去挑一档。

所有阴影都是**黑底 + 低透明度**的两段式（一段紧贴、一段扩散），没有任何彩色或带 offset 的硬阴影。阴影**不得**带主色——带主色的发光阴影会让控件看起来像在自我宣传。

### Named Rules

**The Flat-By-Default Rule.** 静止态是平的。深度只在两种情况下出现：元素浮在内容之上（浮层），或元素正在被拖拽。

**The Border-Not-Shadow Rule.** 需要在视觉上分隔两个面时，先加 1px 边框或改背景透明度；确认这两条都不够，再考虑这是否真的是一层浮层。

> **项目既有规则（保留）**：卡片 hover **不得**添加 `shadow-*`；**禁止**任何 `shadow-[...]` 自定义任意值；**禁止**自定义 `--shadow-*` token，沿用 `styles.css` 已有八档。强调态（被选中、活跃 session）用 ring 而不是 shadow：`ring-1 ring-inset ring-primary/30`、`bg-primary/10`、`border-primary/40`。

---

## Shapes

形态语言由一条 1px 的线与一个 8px 的基础圆角统治。没有斜切、没有不对称切角、没有装饰性几何。

### 圆角尺度

| 元素 | 类 | 值 |
| --- | --- | --- |
| 卡片、面板、grid 卡 | `rounded-xl` | `12px` |
| 列表项、输入框、按钮（常规 size） | `rounded-lg` / `rounded-md` | `8px` / `6px` |
| 小 chip / 图标块（h ≤ 9） | `rounded-lg` | `8px` |
| Pill / 标签 / segmented control / 圆形 icon button | `rounded-full` | `9999px` |
| Hero 区域、超大装饰容器 | `rounded-2xl` | `16px`（仅一处级别的视觉锚点，慎用） |

Button 的 `xs` / `sm` 两个小尺寸用 `rounded-[min(var(--radius-md),10px)]` 与 `rounded-[min(var(--radius-md),12px)]`——小按钮用小圆角，避免看起来像药丸；在 button group 内会被 `in-data-[slot=button-group]:rounded-lg` 重置回 8px 以保持组内一致。

**禁止** `rounded-3xl` 及以上，禁止任意 `rounded-[Npx]`。

### 线条

**描边线（border、divider、outline，以及所有 SVG `stroke`）恒为 1px**，全局统一，不允许粗细混用。Tailwind 默认即 1px，**禁止** `border-2`、`border-4`、`outline-2` 及以上，禁止 `border-[Npx]` 等任意值。

需要"加重"分隔时，改用更深的 token 颜色（如 `border-border` 替 `border-border/40`）或叠 `bg-*`，不要通过加粗线条来强调。选中态、focus 态走 `ring-1 ring-inset`。

**唯一的例外是「领圈」（collar）**：Slider 的滑块和 Switch 的轨道需要一圈**背景色实心带**把自己从底下的轨道上"切"出来，这类 `ring-2` / `ring-4` / `ring-[3px]` 是允许的——它是实心色块，不是描边。区分标准：**它画的是线（stroke）还是块（band）**。线必须是 1px；块按需。TabBar 的连通轮廓用 `strokeWidth="1"` + `vectorEffect="non-scaling-stroke"`，属于描边线，仍然是 1px。

### Named Rules

**The One-Pixel Rule.** 全界面只有一种**线宽**。出现第二种线宽时，用户会下意识认为它有含义——而它没有。（描边归此规则管；实心领圈按上文的例外处理。）

**The Radius-Follows-Size Rule.** 圆角随元素尺寸缩小。大容器 `rounded-xl`、控件 `rounded-lg`、小控件 `min(radius-md, 10~12px)`、药丸形 `rounded-full`。不要给 24px 高的按钮套 12px 圆角。

---

## Components

**气质：克制精确的仪器感。** 控件低对比、边框驱动，悬停靠透明度与底色微移（`hover:bg-accent/50`、`hover:opacity-85`），零阴影零发光。focus **只换边框颜色**（`focus-visible:border-ring`），不画 ring 也不画 outline。尺寸偏小——按钮高 24–36px，标签 11–13px——把像素留给内容。所有组件都用 cva 或 `cn()` 组合出类名，没有 CSS Module 或 styled-components。

组件真身位于两个工作区包，`src/renderer/shared/components/ui/*` 多为一行 re-export：

- `@vetta-org/ui`（`packages/ui/src/`）：Button、Input、Dialog、Drawer、DropdownMenu、Popover、Select、Slider、Spin、Switch、Calendar/DatePicker。
- `@vetta-org/theme-ui/shared`（`packages/theme-ui/src/shared/`）：SegmentedControl、TabBar。

**这里没有 `Card` / `Badge` / `Chip` / `Tabs` / `ScrollArea` 原语。** 需要卡片时组合类名（见下），需要标签时用 `bg-primary/10 text-primary` 这类 token 组合，需要 Tab 时用 `TabBar`，需要滚动容器时靠 `styles.css` 的全局 overlay scrollbar——不要去找或新建一个 `Card` 组件。

### Buttons

`Button` 用 `class-variance-authority`，7 个 variant × 8 个 size。默认 `variant="default"`、`size="default"`（h-8）。基础类含 `rounded-lg border border-transparent text-sm font-medium transition-all`、`active:not-aria-[haspopup]:translate-y-px`（按下位移 1px）、`disabled:opacity-50`。

| Variant | 类 | 用途 |
| --- | --- | --- |
| `primary` | `bg-primary text-primary-foreground hover:bg-primary/90` | 主操作 |
| `default` | `bg-foreground text-background hover:opacity-85` | 前景反相按钮（主题中立） |
| `outline` | `border-border bg-transparent text-foreground hover:bg-accent/50` | 次要操作 |
| `secondary` | `bg-secondary text-foreground hover:bg-accent` | 辅助操作 |
| `ghost` | `text-muted-foreground hover:bg-accent/50 hover:text-foreground` | 工具栏、轻量操作 |
| `destructive` | `bg-red-500/10 text-red-500 hover:bg-red-500/20` | 危险操作（**见下方例外说明**） |
| `link` | `text-primary underline-offset-4 hover:underline` | 行内链接式操作 |

**`primary` 与 `default` 的区别只在彩色主题下可见。** 在默认的 `mono` 主题里，`primary` 的底色是骨白、`default` 的底色是 `foreground`，两者都渲染成"浅底深字"，外观几乎一致。在 `Classic` / `Coral` 下 `primary` 才变成 indigo / 珊瑚色。**主操作统一用 `variant="primary"`**——它是唯一在全部三套主题下都正确表达"主操作"的选择。

Size：`default`(h-8) / `xs`(h-6) / `sm`(h-7) / `lg`(h-9) / `icon`(size-8) / `icon-xs`(size-6) / `icon-sm`(size-7) / `icon-lg`(size-9)。

### Inputs / Fields

- **Input**：`h-8 w-full rounded-lg border border-border/60 bg-transparent px-2.5 text-base md:text-sm shadow-none`，`transition-[border-color,background-color]`。悬浮 `hover:border-border`，聚焦 `focus-visible:border-ring/60`，禁用 `disabled:bg-input/30 disabled:opacity-50`，非法 `aria-invalid:border-destructive/70`。
- **Textarea**：`min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-2 focus-visible:border-ring`，用 `field-sizing-content` 自适应高度。
- 输入控件**没有** shadow，**没有** focus ring——聚焦反馈完全由 1px 边框变色承担。

### Select / DropdownMenu / Popover

- **SelectTrigger**：`rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium`，`h-8`（`size="sm"` 为 `h-7`），`hover:bg-accent data-[state=open]:bg-accent`，`focus-visible:border-primary/50`。
- **SelectContent / DropdownMenuContent**：`rounded-lg`（DropdownMenu 为 `rounded-xl`）`border border-border bg-popover p-1 shadow-md`，出入场 `fade-in-0 zoom-in-95 duration-100`。
- **PopoverContent**：`w-72 rounded-lg border border-border bg-popover p-2.5 text-sm shadow-md`，`sideOffset=4`，箭头 `fill-popover drop-shadow-sm`。
- 三者都带 `no-drag`，因为浮层可能落在窗口拖拽区内。

### Cards / Containers

卡片没有组件，只有一条配方：

```tsx
<div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm transition-colors duration-200 hover:border-primary/40 hover:bg-card/60">
```

- **形状** `rounded-xl`（12px）
- **分层** 边框 `border-border/40~60` + 背景 `bg-card/30~60`（可叠 `backdrop-blur-sm`）
- **hover** 只换边框颜色和背景透明度，**不加阴影、不放大、不平移超过 2px**
- **内衬** 标准卡 `px-3.5 pt-3 pb-3`，宽松卡 `p-4`

### Switch / Slider / SegmentedControl

- **Switch**（`@vetta-org/ui`）：轨道 `rounded-full`，默认 `h-[18.4px] w-[32px]`（`sm` 为 `h-[14px] w-[24px]`），选中 `data-[state=checked]:bg-primary`、未选中 `bg-input`；滑块 `rounded-full bg-background`，默认 `size-4`（`sm` 为 `size-3`），选中位移 `translate-x-[calc(100%-2px)]`。滑块用 `after:absolute after:-inset-x-3 after:-inset-y-2` 扩出一圈**不可见点击区**（横向 +12px、纵向 +8px）——18.4px 高的开关按真实尺寸点击对鼠标极不友好，这一圈是必需品，删掉就等于让设置页变难用。
  - **注意**：Switch 是全项目唯一在 token 类上叠 `dark:` 的组件，且这里**不是**冗余。未选中态轨道 `--input` 在暗色下本身就是深色，滑块再用 `bg-background`（也是深色）就会糊在一起，所以暗色下换成 `dark:data-[state=unchecked]:bg-foreground`。改动它前先想清楚两个面的对比度。
- **Slider**（`@vetta-org/ui`）：容器 `h-5`，轨道 `h-1.5 rounded-full bg-muted-foreground/20`，已填充段 `bg-primary`，滑块 `w-1 rounded-full bg-primary` 静止高 `h-4`、拖动时 `h-5 ring-4 ring-background`、键盘聚焦 `ring-[3px]`。真实交互落在一个 `opacity-0` 的原生 `<input type="range">` 上（保留键盘与辅助技术语义），指针逻辑手写在容器上。
- **SegmentedControl**（`@vetta-org/theme-ui/shared`）：容器 `rounded-[8px] bg-black/[0.06] p-[2px] dark:bg-white/[0.08]`，项 `rounded-[6px] text-[11px] font-medium`，指示器用 `motion/react` spring（`stiffness:480, damping:32, mass:0.8`），tap scale 0.93。

> **已知例外**：`SegmentedControl` 容器与指示器使用 `bg-black/[0.06]`、`dark:bg-white/[0.08]`、`shadow-[0_1px_2px_rgba(0,0,0,0.06),...]` 等字面色值与任意阴影，违反 The Token-Only Rule 与 The Flat-By-Default Rule。它是分段控件的物理惯性所需（需要一个"凹槽"底），改动时优先用 token 表达，但不要为了合规把它改坏。

### TabBar

浏览器式**连通页签条**，本项目辨识度最高的自定义件（`@vetta-org/theme-ui/shared`，桌面端经 `shared/components/ui/tab-bar.tsx` 一行再导出）。

- **激活指示器**：`absolute -inset-x-px -top-px -bottom-px rounded-t-lg bg-muted`。负偏移是为了拉回页签自身那 1px 透明边框——绝对定位默认贴 padding box，不收这 1px 轮廓会整体下移、多探出 1px 压到内容卡片上。
- **连通轮廓**：手写的 SVG 路径几何（`createConnectedTabOutlineGeometry`），把相邻页签合并成一条连续的外轮廓，`fill-muted` + `stroke-border`，`strokeWidth="1"` 配 `vectorEffect="non-scaling-stroke"` 保证缩放时线宽不被拉粗。它不是装饰——这是"这是同一个窗口里的页签"这件事唯一的视觉表达。
- **切换动效**：`motion` 的共享布局动画 `layoutId={\`tabbar-active-${layoutId}\`}`，spring `{ stiffness: 480, damping: 36, mass: 0.8 }`。`suppressLayoutAnimation` 为真时渲染成普通 `<span>`。
- **内容**：`TabInner` 管图标 + 文字 + 小红点徽标，真实页签与隐藏测量层共用同一个组件，保证两者宽度一致（宽度测量失准会让指示器错位）。图标 `h-3.5 w-3.5`，激活 `text-primary`，非激活 `opacity-70`。

### Tooltip

`radix-ui` 包装（桌面端本地实现）。**反色浮层**——全系统唯一用前景色当底色的地方：

```
rounded-md bg-foreground px-3 py-1.5 text-xs text-background
```

箭头 `size-2.5 rotate-45 rounded-[2px] bg-foreground fill-foreground`。`max-w-xs`、`sideOffset=0`（默认）、`delayDuration=0`（`TooltipProvider` 默认值）。可选 `showArrow={false}`。

反色是刻意的：tooltip 出现的位置由指针决定，无法保证落在哪种底色上；用前景色实心块 + 背景色文字，在任何上下文里对比度都恒定。**不要**把它改成 `bg-popover` 的"正常"浮层。

### Spin

全局唯一加载指示器（`@vetta-org/ui`）。两颗小球**黏连 → 分离 → 整体旋转**的"果冻"效果。

- 黏连靠 SVG 滤镜：`feGaussianBlur`（`stdDeviation = 尺寸 × 0.156`，随尺寸缩放，否则小尺寸糊成一坨、大尺寸黏不起来）+ `feColorMatrix`（alpha 行 `0 0 0 18 -7`，把模糊区域对比度拉到阈值外拉伸成实心）+ `feBlend`。每个实例一份 `filterId`（`React.useId()`），同页多个 Spin 不能撞 id。
- 颜色取 `currentColor`，跟随容器文字色：`<Spin className="text-primary" />`。
- 尺寸**只有三档** `sm 16` / `md 24` / `lg 40`，不暴露任意像素值。
- keyframes 经 `<style href="@vetta-org/ui/spin" precedence="default">` 注入，React 19 按 `href` 去重提升，页面上多个 Spin 也只插一次。
- `prefers-reduced-motion` 下停在**两球分离的静止态**，而不是停止动画——停在动画起点会只剩一个黏在一起的圆点，看不出是加载中。
- 无 `label` 时整体 `aria-hidden`（适合旁边已有同义文案的场景）；传 `label` 则 `role="status"`。

### Drawer / DropdownMenu

- **Drawer**：遮罩 `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`（比 Dialog 的 `bg-black/20` 浅，因为抽屉通常不阻塞整屏）。
- **DropdownMenu**：`CONTENT_CLASS` = `z-50 min-w-[10rem] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md`；`ITEM_CLASS` = `flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors focus:bg-accent/60`。菜单项 13px 是项目里除正文外最大的控件字号——菜单是要逐行读的，不按密集表格处理。

### 组件使用纪律

- 操作按钮**必须**用 `@shared/components/ui/button` 的 `<Button>` + variant，**优先复用通用组件，禁止重复造按钮**。
  - **禁止**手写 `<button>` / `<motion.button>` 充当按钮：不允许自拼 `rounded-full bg-gradient-to-* px-4 py-2 text-primary-foreground` 这类样式。
  - **禁止**给按钮加发光/自定义阴影（"肮脏的发光按钮"被明确否决）。主操作直接用 `variant="primary"`，不叠任何 `shadow-*`。
  - 空状态 CTA 同样走 `<Button>`，不要单独造一个"更花"的版本。
  - 需要微调位置/间距用 `className` 传入（如 `mt-2`），**不要**重写整套视觉。
  - **允许用原生 `<button>`** 的场景：导航项、菜单项、列表选择项、标签切换、展开/折叠 toggle、窗口控件等布局交互元素。
- Popover / Dialog / Switch / Select 等先翻 `shared/components/ui/`，不要重写。
- 自定义 toggle / segmented control 时参考现有 `SegmentedControl`、`ToggleSwitch`，沿用相同 token 与 transition。

---

## Do's and Don'ts

### Do:

- **Do** 所有颜色走 `@theme inline` 暴露的 token 工具类及其 `/N` alpha 变体（`/5 /10 /15 /20 /25 /30 /40 /50 /60 /70 /80`）。
- **Do** 需要透明混合时用 `color-mix(in srgb, var(--primary) X%, transparent)`，与 `styles.css` 保持一致。
- **Do** 让静止态保持平坦：分隔靠 1px 边框与背景透明度。
- **Do** 把阴影留给浮层（popover / dialog / dropdown / 拖拽中元素），且沿用 `styles.css` 已有的 8 档 token。
- **Do** 用 ring 表达选中与 focus：`ring-1 ring-inset ring-primary/30`、`bg-primary/10`、`border-primary/40`。
- **Do** 全局只用 1px 线宽；要加重分隔就换更深的 token 颜色或叠 `bg-*`。
- **Do** 让圆角随尺寸缩小（`rounded-xl` 容器 / `rounded-lg` 控件 / `min(radius-md,10~12px)` 小控件 / `rounded-full` 药丸）。
- **Do** 只在七档字号里选（`10 / 11 / 12 / 13 / 14 / 15 / 20+`）。
- **Do** 用 `auto-fill` + `minmax` 做卡片网格（小卡 `240px`、行式列表 `320px`）。
- **Do** 新图标优先 solar linear（`icon-[solar--*-linear]`），其次 mdi。
- **Do** 顶栏留 `<div className="drag-region h-12 shrink-0" />` 作可拖拽空白，交互元素套 `.no-drag`。

### Don't:

- **Don't** 用渐变填充文字当强调。强调靠字重与字号——渐变文字会在任何背景与任何主题下产生不可控的对比度。
- **Don't** 写 hex / `rgb()` / `hsl()` 字面量、Tailwind 默认调色盘（`slate-*`、`zinc-*`、`gray-*`、`sky-*`、`violet-*`、`pink-*`、`orange-*` 等），或 `style={{ color: '#...' }}`。
- **Don't** 给卡片 hover 加阴影，或使用任何 `shadow-[...]` 自定义任意值，或带主色的发光阴影。
- **Don't** 卡片 hover 时联动 `scale` / `rotate` / 阴影；位移上限 2px。
- **Don't** 用 `border-2/4`、`outline-2`、`border-[Npx]` 画线——描边线只有 1px。`ring-2` / `ring-4` 只允许用作**实心领圈**（如 Slider 滑块、把色块从底色上切出来），不允许当作描边。
- **Don't** 用 `rounded-3xl` 或任意 `rounded-[Npx]`。
- **Don't** 写 `transition-all`（优先 `transition-colors` 或具体属性），也不要写长于 0.6s 的进入动画。
- **Don't** 在业务组件里自写 `@keyframes … infinite` 做「进行中」指示。两条合法路径：常驻指示走宿主统一挂载（见下节），加载指示用现成的 `<Spin>`。`Spin` 自己那份无限 keyframes 是全局单例基元，属于被允许的例外——**不要**在 `src/renderer/**` 里再写第二份。
- **Don't** 在组件里手写 `::-webkit-scrollbar` / `scrollbar-width`，也不要单独覆盖 `::selection`。
- **Don't** 机械地给每个 token 类再写一份 `dark:`——绝大多数 token 颜色会自适应，只有装饰性效果（外发光、网格纹理）需要明暗变体。**例外**：当一个部件的两个面在同一模式下对比度不足时（如 Switch 的轨道与滑块），该部件必须按模式调换前后景 token。判断标准是对比度，不是"补一份更保险"。
- **Don't** 在 `drag-region` 内放交互元素（必须放时套 `.no-drag`），也不要给它加 `cursor-*` 或 `onClick`。
- **Don't** 引入 solar / mdi 之外的图标 collection（`lucide`、`tabler` 等），避免 collection 蔓延。

---

# 以下为项目既有硬规范（与上方 canonical 层同源，无重复定义）

## 桌面端特有

### drag-region

- 顶部高度 ≥ 32px 的窗口拖拽区域使用 `.drag-region`（已定义于 `styles.css`）。
- **禁止**在 `drag-region` 内放交互元素，如必须放（设置图标、关闭按钮）请套 `.no-drag`。
- 不要在 `drag-region` 上再写 `cursor-*` 或 `onClick`。

### 标题栏

新页面顶部留 `<div className="drag-region h-12 shrink-0" />` 作为可拖拽空白，再写页面 header；不要把 header 自身设为 drag-region。

### 滚动条

`styles.css` 已实现 macOS 风格 overlay scrollbar。**禁止**在组件里手写 `::-webkit-scrollbar` / `scrollbar-width`，否则会撕裂全局风格。

### 选中态

`::selection` 已用 `color-mix(in srgb, var(--primary) 42%, transparent)`。不要为组件单独覆盖。

### 明暗与主题

明暗走 **`data-mode`**（`light` / `dark`），主题名走 **`data-theme`**（`mono` / `sand` / `default`），两者都由 `applyTheme()` 写在 `<html>` 上。出厂为 `mono` + `dark`。

**只有装饰性效果**（如外发光、网格纹理）才需要 `dark:` / `light:` 变体；token 颜色会自适应，**不要**为每个 token 类再写一份 `dark:`。

主题切换走 View Transition 圆形揭示（`620ms`，`ease-in-out`），不支持时回退为 180ms 颜色过渡；两者都尊重 `prefers-reduced-motion`。

### 光标

默认使用系统原生光标。`html.custom-cursor` 时才换成内置素材（入口见「外观设置 → 鼠标指针」）。所有光标走 `--cursor-*` 变量，不要在组件里硬写 `cursor: pointer`。

---

## 动画与「进行中」指示

### 总则

UI 是工具，不是 showroom。**hover 只反馈，不表演。**

| 场景 | 允许 |
| --- | --- |
| 卡片 hover | `whileHover={{ y: -2 }}` **上限**；不允许 `scale`、`rotate`、`shadow` 联动 |
| 按钮 hover | `whileHover={{ scale: 1.04 }}` 上限 |
| 按钮 tap | `whileTap={{ scale: 0.94 }}` 下限 |
| 进入 | `opacity 0→1 + y 8→0` 或 `+ scale 0.97→1`；duration ≤ 0.5s |
| stagger | `staggerChildren: 0.04~0.06`，`delayChildren ≤ 0.15` |

### spring 默认值

入场用 spring 时统一 `{ type: "spring", stiffness: 280~320, damping: 26 }`，按钮交互 `{ stiffness: 380, damping: 22 }`。

### 禁止

- 装饰性持续旋转 / 弹跳（loading spinner 除外）
- `whileHover` 同时改 `y` + `scale` + 阴影
- 长于 0.6s 的进入动画
- transition 写 `transition-all`；优先 `transition-colors` 或具体属性

### 「进行中」指示动画由宿主统一挂载，禁止自写 infinite 关键帧

macOS 主窗口带毛玻璃，页面每出一帧系统都要整窗重新合成；一个 4px 的脉冲点用平滑关键帧逐帧插值，就足以让流式全程 GPU 不闲。实测（Chromium 132）：opacity/transform 关键帧 + `steps(16)` 每秒画 12 帧、主线程≈0；平滑曲线 70 帧；用注册自定义属性做「时钟」画帧同样少，但 Blink 每帧都在主线程重算样式，挂在 `:root` 上时 300ms/s，**不要再走这条路**。

表达「还在进行」的常驻动效（呼吸文字、状态点、波纹、转弧）：

- CSS 只写静止态（相位 0 的外观必须就是正常外观，光晕这类没有动画就该看不见的元素写 `opacity: 0`），**不写 `animation` / `@keyframes … infinite`**。
- 元素带登记在 `shared/lib/live-animations.ts` 里的类名（`.processing-shimmer`、`.tool-call-shimmer-text`、`.vetta-live-dot`、`.todo-label-sheen`、`.todo-marker-spin`、`.activity-dot-halo/-core`、`.send-button-ripple-1/-2`）。宿主用 Web Animations API 挂 `steps(16)` 的 opacity/transform 动画，并把 `startTime` 锁到文档时间线原点：所有指示器同拍，整页每秒最多因此多出 10 帧，主线程零开销。新增一种指示器就往登记表加一行。
- 流式期间的内容动效不要用逐元素动画：短语渐亮靠「最新短语偏暗、下一次放出时变亮」，只随内容更新出帧；rAF 逐帧追随滚动只留给大跳，短距离直接落位；头像小动作在流式中关闭。
- `will-change` 对这类动画没有额外收益（实测主线程提交次数不变），不要为它加。
- 窗口不在前台时，`[data-inactive-paused]` 会暂停无限动画（标记由 `shared/lib/inactive-window-animations.ts` 打在宿主元素上）。

---

## 图标（`@iconify/tailwind4`）

### 命名

**新增图标一律优先 solar**（`icon-[solar--*-linear]`，统一用 `linear` 线性风格），其次才是 mdi。存量 `icon-[mdi--*]` 渐进迁移，改动相关组件时顺手替换为 solar 同义图标。禁止引入其他 collection（`lucide`、`tabler` 等），避免 collection 蔓延。

solar 常用对照：菜单 `menu-dots`、关闭 `close-circle`、删除 `trash-bin-trash`、编辑 `pen-2`、文件夹 `folder` / `folder-open`、新建 `add-circle` / `add-folder`、设置 `settings`、铃铛 `bell`、会话 `chat-round-line`、加载旋转 `refresh` + `animate-spin`、折叠箭头 `alt-arrow-down` / `alt-arrow-up`。

### 尺寸梯度

| 场景 | 类 |
| --- | --- |
| 行内 inline 状态点 | `h-2.5 w-2.5` |
| chip 内、tag 内 | `h-3 w-3` |
| 按钮内、菜单项前缀 | `h-3.5 w-3.5` |
| 卡片左侧主图标块（含底色） | `h-4 w-4` |
| Hero / 空状态居中大图标 | `h-8 w-8` ~ `h-10 w-10` |

图标颜色一律走 token：`text-primary` / `text-muted-foreground/60` / `text-destructive`。除语义色白名单里的 `text-emerald-*` / `text-amber-*` 外，不得使用 Tailwind 原色（见语义色表）。

---

## Lint checklist（agent 提交前自查）

- [ ] **D01** 没有 hex / `rgb(` / 默认 Tailwind 调色盘（slate/zinc/sky/violet/pink/orange/red/blue/green，除语义色白名单的 emerald/amber）
- [ ] **D02** 没有 `shadow-[...]` 自定义任意值；卡片 hover 无 shadow；按钮无发光阴影
- [ ] **D03** 按钮一律用 `<Button>` + variant，没有手写 `<button>` / `<motion.button>` 自拼按钮样式
- [ ] **D04** 描边线只有 1px：没有 `border-2/4`、`outline-2`、`border-[Npx]`；用了 `ring-2/4` 的话它必须是实心领圈而不是描边
- [ ] **D05** 没有 `rounded-3xl` / `rounded-[Npx]`
- [ ] **D06** 没有 `transition-all`
- [ ] **D07** 字号只落在 `10 / 11 / 12 / 13 / 14 / 15 / 20+` 七档（`text-base md:text-sm` 的输入基元惯用法除外，见「Typography · 已知例外」）
- [ ] **D08** hover `whileHover` 不超过总则表格
- [ ] **D09** 没有自写 `@keyframes … infinite`；进行中指示走宿主挂载，加载态用 `<Spin>`
- [ ] **D10** 顶栏拖拽区域单独 `<div className="drag-region h-12 shrink-0" />`
- [ ] **D11** 没有手写 scrollbar 样式

---

## 已知存量违规（不要复制）

以下位置混入了违规色或视觉，agent **不要**以它们为范例，遇到顺手清理：

- `packages/ui/src/button.tsx` 的 `destructive` variant 用 `bg-red-500/10 text-red-500`，与语义色表（错误必须走 `destructive` token）冲突。
- `packages/ui/src/button.tsx` 与 `packages/ui/src/switch.tsx` 的基础类含 `transition-all`，与本文件的 lint 项冲突。
- `packages/theme-ui/src/shared/SegmentedControl.tsx` 使用 `bg-black/[0.06]`、`dark:bg-white/[0.08]`、`shadow-[0_1px_2px_rgba(...)]` 等字面色值与任意阴影。
- `packages/ui/src/dialog.tsx` 的 `DialogOverlay` 用 `bg-black/20`；`DialogTitle` 用 `text-base`（16px，落在七档之外）。
- `apps/desktop/src/renderer/domains/agent-teams/components/AgentProfileEditor.tsx` 两处区块标题用 `text-base font-bold`；`packages/theme-ui/src/action-approval/BatchTasksExecutionApprovalView.tsx` 的计数数字用 `text-base font-semibold`——都落在七档之外，且不属于「输入基元移动端惯用法」那条例外。
- `apps/desktop/AGENTS.md` §5 已与现行 `@theme inline` token 体系对齐；旧的 `--text-1` / `--hover` 指引已撤销。
- 历史项：`SkillsPage.tsx` 的 `violet-*` 自定义标签已迁移为 `bg-primary/10 text-primary`。
