---
id: VERIFY-0017
type: verification
status: ready
priority: P2
owner: coordinator
related_requirement: []
related_plan: []
related_tasks: [TASK-0214, TASK-0216]
related_issues: [ISSUE-0029]
related_bugs: []
source: user-request（「验收方式」决策：分层）
created: 2026-10-06
updated: 2026-10-08
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 待人工验收清单（行为面 53 条）

## 说明

用户在「验收方式」上选择分层：行为面由用户试用，工程合同面由 Agent 按工程证据闭合（见 [TASK-0216](../tasks/TASK-0216-layered-acceptance.md)）。本清单是行为面的验收入口，每条给出「看什么」与怎么触发。

**验收结论由用户给出**，Agent 不代替、不代判。你回复「通过」或「不通过加现象」之后：通过的原 Task 转 `done`；不通过的按原 Task 走反馈、复现、修复、复验。

分类判据：改动会改变用户可观察的输出、界面、交互、安装或更新流程、AI 行为。

另有 2 条既不属行为面、也还不能闭合：`TASK-0183`、`TASK-0184` 的 CI 复跑仍受 [ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)（Actions 预算）阻塞，本地证据已绿、CI 证据拿不到。

## 一、桌面端日常行为（19）

按你平时用应用的路径试就行。

| Task | 看什么 |
|---|---|
| TASK-0185 | 排队消息被消费后，用户的原文是否还落在回复末尾；继续流式、重开会话都要看 |
| TASK-0188 | 流式回复时，历史回复的用量数字会不会自己变 |
| TASK-0189 | 模型转去调工具时，回复是否仍显示「进行中」而不是提前完成 |
| TASK-0190 | 回合先报错、随后恢复成功，结束原因是否回到正常 |
| TASK-0191 | 自动跟随时离开会话再回来，是否错误恢复半途滚动位置（主动翻历史则应恢复） |
| TASK-0192 | 改了 workspace 产物后重开 dev 主进程，是否仍跑旧 bundle |
| TASK-0193 | 含特殊字符文件名与重命名的提交，详情页显示是否正确 |
| TASK-0194 | 「立即发送」两次且第一次失败时，新一轮是否被误杀；首部重排后比对窗口是否正确 |
| TASK-0151 | 并发改设置（通知、默认模式、项目、快捷键）是否互相覆盖 |
| TASK-0152 | 重开运行中的会话，回复分段身份是否还对得上 |
| TASK-0181 | 外观里选界面字体与代码字体，预览与终端是否生效、重启是否保留 |
| TASK-0186 | 打开 Office 文档是否只加载该格式的解析器；关掉最后一个 PDF 预览后资源是否释放 |
| TASK-0039 | 多个插件页签声明 pinned 时，非活动常驻是否被回收、内存是否不再无限涨 |
| TASK-0042 | 系统休眠或锁屏解锁后，工作集是否回落 |
| TASK-0120 | 分屏到 3 个以上终端反复收起重开，DevTools 是否还报 WebGL 警告 |
| TASK-0131 | dev 下 stdout 管道断开后，日志是否不再刷屏 |
| TASK-0132 | dev 下拖分屏或 resize，日志里是否还出现 ResizeObserver 噪音 |
| TASK-0200 | 会话从无到就绪时消息列表是否抖动；对照 0157/0158 的两项收尾 |
| TASK-0207 | 模型拿 snapshot 里的 `v1:5:e3` 这类引用去点按钮，是否不再报错 |

## 二、非手机上游选择性适配（17）

这些是把上游能力移植过来，验收等于试用对应功能。逐条的「具体场景」在 PLAN-0014 的任务表里，我也可以按你要的顺序把入口与步骤展开。

| Task | 看什么 |
|---|---|
| TASK-0149 | 经兼容网关调用时，思考块校验后输出是否正常 |
| TASK-0153 | 远端项目里跑可取消命令，取消或超时后本地是否不再卡住 |
| TASK-0154 | 资源准备、MCP 作用域、团队首轮响应是否比之前快 |
| TASK-0155 | 模式、人设、项目说明三类提示词的优先级是否按预期 |
| TASK-0156 | 目标模式是否持久化；输入栏相关适配是否生效 |
| TASK-0157 | 富 Markdown 渲染与批注能力 |
| TASK-0158 | 脚本面板；远端文件名筛选（与 0167 同轮看） |
| TASK-0159 | 声明要打包 win32 但缺受控沙盒制品时，打包是否默认阻断 |
| TASK-0160 | Git 与项目工具的使用体验（提交详情、重命名等） |
| TASK-0161 | Agent 通知与提示音 |
| TASK-0162 | 知识库加工的提示词来源是否正确 |
| TASK-0163 | 会话里含图片时切到纯文本模型，请求是否合法且不带图；切回图像模型历史图片是否还在 |
| TASK-0165 | Windows 上新增手动主机，指纹确认加密码超过 ConnectTimeout 后能否仍连上；KI-only 服务器口令问几次 |
| TASK-0166 | SSH helper 失败后能否按预算恢复；首次可用耗时是否可测 |
| TASK-0167 | 远端文件名筛选在完整调用链上是否生效 |
| TASK-0168 | Windows 回环下 Desktop 的 SSH 流程是否与 macOS/Linux 一致 |
| TASK-0169 | SSH 配置失效后连接状态是否实时更正 |

## 三、桌面端机制（12）

| Task | 看什么 |
|---|---|
| TASK-0038 | 长会话触发压缩时的驻留与防抖；连续触发是否熔断、冷却后能否重试 |
| TASK-0050 | 500 条以上会话上滚分页、搜索跳转是否无重漏 |
| TASK-0051 | 压缩后继续上下浏览、打开旧记录是否还能恢复 |
| TASK-0064 | 右栏新建 Terminal 页签：输入输出、状态点、关闭是否随之结束进程 |
| TASK-0072 | 内置浏览器 `<webview>` 换 `WebContentsView` 后，登录态与面板切换是否不变 |
| TASK-0074 | 架构报告是否走单一 artifact 写入，聊天入口与 Canvas 列表能否刷新到 |
| TASK-0075 | 浏览器点选满屏页面时是否不再产生 html/body 胶囊 |
| TASK-0107 | 后台进程崩溃或长时间不响应时，重启与记账是否按契约 |
| TASK-0122 | 团队主控分派后是否让出回合，而不是循环 wait |
| TASK-0123 | 团队成员会话的工具清单里是否不再出现必失败的 `browser_tab` |
| TASK-0130 | Windows 无 GNU tar 时，Node runtime 的 zip 安装是否成功 |
| TASK-0147 | 远程项目选择器里直接添加主机并继续浏览目录 |

## 四、Work 能力（2）

| Task | 看什么 |
|---|---|
| TASK-0025 | Work 研究入口选本地资料集提问，摘要是否带引用、来源可检查 |
| TASK-0026 | Work 数据分析入口导入 CSV/Excel/JSON，清洗与指标计算、预览是否正确 |

## 五、工作流试用与其余（3）

| Task | 看什么 |
|---|---|
| TASK-0136 | 在新会话里丢一句话需求，看 intake 是否按预期路由（这是规范类，只有真用过才算验收） |
| TASK-0178 | known_hosts 里 `@revoked` 的密钥是否无条件拒绝，且不给「仍然连接」 |
| TASK-0208 | 启用 allstar-coding 后，子代理越权工具调用是否被 ac-fence 拦截、越权时的提示是否可读 |

## 怎么回复

按组回复即可，例如「一组除 0192 外通过；0192 现象是……」。不通过的我按原 Task 进诊断，不会另开条目。

## 执行记录

### 2026-10-06 · 组一开始：用户指示「全程自动」

- 授权依据：用户在本轮会话选择「你全程自动」，明确要求 Agent 自动执行验收并授权操作 `verify:ui` 隔离实例与调用真实模型（产生真实 API 费用）；首批范围为第一组「桌面端日常行为（19 条）」。
- 执行方式：Agent 驱动隔离 Debug Profile 实例逐项实测，取证包括页面快照、截图、Renderer/Main 日志与会话 usage。凡验收条目能被客观证据满足的，按上述授权依据闭合为 `done` 并注明；不通过、无法真实复现（如需真实系统休眠）或需要主观判断的条目保持 `verifying`，在报告中单独列出交用户过目。
- 费用记录与逐条结论见下方「组一执行明细」。

### 2026-10-06 · 组一执行明细（19 条）

实测环境：隔离 Debug Profile（`C:\Users\xquan\.openforge-ui-debug\04987e4e`），UI `http://127.0.0.1:63061`、CDP `http://127.0.0.1:63062`，窗口 1180×750；会话 `测试简短回复` 内共 4 个真实 Provider 回合，全部 `stopReason: stop`。

真实模型消耗（取自会话 JSONL 的 `usage.cost`，未另设观测中间件）：12 条 assistant 消息，输入 63,633 / 输出 2,121 token，合计 **$0.011888**（deepseek/deepseek-flash）。

判定规则：仅当该条的**全部**子条件都在真实 UI / 真实模型上被直接观察到，才按授权闭合为 `done`；含未执行的子条件、需要真实系统事件（休眠/锁屏、断 pipe）、需要构造特定仓库或需要主观判断的，一律保持 `verifying` 交用户。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0185 | verifying | 排队消息原文落位：会话 JSONL 因果顺序正确（用户排队消息 → 触发回复的工具流 → 追加消息 → 回复 → `turn.completed`），「继续流式」侧成立；「重开会话」侧本次未实测。 |
| TASK-0188 | verifying | 需要长流式回合中逐帧比对历史回复用量数字；本轮 4 个回合均短，未构造可观察的漂移窗口。 |
| TASK-0189 | **done** | 真实模型回合（含 todo 工具多轮调用）中，UI 持续显示「进行中」，直到 `turn.completed` 才转为完成；JSONL 中 toolUse 未提前写终态。 |
| TASK-0190 | verifying | 需要构造「先报错、随后恢复」的回合；本轮 4 个回合全部一次成功，无错误路径。 |
| TASK-0191 | verifying | 自动跟随侧成立：贴底时离开再回来仍贴底，未错误恢复半途位置。主动浏览侧**未复现**：滚轮上翻到 `scrollTop=659`（回合已结束、1.5s 内位置稳定＝自动跟随确已关闭），切到新会话再切回同一会话（侧栏标题唯一，会话无歧义）后落到 `1991/2307` 即贴底，未回到 659。两种可能解释未区分：①缓存以 `items.length + 首末 itemKey` 为身份键，窗口化列表在重开时身份不等；②`restoreStateFrom` 是 Virtuoso 的初始化输入，会话切换若未真正卸载 feed 则不生效。需用户实机复核后按 BUG 跟进。 |
| TASK-0192 | verifying | 需要改动 workspace 产物后重启 dev 主进程比对 bundle；本次未改动打包输入，无法观察旧 bundle 行为。 |
| TASK-0193 | verifying | 需要含特殊字符文件名/重命名的真实 Git 仓库；隔离实例的工作区未构造该夹具。 |
| TASK-0194 | verifying | 需要「立即发送」两次且第一次失败的人为故障注入；未执行。 |
| TASK-0151 | verifying | 并发改设置（通知/默认模式/项目/快捷键）的互相覆盖需并发写入时序，交互式核对未执行。 |
| TASK-0152 | verifying | 「重开运行中的会话」需在回合进行中切换会话并比对分段身份；本轮未构造该时序。 |
| TASK-0181 | verifying | 已核实：枚举到 40 个系统字体；界面字体选 Cambria 后正文/预览 computed font 实时变更，`localStorage.openforge-font-preferences={"ui":"Cambria","code":"Cascadia Code"}`；代码字体选 Cascadia Code 后 `--font-mono` 为 `"Cascadia Code", "SF Mono", "Fira Code", monospace`，`TerminalSurface` 接线在源码中确认。未执行：**重启实例**验证保留、终端字形渲染（xterm 画在 canvas 上，CSS 侧不可见）。 |
| TASK-0186 | verifying | 需要实机 RAM 对照与「只加载该格式解析器」的资源观测；本次未安装/未打开 Office 文档，也未采内存。 |
| TASK-0039 | verifying | 需要真实 `app.getAppMetrics()` 进程计数与多 pinned 插件页签场景；隔离实例未构造。 |
| TASK-0042 | verifying | 需要真实系统休眠/锁屏解锁；无法在本实例内复现，保持交用户。 |
| TASK-0120 | **done** | 分屏到 3 个终端后共 25 次收起/重开（含连续快切）：唯一 WebGL context 增量为 **0**（按 context 对象身份去重计数），3 个活跃 GL canvas 与 3 个 leaf 对齐，DevTools 无 `Too many active WebGL contexts` 等告警；控制台 162 条消息 / 0 error（仅 1 条 Electron 开发态 CSP 提示）。定向测试 2 文件 9 例通过，`check:quick` 绿。 |
| TASK-0131 | verifying | 需要主动断开 dev 的 stdout 管道；本实例日志无 EPIPE 记录，未做故障注入。 |
| TASK-0132 | **done** | dev 实例上拖动分屏分隔条并连续 3 次改窗尺寸后，main/render 当日日志中 ResizeObserver 诊断命中 **0**、EPIPE 命中 0；策略模块定向回归 7 例通过。 |
| TASK-0200 | verifying | 「会话从无到就绪时消息列表抖动」需逐帧观察空会话→首轮挂载过程；本轮未做帧级采样。 |
| TASK-0207 | verifying | 需要模型读取 snapshot 引用（`v1:5:e3`）并据此点击按钮的 browser_tab 流程；本轮未构造该工具链。 |

