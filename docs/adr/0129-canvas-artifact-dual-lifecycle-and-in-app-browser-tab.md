<!-- Copyright The Open Forge contributors. -->
# ADR-0129：Canvas artifact 双生命周期 + browser_tab 归属应用内 WebView

## 状态

已接受（PLAN-0006 决策冻结；TASK-0059 写入合同）

## 背景

右侧 Activity Panel 需要补齐 Cursor 式工作面：通用 Canvas（Markdown / HTML / 代码 artifact）、内置 Browser 上的元素点选与一等 `browser_tab` 工具、以及右栏 Terminal。现有 `attach_artifact` 只登记已存在文件且要求活动 Task；`ArtifactDescriptorSchema.sourceTaskId` 已是可选，因此 Conversation-owned artifact 不必新增事件类型。ADR-0090 把 Agent 浏览器操作面收敛为独立 `agent-browser` CLI Session，与应用内 WebView、`ctx.browser` 不共享页面。产品现在要在 **不推翻 CLI 独立会话** 的前提下，给应用内 WebView 增加一等工具面。

`HtmlPreviewView` 用带 `allow-same-origin` 的 iframe 预览 HTML，共享 renderer 进程，不能承载不可信 Agent 产出。Browser 面板当前使用全局 `persist:vetta-browser` partition。

## 决策

### 1. Canvas artifact 双生命周期，单一事实源

1. 文件内容是事实源。descriptor 只经现有 `artifact.descriptor.recorded` 重建；禁止第二套存储或事件类型。
2. 无活动 Task 时，`sourceSessionId` 即归属（Conversation-owned）。`sourceTaskId` 缺省合法。`artifact` 工具的 `create` / `update` / `get` / `list` 不要求活动 Task。
3. `attach_to_task` 把已有 artifact 挂到当前活动 Task；无活动 Task 返回 `no_active_task`。普通聊天不因产出 artifact 而创建 Task。
4. 版本单调递增。`update` 必须带 `artifactId + baseVersion`。内容 sha256 与 descriptor.checksum 不一致或 baseVersion 落后 → `stale_version`，禁止覆盖写历史。外部修改导入为新版本并标记「外部更新」。
5. 本机管理目录 `canvas/<workspaceId>/` 按 workspace 分桶。「保存到项目」复制后重指 `uri`，本机副本保留为历史快照，单向不双写。v1 不做自动 GC。

### 2. `browser_tab` 归属应用内 WebView（amends ADR-0090）

本决策 **修正** ADR-0090 中「Agent 浏览器操作面只有 CLI」的表述，但不撤回 CLI 独立会话：

1. `agent-browser` CLI 仍按 ADR-0090 使用 `VETTA_AGENT_SESSION_ID` 的独立 Session；不与 WebView 共享页面、ref、cookie 或 daemon。
2. `browser_tab` 是 Desktop 能力驱动的一等工具：仅当应用内 WebView 会话控制器的 host function 存在时注册。CLI 场景自然不可用。
3. 读类动作（`snapshot` / `inspect` / `screenshot` / `wait` / `scroll`）免审批（L0）。写类动作（`click` / `fill` / `press` / `navigate`）提升到 L3，走现有 Tool Approval 事实流。
4. `elementRef` 内嵌 `pageRevision`。页面变更后旧 ref 返回 `stale_reference`，建议重新 snapshot，绝不静默重定位。WebView 缺失返回 `no_browser_session`。
5. 合同不暴露任意 JS 执行、Cookie/token 导出或 `file:` / `javascript:` 导航。`navigate` 仅 http/https，host 允许 `["*"]`。
6. `ctx.browser` Foundation Capability（ADR-0088）与 Plugin API 继续独立；`browser_tab` 不经插件 `registerTool` 绕桥。

### 3. HTML artifact 用隔离 `<webview>`，不复用 `HtmlPreviewView`

| | `HtmlPreviewView` | Canvas HTML artifact / Browser guest |
| --- | --- | --- |
| 载体 | renderer 内 iframe `srcDoc` | 独立进程 `<webview>` |
| 沙箱 | `allow-scripts allow-same-origin allow-popups allow-forms` | `contextIsolation: true`、`nodeIntegration: false`、无特权 preload |
| 进程 | 与 Desktop UI 同进程 | guest 崩溃不拖垮宿主 |
| 导航 | 页内可自由跳转 | 一律拦截，外部打开需确认 |
| CSP | 无宿主 CSP | 默认 deny，仅允许文档所需的窄策略 |
| 用途 | 可信/本机文件预览 | 不可信 Agent 产出与第三方页面 |

宿主窗口继续 `webviewTag: true`。guest 不得获得 `window.vetta`。

### 4. Browser partition 保持共享；隔离是 deferred 异议

Phase 1 维持 `persist:vetta-browser`（「登录一次到处复用」）。按 workspace 隔离会让现有用户登录态按项目分裂，属于行为回归。

**重议条件**：出现真实的跨 workspace cookie/登录态串台投诉或安全事故。届时最小隔离是 partition 名带 `workspaceId`，并提供一次迁移说明。

### 5. console / network 采集明确不做，仅预留形态

Phase 1 不采集 WebView console 或 network。预留（不实现、不注册工具动作）：

- 落盘路径约定：应用缓存 `browser-logs/<workspaceId>/`（可重建，不进正式会话事件）。
- 后续动作形态：`browser_tab` 增加只读 `read_logs`（`kind: console | network`），仍不暴露任意 JS。
- 触发信号：Agent 调试网页缺少 console 成为明确痛点。

### 6. 工具结果与动态能力语义

`artifact` / `browser_tab` 遵守现有 `content`（模型可见摘要）/ `details`（结构化合同）分层。新工具在下一 Turn 生效，不打破 Turn 内工具面冻结。

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| Conversation-owned artifact 新增独立事件 | `sourceTaskId` 已可选；新事件是第二事实源 |
| HTML 用 sandboxed iframe | 共享 renderer，脚本失控拖垮整个 UI |
| `browser_tab` 走插件 `ctx.agent.registerTool` | 到主进程 WebView 需多绕一层桥，并绑死 preset 启用状态 |
| 复用 `.vetd` 设计画布当通用 Canvas | 数据模型与交互合同完全不同 |
| Phase 1 即按 workspace 隔离 partition | 登录态分裂是行为回归；异议已记录，待事故信号再议 |
| 把 CLI 与 WebView 合成同一 Session | 推翻 ADR-0090 的隔离与诊断边界 |

## 后果

- Desktop 必须在组装根注册 `artifact` / `browser_tab` host function 后，工具才出现；撤掉函数即整面下线。
- ADR-0090 对 CLI 安装、`VETTA_AGENT_SESSION_ID`、sandbox 限制的决策继续有效；文档与 Skill 需同时写明两条浏览器路径。
- Canvas HTML 与 Browser guest 的安全基线高于现有文件预览；不得把 `HtmlPreviewView` 的 sandbox flags 复制到 artifact 预览。
- 快捷键 `browser-element-picker`（默认 `mod+shift+d`）与 i18n 骨架已冻结在共享注册表；后续 Task 只接线，不改 locale / shortcuts / IPC 聚合文件。
