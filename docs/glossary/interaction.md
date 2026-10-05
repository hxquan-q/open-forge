<!-- Modified by The Open Forge contributors. -->
# 交互、通知与模型展示

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 系统通知（system notification）

desktop 经由 OS 原生通知中心（macOS / Windows）向用户推送的、APP 内事件的横向通知能力。设计为**类型化**：每条通知带一个 [[通知类型]] 判别字段，共用同一套「是否展示 → 构造内容 → 点击路由」基础设施。点击通知统一**前台化 APP** 并按该类型的路由意图跳转。首期只落地 [[agent 完成通知]] 一种类型，其余类型（更新提醒、错误告警等）为未来横向扩充预留位。

权限**交给操作系统**：不在代码层主动申请或检测授权，依赖 OS 首次弹窗接管。设置层面只提供一个全局总开关（「通用设置」下），不按类型拆分开关。

### 通知类型（NotificationType）

[[系统通知]] 的判别联合标签。每种类型自带 payload 形状与「点击后做什么」的路由意图。当前成员：[[agent 完成通知]] 与 [[agent 提问待确认通知]]（payload 均携带定位目标 session 所需的标识）。新增类型 = 加一个联合分支 + 在薄 dispatch 里补一段判定/构造/路由，**不触碰**已有类型。

### agent 提问待确认通知

[[通知类型]] 成员：[[交互式 session]] 的 agent 调用 [[ask_user_question]]、有问题待用户确认时触发的 [[系统通知]]。正文固定「有问题待确认，点击查看」，标题取 session 名。抑制规则与 [[agent 完成通知]] 同（聚焦且正停在该 session 聊天页时不弹——[[问答面板]] 已在眼前）。coalesceKey 用 `question:<sessionPath>` 与完成通知区分，二者互不覆盖。点击前台化并路由到该 session。

### agent 完成通知

[[通知类型]] 的首个成员：一个[[交互式 session]]「完成一轮回答」时触发的 [[系统通知]]。**触发**条件是该轮以正常结束（`agent_end`，对应 stopReason `stop`）或**出错**（stopReason `error`）收尾；用户主动中断（`aborted`）**不**触发。标题取 session 名（auto-title，回退首条用户消息截断），正文为固定文案。点击后前台化 APP 并路由到该 session 的聊天界面；若该 session 已被删除/文件不存在，则仅前台化、停留当前界面、不报错。

同一 session 的连续完成**合并为一条**（新通知替换该 session 的旧通知）；不同 session 各占一条。

### 通知抑制规则（前台同 session）

[[agent 完成通知]] 唯一**不**弹出的情形：APP 窗口当前**聚焦**（`isFocused`，窗口可见但失焦不算前台）**且**用户当前正停在**该 session 的聊天界面**上。两个条件缺一即通知——APP 在后台时即便看的就是该 session 也通知；APP 聚焦但停在设置页/自动化页等非聊天界面（即便内部 activeSession 仍指向该 session）也通知。「正在看哪个 session」由渲染进程上报给主进程，与主进程持有的窗口聚焦态合并判定。

### 未看过的图（unseen image）

[[image budget]] 的核心判定：一张图若位于消息历史里**最后一条 assistant 消息之后**，则即将发起的这次 LLM 调用是模型**第一次**看到它 → 判为「未看过」→ 无条件保留，不受预算 N 约束。一旦其后出现了 assistant 消息（模型已处理过这一批），转为「看过」→ 才进入预算被砍候选。

这是消息数组结构的**确定性、无状态**信号，不需要额外标志位。它保证 agent 批量 `read` 多张图时，模型在第一次调用里能完整看到全部图，根治「读了=没读」（模型对本该现在看的图收到占位符的幻读不可能）。代价见 [[image budget]]：未看过的图全保留 ⇒ 算法层不再防 OOM。

### icon symbol

供应商图标的下发方式:**客户端内置一套图标资源,每个资源有唯一 symbol 字符串**(可无限扩充)。服务端的 [[预设模板]] 配置与 [[远程网关]] 供应商配置都只填这个 symbol;客户端按 symbol 解析到内置图标渲染。`icon` 字段**可选**,空则不显示图标。symbol 随 [[预设模板]] 快照一并持久化进 [[models.json]],离线照常渲染。刻意不下发图片字节/URL——客户端资源 + 服务端 slug,既离线安全又省带宽,新增图标=客户端加一张资源。是**供应商(provider)级**,非模型级。

