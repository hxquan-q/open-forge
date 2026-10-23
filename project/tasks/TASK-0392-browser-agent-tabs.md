---
id: TASK-0392
type: task
status: in_progress
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source: 用户要求独立 worktree 实施 browser tab 与 Agent 联动、标签栏响应性能和 UI 优化（autoresearch）
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0063, TASK-0351, TASK-0362, TASK-0366]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0392-browser-agent-tabs
worktree: ../open-forge-wt/task-0392-browser-agent-tabs
base_commit: ea67d951e
read_paths:
  - apps/desktop
  - packages/theme-ui
  - packages/coding-agent/src/features/browser-tab
  - docs/adr
write_paths:
  - apps/desktop/src/main/browser-automation
  - apps/desktop/src/shared/browser-tab-ipc.ts
  - apps/desktop/src/renderer/domains/activity-panel
  - apps/desktop/src/renderer/shared/store/browser-atoms.ts
  - apps/desktop/src/renderer/shared/store/browser-atoms.test.ts
  - apps/desktop/src/shared/i18n/locales/zh/chat.json
  - apps/desktop/src/shared/i18n/locales/en/chat.json
  - packages/theme-ui/src/shared/TabBar.tsx
  - packages/theme-ui/src/shared/use-tab-overflow.ts
  - packages/theme-ui/src/activity/BrowserPanelView.tsx
  - packages/theme-ui/tests
  - apps/desktop/scripts/browser-tabs.bench.mjs
  - apps/desktop/scripts/browser-tabs.bench.tsx
  - project/tasks/TASK-0392-browser-agent-tabs.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.3/task-0392-browser-agent-tabs.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/theme-ui/src/shared/TabBar.tsx
  - apps/desktop/src/main/browser-automation/in-app-browser-tab-host.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts
depends_on: []
conflicts_with: [TASK-0154, TASK-0197, TASK-0218, TASK-0223, TASK-0360, TASK-0362, TASK-0365, TASK-0366, TASK-0391]
integration_status: pending
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器与 Agent 联动及标签栏性能

## 目标

用户与 Agent 操作同一个内置页面时，能看懂当前正在发生什么；标签切换和面板缩放及时响应，不因重复测量产生额外布局工作。优化基于生产组件与固定交互负载，不删功能、不降低测试或改基准骗分。

## 当前事实

- browser_tab 经 Desktop host → InAppBrowserSessionController → 同 workspace 的 WebContents；元素批注已有截图、结构化胶囊及发送链路，不另造工具。
- 页面控制器只有页面/点选事件，尚无 Agent 动作生命周期投影；用户无法在浏览器中判断 Agent 正在读取还是操作。
- TabBar 切换 value 会重建 recompute / ResizeObserver 并读取全部测量节点 offsetWidth；需先测后改。
- URL map 每次相同页面事件仍克隆并发布；地址栏直接受每个事件覆盖，编辑中可能被后台事件打断。
- 图谱 .ua 基线 254796d（2026-10-12），已落后；仅作导航，已回读目标源码与 Git 增量。

## 范围

### 并发评估

- 结论：条件支持。与主工作区其他工作并行，本会话在自己的 worktree 内串行写入；不派并行写 Worker。
- 执行方式：parallel（与主检出隔离），内部串行。
- Branch：task/TASK-0392-browser-agent-tabs；Worktree：../open-forge-wt/task-0392-browser-agent-tabs。
- 创建：为避免向主检出添加 Task 文件，先用原生 git worktree add 从已提交 main 建空候选，再在候选内登记合同并执行 worktree CLI 检查；未复制主检出未提交文件。
- 冲突：上述历史浏览器 Task 验收/热文件串行集成；0154/0197/0218/0223/0391 与本次共享 Task 索引或汇编发布说明，已显式登记冲突，本分支仅改自己的候选，后续由 Coordinator 串行核对集成。主检出现有 Task-0360、Project 文档等修改不属于本任务。
- Coordinator：当前会话；不合入脏 main、不推送、不清理其他 worktree。

### 做

