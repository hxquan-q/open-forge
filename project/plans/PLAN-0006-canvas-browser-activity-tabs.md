---
id: PLAN-0006
type: plan
status: ready
priority: P1
requirement: REQ-0001
owner: apps/desktop
created: 2026-09-23
updated: 2026-09-23
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Canvas / Browser / Terminal 右栏集成（Cursor 式活动面板）

## 背景与目标

把右侧 Activity Panel 补齐为 Cursor 式工作面：`文件 / Canvas / Browser / Terminal` 可切换。Canvas 是**通用 artifact 画布**（渲染 Agent 产出的 Markdown/HTML/代码），与 `vetta-ui-design` 插件的 `.vetd` 设计画布是两个功能；Browser 在现有内置 WebView 上叠加元素点选和一等 `browser_tab` Agent 工具；Terminal 复用底部面板的 PTY 服务进右栏。work（`conversation`）与 coding（`project`）场景均可用。

调研证据见 [`RESEARCH-0005`](../research/RESEARCH-0005-canvas-browser-terminal-support.md)。

## 当前事实

- Activity Panel 已有内置 tab 注册表（`BUILTIN_ACTIVITY_TABS`）+ 插件 tab + “+”挂载池 + warm/pinned 驻留；内置 `file`(0)/`browser`(15) 已存在。
- `browser` tab 的 `useMeta` 在无 `browserUrl` 时返回 null，用户无法手动挂载。
- `ArtifactDescriptorSchema` 的 `sourceTaskId` 已是 `Optional`，`artifact.descriptor.recorded` 是会话级事件——Conversation-owned artifact 无需改 Schema，缺的是会话级写入入口与 UI 呈现。
- `attach_artifact` 只登记已存在文件且要求活动 Task；普通聊天不能复用该路径。
- 现有 WebView 用全局共享 `persist:vetta-browser` partition（“登录一次到处复用”为刻意设计）。
- `agent-browser` CLI 走独立会话，与应用内 WebView 不共享页面（ADR-0090）。
- 可配置快捷键注册表 `SHORTCUT_ACTIONS` 存在；`mod+shift+d` 无冲突。
- 现有 `HtmlPreviewView` iframe 带 `allow-same-origin`，不可直接渲染不可信产出。
- `TerminalSurface` 依赖 `useBottomPanelInstance()` handle；抽出窄接口即可被右栏复用。

## 决策索引（已与用户确认，实现期不再重议）

**Canvas**

- 渲染范围 v1：Markdown / HTML / 代码·纯文本，只读预览，修改走对话。
- 存储：文件是事实源；本机管理目录 `canvas/` 按 workspace 分桶；descriptor 复用 `artifact.descriptor.recorded`，`sourceTaskId` 缺省即 Conversation-owned。
- 保存到项目：复制到项目目标路径 + descriptor `uri` 重指 + 版本延续；本机副本保留为历史快照，单向同步不双写。
- tab：内置 `canvas`，常驻可隐藏；列出 workspace 全部 artifact 按来源会话分组；设计插件 tab 改名「设计画布」消歧。
- 迭代锚点：Markdown/代码文本选区可附加到草稿（带 artifactId+version+选区）；HTML 预览内点选归 Phase 2。
- HTML 沙箱：`<webview>` 独立进程承载。
- Agent 工具：新增 `artifact`，动作 `create` / `update` / `get` / `list` / `attach_to_task`。
- 版本语义：单调递增；内容 sha256 与 descriptor.checksum 不一致的 `update` 一律强制新版本，禁止覆盖；外部修改检测 = Canvas 打开时比对 + 可见 artifact 的文件 watcher + `update` 前校验，外部编辑导入为新版本并标记「外部更新」。
- 归属与 GC：无 Task 时 `sourceSessionId` 即归属；v1 不做自动 GC，删除由用户在列表中显式触发。
- 新产出提示：Agent `create` artifact 后 Canvas tab 显示未读徽标/选中提示（不抢焦点），由 artifact 事件驱动。
- 插件类型 artifact 入列：列表按「workspace 全部 artifact」渲染，不区分内置/插件来源；已知类型（如 `.vetd`）点击跳到其已注册 surface（设计画布 tab），未知类型显示元信息卡兜底；插件 renderer registry 的消费归 PLAN-0007（TASK-0027 之后）。

**Browser**

- WebView 为唯一事实会话；`agent-browser` CLI 并存，文档写明两者不同会话。
- Browser tab 常驻可挂载，空态即地址栏；每 workspace 单页，多页签后置。
- 元素点选：工具栏按钮 + `mod+shift+d`（入 `SHORTCUT_ACTIONS`）；悬停高亮、点击拦截不触发页面动作；选中生成 capsule **附加到草稿不自动发送**；Phase 1 单次只挂一个 capsule。
- capsule schema：`vetta.browser.element-selection` v1——`pageUrl`/`title`/`elementRef`/`pageRevision`/role/accessibleName/attributes 白名单/domPath+xpath/computedStyle 白名单（约 15 项）/outerHTML ≤8KB/周边文本 ≤2KB；裁剪截图进会话图片缓存并作为 image attachment；受 256KB attachment 总闸。
- `browser_tab`：coding-agent 定合同 + Desktop 主进程 host function（`attach_artifact` 同款扩展缝）；**能力驱动**注册——WebView 会话控制器存在即挂上，CLI 场景自然不可用。
- 动作面：`snapshot` / `inspect` / `click` / `fill` / `press` / `scroll` / `wait` / `screenshot` / `navigate`。`snapshot` 返回可访问性/交互元素树 + ref + `pageRevision`；`inspect` 返回单元素详情（与 capsule 字段去重）。
- 审批：读类（snapshot/inspect/screenshot/wait/scroll）免审批；写类（click/fill/press/navigate）走现有 Tool Approval 事实流。
- navigate：不限 host，仅 http/https scheme（复用 `assertAllowedBrowserUrl` 校验段，host 传 `["*"]`）。
- 过期防护：元素 ref 内嵌 `pageRevision`；页面变更后旧 ref 返回 `stale_reference` + 建议重新 snapshot，绝不静默重定位执行。
- 截图：按 devicePixelRatio 换算裁剪坐标，长边上限 1600px，PNG。

