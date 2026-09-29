<!-- Copyright The Open Forge contributors. -->
# Surface Brief — work/coding 双模式工作区

> 定稿来源：`exprot/ui-information-architecture.md`（IA §1–§8）+ `apps/desktop/DESIGN.md` 硬规范。
> 本 brief 是 TASK-0015~0021/0024 的 UI 事实源；实现者不在这里之外发明交互或视觉语言。
> 模式：Operate。所有面在既有 DESIGN.md 世界内扩展，不引入新视觉身份。

## 1. Shell 骨架与 Mode Switcher

- **形态**：`SegmentedControl`（`@shared/components/ui/segmented-control`），两项：`coding` / `work`。不新造开关组件。
- **位置**：PageHeader 左簇，跟在「新会话」按钮之后、标题之前。实现走 `usePageHeaderModel` 的 `leftSlot` 组合——不在每个页面各自插。
- **可见范围**：仅工作区路由显示——`/`（会话）、`/new-session/$cwd`、`/project/$cwd`。settings/automation/knowledge/agent-teams 等独立面不显示（它们有自己的页头语义；Team 会话属于 coding 生态，不切换）。
- **持久化维度**：**按项目 cwd**（`localStorage`，cwd → mode 映射，沿用 `activity-atoms.ts` 的 `createPersistedCwdStringListAtom` 同款模式）。cwd 未知时回落全局默认 `coding`。
- **切换语义**：只改变当前项目的布局与右侧面板内容，**不重建会话、不清空 composer 草稿、不取消进行中的执行**。切换是即时可逆的 UI 偏好。
- **默认**：`coding`（现状即 coding 布局，零迁移成本）。

## 2. work 入口布局

沿用 IA §2 三栏，落到现有壳：

```text
左栏  Sidebar（不变：项目/会话列表）
中栏  Chat + Composer（不变：chat-first，work 模式仍以对话为入口）
右栏  WorkPanel（替换 ActivityPanel）：
      ├── Plan / Progress
      ├── Source Files
      ├── Artifact Preview
      └── Review / Export
```

- WorkPanel 为**分区纵向堆叠**（不是 tab）：四节各自 `rounded-xl border border-border/50 bg-card/40` 卡片，标题行 12px `text-muted-foreground` 大写语义不强制（中文无大写，用字重区分）。
- 每节是**插槽**：数据未接线时渲染空态（§7），TASK-0017/0018 负责填充真实数据源。
- Dataset Preview 归入 Source Files/Artifact 之间的后续节，骨架预留插槽 id 但不单独出节（0018 再决定）。

## 3. coding 入口布局

- **现状即定稿**：中栏 Chat+Plan+Diff，右栏现有 ActivityPanel（plan/todo/file/ports 等内置 tab + 插件 tab），底部 BottomPanelHost。
- Profile / Permission Mode / Trust 状态常驻位置：**页头右簇现有 `ChatHeaderActionsView`**（ExecutionModeSelector 已在此）；TASK-0019 新增 Trust 指示时追加到该组件，不另开区域。
- 高风险操作摘要：沿用现有审批卡位置（ActionApproval / SandboxGrantsBadge），L0-L4 分级见 §5。

## 4. Task Activity Panel

IA §4 五段 → 组件与状态映射：

| 段 | 组件归属 | 状态来源 |
|---|---|---|
| Plan | 现有 `PlanTabPanel`/`TodoTabPanel`（coding）；work 模式 WorkPanel 第一节 | Session observation（TASK-0015 后接 Task projection） |
| Current Step | ActivityPanel tab 内高亮行 | observation |
| Tool Execution | 现有 `ToolCallsSubTab` | execution observation |
| Approval Request | §5 Approval 卡 | approval event |
| Recovery / Review | ActivityPanel 内恢复态条 + Review 节 | Task projection |

**状态 → token 映射**（DESIGN.md「Colors · 语义色」白名单内）：

| 状态 | 视觉 |
|---|---|
| pending / queued | `text-muted-foreground`，无底色块 |
| running | `text-emerald-400` + `bg-emerald-500/15` 徽标 |
| awaiting approval | `text-amber-400` + `bg-amber-500/15` |
| failed | `text-destructive` + `bg-destructive/10` |
| cancelled | `text-muted-foreground` + `bg-muted` |
| succeeded | `text-muted-foreground`（完成后降调，不常驻绿色） |

