<!-- Modified by The Open Forge contributors. -->
# 会话、消息与工具调用

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### ToolTimingEntry

A `SessionEntry` (parallel to `thinking_level_change` / `model_change`, not a `message`) written to a session's jsonl by `agent-session` at `tool_execution_end`. Carries `toolCallId`, `startedAt` (absolute ms), `durationMs`, and `phases` (relative offsets, see `phase`).

ToolTimingEntry exists in a separate channel from `Message` deliberately so that LLM providers — which only consume `message` entries — never see it. This is a hard architectural boundary, not a filter to be maintained.

### phase

A user-defined interval inside a tool's `execute`. Tools call `ctx.phase(label)` to mark "from this moment on, I'm doing `label`"; the next call (or `tool_execution_end`) implicitly ends the previous interval. Persisted as `phases: [{ label, atMs }]` where `atMs` is the offset from `startedAt` in ms. Duration of each interval is computed at read time by diffing consecutive `atMs` (last interval uses `durationMs`).

### conspicuous duration

The user-facing threshold above which a tool call shows a duration badge on the `ToolCallBlock` header. Default 1000 ms. Below the threshold, the badge is hidden but the meta panel still has the data when expanded.

Threshold is a UI display rule, never a write-time filter. Every `tool_execution_end` produces a `ToolTimingEntry` regardless of duration.

### meta panel (of a tool_call block)

The region revealed when a user expands a `tool_call` block. First row is a labelled meta zone showing `startedAt` (absolute time), full-precision `durationMs`, and `phases` as a centred-dot string ("download 2.1s · ocr 12.3s · write 0.8s"). This row is explicitly out-of-band — never sent to the LLM.

### ctx (in a tool's `execute` signature)

The fourth positional argument introduced for timing support: `execute(toolCallId, input, signal, ctx)`. Currently exposes `ctx.phase(label)`. Older tools that don't accept `ctx` continue to work — their timing data is just `[startedAt, durationMs]` with empty `phases`.

### mentionedFile

A user-attached file or directory reference carried alongside a chat prompt. Shape: `{ path: string; name: string; isDirectory: boolean }`. `path` is always an **absolute filesystem path** and is **not constrained to the session's cwd** — it may originate from an `@`-mention inside cwd, an internal File Explorer drag, or an external OS drag-drop. Rendered in `InputBar` as a `Capsule` with a native `title` tooltip exposing the full path. Consumed in `sendPrompt` by being prepended to the user message as `@${path}` lines (one per entry) — the agent then decides whether to read each path via its own tools.

`mentionedFile` is distinct from `attachedImage`: dropping an `image/*` MIME file still routes to `attachedImage` (DataURL multimodal attachment), not to `mentionedFile`. The two channels coexist in `InputBar` capsules but serialize differently at send time.

### 结论 (assistant turn conclusion)

一轮 assistant 回答「已经有结论」的判定：本轮 streaming 已结束，即 `!(isLastAssistant && isStreaming)`。与 [[AssistantFoldTip]] 的 `state: "complete"` 同源，不引入新状态。

定义刻意**不**要求 `foldData.outputBlocks` 非空 —— 纯工具调用收尾（agent 调完工具就 stop、没有 final text）的轮次同样算「有结论」，仍允许用户对该轮内容触发操作（如复制工具输出摘要）。复制按钮在 streaming 期间隐藏，是为了避免用户复制到半句话；轮次结束后内容已稳定，即便没有 final text 也已稳定。

历史 assistant 消息天然满足该判定，不需要额外的 per-message "done" 标志。

### MessageActions

挂在每条 chat message（user / assistant）底部的一排 icon-only 操作按钮，hover 出 tooltip。当前只有「复制」一个按钮，设计为可扩展（后续可能加 regenerate / 评分 / 分享 等）。

与 `ActionButtonBar`（全局粘性条，受 `visibleActionButtonsAtom` 驱动，主色实心 pill）是**完全不同的概念** —— 不要混用 "ActionBar" 命名。前者是"消息附属工具"（灰、轻量），后者是"召唤主动操作"（主色、显眼）。

显示策略：
- User message：hover 整行才显示，绝对定位浮在 bubble 下方不占布局。复制源 = `displayText`（`parseUserPrefixes` 之后的 body，剥掉 `/skill:` 和 `@file` 行）。
- Assistant message：本轮[[结论]]已出现后常驻显示。复制源 = `foldData.outputBlocks` 拼接出的结论文本。

按钮不存在的情形（整条 bar 不渲染）：`role === "compaction"`、user 仅图片或完全空、assistant 仅含 error block、assistant 纯工具轮（outputBlocks 为空）。这是"按钮无可复制内容"的自然 fall-out，不是 hasConclusion 判定的例外。

### conversation cwd

`~/.vetta/conversation`，desktop 中虚拟注入的「对话」项目的**项目根 cwd**（常量 `DEFAULT_CONVERSATION_CWD`，`apps/desktop/src/main/ipc/fs.ts`）。session jsonl 文件集中落在 `<conversation cwd>/.vetta/sessions/`。

