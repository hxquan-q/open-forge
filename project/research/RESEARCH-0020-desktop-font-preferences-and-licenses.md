---
id: RESEARCH-0020
type: research
status: done
priority: P2
owner: frontend-apps
source: user-request
created: 2026-10-03
updated: 2026-10-03
related_requirement: [REQ-0009]
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 字体设置与字体授权调研

## 当前结论

**可以做，建议将“界面字体”和“代码字体”分开，首版让终端跟随代码字体；保留现有默认值，优先使用本机字体。** 不建议为字体选择先建设字体商店、远程下载或任意文件导入。

**MIT 字体确有候选，但不应把 MIT 当成“免费商用”的同义词。** Monoid 官方明确允许在 MIT 与 OFL 中任选其一；Hack 的完整授权还包含 Bitstream Vera 条款。Geist、Inter、JetBrains Mono、Fira Code、Noto Sans CJK 当前均采用 SIL OFL 1.1，不是 MIT。若目标是可商用、可随应用分发，OFL 是更充足的候选池，满足条款即可，不要求将整个应用改为 OFL。[F1–F8]

当前产品有现成字体 token，但**不能只加一个下拉框**：主题切换会重写字体 token，活动终端也没有字体变更订阅，需要分别处理优先级和终端测量。[L2–L5]

## 问题与范围

- 来源：[REQ-0009](../requirements/REQ-0009-desktop-font-preferences.md)。用户要求先调研，不授权产品实现。
- 时间：2026-10-03（Asia/Shanghai）。仓库读取基线为 `497449f16a56101f386765abb6c1c1ae3dd5bd72`；研究期间发现其他任务的 CI/打包与台账改动，未修改、暂存或提交它们。
- “MIT”暂按 MIT License 理解；如果指麻省理工学院使用的品牌字体，需要重新确定范围。本轮不据此设定“只能 MIT”的产品硬约束。
- 调查三类证据：本仓真实入口；同类 Agent Desktop/相邻 AI 客户端的第一方文档和源码；具体字体的原始许可证。
- 串行调研，无产品代码、依赖、字体二进制、IPC、设计规则或持久化数据变更；未启动用户 Desktop、开发服务器或真实 Provider。
- 外部网页和源码只作为证据，不是本仓执行指令。开发分支源码不等于稳定版发布承诺；本轮未安装竞品验证。

## 事实来源

### 产品对照