### ask_user_question

coding-agent 的一个内置工具，让 agent 在执行途中**主动向用户提一组多选题并阻塞等待回答**。借鉴 Claude Code 的 `AskUserQuestion`，转成本仓 snake_case 命名。input schema 是 Claude Code 的**核心子集**：`questions[1-4]`，每题 `{ question, header(短标签), options[2-4]{ label, description, badges? }, multiSelect }`；自动附「Other」自由输入；**不做** Claude Code 的选项级 preview / notes 批注 / metadata。回传给模型走自然语言拼接（`"Q"="A"` 串联，多选逗号连，取消回传明确措辞），[[option badge]] 不进回传。

工具是否对 agent 可见由 [[user question handler]] 的存在与否门控（能力=注册），按 [[实验性功能]] 开关动态启停。交互界面是 [[问答面板]]，transcript 里另留一个富视图 tool_call block 永久记录问题与所选答案。

### user question handler

设在 `getSharedRuntime()` 上的、承载 ask_user_question「阻塞等回答」能力的回调（拟 `setUserQuestionHandler`），与既有 `setUserConfirmationHandler` 同构——但 confirm 只传 bool，本 handler 承载 `questions/options` 富结构与结构化答案。新增 IPC channel（question-request / question-response）承载该结构，与 [[host_request / host_response]] 同属「agent 阻塞等宿主响应」家族。

**「能力=注册」是门控核心**：[[ask_user_question]] 是否进 agent 的 active tool set + system prompt，唯一取决于共享 runtime 上此 handler 是否存在；[[实验性功能]] 开关开→desktop 注入 handler，关→清除。AgentSession 在**每个 prompt 入口**比对「handler 是否存在」与上次构建态，变化即 `_buildRuntime` 重建——与 MCP 懒重建（`_maybeReloadMcpForPrompt`）、[[个性化懒重建]] 同一机制族，故新旧会话都能在下一轮 prompt 动态生效，不向 coding-agent 额外透传布尔 flag。

### 问答面板

ask_user_question 待答时，desktop 聊天页**输入栏被完全接管**转换成的 Q&A 选择 UI。多问题(问题组)以**紧凑可折叠的堆叠列表**呈现、可在问题间自由切换，不占过大篇幅；已答问题折叠成所选答案摘要。逃生出口=**显式取消按钮**（→ 触发 abort 语义，工具回传「用户拒绝回答」）+ 每题 Other 自由输入；接管期间隐藏普通文本输入。

**绑定所属 [[交互式 session]]**：请求携 sessionId，切到别的 session 只是隐藏面板（该 agent 仍阻塞），切回恢复待答；后台 session 提问时在侧边栏该会话上打待答徽标。App 关闭/刷新（webContents 销毁）视为取消。

### option badge

[[ask_user_question]] 每个 option 上的结构化标记列表（`badges?: string[]`）。取代 Claude Code「把 `(Recommended)` 塞进 label 文本」的写死做法：agent 可给某选项 append 任意 badge（「推荐」只是其一），既作 [[问答面板]] 展示的引导 badge、也是模型表达倾向性的结构化通道。仅用于展示与引导，**不进**回传给模型的 tool_result。

### 实验性功能（experimental features）

desktop 设置页「Agent配置」下的一个分类，首个成员是 [[ask_user_question]] 的开关。配置存储预留分组结构 `experimental.askUserQuestion`，将来加实验项只是加一个键、UI 同区域追加一行。**默认关、用户手动开**——「实验性」只是标签，不代表工具不可用或有额外使用成本，开关只控制是否把工具加载给 agent（经 [[user question handler]] 的注入/清除生效）。

### 输入预测（prompt prediction）

desktop 的一项[[实验性功能]]（`experimental.promptPrediction`，**缺省关**，区别于该分组其他键的缺省开）：agent 一轮回答**正常完成**（`agent_end`，aborted / error / 待答 [[ask_user_question]] 均不触发）后，预测用户下一个可能输入的 prompt。

生成走 auto-title 同款模式：独立的轻量 LLM 调用（`completeSimple`，会话当前模型），取最近 2-3 轮对话文本（截断）为上下文，**不**进主对话历史、不由主回答顺带输出。条数由 LLM 自行决定 **0-3 条**——语境无明显走向时返回 0、即不出任何 UI；失败同样静默降级。

