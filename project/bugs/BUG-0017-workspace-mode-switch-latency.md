---
id: BUG-0017
type: bug
status: blocked
priority: P2
owner: apps/desktop
source: user-report
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: [ISSUE-0010]
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 工作区 Work/Coding 切换响应迟缓

## 用户流程

- Given：用户在同一项目的 Desktop 工作区中使用会话。
- When：用户在页头切换 Work 与 Coding（界面文案为“文档与研究 / 代码”）。
- Then：布局应及时切换到目标工作区；当前会话的提示词和能力配置仍遵循既有固化语义，不应因布局切换被静默重配。

## 实际行为

用户报告 Work 与 Coding 开发模式切换有明显延迟，体验不够连贯。当前没有测量切换耗时，也未确定延迟是布局切换、会话准备、数据加载还是控件语义造成。

## 期望行为

用户操作后应及时看到目标模式的布局反馈；任何较慢的非关键准备应与可见切换解耦，并保持当前会话配置合同。

## 最小复现

1. 打开一个项目并进入工作页面。
2. 在页头交替选择“文档与研究”和“代码”。
3. 记录点击到选中态变化、目标布局可交互的时间，并观察会话工具/提示词是否变化。

## 影响

工作模式切换感觉迟钝，降低频繁切换任务类型时的可用性。当前没有可复现的延迟阈值或性能基线。

## 根因证据

- `apps/desktop/src/renderer/domains/workspace-mode/components/WorkspaceModeSwitcher.tsx:14` 是项目级工作区切换入口。
- `apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts:6` 将 `coding` 描述为现有布局，将 `work` 描述为切换会话右侧面板；布局变化与 `agentMode` / `capabilityProfile` 的新会话派生不是同一状态。
- `ISSUE-0010` 已裁决 Work/Coding 控件语义与会话配置的分层；本 Bug 关注切换响应时间，不重开该语义决策。
- 尚无性能 trace、状态更新延迟测量或受控复现，不能断定是 React 渲染、面板装载或会话初始化造成。

根因置信度：低；用户可感知的迟缓由报告确认，瓶颈待测量。

## 回归测试

- 已补充（安装探针的可测合同，先红后绿）：`WorkspaceModeSwitcher.test.tsx` 断言切换点击以同一口径打开 `workspace-mode-switch` 交互窗口且**早于** `setMode`（否则被测提交已跑完、窗口全空）；右栏单独套 `ChatView:rightColumn` profiler id，使报告可归因「右栏换装」与其余重渲。探针关闭时零开销直通。
- 红测实证：把 switcher 还原到基线后 1 失败/4 通过。
- 相关套件：`workspace-mode/` + `chat-view/` + `activity-panel/` 共 53 文件 270/270 通过；`check:quick` 7 文件全绿。

## 修复与验证

- 状态：**阻塞（等待实机基线）**。未获 UI 验证/实机启动授权，jsdom 无 pty/WebContentsView/真实 IPC，其数字不能作为延迟基线；按用户要求「先接 perf monitor 量基线再谈优化」，本次只完成度量接线，未做任何推测性优化。
- 度量入口：渲染层既有交互探针 `@shared/lib/perf-send`（`localStorage["vetta-perf-send"]="1"` + reload），不用 `diagnostics-bundle` 的 `perf-snapshot.json`（那是按间隔采进程 CPU/内存，无法归因 ~100ms 的点击→绘制窗口，只适合事后佐证）。`project/verification/` 现有 7 份基线无切换延迟记录。
- 提交：`c047f722a`（分支 `worktree-agent-af2e44ff2e986a335`，待集成）。
- 源码级已确认/已排除的候选（非延迟实测）：
  - 排除「切换重配会话」：`useSessionOpener.ts:416-417` 只在建会话时读 mode，切换不重开会话、不改 `agentMode`/`capabilityProfile`，与 ISSUE-0010 裁决一致。
  - 确认布局换装机制：`ActivityColumn`（`DefaultChatView.tsx:59-97`）对 work/coding 返回不同元素类型 → 卸载一棵挂载另一棵；`resolveWorkspaceRightPanel` 决定面板开启时切换不改右栏。
  - 确认切入 work 有冗余拉取：`WorkDocumentSections.tsx:61-87` 每次挂载都发 `window.vetta.task.getState(runtimeId)`，而 `taskStateBySessionAtom` 已持有合并投影（异步、不解释点击→绘制延迟，但可消除）。
  - 确认切换丢状态（UX 缺陷，非延迟）：`SourcesSection` 已选来源与 goal 存本地 `useState`，切换即丢——建议另行立项。
  - 内置 tab 的 `useMeta` 只有 i18n 文案与图标，**不主张**面板挂载是瓶颈；这正是待实测项。