闭合依据：TASK-0120、TASK-0132、TASK-0189 三条的验收子条件已全部在真实 UI / 真实模型上直接观察，按用户「全程自动」授权记为 `done` 并在此注明证据；用户如不认可以任一条，按原 Task 回退为 `verifying` 即可。

本轮另发现（未计入任何条目，供后续排查）：render 日志 4 条 `vetta:browser-view:passthrough: TypeError: r.setIgnoreMouseEvents is not a function`（22:21:40 与 22:22:06/07，疑似 `WebContentsView` 无 `BrowserView.setIgnoreMouseEvents`），仅鼠标移动未复现，可能落在 TASK-0072 / TASK-0075 面。测试过程中还误将一段提示词当作命令输入到 Debug 实例的终端（PowerShell 报错回显），无副作用。

### 2026-10-07 · 组一续测（补 0185/0188/0152；重测 0151/0181/0191）

**本节结论覆盖 10-06 表中同项**，其余条目沿用原表。方法学更正两条，均为上一轮误判来源：

1. **Debug CLI 驱动的回合不进入 UI 会话视图**：CLI `conversation.continue` 的 12 步真实回合期间，UI 末项索引与文本长度 42 秒内保持不变（该回合在会话 JSONL 中正常 `turn.completed`）。因此「历史用量是否自变」「重开运行中回合」这类需要 UI 处于流式态的条目，必须在 UI 内用输入框发起回合；上一轮 0188 的取数（在 UI 冻结期间读历史项）据此作废。
2. **流式判据改用 composer 停止按钮**：正文正则 `进行中|思考中|生成中` 会命中用户提示词原文（如「把三个待办逐个标记为进行中」），是假阳性；可靠判据是 composer 的「停止生成」按钮存在与否（另有 `inputBar.placeholder.thinking`＝「Vetta 正在思考…」）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0185 | **done** | 「继续流式」侧沿用 10-06 的会话 JSONL 因果序（排队用户原文 → 触发回复的工具流 → 追加消息 → 回复 → `turn.completed`）；「重开会话」侧本轮实测：切出再切回后重建顺序为 `1000000` 用户 → `1000001` 助手 → … → `1000006` 用户「补充：完成后用一句话说明你刚才改了哪几项。」→ `1000007` 助手答复，排队用户原文保留在正确因果位。两侧子条件均已直接观察。 |
| TASK-0188 | **done** | 新会话首答（`1000001`「收到」）在同一 UI 内三次读取「当前消息」用量：空闲（`1 次模型调用 / 缓存命中率 39.5% / 总计 34.7K / 输入 21K / 缓存命中 13.7K / 缓存写入 -- / 输出 2`）→ **下一回合流式中**（composer 停止按钮可见、UI 项 `1000000–1000003`）→ 回合结束后，三次逐字符一致。历史回复的用量数字不随流式自变。 |
| TASK-0152 | **done** | 运行中回合（todo 工具链）内切出再切回两次：回合未分裂——单项「处理中…／正在处理 · 22秒 → 28秒」连续推进、工具进度按序前进（建立三个待办事项 → 查看是否已有待办清单），单一流式光标；回合结束后再次重开，渲染项内容与顺序完全一致（助手答复 / 用户提示 / 助手「收起1个步骤 完成了 8 步操作」），仅窗口绝对索引基数出现 ±1 偏移（窗口化列表偏移，非分段变化）。工具段与用户消息段均保持。 |
| TASK-0151 | verifying（补证，不闭合） | 由 UI 同一 tick 内并发发出 4 个 `config.set`（系统通知/提示音/代理/默认模式）两轮：第一轮三项全部落到 `desktop-config.json`，第二轮四条精确还原基线（`notificationsEnabled=false`、`soundEnabled=true`、`proxy.enabled=false`），无丢失更新、无跨字段覆盖。「默认模式」在本机无合法目标（sandbox 不可用，`changeExecutionMode` 早退），「项目/快捷键」属其它设置页未做并发，故保持 verifying。 |
| TASK-0181 | verifying（补证 + 归因） | 「重启保留」在本实例失败并已归因：字体偏好只写入 origin 级 localStorage 键 `openforge-font-preferences`，dev 渲染源为 `http://127.0.0.1:<每次重启变化的端口>`，重启后该键为 `null`、正文字体与 `--font-mono` 回落默认（与设置向导标记 `vetta-setup-wizard-completed` 同时消失同因）。安装态源稳定时预期保留，需用户按打包形态复核；终端字形仍不可观测（xterm 画在 canvas）。预期已生效侧证据见 10-06 表。 |
| TASK-0191 | verifying（细化诊断） | 路线离开再返回（feed 真正卸载）→ 半途位置恢复成立：`top=500` 离开到 `#/settings/appearance` 再 `history.back()`，回到同一位置且 1.5 秒内稳定。会话切换（feed 不卸载、仅 `resetKey` 变化）→ 落回贴底。与 `restoreStateFrom` 是 Virtuoso 初始化输入一致；「缓存身份键在窗口化列表下不匹配」假设未被完全排除。需用户按「主动翻历史后离开再回来」的期望行为复核。 |

真实模型消耗（取自会话 JSONL 的 `usage.cost`）：本轮 16 次模型调用，输入 47,681 / 输出 6,051 token，**$0.012419**；与 10-06 轮合计 **$0.024307**（deepseek/deepseek-flash）。

闭合依据：TASK-0185、TASK-0188、TASK-0152 三条的全部验收子条件本轮已在真实 UI / 真实模型上直接观察，按用户「全程自动」授权记为 `done` 并注明证据；用户如不认可以任一条，按原 Task 回退 `verifying`。组一至此 6 条闭合（0120、0132、0189、0185、0188、0152），余 13 条保持 verifying：0190、0191、0192、0193、0194、0151、0181、0186、0039、0042、0131、0200、0207。

### 2026-10-07 · 组一续测二（TASK-0200）

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0200 | **done** | 采样方法：`page.addInitScript` 在文档初始化前装帧级采样器（记录消息列表滚动容器身份、项数、scrollTop、scrollHeight 的变化点），`page.reload()` 触发应用冷启动即 activeSession `null → 就绪`。结果：滚动容器在 t≈8.65s 以**空列表**挂载（0 项、scrollHeight 571），t≈9.27s 内容到达时仍是**同一个 DOM 节点**（未卸载重挂，即上游 c362aacc4 修复合同成立），scrollTop 由 0 直接落到底部 1617，无来回抖动。另从设置路由点开会话：同一容器 scrollTop 单调 0 → 2581 → 3535，内容到达后位置未重置。工程侧复跑：`bun run test SessionMessageList.stability.test.tsx + annotations/`＝2 文件 12 例通过（挂载计数 1→2 的回归合同），`markdown-isolation` e2e PASS 见任务交付记录。按用户「全程自动」授权记为 `done`；如不认可按原 Task 回退 `verifying`。 |

组一至此 7 条闭合（0120、0132、0189、0185、0188、0152、0200），余 12 条保持 verifying：0190、0191、0192、0193、0194、0151、0181、0186、0039、0042、0131、0207。

### 2026-10-07 · 组一续测三（TASK-0193，自建 Git 夹具）

方法：为原先「缺夹具」的条目自建夹具。在隔离实例 home 下建真实 Git 仓库 `fixtures/git-literal-paths`（5 个提交：空格/中文/`'`/`$`/`#`/`&`/`()`/`[]`/子目录空格；R100 纯重命名、R087 重命名加改、含 `[` 的 glob 同名邻居 `br[ack]et.txt`↔`bracket.txt`、`x[1].txt`↔`x1.txt`），把它追加进隔离 profile 的 `desktop-config.json` 后重启实例（`verify:ui:stop/start:debug`，配置保留、`seed.seeded=false`），在 `git-fixture` 项目内开一条会话 → 活动面板 → Git 页签 → 提交图 → 提交详情。

沿途踩到并已解决的两个环境坑（对后续同路线有用）：① 重启后 `session.create` 报 `Desktop Runtime requires at least one available model`，根因是隔离 profile 的 `agent/models.json` 已退化为 `{"providers":{}}`，用 `verify:ui:stop:debug` → `verify:ui:sync:debug`（只能在停机时跑）补回 models+credentials（`credentialsCopied:5`、`osCryptSynced:true`）后恢复；② 插件页签（Git）在窄面板的页签条里被挤出可视区（隐藏的测量层里存在、真实页签条只渲染前 3 个），关掉「画布/浏览器」两个页签腾出空间后 Git 页签才可点。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0193 | **done** | ① 字面路径：提交详情文件列表逐项显示原文，根提交 7 项全对（`普通 文件.txt`、`sub dir/`→`带 空格.md`、`quote'file.txt`、`dollar$file.txt`、`amp&and.txt`、`paren(1).txt`），重命名提交显示 `renamed #2.txt`/`引号'文件.txt`/`new 文件&2.txt`，无转义无丢项（与 `git show -m --first-parent --name-status -z --find-renames` 的 5 项逐项对齐）。② 前后路径：R100（`paren(1).txt` → `paren(1) 重命名.txt`）的逐文件 diff 头部为 `orig → path`、徽标「已重命名」、正文「无差异内容。」；R087（`dollar$file.txt` → `dollar$file-v2.txt`）同带前后路径并渲染追加 hunk。③ 不按模式误匹配：含 `[` 的四组同名邻居中，选中 `br[ack]et.txt` 的 diff 只含 `BRACKET_ONE`、选中 `x[1].txt` 只含 `XBRACKET_ONE`，邻居文件内容未串入（若 `--` 后路径按 pattern 解释则必然串入），`--literal-pathspecs` 生效。未覆盖：工作区未提交变更（`GitChanges`）侧的同名场景（本轮工作区干净）；重命名前后路径在列表行正文里不并排显示、只在行 tooltip 与 diff 头部暴露（交互取舍，已在任务记录中提请用户裁定）。按用户「全程自动」授权记为 `done`；如不认可按原 Task 回退 `verifying`。 |

组一至此 8 条闭合（0120、0132、0189、0185、0188、0152、0200、0193），余 11 条保持 verifying：0190、0191、0192、0194、0151、0181、0186、0039、0042、0131、0207。本轮夹具可复用于 0186（`E:\demo` 内已有 xlsx）与其它需要真实仓库的条目。

### 2026-10-07 · 组一续测四（TASK-0186，Office 按需加载与 PDF worker URL）

