---
id: TASK-0543
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: d67908c7b
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
  - apps/desktop/src/renderer/domains/file-preview/
  - apps/desktop/src/main/conversations/
  - packages/runtime-node/src/conversation/
  - packages/runtime-node/test/conversation/
  - packages/theme-ui/src/activity/CodePreview.tsx
  - packages/theme-ui/src/file-preview/
  - project/tasks/
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 性能三件套改写移植：团队时间线对象复用、会话文件增量解析、大文件虚拟化预览

## 合同

- 来源与目标：上游三个提交 `502fe4dc5`（团队时间线投影缓存+未变项沿用对象）、`770602579`（只读查看器按追加增量解析 jsonl、未变不再推送）、`ac62b5c2d`（大文件预览改只读虚拟化编辑器、超大 Markdown/HTML 默认源码）。台账 RESEARCH-0052 判为「改写后采纳」：三处本仓均有现成机制，嵌进去而不是替换。逐项适配点已在实施前核对：
  - 团队：本仓已分叉出 `computeTeamTimelineBase`（持久侧基座）与 `diffViewerHistory` 增量推送。改写点——`projectMemberConversation` 按 `history` 数组身份 WeakMap 缓存（主进程 display service 已按版本复用同一数组引用，`team-session-display-service.test.ts` 有锁定），键含本仓多出的 `mediaSessionId` 维度；`useTeamChatModel` 的 feedItems 加 `reuseUnchangedTimelineItems`，行级对象身份跨流式帧保持稳定。
  - jsonl：codec 与上游 pre-change 形态等价但缺 `extendDocumentWithRecords`/`parseAppendedConversationRecords`/`ConversationBodyRecord` 导出，先抽取共用重放函数再逐字移植增量解析；`FileConversationRuntimeSessionFileHistoryReader` 加 LRU 缓存（默认 4，搜索 worker 传 0）；本仓 `diffViewerHistory` 已具「完全相等 → null 不推送」语义，读取侧无变化即引用相等，命中既有早退路径，IPC 层不需改。
  - 预览：本仓 `CodePreview` 有大对象降级闸（artifact 2MB / textFile 2MB/20k 行 → 纯文本）。嵌套关系——100KB–降级闸之间用只读 CodeMirror 虚拟化（新增 `ReadonlyCodeView`）；降级闸命中仍走本仓既有纯文本兜底；JSON 格式化加 `useMemo`；超大（>200KB）Markdown/HTML 首次打开默认源码（edit），用户手动切预览时 `renderLargeDocuments` 放行。本仓 HTML 默认 edit 的分叉（`CODE_DEFAULT_EXTENSIONS`）保留。
- 输入 → 输出：上游最终态语义 → 本仓结构内的等价行为与测试。
- 做 / 不做：只做这三提交等价物；不碰输入预测、用户消息编辑等其他改写项；不改 diffViewerHistory 的差分协议。
- Given / When / Then：
  - 团队会话流式刷新、持久侧无变化 → 持久消息行对象引用跨帧相等（`toBe`），未变时整条 feedItems 数组沿用上一份。
  - 查看器观察的 jsonl 只追加新整行 → 增量解析的结果与整份解析逐条相等（`extendDocumentWithRecords` 共用重放保证两条路径一致）；文件 stat 未变 → 返回引用相等的同一 history；写入半行 → 保缓存等下次；文件被改写/截断 → 回退整份解析。
  - 打开 100KB–2MB 的代码/JSON/日志文件 → 不再 Shiki 全文高亮，改只读 CodeMirror 渲染（DOM 中出现 `.cm-editor`）；超过降级闸仍纯文本。超过 200KB 的 .md 首次打开显示源码编辑器，手动点「预览」可看到渲染结果。
- 保留：降级闸与提示文案行为不变；`diffViewerHistory` 的 snapshot/append/reset 协议不变；成员投影的 `mediaSessionId` 语义不变。
- 验证：移植+改写测试（teamChatModel 身份断言、file-conversation-session-services 增量用例、TextPreviewRenderer/EditableTextFileView 尺寸分支用例）；`bun run test:impact`；`bun run check`。
- 测试纪律：移植用例改写为 DOM/捕获式断言，不新增 `toHaveBeenCalled*`；存量断言不动。
- 人工验收：不适用（性能优化，行为合同由测试锁定）；工程完成标准为检查全绿。

## 交付