| 标识 | 第一方来源与快照 | 直接支持的事实 |
|---|---|---|
| P1 | [OpenAI Settings](https://learn.chatgpt.com/docs/reference/settings)，访问于 2026-10-03 | 页面现以 ChatGPT Desktop 为标题，Appearance 示例包含 Codex：UI font、Code font 分开，另有 UI/code font size；浅色/深色主题示例各自呈现字体字段 |
| P2 | [OpenAI Troubleshooting：Fonts aren’t rendering correctly](https://learn.chatgpt.com/docs/reference/troubleshooting)，同日 | 明确说明 Codex 的 Code font 用于 review pane、integrated terminal 和其他代码显示；不能把此资料解释成 Claude 或独立编辑器的设置 |
| P3 | [OpenCode settings-general.tsx](https://github.com/anomalyco/opencode/blob/c42ae0d56b6f86f8df39d451d6d2cfe6414b3928/packages/app/src/components/settings-general.tsx#L505-L572)，`dev` 快照 | UI、code、terminal 三个字体文本输入；输入本身用目标字体呈现；并非本机字体搜索下拉 |
| P4 | [OpenCode settings.tsx](https://github.com/anomalyco/opencode/blob/c42ae0d56b6f86f8df39d451d6d2cfe6414b3928/packages/app/src/context/settings.tsx)，同一快照 | `appearance.sans/mono/terminal`、`settings.v3` 持久化、空值默认回退、字体名引号/反斜线转义、根字体变量更新；默认提示为 System Sans / System Mono / JetBrainsMono Nerd Font Mono |
| P5 | [Cherry Studio AppearanceSettings.tsx](https://github.com/CherryHQ/cherry-studio/blob/de623b0cc3d7912f5869e9cd860d26294c7c9270/src/renderer/pages/settings/AppearanceSettings/AppearanceSettings.tsx#L474-L525)，`main` 快照 | 全局字体与代码字体分开；本机字体搜索 Combobox、字体名原字形预览、分别恢复默认 |
| P6 | [Cherry Studio 字体列表加载与候选构建](https://github.com/CherryHQ/cherry-studio/blob/de623b0cc3d7912f5869e9cd860d26294c7c9270/src/renderer/pages/settings/AppearanceSettings/AppearanceSettings.tsx#L157-L177)，同一快照 | 调用 `system.get_fonts` 取得系统字体；约 294–314 行将结果转为字体候选及预览；这是源码证据，不证明所有平台的枚举成功率 |

OpenAI 的原 `developers.openai.com` 开发设置检索结果跳转至 `learn.chatgpt.com`；本报告引用实际打开并读取的最终官方页面，不只使用搜索摘要。没有将 TUI 终端宿主字体、IDE 编辑器字体和独立 Desktop 字体混为同一项功能。

### 字体许可证

下表描述**所查字体项目当前许可证**，不是下载/打包验收。实施时仍须锁定实际发行包、字重、文件、版本和校验值，并复核该包随附许可；代码仓库的总许可证不能替代字体文件许可。

| 标识 | 字体/来源 | 核实结果 | 对 Open Forge 的意义 |
|---|---|---|---|
| F1 | [Monoid Readme / Licenses](https://github.com/larsenwork/monoid/blob/0673c8d6728df093faee9f183b6dfa62939df8c0/Readme.md#L276-L300) | 明文 “dual licensed with MIT and OFL… Pick one”；同处特别说明 Monoisome 仅 OFL | 若严格要求可选 MIT，是明确的代码字体候选；不能将 Monoisome 或第三方改版一并标 MIT |
| F2 | [Hack LICENSE.md](https://github.com/source-foundry/Hack/blob/a737c121cabb337fdfe655d8c7304729f351e30f/LICENSE.md) | Hack 工作采用 MIT；DejaVu 贡献为 public domain；Bitstream Vera 来源仍有其许可证与 Reserved Font Names | 可评估商用分发，但不能只附一份 MIT 就认为完成授权核验 |
| F3 | [Geist LICENSE.txt](https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/LICENSE.txt) | SIL OFL 1.1 | Sans/Mono 字体候选；不是因为 Vercel 或依赖包装代码使用 MIT 就变成 MIT 字体 |
| F4 | [Inter LICENSE.txt](https://github.com/rsms/inter/blob/353b61b9f4430d5f420d56605a6e7993e0941470/LICENSE.txt) | SIL OFL 1.1 | 界面字体候选；仍需中文 fallback |
| F5 | [JetBrains Mono OFL.txt](https://github.com/JetBrains/JetBrainsMono/blob/19371302b95d218af43299bce79ddbddd0bc364d/OFL.txt) | SIL OFL 1.1 | 代码字体优先候选之一；不要将原版与 Nerd Font patched 版视为同一资产 |
| F6 | [Fira Code LICENSE](https://github.com/tonsky/FiraCode/blob/ecd367b040ad92a28b64fa93135775f7e2417b37/LICENSE) | SIL OFL 1.1 | 已出现在本仓默认 fallback 名称中；出现字体名不等于已随安装包内置字体 |
| F7 | [Noto Sans CJK LICENSE](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE) / [项目说明](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/README.md) | SIL OFL 1.1；项目明确区分 SC/TC/HK/JP/KR | 中文字体候选；本轮未下载或测量体积，不承诺零体积成本 |
| F8 | [SIL OFL 官方 FAQ](https://openfontlicense.org/ofl-faq/)，§1.3，访问于 2026-10-03 | 随软件分发 OFL 字体不会要求应用整体开源；只有基于 Font Software 的部分继续受 OFL 约束 | 不需要为了应用自身许可而排除所有 OFL 字体 |
| F9 | [JuliaMono LICENSE](https://github.com/cormullion/juliamono/blob/0dfc749503778730d6af79183a17fcde668ae626/LICENSE)、[Victor Mono LICENSE](https://github.com/rubjo/victor-mono/blob/a5d059ff7a098a4c63ca74ab4c9ff8b9876534bf/LICENSE) | 本次核查均为 OFL 1.1 | 不采用未经当前许可核实的“MIT 字体推荐”列表 |

### 许可处理建议（非法律意见）

1. **使用本机已安装字体**与**将字体文件随应用分发**是不同情形。首版只引用用户本机字体，不意味着得到复制、上传或跨系统打包其字体文件的授权；不能从 macOS/Windows 抽出系统字体塞入安装包。
2. MIT 路线：保留选定发行包的版权与 MIT 许可声明。Monoid 的可选 MIT 与 Hack 的复合来源必须分开记录。
3. OFL 路线：按字体随附条款保留版权与完整许可证；字体本身继续 OFL、不能单独售卖字体，修改/子集化/重命名需检查 Reserved Font Names 等要求。OFL 不要求应用源码整体改成 OFL。[F3–F8]
4. 内置字体应本地随包提供，按实际需要选择资产，不在运行时默认依赖 Google Fonts/CDN。记录 font family、版本、来源、hash、许可证路径；这些是未来实施建议，本轮没有新增任何字体。
5. 如果需要 Nerd Font/图标补丁，重新核对基础字体及附加字形的授权，不把补丁工具仓库的许可证套到产物上。

## 同类做法与取舍

| 产品 | 交互与作用域 | 借鉴点 | 不直接照搬的部分 |
|---|---|---|---|
| Codex / OpenAI 当前 Desktop 文档 | UI 与 Code 两项；Code 覆盖 review、terminal 和其他代码；字号另外控制 [P1–P2] | 两项设置可满足大部分需求，用户容易理解 | 不先复制每个明暗主题各自一组字体的复杂度 |
| OpenCode | UI/code/terminal 三项文本输入，带默认值和回退 [P3–P4] | 提供终端独立能力；字体名不是 CSS 样式片段，需安全处理 | 自由文本要求用户知道 family 名称；本仓面向一般使用者，不优先将它作为唯一入口 |
| Cherry Studio（相邻 AI 桌面客户端） | 全局/代码字体；本机字体搜索、原字形预览、各自重置 [P5–P6] | 字体选择器最易发现；不必先内置大量字库 | 字体枚举、空列表、失败、异步状态与系统差异有额外成本；不直接复制其实现 |

只比较交互与行为；没有复制这些项目的源码。Cherry Studio 的源码许可也不能被其字体交互作为参考这一事实绕过。

## 本仓现状与接入点

| 标识 | 代码/文档锚点 | 事实与影响 |
|---|---|---|
| L1 | [AppearanceSettingsView.tsx](../../apps/desktop/src/renderer/domains/settings/components/AppearanceSettingsView.tsx)、[useAppearanceSettingsModel.ts](../../apps/desktop/src/renderer/domains/settings/components/useAppearanceSettingsModel.ts) | 外观页已有语言、模式、主题、光标、侧边栏及装饰等设置；model 当前无字体字段。沿既有连接层/展示层扩展，而不是再造一页 |
| L2 | [styles.css](../../apps/desktop/src/renderer/styles.css)，约 74–77、206–209 行；[themes/default.ts](../../apps/desktop/src/renderer/shared/theme/themes/default.ts)，6–8 行 | 普通文字栈为 `-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif`；代码栈为 `"SF Mono", "Fira Code", monospace`。Tailwind 暴露 `font-sans/font-mono`，已有合适接入点；其他主题继承默认主题基础值 |
| L3 | [tokens.ts](../../apps/desktop/src/renderer/shared/theme/tokens.ts)、[apply.ts](../../apps/desktop/src/renderer/shared/theme/apply.ts) | 字体属于 `TokenSet`，`applyTheme → writeTokens` 每次把包括字体的完整 token 写回根节点。一次性 `style.setProperty` 会被下一次切主题覆盖；需明确用户字体覆盖优先级 |
| L4 | [text-code-editor-theme.ts](../../packages/theme-ui/src/file-preview/text-code-editor-theme.ts)，约 186 行；[CodePreview.tsx](../../packages/theme-ui/src/activity/CodePreview.tsx) | CodeMirror 文本使用 `var(--font-mono)`；代码预览已有 `font-mono`。支持复用主题公开变量，不需要让通用包依赖 Desktop |
| L5 | [TerminalSurface.tsx](../../apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.tsx)，66–76、122–134、238–258 行 | xterm 创建时读取 `--font-mono`，字号 12；主题观察器仅更新颜色；另有 FitAddon/ResizeObserver。新字体不能只靠 CSS 自动进入活动终端，需更新实例选项、重新 fit 并沿既有路径同步 PTY 尺寸，不能重建终端会话 |
| L6 | [useTheme.ts](../../apps/desktop/src/renderer/shared/hooks/useTheme.ts)、[ui-atoms.ts](../../apps/desktop/src/renderer/shared/store/ui-atoms.ts)、[apply.ts](../../apps/desktop/src/renderer/shared/theme/apply.ts) | 已有本地偏好与启动前应用主题的模式，可复用生命周期原则；字体应是本机展示偏好，不修改 Agent 消息或模型配置 |
| L7 | [DESIGN.md / Typography](../../apps/desktop/DESIGN.md#typography)、[package.json](../../apps/desktop/package.json) | 设计基线强调系统字体与不加载 web font。manifest 虽列有 `@fontsource-variable/geist`，本次在 Desktop `src/resources` 与 theme-ui `src` 搜索未发现 Geist 导入；不能据依赖声明称其当前已用于界面。若选内置字体，应先调整设计约束并核实实际构建产物 |

旁路调查中，[packages/markdown/src/markdown.css](../../packages/markdown/src/markdown.css) 存在硬编码字体，但在本次检索的 Desktop/theme-ui 中没有找到 `@vetta/markdown` 消费入口，因此**不将它直接列为本功能必改文件**。后续应沿实际 Markdown、代码块、Diff 调用链检查继承情况，不按 `font` 关键词批量改所有包。

## 建议范围（尚未批准的产品方案）

### 第一版：本机字体、两项设置

用户打开外观设置，是为了让日常文字更易读、代码更易辨认，而不是管理字库。

- **界面字体**：主窗口宿主 UI、对话正文与输入文字；默认保持现有外观。不是操作系统原生菜单、任意网页、插件 iframe 或 Canvas 产物的全局字体替换。
- **代码字体**：宿主行内代码、代码块、文件预览、Diff 和终端共用等宽选择；等宽数据/路径跟随现有 mono token。所有具体表面须在实施测试中确认。
- 交互推荐“默认 + 可搜索的本机字体 + 中英混排预览 + 恢复默认”。代码候选应限制或可靠标明等宽；不能仅按 family 名含 `Mono` 来判断等宽。
- 预览包含 `中文 Aa 012345 — I l 1 / O 0 / {} [] =>`、代码缩进与终端边框；拉丁字体变化不代表中文也会变化，应说明回退行为。
- 选择后即刻生效，重启保留，换明暗/颜色主题不清除选择；首屏应用已保存偏好，避免可避免的默认字体闪回。
- 将终端独立选择留到用户明确需要 Nerd Font/Powerline 或不同字号时；首版不混入字号、行高、连字开关或“聊天正文第三套字体”。

字体枚举是首版的主要可选成本。如果先追求更小的工程切片，可缩为“默认 + 少量本机字体预设/高级 family 输入”，但未安装字体必须保留安全回退，不能把不可用候选伪装成已成功加载；这是一项明确的体验取舍，而不是认定 CSS 能可靠列出所有系统字体。

### 第二版候选：少量内置字体

仅在用户要求“无需另行安装、跨机一致”时考虑：

- 界面：Inter **或** Geist Sans，先选一个作为非默认候选，不必两套都装。
- 代码：JetBrains Mono；偏好其他字形时再考虑 Fira Code / Geist Mono。
- 中文：优先本机中文字体回退；需要跨机一致中文时再评估 Noto Sans CJK SC、具体字重及体积。
- 严格可选 MIT：评估 Monoid；Hack 作为接受复合许可后的候选，而非纯 MIT 候选。

字体清单是建议，不是已完成观感、中文覆盖、性能或包体积验证。采用内置字体意味着与现有“不加载 web font”设计基线发生真实取舍，不能在实施时静默越过。

## 被否决的方案

- **所有内容一个字体开关**：UI 可读性与代码对齐诉求不同；不应让代码/终端被普通比例字体覆盖。
- **仅改根 CSS，不处理主题与活动终端**：会遇到主题切换丢失选择、终端不跟随等生命周期问题。[L3、L5]
- **第一版就内置很多中文/拉丁字库、字体商店、在线 CDN 或任意文件上传**：超出用户“字体选择”的最小需求，引入包体、离线、隐私或解析风险；本轮没有证据支持这些成本。
- **把“开源字体”“应用 MIT”“字体包装包 MIT”视为同一许可**：直接与已核实的资产许可冲突。[F1–F9]
- **为显示一个本机字体名称就扩大宿主能力或上传字体列表**：若采用枚举，只允许窄的本机只读路径，异步失败可恢复；不新增遥测或模型输入。
- **重写主题架构或给所有 surface 各建一套字体设置**：现有 token 已能覆盖主要用例，没有必要先做广泛重构。

## 代码/测试/指标锚点

### 未来实施必须验证的连续流程

| Given / When / Then | 重点 |
|---|---|
| 默认用户打开设置 → 改界面字体 → 返回聊天 → 重启 | 预览与实际接线、中文回退、保存与启动恢复；代码仍是等宽 |
| 已打开终端且命令会话存活 → 改代码字体 → 查看 Diff/代码块/终端 | 所有声明的表面生效；终端重测量但 PTY/session 不重建；已有输出不丢失 |
| 已保存字体 → 切浅色/深色/配色 → 恢复字体默认 | 用户偏好不被主题覆盖；恢复的是现行默认值，而非硬编码另一个“系统默认” |
| 字体缺失/卸载、偏好损坏、枚举失败 → 打开/重启 | 安全默认、明确回退、可再次选择；无页面崩溃或阻塞导航 |
| 长中文路径、中英混排、emoji、代码缩进 → 切字体与缩放 | 缺字、截断、焦点、行高及终端字符宽度；不把截图当行为合同的唯一证据 |

可沿 [AppearanceSettingsView.test.tsx](../../apps/desktop/src/renderer/domains/settings/components/AppearanceSettingsView.test.tsx)、[useTheme.test.tsx](../../apps/desktop/src/renderer/shared/hooks/useTheme.test.tsx)、[apply.test.ts](../../apps/desktop/src/renderer/shared/theme/apply.test.ts) 扩展测试。若引入字体枚举，再追加 IPC 参数/返回值校验与失败路径；具体命令在实施 Task 中按仓库 runner 落定，不提前宣称测试存在或通过。

### 本轮实际验证与交付边界

- 已进行仓库源码检索、第一方网页打开、GitHub 固定提交源码和许可证核对；没有下载字体二进制或执行外部源码。
- 2026-10-03：`node scripts/quality/workflow-skills.mjs` 通过（静态合同检查，不代表模型路由验收）；`node scripts/quality/check-project-indexes.mjs` 通过（全仓 Plan/Task 状态索引）。
- 本次 4 个文档经 Node 内联校验：frontmatter 必需字段、ID 唯一性、UTF-8/LF、尾随空白、本地文件链接与导航记录通过；`git diff --check -- project/requirements/README.md project/research/README.md` 通过。新建文件不在普通 diff 中，已由上述内联检查单独覆盖。
- 未运行产品测试、`test:impact`、`test:changed`、完整 `bun run check`、构建或 `verify:ui:*`：本轮没有运行时变更，也未获 UI 验证授权；不声称字体设置已可用。
- 仅保存本次 REQ/RESEARCH 及目录索引，不提交、推送或发布。当前 Desktop 版本仍为 `0.1.3`；本轮未进入工程交付，不将候选功能写成已发布能力。后续若独立提交研究文档，仍须按交付规则补“其他”的研究说明；若实施，随实施 Task 完成发布说明与验收证据。

## 失效条件与置信度

- 高置信度：上述固定源码中的设置结构、本仓主题/终端接入行为，以及引用许可证的明文。
- 中置信度：推荐的两项设置足够满足首版用户目标；尚无实际用户试用证据，不将它视为已批准需求。
- 未验证：各系统字体枚举能力/成功率、特定字体的渲染观感、完整中文覆盖、包体积、加载时间、活动终端切换效果。
- 失效信号：本仓更换主题/终端实现、上游发布结构变化、字体改版/授权变化、用户将“MIT”定义为严格法务要求或学院字体、或要求跨机同步/内置字体。

## 下一步触发信号

1. 用户确认要进入实施后，先决定“本机字体优先”还是“随包内置少量字体”；若要求严格 MIT，则以 Monoid 等具体资产重新收敛清单。
2. 将 REQ-0009 从候选范围收敛为稳定验收合同，再建立实施 Task；不因本研究状态为 done 自动进入实现。
3. 默认先采用两项设置、终端跟随代码，独立终端字体与内置中文字体仅在真实需求出现时扩展；如出现跨包公共合同或较大迁移，再决定是否需要 Plan/ADR。