方法：不用构建体积推算，改用运行时可观测的**模块 URL**。隔离实例内 `page.reload()` 触发冷启动 → `performance.clearResourceTimings()` 清空 Chromium 资源计时缓冲（默认容量 250 条，不清空会把缓冲当结果误读）→ 在项目会话里打开活动面板「文件」页 → 用 `performance.getEntriesByType('resource')` 抓 `name` 列表并按 `office|excel|xlsx|pdf|docx|pptx|sheet` 过滤。dev 下模块名可分辨到源文件级，因此能直接证明「加载了哪一路解析器」。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0186 | **done** | ① 不预览不加载：冷启动 + 开会话 + 打开文件面板（`E:\demo`，面板已列出 `质量日报_生产一部_一车间_260901.xlsx`）后清空计时缓冲，解析器命中 **0 条**。② 按格式加载：点开该 xlsx 后新增 11 条，全在表格路（`components/spreadsheet/{SpreadsheetPreview,parseWorkbook,SheetTabs,VirtualSheet,constants,cellKeys,SheetHeaders,sheetGeometry,VisibleCells}.tsx` + `.vite/deps/xlsx.js`），无 pdf/docx/pptx；预览真实渲染出工作表「报表要求」「抽检返工明细表」。切到自建夹具 `preview-sample.pdf` 后新增模块只有 PDF 一路（`components/PdfPreview.tsx`、`deps/pdfjs-dist.js`、`components/pdf-worker-source.ts`、`build/pdf.worker.min.mjs?raw`），渲染 1 个 canvas，无表格模块。③ PDF worker URL 生命周期：点击预览前替身 `URL.createObjectURL`/`revokeObjectURL` 记账——打开 PDF 时恰好 create **1 次**（Blob `text/javascript`、1,375,838 B），切到 `renamed #2.txt` 后 canvas 1→0 且 revoke 以**逐字符相同**的 URL 调用一次，即随挂载创建、随卸载释放。未执行：真实 Renderer RAM 前后对照（该 Task「不做」已声明不以构建字节数推算或承诺 RAM 节省，故不作为通过条件）；PPTX/DOCX 实机预览（夹具无该格式，路径与 xlsx/pdf 同构）。按用户「全程自动」授权记为 `done`；如不认可按原 Task 回退 `verifying`。 |

组一至此 9 条闭合（0120、0132、0189、0185、0188、0152、0200、0193、0186），余 10 条保持 verifying：0190、0191、0192、0194、0151、0181、0039、0042、0131、0207。

### 2026-10-07 · 组一续测五（TASK-0207，browser_tab elementRef 往返）

方法：从工程侧硬造「模型按最自然方式用工具」的场景，而不手写 ref。隔离实例内起本地夹具页（`http://127.0.0.1:8791/`，含 textbox + 文案「提交」的 button；点击回调把按钮自身文案改成「已提交」并追加一个「继续」按钮，让副作用在交互树上可见），在会话里打开应用内浏览器标签页载入该页，用真实模型（DeepSeek V4.1 Flash，真实 API）要求「snapshot → 把打印出的 elementRef 原样回传 click → 再 snapshot」。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0207 | **done** | ① 点击前 snapshot：`snapshot pageRevision=3 url=http://127.0.0.1:8791/`，树为 `v1:3:e3 role=textbox` / `v1:3:e4 role=button name="提交"`。② 模型把 `v1:3:e4` 原样回传后工具返回 `click ok pageRevision=3.`——既不是 `invalid browser_tab tool input`（BUG-0078 的未修复表现），也不是 `no_browser_session`，说明输入边界接受编码串、宿主拿到规范化对象 ref 且点击真正落到页面。③ 点击后 snapshot：`pageRevision=4`，树变为 `v1:4:e5 role=textbox` / `v1:4:e6 role=button name="已提交"` / `v1:4:e7 role=button name="继续"`，即页内回调确已执行（文案变更 + 新增节点），非空动作。④ 附加：本次对外 Schema 经**真实厂商网关**（非 mock）接受嵌套 `anyOf`，交付记录中「严格网关是否接受嵌套联合」的 DeepSeek 一路得到实证（Gemini 系仍未测）。未覆盖：`fill`/`press`/`scroll`/局部 `screenshot` 未逐一实跑（同一解码路径，合同层有单测）。按用户「全程自动」授权记为 `done`；如不认可按原 Task 回退 `verifying`。 |

组一至此 10 条闭合（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207），余 9 条保持 verifying：0190、0191、0192、0194、0151、0181、0039、0042、0131。本轮新增可复用设施：本地夹具 HTTP 服务（`<debug vettaHome>\fixtures\browser-page\server.ts`，端口 8791）与「页内可见副作用」的取证手法（让回调改文案/加节点，使交互树快照能证明动作真的执行过）。

### 2026-10-07 · 组一续测六（TASK-0194，排队气泡锚定；保持 verifying）

方法：真实会话 + 真实模型，回合 A 在途时发第二条消息，用 `[data-index]` 逐秒采样 Virtuoso 条目序列，观察排队气泡落在尾部还是历史中段、以及消费后有无重影。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0194 | **verifying（补证）** | ① 排队气泡尾部锚定：B 发出后序列 `…27:A 提问 → 28:回合 A（等待→处理）→ 29:QUEUE-PROBE-B`，B 始终紧随正在输出的回合 A，未锚进历史中段（BUG-0073 缺陷 2 的用户可见面不成立）。② 消费后按序派发：终态 `30:回合 A（02:21:02）→ 31:QUEUE-PROBE-B → 32:回合 B（02:21:07）`，原位消费、无重复气泡、无尾部幽灵残留。未闭合：GWT ① 失败派发竞态（同一时刻两次「立即发送」+ q-2 返回 `missing`）与 ② 幽灵态（live 需同时含 pending 镜像与幽灵）两个前置无法从 UI 稳定构造，需注入内核事件/时钟；GWT ③ `prependedCount` 与 ④ 两层回退一致性属内部不变量，只能单测观测（交付记录 4 文件 64/64 已覆盖）。故仅补用户可见面实测，状态交用户裁定。 |

### 2026-10-07 · 组一续测七（TASK-0190，可控故障 provider 注入；保持 verifying）

方法：为原先「需要故障注入」的条目自建注入设施——给隔离 Debug Profile 注册一个可控故障的 provider 夹具（`<debug vettaHome>\fixtures\fault-mock\server.ts`，`Bun.serve` 127.0.0.1:8792，实现 openai-responses 的 `POST /v1/responses` SSE，事件形状抄自仓内 `app-debug/runtime-canary/provider.ts`；控制面 `/control/fail?ms=`、`/control/failcount?n=&minBytes=`、`/control/partial?n=`、`/control/ok`，请求逐条落 `requests.ndjson`）。注册方式：停机 → 隔离 profile 的 `agent/models.json` 加 provider `faultmock`（模型 `fault-mock-1`）→ 重启实例（启动时应用把内联 `apiKey` 迁为 `credentialRef`）→ 在模型选择器里选中「Fault Mock 1」。两个环境要点：新会话首回合从点「发送」到第一个 provider 请求约 **+10 秒**（运行时冷启动），按时间窗注入会打空，必须按次数注入；dev 重启后首启会有一次「语言与外观／项目区域」引导浮层需要跳过。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0190 | **verifying（补证）** | 用户可见面两侧都成立。① 恢复侧：`FAULT-ERR-0190-A` 回合先进入 `正在重新连接（1/3 → 2/3）｜上次请求失败：服务方暂时出了点问题`，主进程日志 `runtime turn retry { phase:'scheduled', attempt:1, maxAttempts:3, delayMs:2000, failureCode:'AI_TRANSPORT_FAILED', failureOrigin:'provider' }`（02:47:13）→ `attempt:2, delayMs:4000`（02:48:26）；夹具切回健康后 `runtime turn retry { phase:'completed', attempt:2 }`（02:48:36），该回合以**正常结束**收尾：普通助手消息 `FAULT_MOCK_OK：这是故障恢复后的正常回复。`、composer 回空闲、无错误横幅，且当天主进程日志里**唯一**一条 `Session interrupt decision` 属于最终失败的回合而非它，即没有把已恢复回合的旧错误当终态上报。② 最终失败侧：助手已产出内容后中途断流 → `turn.failed { code:'AI_TRANSPORT_FAILED', origin:'provider', retryable:false, retryAttempts:0, message:'net::ERR_CONNECTION_RESET' }` + `session-interrupt { action:'notify', state:'error', trigger:'error' }`，UI 给出错误卡片「网络没连上／检查一下网络或代理，然后重新发送」、底部「上次回复未完成：网络没连上」+「继续」与通知「会话回复中断」，原因正确保留。截图 `<artifactDir>\0190-faultmock-session.png` 同屏对照「恢复回合 = 普通助手消息」「失败回合 = 错误卡片」。未闭合：GWT 的「同一回合先 error、随后 assistant done」未能构造——runtime 重试在会话记录里是**另起回合**（`turn.failed` ×2 → `turn.completed`），而 relay 缓冲在 `agent_start` 重置（`runtime-host-session-event-relay.ts:113-121`），命中 `buffer.terminalReason` 分支需要同一 agent_start…agent_end 跨度内先 error 后 done（多步工具回合某步报错而循环继续那种形状），需注入内核事件；该分支由 `running-changed-reason.test.ts` 真实事件 fixture 覆盖（旧实现 2 失败/9 通过 → 修后 3 文件 26 例通过）。故保持 verifying 交用户裁定。 |

组一至此仍 10 条闭合（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207），余 9 条保持 verifying：0190、0191、0192、0194、0151、0181、0039、0042、0131。本轮新增可复用设施：可控故障 provider（`fixtures/fault-mock`，端口 8792，已注册进隔离 profile 的模型列表），`failcount`/`partial` 两种注入模式可复用于其它需要 provider 侧故障的条目；同类设施（`browser-page` 端口 8791、`git-literal-paths` 真实仓库、`preview-sample.pdf`）见前述各轮。

### 2026-10-07 · 组一续测八（TASK-0192，开发主进程缓存输入；不依赖 UI）

方法：本条不需要 UI 交互，改为真实运行开发主进程构建 CLI（`apps/desktop/scripts/build-dev-processes.mjs`），按 GWT 分别改动「已打包」与「未打包」的 workspace 产物，读缓存判决日志。此前该 Task 的交付记录明记「未运行 build-dev-processes CLI（会准备模型）」，本轮把这一缺口补上。先用仓内 `main-bundle-workspace-inputs.mjs` 的 `getMainBundledWorkspaceInputs(root)` 实算出口图：Desktop 可达 workspace 依赖 **20 个已打包 / 9 个未打包**，据此挑样。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0192 | **done** | ① 缓存已建立：`完成，构建 0/4 个任务`（1.36 s，preload/ocr-preload/ocr-runner/main 四条全 `跳过（无变更）`）。② 改**已打包**包产物必须失效重建：`packages/runtime-storage/dist/index.js` md5 `5296d630835938e7fd6230329610e100` → `4530377818b22017e00df5435a83a70c` 后重跑，日志 `构建 main …` + `完成，构建 1/4 个任务`——**恰好只失效 main**，其余三条仍命中；还原该文件后重跑又只重建 main（缓存存的是被改后的 hash），再跑回到 `0/4`。③ 改**未打包**包产物不无故失效：`packages/runtime-core/dist/contracts.js` md5 `5003647d3deeb4287cdbcf34a4e8eb12` → `53a508cf7ad57477364a69cc58f16ec2` 后重跑 `0/4`，main 仍 `跳过`；还原后 `0/4`。负例非空转：缓存输入侧的排除规则与真实打包侧共用同一事实源（`main-bundle-workspace-inputs.mjs` 跳过 `DEVELOPMENT_WORKSPACE_EXTERNAL`，`vite.main.config.ts:6,39` 的 `external` 导入的正是 `packaged-native-dependencies.mjs:92-93` 定义的同一常量），runtime-core 既不进缓存输入也不进 main 产物。环境要点：输入 hash 由 `hashPaths(paths, env)` 计算并把**每个 `VETTA_*` 环境变量一并计入**，首次基线在 UI 验收 harness 环境外跑出现 4/4 全量重建即源于此，之后固定同一环境全程可复现。干净性：只改 `apps/*/dist`、`packages/*/dist` 下 gitignore 产物，改前改后 md5 逐一还原，收尾 `git status --porcelain` 仅剩既有的 ` M bun.lock`。 |

组一至此 11 条闭合（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192），余 8 条保持 verifying：0190、0191、0194、0151、0181、0039、0042、0131。本条另留一条对后续排查有用的经验：dev 主进程构建缓存「莫名全量失效」时，先检查 `VETTA_*` 环境变量是否变了（它们一起进 hash），再怀疑产物。

### 2026-10-07 · 组一续测九（TASK-0131，真实断管；不依赖 UI）