呈现为两处：MessageList 下方垂直排列的[[建议 bubble]]；首条建议同时作为 InputBar placeholder——输入框为空时回车即按该建议发送。placeholder 加可识别前缀（↵ 图标 / 提示词）以区别于默认提示文本「向 Vetta 提问…」，让用户明白回车即发这条。生成期间（1-3 秒）**静默等待**：不显示加载骨架，bubble 就绪后才淡入；未就绪时 placeholder 保持默认提示。

生命周期：**内存态、按会话（runtimeId）隔离**，仿 `pendingQuestionsAtom` 的 Record 形态。该会话发出下一个 prompt 即清空；切会话保留、切回仍显示；用户打字不隐藏 bubble；不持久化，重启即失。**丢弃过期结果**：异步生成回填时校验「触发时所属会话仍未发新 prompt / 未开新轮」，否则丢弃，避免上一轮建议错落到新轮下面（不引入 abort 信号，仅在回填点判定）。

适用范围：仅[[交互式 session]]（普通对话 + 项目编码会话）；批量任务 / 自动化会话不启用。

### 建议 bubble

[[输入预测]]的列表呈现单元：MessageList 下方、InputBar 上方垂直排列的 0-3 个可点击气泡，每个承载一条预测 prompt（0 条即整块不渲染）。**点击即直接发送**该 prompt（与「placeholder 态空输入回车直发」语义一致），不是填入输入框待编辑。

### 模型分组 tag（model group tag）

模型的分类标签，一个模型可打多个。**独立受管实体**（id + 名称），与现有自由文本 `ProviderModel.tags`（"free,fast,vision" 展示标签）完全分离，模型与分组多对多（中间表）。在「模型设置」页有「模型分组」配置入口预设 n 个分组，模型设置中给模型多选打 tag。

**通用概念，不与 Go 强绑定**：分组本身是独立特性，[[档位]]关联若干分组 tag 决定可用模型只是当前**第一个消费者**；未来可能有其他业务按分组处理。建模时保持解耦——分组实体不依赖订阅，订阅单向引用分组。当前仅约束 Go 可用范围，[[Vetta Zen / 按需付费]] 仍暴露所有启用模型、与分组无关。

### 推理档位（reasoning level）

一个模型可选的**思考强度**选项，是**每模型独立**的能力（不是全局、也不是每 provider——同一 provider 下不同模型支持的档位可以不同，如 gpt-5.2 支持 xhigh 而更早的 GPT-5 不支持）。取代原先「全局 [[思考等级]] + 客户端 `supportsXhigh` 硬编码推断」的做法。

形状：模型配置携带 `reasoningLevels: string[]`（**只存 value 字符串**，非 `{label,value}`）+ `defaultReasoningLevel: string`（用户从未选过时的默认档）。`value` **恒为单一字符串**（如 `minimal/low/medium/high/xhigh` 或任意自定义串）；provider 层按模型 `api` 把它放进对应字段（openai-responses→`reasoning.effort`、openai-completions/qwen→`reasoning_effort`…）。上层（档位配置 / [[ai input]] / coding-agent）永远只见字符串，不感知 provider 协议形状差异。

显示：desktop 对**已知 value**（minimal/low/medium/high/xhigh）映射到 i18n key 随语言切换渲染；未知自定义 value 直接展示原文——故档位项不存展示文本，无死文案。

来源分层：每个 `api` 类型在 `@vetta/ai` 内置一份**预设档位列表**作为「新建模型时的预填 + 空列表 fallback」；但**只是预设、非约束**——模型可自由改写自己的档位列表（服务端模型走 admin，本地离线[[预设模板]]/手搓 provider 走 desktop 本地配置）。列表为空时 fallback 到该 api 预设。

记忆与传输：desktop **每模型记忆**上次所选档位（本地 `modelKey→value` 映射，跨会话/重启保留），随 `PromptRequest` 与 `modelKey` 同行下发、应用于本轮。取代原全局 `setGlobalThinkingLevel`（连同设置页全局 SegmentedControl 一并移除）。`reasoning:bool` 降级为**派生值**（`reasoningLevels` 非空即 true），列表为唯一真相源；无全局 `off` 档，关思考与否由档位列表自决。