**项目根 cwd ≠ session 运行 cwd。** ADR-0007 起，「对话」下新建的每个 session 拿到自己的 [[session 产物子目录]] (`<conversation cwd>/<sessionId>/`) 作为运行 cwd，agent 产物落在那里，避免不同 session 在根目录互相窜味。读 session.cwd 而不是项目 cwd 才能拿到 agent 当时的真实工作目录。fs IPC 沙箱边界仍是项目根整体，不按 session 收紧——隔离的是状态不是权限。

**仅指 desktop 侧。** im-gateway 自 ADR-0005 起改用独立 cwd（见 [[im-gateway cwd]]），不再共用本目录。文档/代码里出现「conversation cwd」时默认指 desktop 这一份。

### session 产物子目录

「对话」项目下每个**新建** session 在 main 进程 eager `mkdir` 出来的独立工作目录：`~/.vetta/conversation/<sessionId>/`。session 的运行 cwd 指向这里，agent 工具默认写入 `./` 时落入本目录，自然按 session 隔离。

命名刻意用不可变 `sessionId` 而非 session title slug——session 可重命名而产物内的相对引用不可控，stability 优先。Finder 不可读由 UI"在 Finder 中打开本 session 产物目录"入口补偿。

ADR-0007 之前创建的老 session 不迁移，cwd 保留为 [[conversation cwd]] 根；其根目录残留产物在「对话」项目详情页 Files 面板与新的 `<sessionId>/` 子目录共存展示。删除 session 时一并递归删除其子目录。

**仅作用于「对话」默认项目。** 用户手动创建的项目（cwd 由用户选）不走 per-session 拆分——共享 cwd 是用户创建该项目时的初衷。

### host_request / host_response

agent ↔ host 之间的反向 RPC 通道，扩自 coding-agent 的 RPC 协议（`packages/coding-agent/docs/rpc.md`、`src/modes/rpc/rpc-types.ts`）。形状：

- agent → host（stdout event line）：`{"type":"host_request","id":"hr-N","method":"send_attachment","params":{...}}`
- host → agent（stdin command line）：`{"type":"host_response","id":"hr-N","success":bool,"data":{...},"error":""}`

`method` 字段预留扩展（未来可能有 `send_typing` / `query_peer` 等）。`id` 由 agent 侧生成，host 必须原样回填。无应答时 agent 工具侧 30s 超时。

与 RPC 现有的 `command/response` 是镜像方向：现有是 host→agent（驱动），新增是 agent→host（回调）。共用 stdin/stdout，靠 `type` 字段区分。

### drop overlay (of ChatPage)

A full-`ChatPage` overlay rendered while an OS-level drag carrying `Files` (or an internal drag carrying the `application/vetta-path` MIME) is hovering. Provides the visual affordance "release to reference"; on drop, each dragged item becomes a `mentionedFile` (or an `attachedImage` for image MIME). Triggers regardless of whether a session is currently active — items dropped on `NewSessionPage` stay in `mentionedFilesAtom` and are picked up by the next `sendPrompt`. Internal drags from File Explorer are detected via the `application/vetta-path` MIME and bypass `webUtils.getPathForFile`, reading the path directly from the dataTransfer payload.

### image budget

coding-agent 在每次 LLM 调用前（`transformContext` 钩子，`applyImageBudget`）对消息历史里的图片做的保留策略：对**看过的**旧图只保留最新 N 张（`maxRecentImages`，默认 2，desktop 设置页可调；`<=0` 禁用即全保留），其余替换为文本占位符以省视觉 token。是**只作用于本次发送 payload 的纯函数变换**，不 mutate 原始历史、不落盘（脏读不可能）。

ADR-0012 起判定依据从「留最新 N 张」改为引入 [[未看过的图]]：N 只约束「看过的」旧图，未看过的图无条件保留。原本附带的 OOM 硬保护（把批量读的图强砍到 N）被**刻意移除**——显存受限的本地模型改由部署方提示词软引导「一张一张读」来兜底，云端模型无显存墙不受影响。文档/代码里出现「图片预算」「视觉 token 封顶」时即指本机制。

### 交互式 session

用户在聊天界面**手动发起**的 session，与自动化/批量任务/定时任务等**非手动发起**的 session 相对。判别依据是创建路径：交互式 session 经渲染进程的 `session:create` 通道创建，批量/定时任务直接调运行时创建——故主进程可在 `session:create` 处天然圈定交互式 session。[[agent 完成通知]] **只针对交互式 session**，避免后台任务刷屏。

### 工作模式（agent mode）

用户在新会话页选择、在会话创建时固定下来的任务解释先验，目前有 Work 与 Coding 两个。模式之间**只有提示词正文不同**：身份、默认路线与各自的专业纪律；会话流的[[叙事阶段]]、Deliverables 改动文件清单、写代码时的底线纪律对所有模式一致，不随模式变化。模式不排除也不重排任何工具、Skill、MCP 或插件。
_Avoid_: 「场景」（与 `scope_use` 会话场景混淆）；「执行模式」「权限模式」（那是 `permissionMode`，与工作模式正交）。