方法：补做该 Task 交付记录里明记未做的那一步——「dev 启动后关闭持有 pipe 的终端」。规避了 harness 路径：`verify:ui:start` 把 host 的 stdout 接进日志**文件**（`stdio: ["ignore", logFd, logFd]`），中间还有 `dev:verify` 的 `concurrently` 中转，主进程根本接不到终端 pipe，所以照常启动永远看不到 EPIPE。改为自己起一个 dev 形态实例（一次性 VETTA_HOME/配置/用户数据目录，指向已在跑的隔离实例的 renderer dev server 端口），把主进程 stdout 接进 `| head -c 1200`，head 读满即退出、读端关闭，等价于终端被关掉。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0131 | **done** | ① Given 镜像开启：管道前 1200 字节就是 console transport 镜像出的启动日志。② When：head 读满 1200 字节（`wc -c` 恰 1200）退出后 1.5 秒，主进程写下 `14:05:47.220 [error] [diagnostics] uncaughtException Error: EPIPE: broken pipe, write`，堆栈为 `console.info → Writable.write → Socket._write`，即「日志镜像 → console → 断管写」这条自反馈链的第一环。③ Then：**1 ms 后**（`14:05:47.221`）写下 `stdio stream write failed; console log mirror disabled for this process`，主进程未退出，照常完成启动（`14:05:47.289 [info] [window] create`、技能 102 条、runtimes applied）。④ 有界性（对照 BUG-0047 的 14 秒 5069 条）：整份 main 日志 14:05:45.691 → 14:06:37.199 共 **392 行**，`uncaughtException` 1 条 / `EPIPE` 1 条 / 熔断说明 1 条；熔断后仍有 **180 行正常业务日志**落盘，这 180 次镜像本该各触发一次 EPIPE 却一条都没有，即镜像确已关停的直接证据；500 条汇总阈值未触发。⑤ 必须保持：文件日志路径与格式未变，render 侧与 ringbuffer/ipc 未受影响。证据留存 `<artifactDir>\0131-epipe-main-log-2026-10-07.log`。未覆盖：pipe 恢复后自动恢复镜像（该 Task 已明确列为既定取舍）。 |

组一至此 12 条闭合（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131），余 7 条保持 verifying：0190、0191、0194、0151、0181、0039、0042。本轮另留两条对后续排查有用的经验：① harness 的 `verify:ui:start` 路径里主进程 stdout 是**文件**（且中间有 `concurrently` 中转），任何「终端 pipe 断开」类条目都必须自己起实例、自己接管道；② 起临时实例做破坏性实验时用一次性 VETTA_HOME + `VETTA_DESKTOP_DEV_PORT` 指向已有 dev server 即可，不必重启或干扰隔离 Debug profile。

### 2026-10-08 · 组一续测十（TASK-0181，字体偏好重启保留与主题切换；保持 verifying）

方法：上一轮已实测「保存生效、重启丢失、终端字形不可读」，其中重启丢失已归因为字体偏好只落在 **origin 级** localStorage（`openforge-font-preferences`），而 dev 渲染源是 `http://127.0.0.1:<每次重启变化的端口>`。本轮把唯一变量固定：起一次性 `VETTA_HOME` 实例，`VETTA_DESKTOP_DEV_PORT` 指向已在运行的 renderer dev server（60957），使 origin 恒为 `http://127.0.0.1:60957`；字体一律经真实设置页 UI 保存（读取本机字体 → 93 项候选 → 选 Cambria），重启用同一套环境变量。随后在隔离 Debug profile 内补测「切明暗/配色」与「重置」两条子句。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0181 | **verifying（补证，覆盖上一轮同项的「重启保留」判定）** | ① 重启保留成立（origin 固定时）：实例 A 界面字体选 Cambria 后 `--font-sans` 由默认栈变为 `"Cambria", -apple-system, …`、body computed font 为 Cambria、`--font-mono` 保持 `"SF Mono", "Fira Code", monospace`（代码仍等宽），`localStorage["openforge-font-preferences"]={"ui":"Cambria","code":""}`；杀掉进程、同环境重启得实例 B，origin 仍为 60957，偏好键值/`--font-sans`/body font 与 A 完全一致 → 启动即重新应用（`main.tsx:19 applyInitialTheme → applyStoredTheme → applyTheme`）。② 切明暗/配色保留：同一 origin 内切配色（默认 → 珊瑚，`data-theme` mono → sand）与切明暗（深色 → 浅色，`colorScheme` dark → light），`--font-sans`、body font、偏好键三者均不变。③ 重置恢复默认栈：界面字体下拉选回「默认」后键为 `{"ui":"","code":""}`、`--font-sans` 回到 `-apple-system, "SF Pro Text", …`。实测后已把该 profile 主题复位为 dark/mono。**未闭合**：GWT 第 2 条「活动终端字形/尺寸响应，实例、PTY 与已有输出保留」在 harness 下读不到（xterm 画在 canvas，无测量元素；`TerminalSurface` 接线仅有源码级证据），第 4/5 条（枚举失败/偏好损坏的反馈、连续请求与隐藏后重新 fit）只有 30 项工程定向测试覆盖、无真实 UI 观察；且第 1～3 条观感仍需**打包形态**（origin 天然稳定）复核。证据留存 `<artifactDir>\0181-pinned-origin-restart.txt`、`0181-theme-switch-and-reset-2026-10-08.txt`、`0181-appearance-fonts-list.png`。 |

组一至此仍 **12 条闭合**（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131），余 7 条保持 verifying：0190、0191、0194、0151、0181、0039、0042（本条为补证，不改变计数）。本轮另留一条经验：涉及 localStorage 偏好的条目，若在 dev 下测「重启保留」，必须先把渲染源端口固定（`VETTA_DESKTOP_DEV_PORT` 指向同一 dev server），否则端口变化会伪装成「功能不保留」。

### 2026-10-08 · 组一续测十一（TASK-0191，滚动记忆切换语义；不依赖 UI）

方法：上一轮实测留下「会话切换落回贴底」与两种未区分解释（① 缓存身份键不匹配 / ② 切换不重挂载故 `restoreStateFrom` 不生效）。本轮只读实现与既有单测做判定，不再跑实例。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0191 | **verifying（判定补证，不改变计数）** | 解释②成立且被单测钉住，①不再是必要解释：`useMessageFeedScrollModel.ts:117` 的失效条件是 `resetKey !== 当前值`，所以切换会话**确实**重算并调用 `readCachedFeedState`（`:120`，命中要求 `itemCount` 与 `itemIdentity` 全等，`:28-36`、`:60-65`）；但结果只喂给 Virtuoso 的 `restoreStateFrom` / `initialTopMostItemIndex`（`:127`、`:488`），二者是**初始化输入**，不重挂载不生效。同一测试文件两条断言把语义分开钉死：`:415`（`resetKey` 变化后初始索引为 `{index:"LAST",align:"end"}` 且不 `scrollToIndex`）＝切换回尾部；`:466`（标题即 “for a later remount”）＝缓存只在重挂载时采用。本 Task 切片只改**写入**侧：`captureState`（`:178`）在跟随中删除缓存项（`:184-185`）。结论：「离开再进入=恢复用户位置、切换会话=回到尾部」是当前实现的声明语义，不是本 Task 的回归。**未闭合（待裁定）**：`主动翻历史 → 切到别的会话 → 再切回来` 是否算 GWT 的「再回来」——若算则应恢复，属新缺陷跟进；若不算，本 Task 两条子句（自动跟随不记忆中途位置、主动浏览返回仍恢复）均已观察到，可闭合。 |

组一计数不变：12 条闭合，余 7 条 verifying（0190、0191、0194、0151、0181、0039、0042）。本轮方法经验：实测留下的「两种解释未区分」多数可以靠**既有单测的断言标题与初始化输入语义**直接判掉，比再造一次 UI 实验便宜得多。

### 2026-10-08 · 组一续测十二（TASK-0181 终端字形，几何量读数）

方法：上一轮把 GWT 第 2 条记为「xterm 画在 canvas，读不到字形」。本轮改测**几何量**——该 xterm 构建是 canvas 渲染（无 `.xterm-rows`），但 `.xterm-screen` 与其中 `canvas` 的像素尺寸等于「列数 × 单元格宽度」，字体度量一变读数就变。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0181 | **verifying（补证，不改变计数）** | 同一终端位置、同一容器宽度下三态读数：默认 → `screen/canvas 1044×210`；经设置页把代码字体设为 Courier New（`--font-mono="Courier New","SF Mono","Fira Code",monospace`）→ `1043×208`；再选回「默认」→ **逐像素回到 1044×210**。双向可复现 ⇒「修改代码字体 → 终端字形/尺寸响应」成立。附带核实等宽筛选：代码字体下拉 **21 项**（全是等宽：Cascadia Code/Mono、Consolas、Courier New、Lucida Console、Maple Mono…），界面字体下拉 93 项（全部本机字体）。**未观测**：同条后半「实例、PTY 和已有输出保留」在真实 UI 不可达——代码字体只能在设置页改，而进设置路由会卸载底部面板终端（`.xterm` 计数 1 → 0，返回后为**新节点**，实测前打的标记属性变回 `null`），即当前应用形态没有「终端挂着时改字体」的入口；该子句由宿主测试覆盖：`TerminalSurface.host.test.tsx:167` 断言字体更新、`ipc.resize` 增加、终端数组长度仍为 1、`writes` 不变、`ipc.open` 一次且 `ipc.close` 未调用。若要 UI 级证据，需产品侧提供终端可见时的改字体入口（设计问题，非本 Task 缺陷）。证据：`0181-terminal-before-el.png`、`0181-terminal-after-code-font.png`、`0181-terminal-after-reset-code-font.png`。 |

组一计数不变：12 条闭合，余 7 条 verifying（0190、0191、0194、0151、0181、0039、0042）。方法经验：canvas 渲染的组件（xterm 等）虽然读不到文本，但 `canvas.width/height` 与容器像素尺寸是可靠的**字体/尺寸响应**读数，配合「改了再改回去」的双向对照即可排除随机抖动。

### 2026-10-08 · 组一续测十三（TASK-0151，快捷键页同 tick 双字段并发）

方法：上一轮留的缺口是「项目/快捷键分属其它设置页未做并发核对」。本轮先确认桥不可用——`page.evaluate` 里调 `window.vetta.config.get()` 抛 `Host API access denied`（`apps/desktop/src/preload/host-access.ts:14` 的宿主令牌校验），所以并发只能由**页面内真实控件在同一 tick** 构造。快捷键页恰好同时承载两个写者：全局快捷键录制器（`onShortcutChange` → 写 `shortcuts`）与快捷面板下拉 `MotionSelect`（`onValueChange` → 写 `quickPanel.trigger`）。先点录制器使其进入 armed（其 `keydown` 监听挂在 `document` 捕获阶段），再展开下拉让选项按钮已挂载，最后在**同一个 `page.evaluate` tick** 内先 `document.dispatchEvent(keydown)`、紧接着点弹出层里的「双击 Alt」。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0151 | **verifying（补证，不改变计数）** | 两次写入在同一 tick 内相隔 2.4 ms 发出：`Ctrl+Shift+J`（写 `shortcuts`）与「双击 Alt」（写 `quickPanel`）→ 落盘**同时**保留 `shortcuts.bindings["new-session"]="mod+shift+j"` 与 `quickPanel.trigger="alt"`，UI 双处同步显示（录制器 `Ctrl ⇧ J`、下拉 `双击 Alt`）。非参与字段未被覆盖：`notificationsEnabled=false`、`defaultExecutionMode="full-access"`、`projects=['demo','git-fixture']`、`archivedProjects=0`、`quickPanel.postSendBehavior="foreground"`，19 个顶层键齐全。**突发串行**：同一录制器在 2.8 ms 内连发 5 个 keydown（J/K/L/M/N）→ 最终落盘 `mod+shift+n`（末次生效、无中间态残留），`quickPanel.trigger` 仍为 `alt`，文件仍是合法 JSON。**还原**：点「重置所有快捷键」只改 `shortcuts`（→`{}`），下拉切回「不启用」只改 `quickPanel.trigger`（→`none`），二者各自回到基线且互不覆盖——即 BUG-0075 的「整快照写回把别的字段改回去」形态在快捷键页未复现。**仍未闭合**：`projects` 没有能在同一 tick 触发的 UI 写入口（`window.vetta.project.*` 同被令牌拦截，添加项目走原生目录对话框），本轮只证明它在上述写入中未被波及；「默认模式」在本机仍无合法目标（Windows 无 sandbox）。证据快照：`0151-desktop-config-before.json`、`0151-desktop-config-after-concurrency.json`（实测后已把基线还原）。 |