**Terminal**

- 右栏新增内置 `terminal` tab：抽 `TerminalSurface` 的 handle 窄接口，底部面板与右栏各给 adapter；每 workspace 单实例；进「+」挂载池默认不上栏；底部面板零改动。
- Agent 的 `shell`/`bash` 工具与两个 UI surface 完全独立，不受本任务影响。

## 候选方案与取舍（被否决项）

- 复用 `.vetd` 设计画布当通用 Canvas —— 否决：数据模型与交互合同完全不同。
- Conversation-owned artifact 新增独立事件类型 —— 否决：Schema 已允许 `sourceTaskId` 缺省，新增事件是第二事实源。
- HTML 用 sandboxed iframe —— 否决：共享 renderer 进程，脚本失控拖垮整个 UI。
- `browser_tab` 走插件 `ctx.agent.registerTool` —— 否决：要到达主进程 WebView 需多绕一层桥，且把功能绑死在 preset 启用状态上。
- browser partition 按 workspace 隔离 —— **评审异议项**：外部评审建议 Phase 1 做最小隔离（partition 名带 workspaceId）；维持已批准的「保持共享」，理由：改 partition 会使现有用户登录态按项目分裂，是行为回归。触发重议条件见「升级信号」。
- console/network 日志采集 —— Phase 1 **明确不做**（non-goal，写死）；ADR 预留落盘路径约定与后续 `read_logs` 动作形态。
- Cursor 式多选/框选/页面标注/语音 —— Phase 2。

## 阶段

```text
TASK-0059 合同与接缝冻结（serial，先行）
    ├─ TASK-0060 Canvas artifact 服务 ──→ TASK-0061 Canvas tab UI
    ├─ TASK-0062 Browser 元素点选 ──→ TASK-0063 browser_tab 工具
    └─ TASK-0064 Terminal 右栏 tab（独立）
```

TASK-0059 负责所有共享接缝（IPC channel 常量、preload 桩、组装根装配、新增 i18n key 骨架、`SHORTCUT_ACTIONS` 注册），使后续 worker 不触碰共享注册文件。

## 不做什么

- 不改 `.vetd` 设计画布本身（仅 tab 标签改名）。
- 不改底部面板与 Terminal 功能行为。
- 不做 Git add/commit/push；「保存到项目」只是文件复制。
- 不做 console/network 采集、多页签、多选/框选、HTML 内点选、artifact 自动 GC、browser partition 隔离、Canvas 直接编辑、图片/媒体 artifact。其中 **console/network 采集、HTML 内点选、Agent 操作可见指示已圈选进 PLAN-0007（draft）**。
- 不创建第二套 Agent Loop / Task Runner / 存储事实源。

## 验证与回滚

- 合同层：descriptor 双生命周期、`stale_reference`、capsule schema 走合同测试；取消/超时/审批拒绝路径逐一覆盖。
- 用户流程：普通会话产出 Markdown→Canvas 出现→选区回引→Agent 更新新版本→重开恢复；Browser 点选→草稿附件→发送→`browser_tab` 操作同一 WebView；HTML artifact 在沙箱运行且无法触达宿主 API。
- **v1 里程碑判据**（「Agent Workspace v1」达成）：五条代表流程在真实 Desktop 各跑一次有人监督演示——①会话产出→Canvas→选区回引→新版本→恢复；②Task 产出在 Task Review 与 Canvas 同源可见；③Browser 点选→capsule 草稿→`browser_tab` 同页操作→页面变更后 stale_reference；④保存到项目→外部编辑→「外部更新」；⑤HTML 沙箱隔离（脚本触达不到宿主 DOM/Vetta API/Node）。合同/定向 E2E 绿作为防回归资产，不单独构成达成判据。
- 门禁：`bun run test:impact -- <files>`、`check:quick`、收尾 `check`；真实 WebView 行为用本地 fixture 做定向 Electron E2E。
- 回滚：每个 Task 独立可回滚；`browser_tab` 为能力驱动注册，撤掉 host function 即整面下线。

## 升级信号

- 多 workspace 间 cookie/登录态串台的真实投诉或安全事故 → 重议 partition 隔离（评审异议已记录）。
- Agent 调试网页缺 console 的痛点 → **已排期**：console/network 采集 + `read_logs` 进入 PLAN-0007（draft）；若 v1 演示/首发反馈暴露更痛缺口，按反馈重排 PLAN-0007 内部顺序。
- 单页浏览器成为明确瓶颈 → 引入多页签 session 模型。

## 需要的 ADR

已写入 [`ADR-0129`](../../docs/adr/0129-canvas-artifact-dual-lifecycle-and-in-app-browser-tab.md)：Canvas artifact 双生命周期 + `browser_tab` 归属应用内 WebView（amends ADR-0090：CLI 会话保留为独立路径，不再被描述为唯一浏览器自动化面），并含 webview 安全基线与 `HtmlPreviewView` 差异表、console/network 预留设计、partition 决策与 deferred 异议。
