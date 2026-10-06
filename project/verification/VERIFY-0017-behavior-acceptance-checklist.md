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
updated: 2026-10-06
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