不变量落地：面板只读 projection；关闭/收起面板不取消 Task；取消走显式 Runtime Command 按钮。

## 5. Approval 卡片规格

信息层级（自上而下，密度对齐现有审批卡）：

1. **头部行**：Tool 名（`text-[13px] font-medium`）+ 风险等级徽标（右侧）。
2. **上下文行**：Task/Turn 标识 + Trust scope 来源 + 过期时间（`text-[12px] text-muted-foreground`）。
3. **受影响资源**：路径/主机列表，单行截断 + 展开。
4. **参数摘要**：等宽折叠块。
5. **外部副作用警示**（仅 L3+ 显示）：`text-amber-400` 一行。
6. **操作行**：`允许一次`（primary）/ `允许本 Session` / `允许本 Project`（outline）/ `拒绝`（ghost→destructive 语义）。UI 只产生 Approval Decision，按钮不直连 Tool。

L0–L4 视觉分级：L0/L1 不出现审批卡（自动放行）；L2 `bg-primary/10 text-primary` 徽标；L3 `bg-amber-500/15 text-amber-400`；L4 `bg-destructive/10 text-destructive` 且标题行加 `border-destructive/30`。

## 6. Artifact 面板渲染矩阵

| descriptor kind | 渲染 | 降级态 |
|---|---|---|
| markdown/text | 现有 Markdown 渲染器 | 纯文本等宽块 |
| json | JSON 树/高亮块 | `application/json` 纯文本 |
| csv/表格 | 表格组件 | 纯文本 |
| diff/patch | Diff 视图 | unified diff 等宽块 |
| image | 图片预览 | 文件卡片 + 打开按钮 |
| execution-result | 终端式输出块（exit code 徽标） | 纯文本 |
| research-evidence | 引用列表（来源+摘要+链接） | 纯文本列表 |
| bundle | Artifact 列表页 | — |
| 未知 kind | 通用文件卡（名称/大小/打开） | — |

Plugin Renderer 经 descriptor registry 注册，capability 校验后才能读资源，不直读绝对路径（IA §6）。

## 7. 空 / 加载 / 错误 / 取消态与 i18n

- **空态**：图标（solar linear）+ 一行说明 + （可选）一个 `<Button>` CTA。文案进 `chat` ns 的 `workspace.work.*` 组（work 面板属会话工作区，不单开 ns）。
- **加载态**：`RouteContentLoadingView` 同款 spinner 小型化，不新造骨架屏。
- **错误态**：`border-destructive/30 bg-destructive/10 text-destructive` 圆角条（`ChatError` 同款）+ 重试 `<Button variant="outline">`。
- **取消态**：按 §4 取消态映射呈现，附「重新开始」入口但不自动重跑。
- i18n key 规划：`workspace.mode.coding|work`、`workspace.work.plan|sources|artifacts|review`、`workspace.work.empty.*`、`workspace.mode.switch`（aria）。

## 8. token 与组件映射（全部复用，无新增）

| 需求 | 落地 |
|---|---|
| 模式切换 | `SegmentedControl` |
| 面板节卡片 | `rounded-xl border border-border/50 bg-card/40`（1px、无阴影） |
| 操作按钮 | `<Button>` variant：primary/outline/ghost/destructive |
| 状态徽标 | 文字 + `/15` 底色块，emerald/amber/destructive 白名单 |
| 图标 | `icon-[solar--*-linear]` |
| 浮层 | Popover/Dialog 现有件 |
| 拖拽/宽改 | 复用 activity panel 宽度模式（本阶段不新增） |

## Direction contract

THESIS：Chat-first 不变，右栏随模式换内容——coding 看执行轨迹，work 看计划/资料/产物/评审；模式是项目级偏好而非应用级分叉。
OWN-WORLD：既有 DESIGN.md token 世界原样继承，新面只允许用 §8 表格内映射。
STORY：用户切到 work 即看到「目标→计划→产物」的工作区骨架，即使数据未接线也清楚每节将装什么。
FIRST VIEWPORT：页头左簇 segmented 两态；右栏四节卡片空态；中栏会话如常。
FORM：在既有壳上扩展（非新 surface roll）；继承 coding 全部布局与组件纪律。
FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