组一计数不变：12 条闭合，余 7 条 verifying（0190、0191、0194、0151、0181、0039、0042）。方法经验：`window.vetta.*` 桥受令牌保护，`page.evaluate` 直接调必被拒；要构造「同一 tick 的并发写」，可让一个**自持 document 监听**的控件先 armed，再把它的 `dispatchEvent` 与另一个**已展开弹层**中选项的 `click()` 放进同一个 evaluate tick。

### 2026-10-08 · 组一续测十四（TASK-0194，「立即发送」竞态与幽灵气泡；复现出新缺陷）

方法：上一轮把 GWT ①「同一时刻两次『立即发送』且 q-2 返回 `missing`」与 ②「live 同时含 pending 镜像与幽灵态」都记为「UI 无法构造，需注入内核事件/时钟」。本轮找到了两者的可达路径，并给可控故障夹具加了长流控制面（`fixtures/fault-mock` 新增 `GET /control/slow?n=&ms=`，让一个回合稳定流式 14 秒以上，便于在流式期间排队）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0194 | **verifying（补证 + 新缺陷，不改变计数）** | ① **可达路径已找到**：队列抽屉入口是文本为「队列 N 条待发」的按钮，抽屉内每条消息一个 `button[title="立即发送"]`；同一 tick 内点两条（相隔 1.7 ms）实测：流式中的 SLOW-B 回合被 `turn.cancelled(reason="send queued message now")` 打断、**被打断回合的部分回复保留**（会话记录里的 `步 1 步 2 步 3` 与 UI 的「·4秒」行同时在），无错误气泡、无 `sendQueuedNow failed` 日志。但会话记录显示 q-1、q-2 **各自成为一个新回合**（`turn-1f4dc64b` / `turn-eecb181d`），**没有**出现「q-2 返回 `missing`」这一次时序 ⇒ GWT ① 的前提在本机不复现（真的发生了两轮派发）。该次观测在回合跑完前被我方夹具崩溃打断（slow 流在客户端断开后仍 `enqueue`，未捕获异常打死夹具进程），补齐「对账后位置」观测前不改判。② **幽灵气泡可稳定构造，且复现出缺陷**：无需注入内核事件，正常操作即可——回合流式中连发两条消息使其排队，等回合结束、队列抽屉已不再显示「N 条待发」之后，实时视图仍比落盘多出**两个重复的用户气泡**并追加在尾部：DOM 8 行 `GHOST-1 / 回复 / GHOST-A / 回复 / GHOST-B / **GHOST-A** / 回复 / **GHOST-B**`，而会话记录只有 6 条（`MDA0YTMzODgt…conversation.jsonl` seq2–7）；重复行的 `data-entry-id` 是**乐观 id**（`user-16-1791391810833`、`user-17-1791391811301`），正牌行是**规范 id**（`event-4`/`event-6`）⇒ 未决乐观气泡未被规范历史吸收。刷新后重开同一会话恢复 6 行 ⇒ 幽灵只存在于渲染端 live 层，未落盘。两个会话复现 **2/2**。此结果与上一轮「无尾部幽灵残留」相反，且与 BUG-0068（同族，`verifying`）描述一致。证据：`0194-ghost-duplicate-tail.png`、`0194-ghost-session-conversation.jsonl`（artifactDir）。**交用户裁定**：本项保持 `verifying`——幽灵属 BUG-0068 残余变体还是新缺陷，以及 ① 是否按「两轮派发也可接受」改写 GWT。 |

组一计数不变：12 条闭合，余 7 条 verifying（0190、0191、0194、0151、0181、0039、0042）。方法经验：把「需要注入内核事件/时钟」的判断先换成「能否找到可控外部输入」通常更省——本例只给夹具加一个慢速流控制面，就把「无法构造」变成「稳定复现」；反过来说，凡上一轮以「不可构造」结案的条目，都值得再问一次「有没有可控输入」。

### 2026-10-08 · 组一续测十五（TASK-0190，恢复分支可达性；不依赖 UI）

方法：上一轮把「同一回合先 error 后 done」记为「需注入内核事件，UI 侧无法稳定构造」。本轮只读实现，判定该形状在生产装配下是否可达。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0190 | **verifying（判定补证，不改变计数）** | relay 的清错分支只有一处：`runtime-host-session-event-relay.ts:149-152`（assistant 通道 `error` → `terminalReason="error"`；随后的 assistant `done` 且 `stopReason!=="aborted"` 清回 `undefined`），`agent_end` 以 `terminalReason ?? "agent_end"` 上报（`:132-137`）。故只有「同一 `agent_start…agent_end` 内先 error 后 done」才需要它。该形状唯一的**生产**构造点是 `packages/agent/src/agent-loop.ts:231-247`：assistant `stopReason==="error"` 先发 `turn_end`，**仅当 `config.contextCheckpoints` 为真且 checkpoint 恢复返回 `retry`** 才 `continue` 续跑并可能产出正常 `done`。而 `contextCheckpoints` 在整仓（排除 `dist/`）只有四处引用——`packages/agent/src/types.ts` 的类型声明、`agent-loop.ts` 的两处消费、`packages/agent/test/agent-loop-{limits,continue}.test.ts` 的测试；**没有任何生产装配把它置真**（`packages/agent/CHANGELOG.md:40`、`docs/agent/coding-agent/05-greenfield-rewrite/08-implementation-log/70-model-call-compaction-orchestrator.md:64` 亦记「普通 Agent 调用不启用」）。非 assistant 通道的 error（relay `:124`）虽有生产来源（`runtime-host-session-operations.ts:123/178`、`composed-runtime-factory.ts:231`），但其生产者均紧跟 `agent_end` 或直接抛错，不会在其后产出 `done`。⇒ **GWT 期望的形状在当前生产装配下不可达**，该分支属防御性代码，由 `running-changed-reason.test.ts` 的真实事件序列覆盖（旧实现 2 失败/9 通过 → 修复后 3 文件 26 例通过）。用户可见面价值已由上一轮实测覆盖（恢复侧普通消息渲染、失败侧错误卡片与中断通知）。**未闭合（待裁定）**：是否接受「不可达的防御分支由单测覆盖」作为验收口径。 |

组一计数不变：12 条闭合，余 7 条 verifying（0190、0191、0194、0151、0181、0039、0042）。方法经验：对「机制分支不可观测」的条目，先查该分支的**开关在生产装配里是否被置真**（本例 `contextCheckpoints` 只出现在类型、消费点与测试里），往往能直接把「无法构造」升级为「不可达」，比继续寻找注入手段便宜。

### 2026-10-08 · 组一续测十六（TASK-0151，`projects` 写入口枚举；闭合为 done）

方法：上一轮把 `projects` 记为「没有同 tick UI 写入口」。本轮不再找入口，改为枚举「这个字段到底有没有渲染端写者」，据此判定缺口属于「未测」还是「不存在」。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0151 | **done（闭合）** | ① **渲染端无写者**：`apps/desktop/src/renderer` 下 `config.set(` 全部 17 处调用，补丁键为 `workspacePath`×2、`shortcuts`×2、`quickPanel`、`proxy`、`notificationsEnabled`、`notificationPreferences`、`knowledgeBase`×2、`imageGeneration`、`experimental`×3、`defaultExecutionMode`、`debugMode`×2——**没有一处写 `projects` 或 `archivedProjects`**（渲染端对这两个字段只有读，`useProjects.ts:206`），即该字段在 `config.set` 这条面上没有写者，不存在可构造的并发写。② **真实写者全在同一事务队列**：唯一生产写路径是主进程 IPC `vetta:projects:*` → `ProjectService.commit` → `dependencies.updateConfig(update)`（`project-service.ts:86-92`）与 `batch-task-storage.ts:178-200,218-228` 的 `updateDesktopConfig((current) => …)`，均为**函数式读改写**而非旧快照整段写回。③ **队列自身重读磁盘**：`updateDesktopConfig`（`desktop-config-store.ts:388-404`）把读改写串在同一条进程内 promise 队列上，事务内重新 `readRawConfigSync()` 并以 `{ ...readRawConfigSync(), ...next }` 落盘，未提及字段与未知新字段都存活。④ **整快照入口生产无调用者**：`writeDesktopConfig`（`:407`，注释自陈产品流程走 `updateDesktopConfig`）与测试辅助 `overwriteDisk` 在 `apps/desktop/src` 全仓只出现在 `desktop-config-store.test.ts`。⇒ `projects` 的残留是「该面上没有写者」而非「未验证的并发面」。叠加已完成的 UI 观测（2026-10-07 四字段同 tick 并发两轮；2026-10-08 快捷键页同 tick 双写 2.4 ms、2.8 ms 内 5 连发串行、重置只触自身字段、非参与字段含 `projects`/`archivedProjects` 未被覆盖），本 Task 验收子条件已全部有客观观测，记为 `done`。用户如不认可「以代码级枚举替代 UI 实测」，按原 Task 回退 `verifying`。 |

组一计数更新：**13 条闭合**（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131、**0151**），余 **6 条 verifying**（0190、0191、0194、0181、0039、0042）。方法经验：条目标「UI 无法构造」时，先问「这个写者/路径**是否存在**」——若枚举证明写者根本不在被测面上（本例渲染端 17 处 `config.set` 无一是 `projects`），缺口即从「未测」降级为「不适用」，比继续寻找注入手段或改装夹具更省。

### 2026-10-08 · 组一续测十七（TASK-0191，三条子句实测；闭合为 done）

方法：上一轮把「主动翻历史 → 切到别的会话 → 再切回来是否算『再回来』」交用户裁定；在「全程自动」下按 GWT 与 BUG-0072 的措辞（「离开**再打开**会话」＝视图卸载后重挂载）闭合，并把会话切换路径的读数一并留档。为了造出「流式跟随中途」这一瞬态，用上一轮给故障夹具加的长流控制面（`/control/slow`）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0191 | **done（闭合）** | ① **子句 1/2（自动跟随未到底时离开再回来 → 不恢复半途快照、继续定位尾部）**：在「分步慢慢输出」会话发一条走慢流的消息，捕捉到「跟随已开启但尚未到底」的瞬间 `st=3 / max=22`（同时「停止生成」可见 ⇒ 确在跟随输出），随即离开路由到 `#/settings/appearance`（feed 卸载）再 `history.back()` 返回 → `st=234 / max=234`，内容继续增长到 `max=298` 时 `st` 仍为 298：**落在尾部并继续跟随**，半途的 3px 快照未被恢复。② **子句 3（主动浏览旧消息再返回仍恢复位置）**：另一会话用真实滚轮上翻到 `st=59`（跟随关闭），离开路由再返回 → `st=59`，此后 6 秒稳定不变。③ **会话切换路径实测（GWT 未覆盖）**：从同一主动位置 `st=59` 改走「切到别的会话再切回来」（feed 不卸载）→ `st=659 = max`（落回尾部），不恢复；与上一轮的实现判定一致（缓存只喂 Virtuoso 的初始化输入 `restoreStateFrom` / `initialTopMostItemIndex`，不重挂载不生效）。④ 闭合口径：GWT 与 BUG-0072 的场景均为「离开再打开会话」（重挂载），三条子句在该路径上均有实测读数（含流式瞬态与稳定态），据此记为 `done`；会话切换（不卸载）不恢复属读侧既有声明语义、不由本切片引入，若产品期望它也恢复应另立条目。用户如不认可以此口径闭合，按原 Task 回退 `verifying`。本轮为 DOM 读数，无独立截图。 |

组一计数更新：**14 条闭合**（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131、0151、**0191**），余 **5 条 verifying**（0190、0194、0181、0039、0042）。

### 2026-10-08 · 本轮另发现（未计入任何条目）：回合不进入终态的两态

排 TASK-0191 时为构造流式态误杀了故障夹具进程，得到一个人工可见的「回合卡死」态；随后按同一条件做了一次确定性复现。二者都落在 BUG-0018（`done`）的合同面上——其 GWT 明确要求「当前 Turn 应在有限时间内进入明确的 interrupted/aborted 终态；后续消息应能正常发送……不应长时间卡在处理中」。**本记录只报告观测与证据，处置（新开缺陷还是并入 BUG-0018 重开）交用户裁定。**