- 阈值提案（须由首次实测确认，非既定基线）：面板关闭时 frame#1 ＜100ms 且无 ＞50ms longtask；≥200ms 才值得动手。
- 需用户配合的实机步骤：① DevTools 执行 `localStorage.setItem("vetta-perf-send","1"); location.reload()`；② 打开项目会话并**关闭活动面板**后交替切换 5-10 次，另覆盖长消息流与面板开启+文件树展开各一次；③ 回贴每条 `interaction=workspace-mode-switch` 的 `marks`/`commits`/`longTasks` 并标注场景；④ 同机跑一次 `trigger=send-button` 作「已知可接受」参照；⑤ `localStorage.removeItem("vetta-perf-send")` 关闭。

### 实机采证结果（2026-09-25，隔离 dev 实例）：**未取得任何切换耗时数字**

本条不是"没跑"，而是采集过程被两个可复现的环境事实挡住，且每个都有原始证据：

1. **该实例的 Renderer 文档永久 `hidden`，rAF 完全不触发**：`document.visibilityState === "hidden"`、`document.hasFocus() === true`、原生窗口在屏未最小化（rect 320,140→1600,940，`IsIconic=False`）。实测 1.2s / 3s 内 **0 帧**；探针的 `waitForCommittedPaint`（`shared/lib/committed-paint.ts:13`）直接短路返回 `skipped-hidden`。因此 `marks`（frame#1..#5，即"点击→首帧"这一核心口径）**无法产生**；Playwright 点击全部 `locator.click: Timeout`（元素可解析但不可交互）。已排除普通遮挡：强制 `HWND_TOP`/位移/`SetForegroundWindow` 后 `visibilityState` 不变 → 更像 Electron 自身的 webContents 可见性（hide-to-tray 状态），而非窗口被覆盖。
2. **同一 checkout 被并发编辑，Vite 全量重载风暴**：控制台实测 `[vite-hmr] before-full-reload {"path":"*","triggeredBy":"...i18n/locales/en/chat.json"}`，以及 `packages/capability-sdk/dist/*`、`capability-runtime/dist/*` 重写触发的批量全量重载，伴随 `500` → `Failed to initialize renderer` → 白屏骨架；冷启动在此状态下耗时约 2.7 分钟。一次重载正好落在测量窗口（`timeOrigin` 变化）使该次迭代作废。

- 未做的两项：`trigger=send-button` 参照（dev profile 有 deepseek 凭据，但发一条即真实计费调用，未做）；任何优化结论（无数据不下结论）。
- **解除阻塞的最小方案（择一）**：① 让 dev 窗口的 webContents 真正可见（应用层 show 而非 OS 层）后重跑 bug 文档第 ①–⑤ 步；② 在固定 revision 的隔离 worktree 上启动实例，避开当前 checkout 的并发编辑与 dist 重写。
- 探针开关 `localStorage["vetta-perf-send"]` 已按协议关闭（`"1"` → `null`），`vetta-workspace-mode` 全程未变，证明点击从未真正生效。
