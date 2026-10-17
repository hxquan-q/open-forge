---
id: RESEARCH-0031
type: research
status: done
priority: P2
owner: packages/plugins
source: 外部仓库 GitHub license 元数据与 LICENSE 原文核对（2026-10-18）、官方文档/博客检索；非法律意见
created: 2026-10-18
updated: 2026-10-18
related_requirement: [REQ-0005]
related_plan: [PLAN-0018]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 设计插件参考项目与许可证审计（PLAN-0018 依据）

## 问题与范围

用户交付设计插件路线图 v2 前的大范围调研：核实「对话出界面」商业产品（Stitch、v0、Lovable、Figma Make、Magic Patterns、Subframe 等）、开源项目（Onlook、dyad、bolt.diy、open-lovable、OpenUI 等）与「点元素跳源码」工具（LocatorJS、code-inspector-plugin 等）的许可证，按三类分流：①可拷贝进闭源商业版；②只能看不能抄；③只借产品思路。本篇记录方法与结论摘要；完整「项目 × 许可 × 借什么 × 接入位置」矩阵在 [PLAN-0018 §2](../plans/PLAN-0018-design-plugin-roadmap-v2.md)，不在此复制第二份。

## 事实来源

- 各项目 GitHub 仓库 license 元数据 + LICENSE 原文逐份核对，时间 2026-10-18（台北时间）。
- 产品功能描述来自官方文档或博客的检索结果。
- 标「未核实」的条目（见失效条件）在采用前需复核。
- 非法律意见。

## 当前结论

**① 可直接拷贝**（MIT/Apache-2.0/BSD；合规义务见 PLAN-0018 合规清单），最值得直接拿的三块：

- dyad `@dyad-sh/react-vite-component-tagger`（Apache-2.0）：约百行 Vite 插件，给 JSX 注入 `file:line:column`，替换现有仅行号的插桩（F1）。
- Onlook `packages/parser` code-edit（Apache-2.0）：Babel AST 改 Tailwind class / 文本 / 移动 / 插入 / 删除 / 成组，直接当写回源码引擎（F3）。
- react-grab（MIT）：元素拾取浮层 + 交给 agent 的上下文格式（F2）。

其余 ① 类：Onlook penpal（iframe 类型化 RPC）、bippy（React 19 移除 `_debugSource` 后读 fiber 组件名/props）、Excalidraw（草图层）、screenshot-to-code（提示词与评测方法）、cursor-talk-to-figma-mcp（Figma 桥）、code-inspector-plugin、LocatorJS、OpenUI、bolt.diy、Puck、GrapesJS（BSD-3）、Storybook CSF（格式兼容）等。

**② 只能看、不能抄**：Webstudio（AGPL）、Plasmic `platform/`（AGPL）、Penpot（MPL；官方 MCP 可作外部进程原样接入）、tldraw（生产需许可证 key）、make-real（无 LICENSE，仅思路）、dyad `src/pro/`（FSL）、Theatre studio（AGPL）、WebContainers（API 商用需 StackBlitz 许可）。

**③ 仅产品思路**：Stitch、v0 Design Mode、Lovable Visual Edits、Figma Make、Cursor Design Mode、Paper、Pencil.dev、Claude Design、Magic Patterns、Subframe 等闭源产品——多方案并排生成、确定性视觉编辑不耗模型、设计系统/组件页、原型跳转、agent 优先 MCP 等思路分别落入 F2–F16。Onlook 新 Mac 桌面版未开源，发布后复核。

**引擎结论**：保留「每设计一个本地 vite」，不换 Sandpack（默认依赖 CodeSandbox 托管 bundler）与 WebContainers（商用许可 + COOP/COEP）。

**npm 决策**：`@openforge` scope 不注册、不发布（与 2026-09-25 TASK-0046 用户决策一致）；随之新增的依赖混淆风险以 `workspace:*` + scope 指向不可达私有源 + CI 检查 `bun.lock` 处置（PLAN-0018 §1 与 P4）。

## 被否决的方案

- 引擎换 Sandpack / WebContainers：托管 bundler 依赖、商用许可与 COOP/COEP 代价（F17 评估表）。
- Onlook 的 `data-oid` 写入源码定位：agent 改码时易删掉或复制这些 id；改为构建期注入 `file:line:col`（dyad 方案）+ 指纹重定位。
- 复制 make-real 代码：仓库无 LICENSE 文件，视为保留所有权利，只借「草图 → 生成可运行 frame」思路。
- tldraw 无限画布：生产环境需要许可证 key / 商业许可。

## 代码/测试/指标锚点

- 完整矩阵（40+ 项目：许可、类别、借什么、接入位置、URL）见 [PLAN-0018 §2](../plans/PLAN-0018-design-plugin-roadmap-v2.md)。
- 仓库侧接入锚点 20 处已核实存在（`packages/plugins/presets/vetta-ui-design/` 下 `engine/vite.config.mjs`、`src/vetd/layout-probe.ts`、`src/history/turn-history.ts`、`src/design-systems/{apply,catalog-sync,remote-catalog}.ts` 等），核对记录见 PLAN-0018「落盘核对」。

## 失效条件与置信度

- 任一上游仓库改许可证、归档或条款变更 → 对应结论失效；引入该代码前必须复核 LICENSE 原文。
- 未核实项（采用前必查）：Onlook 新桌面版开源时间与许可；Onlook 根 NOTICE 与 penpal 底层库许可版本；Sandpack 自托管 bundler 可行性；WebContainers 商用条款；Stitch DESIGN.md 是否有公开 schema；`.ofpkg` 撞名；launch-editor 许可；screenshot-to-code 提示词具体路径；Framer AI / Same.new / Polymet / Tempo Labs / UX Pilot / Uizard 功能。
- 许可证结论置信度高（原文核对）；服务条款类（open-lovable 的 Firecrawl 抓取、第三方站点版权）为中，实现时以「仅作参考」提示兜底。

## 下一步触发信号

- PLAN-0018 P0–P8 各阶段启动时按矩阵复核对应条目；引入任一 ① 类代码前重验其 LICENSE 未变，并按合规清单落文件头声明与 NOTICE 条目。