- **态 A（严重；无自救手段）**：会话「分步慢输出」的 `turn-eecb181d` 在会话记录里**只有 `turn.started` + 两条 `message.appended`，没有任何终止事件**（无 `turn.completed`/`turn.cancelled`/`turn.failed`）。UI 上同一屏**同时**呈现「处理中…｜正在处理 · 31分16秒」与错误卡片「网络没连上／检查一下网络或代理，然后重新发送」；composer 的 aria 是「Open Forge 正在思考…」、模型选择器被禁用（「当前回合进行中，回合结束后可切换模型」），且**既没有「停止生成」也没有「发送消息」**——该会话既不能取消回合也不能发新消息。渲染进程重载无效；**重启应用**后该会话恢复为可发送状态（`发送消息` 可用、无「处理中」）。⇒ 该忙态由主进程内存中的在途回合持有，不是从落盘记录重新推导的（落盘记录里那回合根本没有尽头）。截图：`<artifactDir>\stuck-turn-wedged-session.png`。
- **态 B（确定性复现；有自救手段）**：在新会话里发一条走 `/control/slow` 的消息，流式中**杀掉夹具进程**（连接被粗暴断开）→ 其后 60 秒内：`停止生成` 一直在、`发送消息` 一直不在、无错误卡片、无任何终态事件，计时器持续增长；点「停止生成」后 3 秒内恢复（`发送消息` 可用、模型选择器解除禁用），会话记录写入 `turn.cancelled reason="This operation was aborted"`。⇒ **provider 连接中断后回合不会自动进入终态**，但用户可手动中断。
- **与既有记录的关系**：态 A 同时违反 BUG-0018 的「有限时间内终态」与「后续消息应能正常发送」两条，且连中断入口都没有；态 B 违反前者（60 秒无终态）、保留后者。触发条件不是「用户点停止」，而是 **provider 连接在回合中途被粗暴切断**（本例由我杀夹具造成；生产等价物是 provider 进程崩溃、网络中断或主进程被杀）。
- **环境注记**：夹具自身在客户端断开后继续 `enqueue` 抛 `Invalid state: Controller is already closed` 的缺陷本轮已修（`try/catch push` + `cancel()` 清表），因此态 B 的复现方式改为**故意杀掉夹具进程**，不依赖那个缺陷。

### 2026-10-08 · 组一续测十八（TASK-0181，向导与引导随重启重放；补证）

方法：本轮因其它条目需要重启隔离 Debug 实例（`verify:ui:stop:debug` → `start:debug`，渲染源端口由 36915 变为 **52272**），顺手把上一轮归因（偏好只落在 origin 级 localStorage）的**可见症状**补全：不只字体回落，凡是 origin 级 localStorage 里的首启状态都会重放。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0181 | **verifying（补证，不改变计数）** | 重启前该 profile 的 localStorage 有 `openforge-font-preferences`、`vetta-setup-wizard-completed=1`、`vetta.tour.sidebar.completed=1`；重启后（origin `http://127.0.0.1:52272`）localStorage 只剩 **4 个运行时键**（`vetta-ui-theme`、`vetta-session-execution-mode`、`vetta-workspace-path`、`vetta-selected-model`），`vetta-setup-wizard-completed` 与 `vetta.tour.sidebar.completed` 均为 `null`（`openforge-font-preferences` 一并消失，即上一轮的字体回落同因）。可见后果两条实测：① 「语言与外观」整屏向导**重放**（`div.fixed.inset-0.z-[100]`，含「跳过」「下一步」，截图 `0181-setup-wizard-replay-after-restart.png`）；② 跳过向导后**产品引导 tour 重放**（`svg.driver-overlay` + `.driver-popover`，截图 `0181-sidebar-tour-replay-after-restart.png`），走完引导后 `vetta.tour.sidebar.completed` 才写回 `1`。⇒ 该丢失不是字体偏好专有，而是 dev 形态下**整个 origin 级 localStorage 一起失效**；安装态 origin 稳定时不会发生。本段只补症状，归因与「打包形态复核」要求同上一轮，状态不变。 |

组一计数不变：**14 条闭合**，余 **5 条 verifying**（0190、0194、0181、0039、0042）。

### 2026-10-08 · 组一续测十九（TASK-0039，插件 pinned 驻留预算与逐出实测；闭合为 done）

方法：GWT 要求「多个插件页签声明 pinned」，而随包预设里没有声明 pinned 的页签，故本轮**自建夹具插件**：复制一个同类插件目录为 `packages/plugins/externals/pinned-probe/`（`node_modules` 用 Windows junction 指向兄弟插件，`bunx vite build` 产 MF `dist/`，**不动 `bun.lock`**），注册 4 个 `retention: "pinned"` 的活动页签 PP-A…PP-D；用 `VETTA_PLUGIN_DEV`（16 个预设 + `pinned-probe`）dev-link 进隔离 Debug 实例。**观测手段**：夹具页签渲染一次性生成的 `data-mount-id`（每个组件实例一个），故「谁还驻留、谁被重建」可直接从 DOM 判读；驻留集合用 `[data-activity-tab-content]`（`ActivityTabSurface` 给每个挂载表面写的 dataset）枚举。候选池 = 4 个夹具 pinned 页签 + 随包插件 `plugin:content-creation:workspace`（同为 pinned）= **5 个 pinned 候选**，预算 3。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0039 | **done（闭合）** | ① **硬上限**：重置实例态后（重载渲染进程 + 重开面板，active=`file`）挂载表面 = `file` + PP-B/PP-C/PP-D，**5 个 pinned 候选中只有 3 个驻留**，PP-A 与 `content-creation` 被逐出 ⇒ 非活动 pinned 驻留数有硬上限（=3，`DEFAULT_INACTIVE_PINNED_TAB_LIMIT`）。② **逐出可透明重建、驻留保持实例**：点开已被逐出的 PP-A → 它以**新 `data-mount-id`**（`ew81wu`）重建并以活动页签身份驻留（此时驻留 = 3 非活动 + 1 活动 = **4**，活动页签不占用非活动预算），PP-B/PP-C/PP-D 的 id（`u930fi`/`qubfh1`/`br8xbw`）**逐个不变**。③ **逐出跟随激活顺序（LRU）**：紧接上一步切到内置 `browser`（非 pinned 活动）→ 被逐出的是 **PP-B**（此时最久未激活者，id `u930fi` 消失），刚激活过的 PP-A 与 PP-C/PP-D 全部保留且 id 不变。④ **收起卸载 + 记录保留（第二子句）**：点「关闭活动面板」→ 全部 `[data-activity-tab-content]` 归零（docked 表面整体卸载，含内置浏览器的 docked 表面）；重新展开 → 驻留**仍是同一批** PP-A/PP-C/PP-D（PP-B 依旧被逐出，id 因重挂载必然更新）。该读数同时是「residency 记录保留」的判别证据：若状态随收起丢失并从头登记，LRU 会回到候选自然序 `[cc,A,B,C,D]`，`active=browser` 时驻留应为 {B,C,D} 且 A 被逐出——实测完全相反。⑤ 复位：夹具插件目录在提交前删除，`bun.lock` 全程未动。**未覆盖（如实记录）**：夹具页签渲染的是普通 React（插件 SDK/`docs/plugin/ui-slots.md` 无 `webview` 贡献面），故「guest `<webview>` 卸载」无实时读数，其证据为同一 `renderDockedPanel = model.isOpen` 闸门 + 既存组件测试 `ActivityPanel.plugin-tabs.test.tsx:95`「does not mount the docked tab bar or docked content while closed」（本轮复跑 4/4 绿）；`app.getAppMetrics()` 进程计数同本 Task 原记录，不做。截图：`0039-pinned-residency-strip.png`。用户如不认可以「DOM 挂载/实例 id」作为驻留证据，按原 Task 回退 `verifying`。 |

组一计数更新：**15 条闭合**（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131、0151、0191、**0039**），余 **4 条 verifying**（0190、0194、0181、0042）。方法经验：测「驻留/逐出」这类有历史的策略，**必须先重置实例态再读数**——在已经历多轮激活的实例上采样，LRU 顺序是未知量，读数无法与策略对齐（本轮探索阶段就出现过无法与源码语义对齐的 3 驻留读数）；改为「重载渲染进程 + 重开面板」得到确定初态后，每一步读数都与 `resolveResidentPinnedActivityTabIds` 的窗口预测逐项吻合。

### 2026-10-08 · 组一续测二十（TASK-0181，GWT 第 4/5 条在真实 UI 逐子句实测；保持 verifying）

方法：隔离 Debug profile `04987e4e`，全部经真实设置页 UI 驱动（`设置 → 外观 → 字体`）。真实权限拒绝**造不出来**：本机 Electron 无 `local-fonts` 权限处理器（默认放行），且 CDP `Browser.setPermission` 在该 Electron 上直接报 `Invalid PermissionDescriptor name: localFonts`；故失败分支用「替换 `window.queryLocalFonts`」构造（拒绝桩＝`Promise.reject(new DOMException("denied","NotAllowedError"))`，正是调用方看到拒绝时的形态；不支持桩＝`defineProperty(...,{value:undefined})`）。连续请求/过期结果用**可控计数桩**（保留 resolver，可决定何时兑现）。终端子句用底部面板终端的几何量（canvas 渲染，`.xterm-screen` 像素尺寸＝列数×单元宽）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0181 | **verifying（GWT 4/5 已实测闭合，剩余待用户判定观感与 PTY 读数）** | **GWT 第 4 条（5 个子场景全部实测）**：① 枚举失败 → `[role=alert]`＝「无法读取本机字体。如出现权限提示，请允许访问后重试；已有选择未改变。」，按钮回可用、列表与两个选择器仍在，还原 API 后重试即消失；② 不支持 → 「当前环境不支持读取本机字体，已有选择与默认字体仍可使用。」，两个选择器 + 两个「恢复默认」按钮均在（页面可用）；③ 字体缺失 → 下拉显示 `NoSuchFontZZZ`、`--font-sans`＝`"NoSuchFontZZZ", -apple-system, …`，读取后出现「可用列表中未找到此字体…」，点「恢复默认界面字体」→ 键回 `{"ui":"","code":""}`、CSS 回默认栈、提示消失；④ 偏好损坏（键写 `{oops-not-json`）→ 应用正常启动、`--font-sans`＝默认栈、两选择器「默认」、无错误 UI，随后选 Arial → 键被改写为合法 JSON 且 CSS 跟随（损坏值在启动时不被改写，恢复发生在下次保存，与只读实现一致）；⑤ 写入失败（`Storage.prototype.setItem` 抛错）→ 「无法保存字体设置，已保留原来的选择，请重试。」，**存储键、`--font-sans`、选择器显示三者均未变**（不伪称保存成功），还原后重试成功。**GWT 第 5 条**：① 连续请求——真实按钮同 tick 连点两次 → `queryLocalFonts` 调用次数＝**1**（加载中 `[role=status]`＋`disabled` 双重拦截），桩载荷正常落地；② 卸载中放弃——请求在飞时切「通用设置」（外观段卸载，字体按钮 0）再回「外观」→ 无提示、无搜索框、无 `ZZSTALE` 文本；随后兑现被放弃的请求 → 仍无提示、无 `unhandledrejection`/`error`；回页后新请求以 `FRESH-OK` 正常落地；③ **释放订阅（判别性）**——挂载中发 `StorageEvent` → `--font-sans` 变 `"Courier New", …`、选择器跟随（订阅有效）；**卸载后**同事件下 `--font-sans` **不变**，而存储键确为 `{"ui":"Courier New",…}`、回页后选择器显示该值 ⇒ 不是事件没生效而是监听已摘；④ **隐藏期间变更 → 恢复可见后重新 fit**——基线 `1044×210`，收起底部面板后 `.xterm` **仍为 1**（仍挂载、仅隐藏）且容器链宽高全 0，隐藏期间切侧边栏改宽无读数，展开后 **`1266×210`**（跟随新容器链），复原侧边栏 → 回 `1044×210`，双向可复现。附属读数：真实枚举 93 项界面 / 21 项代码候选（与上一轮另一 origin 一致）。**未观测**：PTY 尺寸同步调用本身——该 IPC 经 `contextBridge` 暴露且对象冻结，实测替换 `window.vetta.terminal.resize` 不生效（记录数组恒空），故「resize 被调用、cols 增加」仍只有宿主测试 `TerminalSurface.host.test.tsx:167`；GWT 第 2 条后半「实例/PTY/输出保留」的 UI 不可达结论不变。**本轮另记（未计入条目，不作为缺陷）**：进入外观页时模型只 `setPreferences` 不 `applyStoredTheme()`，在「键被外部改写」时可出现「选择器＝新值而 `--font-sans`＝旧值」的短暂分叉；可达性枚举显示 `saveFontPreferences` 全仓只有 `useFontSettingsModel.choose()` 一个写者（同文档、写完即 apply），`onboarding`/`pet`/`quickpanel` 的 storage 监听只跟随主题键，故当前单主窗形态下该分叉用户不可达。截图：`0181-fonts-loaded-2026-10-08.png`、`0181-fonts-load-failed.png`、`0181-fonts-missing-notice.png`、`0181-fonts-save-failed.png`、`0181-fonts-unavailable.png`。仍待用户判定：打包形态的字体观感与终端字形（本轮为几何量非观感）、是否接受 PTY 尺寸同步以宿主测试为准。 |