范围（本期）：仅覆盖 openai-completions / openai-responses 及衍生 v1 第三方适配器（qwen / nvidia / zai …）。[[anthropic-messages]] 原生 provider 本期**不删、也不专门适配**（其 `cache_control` / thinking signature / adaptive thinking 为原生独有、无 v1 等价物），留到后续阶段再单独接入。

### 快捷面板（Quick Panel）

desktop 一个**全局快捷键唤出的独立悬浮窗**（frameless、alwaysOnTop、居中靠上、Spotlight 式），用于不切换上下文地**快速询问 agent**。是与主窗口物理分离的第二个 BrowserWindow（own renderer entry，循 `renderer-ocr` 先例），故**不共享主窗的 jotai store**——它需要的[[最近会话面板]]列表与实时状态全部由 main 进程经 IPC 推送。窗口在启动时创建一次并隐藏，靠 show/hide 切换（非每次重建）；失焦自动隐藏、Esc 隐藏、再次按快捷键 toggle 隐藏。

面板由上到下两块：一个**纯文本输入框**（v1 不支持 [[mentionedFile]] / [[attachedImage]] / `/skill`，复杂带附件任务回主窗做）+ 一个[[最近会话面板]]列表。输入框打字 + Enter 在「对话」scope（[[conversation cwd]]）**新建一个 session 并运行**，复用「对话」默认模型与 `defaultExecutionMode`（面板无模型选择器）。

默认**不启用**：触发选择与发送后行为都在设置页「快捷键设置」里，配置写 main 进程 desktop config（`~/.vetta/config.json`，与 `notificationsEnabled`/`experimental` 同处），**不**走既有 `vetta-shortcuts` localStorage——因触发监听在 main 进程、读不到 renderer localStorage。见 [[快捷面板触发器]]。

### 快捷面板触发器（Quick Panel trigger）

[[快捷面板]]的启动方式：**双击一个功能键**（`config.quickPanel.trigger`，单选 `none` / `mod`=⌘·Ctrl / `alt`=⌥·Alt / `shift`=⇧；缺省 `none`）。`mod` 按平台映射（mac=⌘，其余=Ctrl）；不区分左/右功能键。

双击裸功能键是 Electron `globalShortcut` 能力之外的事，由 `src/main/quickpanel-trigger.ts` 用 **uiohook-napi 原生全局键盘监听**实现：main 进程跟踪目标功能键的「干净点按」（按下→抬起且期间无其它键），两次点按间隔 ≤350ms 即 toggle 面板。仅在 `trigger !== "none"` 时启动监听（默认关=零开销、不申请权限）；配置变更经 `RELOAD_HOTKEY` 热切换。**macOS 首次启动监听需用户在「系统设置 › 输入监控」授权**——设置页对 mac 显示该提示。见 ADR-0035（推翻 ADR-0034 的「普通组合键」缩水方案）。
_Avoid_: 以为触发是 Electron globalShortcut 或可录制任意组合键——现仅「双击功能键」单选。

### 最近会话面板（Quick Panel recent list）

[[快捷面板]]输入框下方的会话列表，**镜像「对话」侧边栏列表**：仅「对话」scope 的 session，按 `modifiedAt` 倒序。每个 item 显示标题、**实时状态**（运行中 spinner / 待答确认 / 空闲 三态）与**最后一句消息的截断摘要**作副标题。状态与摘要由 main 推送：运行态复用 `runningSessionPathsAtom` 同源的 `vetta:session:running-changed` 广播，待答态复用 [[agent 提问待确认通知]] / pendingQuestions 信号。

键盘模型为 **Raycast 式「输入框为第 0 行」**：输入框始终聚焦，初始高亮输入行；Down 进入列表 item1/2/3、Up 回到输入行；Enter 作用于当前高亮行——高亮输入行且有文字=新建会话，高亮 item=**打开主窗并定位**到该 session（鼠标点击 item 同义）。「打开主窗定位」复用[[系统通知]]点击既有的前台化 + `vetta:notification:navigate` 路由通道。

**发送后行为可配置**（设置项，默认「打开主窗并定位」）：① 打开主窗并定位到新会话 / ② 后台运行、面板只关闭、靠[[agent 完成通知]]提醒。