- 实际修改与验证：
  - 团队时间线（`502fe4dc5`）：`teamChatModel.ts` 新增 `reuseUnchangedTimelineItems` + 私有 `shallowEqualTimelineItems`（逐字段 `===` 浅比较）；`projectMemberConversation` 按 history 数组身份 WeakMap 缓存，键含本仓多出的 `mediaSessionId` 维度；补上游同提交的 `projectCoordination` WeakMap 缓存（按 snapshot 身份缓存 items + agentItems——缺失时 `computeTeamTimelineBase` 每帧重建导致 attachments/blocks 新引用，行身份无法稳定）。`useTeamChatModel.ts` 以 ref + useMemo 接 `reuseUnchangedTimelineItems(prev, placeTeamErrorInTimeline(project(...)))`，接法与上游一致。
  - jsonl 增量（`770602579`）：`conversation-file-codec.ts` 把 `documentFromFile` 的重放循环抽为共用 `replayConversationRecords`，逐字移植 `parseAppendedConversationRecords`/`extendDocumentWithRecords`（node 抽取对比验证与上游一致）；`file-conversation-session-services.ts` 的 FileConversationRuntimeSessionFileHistoryReader 加 LRU 缓存（默认 4 条，`{cacheEntries}` 构造参数，ino/size/mtimeMs 三重 stat 校验，只变长走增量、半行保缓存并把 mtimeMs 置 NaN、改写/截断回退整份，readWhole 以字节数校验防读写竞态）；搜索 worker 传 `cacheEntries: 0` 不缓存；`session-history-page.ts` 的 `diffViewerHistory` 加 `prev === next` 引用相等早退——verifier 核实为严格快路径（旧逻辑在同引用时本就返回 null），接入点与上游 ipc 层去重不同但语义等价。
  - 大文件预览（`ac62b5c2d`）：新建 `packages/theme-ui/src/file-preview/ReadonlyCodeView.tsx`（上游逐字 + Modified 头，只读 CodeMirror basicSetup）；新建 fork 自有 `readonly-code-view-loader.ts`（模块级 promise 缓存的动态 import，满足 `readonly-dependencies.test.ts` 门禁——CodePreview 求值不得加载编辑器语法模块）；`CodePreview.tsx` 100KB 阈值虚拟化分支，降级闸（artifact 2MB / textFile 2MB / 20k 行）命中仍走既有纯文本兜底，分支顺序降级闸优先；`TextPreviewRenderer.tsx` 加 200KB 渲染门控 + `renderLargeDocuments` prop + JSON 格式化 useMemo，保留 fork 的 HtmlPreview src/revision 参数与 degradationKind；`EditableTextFileView.tsx` 落上游 chosenMode/loadedModeRef 逻辑，超大 md/html 首载默认 edit、手动切预览传 `renderLargeDocuments`，保留 fork 的 `CODE_DEFAULT_EXTENSIONS`（html 族默认 edit）分叉。
  - 测试：`teamChatModel.test.ts` 末尾移植上游两例身份断言（58/58）；`file-conversation-session-services.test.ts` 移植增量用例——追加半行/完整行/改写回退/引用相等（10/10）；新建 `TextPreviewRenderer.test.tsx`（3/3，`.cm-editor` 断言经 `await waitFor` 等懒加载）与 `EditableTextFileView.test.tsx`（2/2 + 既有 .test.ts 2/2），全部捕获式/DOM 断言零新增 `toHaveBeenCalled*`；`readonly-dependencies.test.ts` 门禁 1/1 通过。
  - 验证：`bun run test:impact` 全绿（desktop 45 文件 333 用例 + runtime-node 22 文件 108 用例 + theme-ui 2 文件 12 用例）；`bun run check` lint/types/guards/mobile 全绿（首轮 lint 报 4 处格式/import 排序，`check:lint:fix` 修复后复跑通过）；modified-file-notices missing=0（补 `session-search-worker-runtime.ts`/`conversation-file-codec.ts` 声明头）。
- 评审与集成：主代理串行实施；独立 verifier 复查 pass（直接 `git show` 上游三提交逐段对照）——增量解析与上游逐行一致、引用相等早退为严格快路径无吞内容风险、预览三态门控符合合同、缓存键覆盖全部投影输入。P3 注释事实错误（loader 注释所指门禁位置）已修为指向 `readonly-dependencies.test.ts`；其余 P3（100-200KB 区间覆盖深度、release-notes 软上限 warning、上游同源缓存策略风险）为低风险观察，不处理。
- 未运行与风险：未真机目视验证超大文件的 CodeMirror 渲染与滚动流畅度（行为合同以 DOM/引用相等断言锁定）；theme-ui 存量 `src/chat/*.tsx` JSX namespace 类型基线未触碰。
- 发布：release fragment `upstream-perf-trio.md`（改进类三条，已 assemble）。