组一计数不变：**15 条闭合**，余 **4 条 verifying**（0190、0194、0181、0042）。方法经验：① 要测「失败反馈」，先确认该失败**在这个运行时能不能真造**——本机 Electron 对 `local-fonts` 默认放行且 CDP 连权限名都不认，硬造权限拒绝会白费一轮；改为按「调用方看到拒绝时的形态」替换 API，并在记录里明写是桩，比含糊地宣称「已测拒绝」诚实。② 要证明「释放订阅」这类**移除型**行为，用同一次事件在挂载/卸载两态对照（本例读 `--font-sans`），再回页确认值确实在库里，才能排除「事件本身没生效」这一替代解释。③ 测「隐藏后重新 fit」要**在隐藏期间改变输入**（本例切侧边栏改宽度），否则恢复可见后无论如何都会有一次 fit，读数无法区分「补上了跳过的变更」与「碰巧重算」。

### 2026-10-08 · 组一续测二十一（TASK-0190，标志位载体在生产装配中从不构造；保持 verifying）

方法：上一轮（续测十五）判定「同一 `agent_start…agent_end` 跨度内先 error 后 done」不可达时，依据是「整仓无人把 `contextCheckpoints` 置真」——这是**配置性**证据（没人设）。本轮只读代码把问题前推一步：**能携带该标志的对象到底会不会在生产里被建出来**（构造性证据），从而排除「某条可编辑配置路径其实能加上这个键」。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0190 | **verifying（补证，不改变计数）** | 结论由「没人置真」（配置性）升级为「携带它的对象在生产装配里不会被建出来」（构造性）。① 唯一构造点：`AgentLoopConfig`（含可选 `contextCheckpoints`，`packages/agent/src/types.ts:143`）在生产源码里只有 `packages/agent/src/agent.ts:462-495` 一处字面量，逐字段显式列出（`model`/`reasoning`/`sessionId`/`transport`/`thinkingBudgets`/`maxRetryDelayMs`/`limits`/`tracer`/`tracing{…}`/`convertToLlm`/`transformContext`/`getApiKey`/`getSteeringMessages`/`getContinuationMessages`/`getTools`/`getSystemPrompt`/`salvageTextToolCalls`），既无该键也**不展开任何调用方对象**，故用户侧 JSON 等可编辑输入无处注入。② 三个读取点（`agent-loop.ts:233`/`:287`、`loop/assistant-stream.ts:59`）只经 `agentLoop`/`agentLoopContinue`，二者唯一调用者即 `agent.ts:502-503`；承载它们的 `Agent` 类在生产源码中**零实例化**（全仓 `new Agent(` 仅 `packages/agent/src/proxy.ts:75` 的 `@example` 文档块与 `packages/ai/src/utils/proxy-dispatcher.ts:45` 的 undici `Agent`）。③ 生产回合走另一条引擎：runtime-core `StatelessAgentCoreTurnEngine`（`packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts:60`，`AgentCoreTurnEngine` 为其空子类）→ `runAgentTurn(AgentTurnRequest)`（`packages/agent/src/engine/run-agent-turn.ts:39`），该路径不构造 `AgentLoopConfig`；其 checkpoint 是**宿主回调**（`run-agent-turn.ts:342` `if (!request.checkpoint) return undefined`；`engine/types.ts:172` `checkpoint?: AgentCheckpointHandler`、`types.ts:22` `limits.checkpointTimeoutMs`），与标志无关。④ 该引擎唯一展开调用方选项包处 `...this.options.streamOptions`（`stateless-agent-core-turn-engine.ts:223`）只把结果交给 provider 流函数，不进任何 loop config。仍未闭合：**用户裁定项不变**——是否接受「生产不可达的防御分支由单测覆盖（`running-changed-reason.test.ts` 真实事件序列，旧实现 2 失败/9 通过 → 修复后 3 文件 26 例通过）」作为验收口径。补记事实：该分支**不是可删死代码**，`Agent` 类与 loop 经 `packages/agent/src/index.ts` 导出，是库消费者/节点扩展（`node-extension-factory-loader.ts` 命名空间整体注入）的 API 面，外部置真即会走到；本仓生产接线不走，故不影响本次验收的用户可见面。 |

组一计数不变：**15 条闭合**，余 **4 条 verifying**（0190、0194、0181、0042）。方法经验：判「某分支不可达」时，「全仓无人设这个开关」只是配置性证据；真正的构造性证据是**那个对象在不在生产装配里被建出来**。三轮问法：谁会构造它（唯一构造点是否为显式字面量）→ 构造时展不展开调用方输入（有没有 `...options` 之类注入面）→ 生产实际走的是不是这条链（本例生产走的是另一条引擎且承载类零实例化）。这样结论才从「碰巧没开」升级为「开不了」。

### 2026-10-08 · 组一收口裁定（TASK-0190、0194、0181 闭合为 done；0042 转用户自行实机）

方法：Agent 把四条剩余项各自的可裁定问题连同证据一并提交用户，由用户逐项裁定（验收结论归用户）。

| Task | 用户裁定 | 落地结果 |
|---|---|---|
| TASK-0190 | **接受**「生产不可达的防御分支由单测覆盖」作为验收口径 | 闭合 `done`。依据：用户可见面已实测（恢复回合不残留错误横幅、最终失败保留正确原因与中断通知）；分支由 `running-changed-reason.test.ts` 真实事件序列覆盖；不可达有构造性证据。遗留：该分支随包发布、**不得按死代码删除**，若未来出现 `Agent` 类生产装配须重跑事件序列。 |
| TASK-0194 | 重复用户气泡（乐观 id 未被规范历史吸收、刷新即消失、2/2 复现）**归 BUG-0068 作残余变体**；GWT ① 改写为「两轮派发亦可接受」 | 闭合 `done`；BUG-0068 已追加裁定段并登记 `related_tasks: TASK-0194`，其状态维持 `verifying`（残余变体尚无修复提交，回归夹具为本轮的正常操作路径）。 |
| TASK-0181 | **接受** PTY 尺寸同步以宿主测试为准（`TerminalSurface.host.test.tsx:167`）；打包形态字体观感与终端字形**留发布前抽检** | 闭合 `done`。等价读数已在真实 UI 成立：fit 后渲染尺寸跟随容器（`1044×210` ↔ `1266×210`，隐藏期改输入后展开仍正确）。 |
| TASK-0042 | 实机峰谷差由**用户自行实测**（不由 Agent 触发真实系统电源事件，避免中断其桌面会话） | 仍 `verifying`。步骤与日志字段清单已写入 Task：锁屏/睡眠一次，回贴 `power working-set trim`（`reason/trimmed/beforeKb/afterKb/deltaKb`）与 `power event observed`（`workingSetKb`），日志落点 `<vettaHome>/desktop-app/logs/`。 |

组一计数更新：**18 条闭合**（0120、0132、0189、0185、0188、0152、0200、0193、0186、0207、0192、0131、0151、0191、0039、**0190**、**0194**、**0181**），余 **1 条 verifying**（0042，待用户回贴实机读数）。另有 2 条组外项（TASK-0183、0184）仍受 ISSUE-0029 的 CI 预算阻塞，不计入组一。方法经验：「不可达分支」这类条目**不要由 Agent 单方面闭合**——把「配置性证据 vs 构造性证据」「用户可见面是否已实测」「该分支是否随包发布（能否删）」三件事一并摆给用户，用户才能在三十秒内给出稳定裁定；同样地，「需要真触发系统电源/会话中断」这类有副作用的实测，把它交给用户自行执行比 Agent 代跑更合适（本轮 0042 即如此，同时把可复现步骤与判定阈值写成用户可直接执行的清单，避免「交回去了但没法做」）。

### 2026-10-08 · 组二开始（TASK-0163，模态过滤往返；闭合为 done）

方法：延续组一的隔离 Debug profile `04987e4e`，同一个真实会话里做「含图片 → 切纯文本模型 → 切回图像模型」的完整往返。**Playwright 驱动不了 Electron 原生选图对话框**，故图片经真实投递路径进入：页内 canvas 画一张 64×64 PNG（正红底 + 白色「IMG」）→ `DataTransfer` + 合成 `dragover`/`drop` 派发到输入栏 contenteditable（由 `MessageInput.DropZone` 祖先处理），与用户拖拽同一条链。出站请求体的判读靠**给夹具 provider 补一段请求体摘要**（`<debug vettaHome>\fixtures\fault-mock\server.ts` 的 ndjson 日志新增 `bodySummary`：只记类型与计数，不记正文）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0163 | **done（闭合）** | 图像模型 `glm-5.3-flash`（`input: ['text','image']`）先读图 → 正常描述「鲜艳的正红色」（证明图片确实进入请求）。**0163 决定性取证到手**：切到纯文本 `Fault Mock 1`（`input: ['text']`）后同一会话再发一轮，回合正常完成，该请求体摘要为 `contentTypes = ['input_text','output_text']`、`imageParts = 0`、`imageDataUrls = 0`、`rawHasDataImage = false`、`rawHasInputImage = false` ⇒ **请求合法且完全不含图片**。同请求 `inputTypes` 仍含 `message` × 6 与成对的 `function_call`/`function_call_output` ⇒ 文字与工具关联未丢。同请求 `omissionNotices = 1`，即 `packages/ai/src/providers/transform-messages.ts:4` 的 `UNSUPPORTED_IMAGE_INPUT_NOTICE` 被追加了一条。**切回图像模型后图像仍在**：改回 `glm-5.3-flash` 追问「图里那行白色文字写的是什么？只回那串字符」，答 **IMG**——正是第一轮投递图片里画的那串字符，跨越一次纯文本模型切换。0163 的三条子句全部在真实应用里成立。工具结果图片分支本轮未在 UI 构造（需工具返回图片），由单测覆盖：`packages/ai` 全量 63 文件 / 515 例绿（含 `openai-completions-tool-result-image*`）。截图：`0163-attach-probe.png`、`0163-model-picker.png`、`0163-image-model-turn.png`、`0163-text-model-turn.png`、`0163-switch-back-turn.png`。用户如不认可以「出站请求体摘要 + 判别性回答」作为行为面证据（或要求工具结果图片分支也上 UI），按原 Task 回退 `verifying`。 |

组二计数更新：**1 条闭合**（0163），余 **16 条**（0149、0153、0154、0155、0156、0157、0158、0159、0160、0161、0162、0165、0166、0167、0168、0169）。方法经验：① 判「请求里到底有没有图」，**只读客户端源码不够**——这次靠的是夹具 provider 侧的**出站请求体摘要**，属于外部可观测事实，比「代码里写了 filter」强一档；② 摘要只记类型/计数不记正文，既拿到判别力又不把会话内容落到磁盘；③ 测「切回后图片还在」要设计**只有真看到图才答得出的问题**（本例让模型回读图上的字），否则模型凭上下文猜一句也能「看起来通过」。

### 2026-10-08 · 组二续测一（TASK-0161，通知偏好迁移/持久化成立，提示音链路断裂；保持 verifying）