1. 固定真实 TabBar 交互基准，覆盖常用/拥挤标签数量、切换、动态标签、宽度变化；记录 React 时间及布局读取等辅助指标。
2. Agent 动作通过既有 session/event 桥投影为有界只读状态；工具栏显示本地化的当前操作反馈，成功/失败/取消/销毁都能结束，跨 workspace 不串台。
3. 减少无变化 URL 发布、标签栏重复测量/订阅；保留激活项可见、溢出、重排/脱离、文件拖入和关闭功能。
4. 工具栏更清晰紧凑，地址输入有可访问名称，保留焦点/编辑草稿、loading/error/retry、reduced motion 与设计 token。

### 不做

- 不新增 browser_tab 动作、任意脚本、权限、Provider、真实付费调用、外部 MCP 或多网页 tab。
- 不迁移持久化/partition，不触碰真实用户 Desktop/状态，不默认启动 dev 或 verify:ui。
- 不修改旧 Markdown 实验/工作树，不升级依赖，不改产品主题或全局规则。

## Given / When / Then

- Given 两个 workspace 各有内置页面；When Agent 在其中一个执行 snapshot/导航/操作；Then 只在对应页面看到动作状态；结束、抛错、取消、销毁后不残留忙碌；工具结果、审批与取消语义不变。
- Given 地址栏正在编辑；When 页面收到重复 loading/历史状态；Then 输入不被无关状态覆盖；提交可导航到输入目标，实际新页面仍正确同步。
- Given 4/12/30 个标签和窄面板；When 连续切换、重排、关闭、收窄再恢复；Then 激活项始终可访问，溢出顺序正确，拖拽/浮动接管不回归，无变化事件不重复布局或广播。
- Given 用户点选元素并添加批注；When 发送给 Agent；Then 仍保留原草稿、胶囊和截图，Agent 操作的是同一内置页面。

## 必须保持

- WebContentsView 唯一页面事实源；URL scheme、审批、stale_reference、取消/异常及工具返回协议不变。
- 新状态仅元数据，不复制页面正文、表单、Cookie 或用户输入。
- 无测量作弊/特定夹具分支；基准参数固定，优化同时覆盖留出形态与连续用户流程。
- Theme View 不读业务 atom/IPC；桌面 Connector 负责翻译与事件，所有用户文案 i18n。

## 测试与验证

- 先运行既有 host/controller、BrowserPanel、TabBar 与 browser-atoms 基线。
- TDD：动作生命周期正常/异常/取消/并发/跨 workspace，地址栏输入连续流程、重复 URL 无通知。
- 组件：真实 TabBar 点击/关闭/溢出/动态标签/尺寸变化、既有 drag 与 BrowserPanelView picker；无新增任意 keydown。
- 性能：固定 Chromium production profiling 基准，至少 3 次中位数；小于噪声需交错 A/B 或复测；耗时和布局计数独立报告。
- 门禁：定向 Node runner、test:impact、跨包 test:changed（按影响选择）、check:quick 与交付前完整 bun run check。
- 真 UI：未获 verify:ui 授权不运行；Chromium benchmark 仅隔离组件测试页，不连接 Desktop/CDP 用户实例。

## 验收分层

- 工程验证：待执行。
- 技术评审：实施完成后独立只读审查；当前未执行。
- 集成：pending，候选仅独立分支。
- 人工功能验收：待用户检查浏览器操作反馈、地址栏与窄栏切换体验。
- 发布：未授权。

## 功能验收包

- 入口：会话 → 活动面板 → 浏览器；打开本地 fixture，点选批注/由 Agent 使用 browser_tab。
- 预期：页面共享且动作状态准确；输入不被后台状态打断；切换/缩放无多余跳动。
- 已知限制：单 workspace 单页、共享登录 partition 延续现状；组件基准不证明真实模型质量或原生跨进程观感。

## 交付记录

- 创建独立分支/工作树，基线 ea67d951e；主检出与旧实验未改交付文件。
- 实际实现、测试、性能指标、评审与未运行项：后续据实追加。