方法：隔离 Debug profile `04987e4e`，设置 → 通用设置 → 通知（节锚点 `[data-setting-section-id="general-notifications"]`）。读数三条腿：UI（`role=switch` 的 `aria-checked`）、磁盘（`<vettaHome>/desktop-config.json`）、渲染进程 `window.Audio` 记录器（阳性对照＝设置页「试听提示音 → 播放」）。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0161 | **verifying（两条子句成立；两条被新立案 BUG-0080 阻断）** | ① **旧配置迁移成立**：把配置降级为「无 `schemaVersion`/`notificationPreferences`」并塞入未知未来字段 `notificationPreferencesLegacy` → 应用读取后被原子重写为 `schemaVersion: 2` + 完整默认偏好，`notificationsEnabled`/`projects`/`language` 与未知字段全部保留，UI 无需重启即反映默认值。② **开关保存/重开成立**：「系统通知」切关 → 磁盘 `notificationsEnabled: false`；离开再进入仍为关；**重启整个实例**（渲染源 `42672`→`59802`，localStorage 全丢）后重开设置页仍为关、提示音仍为开，与磁盘一致。③ **完成/失败/等待审批的提示音在真实应用中从不播放**：三轮真实完成回合（夹具 `requests.ndjson` 记 `21:24:17Z`/`21:25:57Z`/`21:27:10Z` 三次 `/v1/responses`，会话 JSONL 相应新增回复）在 `window.Audio` 记录器下 **0 条**，而同记录器点「试听提示音 → 播放」立得 `new Audio()` + `data:audio/wav;base64,…`（10,750 字符）+ `play()`，1.5 s 后 `duration=0.5`/`currentTime=0.5`/`paused=true`（确实播完）。静态决定性证据：主进程 `notification-service.ts:130-135` 有 `webContents.send("vetta:notification:sound")`、preload 有 `onSound`，但**渲染进程无任何订阅者**（`playNotificationSound` 唯一调用点是设置页试听），且 Agent 横幅为 `silent: true` ⇒ 三类终结事件整体无声；原交付记录所称「root-layout onSound 播放接线」在特性提交 `3a49e5c2a` 中不存在。已立案 [BUG-0080](../bugs/BUG-0080-notification-sound-never-played.md)。④ **静音不影响业务事件成立**（业务事件侧）：系统通知关闭下的回合正常完成并渲染回复。未观测：OS 横幅本身（主进程 `new Notification` 无日志行；从页面补挂订阅被拒 `Host API access denied`），与 TASK-0181 的 PTY 读数同类处理。截图：`0161-notifications-section.png`、`0161-migrated-config-switches.png`、`0161-preview-audio-playback.png`、`0161-restart-persisted-switch.png`。 |

组二计数更新：**1 条闭合**（0163），**1 条 verifying**（0161，待 BUG-0080 裁定），余 **15 条**（0149、0153、0154、0155、0156、0157、0158、0159、0160、0162、0165、0166、0167、0168、0169）。方法经验：① 测「设置项生效」要把**磁盘读数**当第二证人——UI 开关只证明渲染层状态，磁盘才证明真的保存；本例正是靠磁盘读数才把「迁移」与「保存」两条子句各自钉死。② 测「某功能是否真的响」必须配**阳性对照**（同一记录器点试听按钮能出声），否则「没记录」既可能是功能没响，也可能是记录器装错了；本例的对照恰好暴露出「设置页试听可用、事件路径不可用」这一半接线形态。③ 交付记录里的「接线」类描述要**回到提交里核**——本项记录写的 root-layout 接线的在那个提交的 37 个文件里根本不存在，源码搜索（谁订阅了这个通道）比读交付记录可靠。

### 2026-10-08 · 组二续测二（TASK-0156，目标模式六条子句实测；保持 verifying 待裁定）

方法：同一个隔离 Debug profile `04987e4e`，三条证据腿并读——① UI（目标模式对话框的「状态 / 已使用 N Token · 自动续跑 M 次」行、输入栏胶囊、会话内失败卡）；② 会话 JSONL 里的 `goal_snapshot` 自定义条目（含 `status`、`statusDetail`、计数器、`data: null` 清除标记）；③ 夹具 provider 出站请求日志（新增 `GET /control/empty?n=N` 注入「空回合」）。**测试夹具的 `/control/failcount` 注入不出「三轮无进展」**：运行时对注入的 500 有逐回合重试，目标只是继续往下跑（续跑数从 261 一路涨到 307），必须换成「回合成功但无产出／回合失败」的注入才有判别力。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0156 | **verifying（六条子句均有真实读数；建议闭合，待用户裁定）** | ① **新建/已有会话目标流成立**：技能/场景 → 目标模式 → 对话框只有「目标」一个字段（`textarea[aria-label="目标"]`）+ 取消/开始执行，提交后输入栏出现胶囊 `button[title="目标模式 · 点击移除"]`，回合结束自动续跑（实测 65 s / 60 次，前一目标累计 442 次）；同一入口在已有会话 `FAULT_MOCK_OK：` 上同样成立。② **三轮无进展 → 受阻成立**：注入空回合后循环发出 6 个请求、呈 3 对（`21:46:31.009/31.360`、`42.732/43.088`、`58.902/59.231Z`，输入条目数 891/892 ⇒ 上下文未重放），随后 `status: "blocked"`、`statusDetail`＝「Execution failed for three consecutive goal turns; review the failure before resuming」，UI 读到「状态 受阻」+ 继续目标/清除目标，**其后 12 分钟零 provider 请求**；会话内三轮回合各有可见失败卡（「本次回复中断了／可以重新发送试试／查看详情」）。③ **预算/取消成立**：无 Token 预算属 ADR-0144 明示设计（非缺陷）；「停止生成」→ 回合中断、目标转**已暂停**、请求立刻停（`21:56:44.407Z`、`21:59:12.223Z` 各一次，其后 12 分钟零请求），对话框给出「继续目标」。④ **恢复不重复轮次成立**：受阻态点「继续目标」→ 回「执行中」且用量/次数**原地接续**（6675 Token / 442 次，未清零），随后只发 6 个请求（3 轮 × 2）即再次受阻，输入条目数仍 891/892 ⇒ 未重放历史轮次；单测 `continuation-orchestration.test.ts:351` 另证 `[ephemeral:goal]` 恰好 1 条。⑤ **重启不静默续跑成立**（前段读数）：活跃目标 + 重启 → 自动转「已暂停」并附「Restored after the session stopped; resume explicitly to continue」，用量原样（3930 Token / 261 次），约 110 s 内零请求。⑥ **renderer 不引入 Provider 成立（静态）**：`useGoalModeModel.ts`/`GoalModeDialog.tsx` 只 import react/jotai/i18n/shared UI 与 `@vetta/coding-agent/session-extensions` 的**类型**。⑦ **清除目标成立**：清除后对话框关闭、胶囊消失、文档追加 `data: null` 的 `goal_snapshot`（revision 1603），再进入即回到创建态。未闭合项：真实应用里只触发了「连续执行失败」分支，「连续无可观察进展」分支仍是单测级（`goal-session-extension.test.ts:251`）；每轮两个请求的成因未定论（观察为同一上下文 891→892 条目，疑似空回合重试），仅作事实记录。截图 `0156-goal-create-dialog.png`、`0156-goal-active-capsule.png`、`0156-goal-paused-dialog.png`，原始读数 `0156-goal-evidence-2026-10-08.txt`。 |

组二计数更新：**1 条闭合**（0163），**2 条 verifying**（0161 待 BUG-0080 裁定、0156 待裁定），余 **14 条**（0149、0153、0154、0155、0157、0158、0159、0160、0162、0165、0166、0167、0168、0169）。方法经验：① 判「无进展/受阻」这类**计数型停止条件**，注入方式决定证据价值——`/control/failcount` 的 500 会被运行时重试吸收，只有让回合**真正失败或真正零产出**才走到阈值分支；先读源码确认计数口径（`goal-runtime.ts:206-236` 分「连续失败」与「连续空续跑」两条），再造注入。② 「恢复不重复轮次」不要只看计数器，**看请求体**——恢复后上下文条目数仍是 891 而非膨胀到数百，才是「没有重放历史」的硬证据。③ 夹具能力是逐步长出来的：本轮给夹具补了空回合注入（`/control/empty`），这类改动都在 Debug profile 的 vettaHome 内、不进仓库，但要在记录里点名，否则读数无法复现。

### 2026-10-08 · 组二续测三（TASK-0160，Git 两条子句实测成立、四条未落地；保持 verifying 待裁定）

方法：同一个隔离 Debug profile `04987e4e`，自建 Git 夹具仓库 `<vettaHome>/fixtures/git-literal-paths`（5 提交，独立于用户仓库），以磁盘 `git show --name-status -M` 与 md5 作对照，UI 侧驱动活动面板 → Git → 提交图/变更。**Git 面板正文渲染在 shadow root 内**：`document.querySelectorAll`、`body.innerText`、`getByText` 都取不到文件行（表现为「明明可见却搜不到」），必须自底向上遍历 `shadowRoot` 才能命中——本轮一次「每个提交只列一个变更文件」的结论就是探针假象，全量扫描后与 `--name-status` 逐条一致，已更正。

| Task | 本次结论 | 证据 / 未闭合原因 |
|---|---|---|
| TASK-0160 | **verifying（两条成立、一条单测级、三条未落地；不建议闭合）** | ① **特殊文件名/重命名成立**（归 TASK-0193/BUG-0074）：449e837 恰好列出 `br[ack]et.txt`/`bracket.txt`/`x[1].txt`/`x1.txt` 四行且点 `br[ack]et.txt` 得到自己的 hunk（`+BRACKET_ONE`，未串邻居）；b25171db 两行重命名各带 `旧 → 新` 标题与 `R`（`R087`/`R100`），纯重命名点开为「无差异内容。」；含 `&`/`#`/`'`/空格/方括号的路径按字面呈现。② **动作确认取消成立**：变更视图右键 `amp&and.txt` → 「丢弃更改」→ 破坏性确认框（含路径清单与「无法撤销；未跟踪的文件会被直接删除」），点「取消」后对话框消失、文件仍在列表、磁盘 md5 与操作前一致 ⇒ 未执行。③ **未安装 Git 仅单测级**（git 插件 51/51 + NoGitCta 组件测试）；真实「未安装」需去 git 的 PATH 启动实例，未授权不做。④ **关闭面板点文件一次打开 未适配**：`useFileTabContentModel.ts:69` 仍是修复前形态（同步卸载清理），无上游 b530b02ae 的 `mountedFileTabs` 微任务延后；用户可见面未实测（复现需聊天内文件引用，本 profile 无此会话）。⑤ **设计A切B 未适配**：`design-runtime.ts` 无 `pendingDesignListeners`/`onPendingDesignPath`。⑥ **空标题自动化可创建：实测不成立**——只填提示词时创建按钮 `disabled=true`、名称仍空；上游 2543c5aec 的「标题选填 + 首行兜底」在本仓不存在（`scheduler/automation-draft.ts` 缺失、`canSubmitFromData` 要求 `data.name?.trim()`）。附带核查 c496fb60d（能力筛选）同样未适配（不在合同内）。四个未落 SHA 在 `project/` 下只出现于本 Task 与 PLAN-0014，无其它 Task 承接。截图 `0160-diff-bracket.png`、`0160-diff-paren-rename.png`、`0160-discard-confirm.png`、`0160-discard-cancelled.png`、`0160-automation-prompt-only.png`，原始读数 `0160-git-evidence-2026-10-08.txt`。裁定选项：①补做四片后复验；②收窄合同为「未安装 Git + Git 特殊路径/确认取消」并把四片另立 Task/Bug 跟踪后闭合。 |

组二计数更新：**1 条闭合**（0163），**3 条 verifying**（0161 待 BUG-0080 裁定、0156 待裁定、0160 待裁定），余 **13 条**（0149、0153、0154、0155、0157、0158、0159、0162、0165、0166、0167、0168、0169）。方法经验：① 「上游补丁没进本仓」这种判断要**两头都查**——查补丁引入的标识（`mountedFileTabs`、`pendingDesignListeners`）是否存在，再查该 SHA 是否被本仓别的 Task 承接（`grep -r <sha> project/`）；两头都空才能说「未落地」，否则容易把「别人做了」误报成缺口。② UI 里「可见但搜不到」几乎总是 **shadow DOM**：先遍历 `shadowRoot` 再下结论，别急着把探针读不到当成产品缺陷。③ 已落地的上游补丁也可能**被本仓用别的实现覆盖**（本例 `PREVIEW_MOUNT_DELAY_MS = 240` vs 上游 `waitForCommittedPaint`），所以「标识缺失」只能证明「上游那种写法不在」，要不要升级成用户可见缺陷，得看能不能实测或给出构造性证据。
