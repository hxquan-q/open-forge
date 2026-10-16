---
id: RESEARCH-0027
type: research
status: done
priority: P2
owner: coordinator
source: user-request; 2026-10-16 Desktop dev 日志只读巡检
created: 2026-10-16
updated: 2026-10-16
related_requirement: []
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop dev 日志异常巡检

## 问题与范围

只读检查现有开发实例日志，识别实际失败与待定位问题；未修改实现、启动实例、调用 Provider 或操作用户会话。不将日志中的异常直接等同于已复现的代码缺陷。本轮为分析，不进入修复 Task。

## 事实来源

开发实例目录为 `C:/Users/xquan/.openforge-dev`。日志路径由 `apps/desktop/src/main/logger.ts` 的 `APP_LOG_DIR` 确认。检查 `desktop-app/logs/{main,render,im}/2026-10-16.log`，采样时最新写入约为 15:14（UTC+08:00）。当前聊天无关联终端；未取得启动命令完整 stdout/stderr。仓库 `temp/log` 为旧日志，未作为当前证据。

## 当前结论

| 优先调查 | 可靠失败证据 | 影响与置信度 |
|---|---|---|
| P1：会话创建长时间未完成后失败 | main:2646–2663；14:09:42，interactive 创建的 runtime-create 耗时 1840161ms，最终 conversation_not_found；render:122 同步报错 | 一次创建失败且耗时约 30 分 40 秒；原因、期间是否删除会话或网络挂起未知 |
| P2：渲染列表重复 key | render:138–422，共 252 条 same key，至少包含 event-1215 | React 列表身份冲突已确认，可能重复或遗漏条目；未实际验证界面影响与事件来源 |
| P2：SSH 错误未被局部处理 | main:569、581，09:35:51，uncaughtException: Connection lost before handshake，栈来自 ssh2；14:46 另有 6 次目录读取 Channel open failure | 握手失败逃逸到全局异常处理已确认；不据此声称进程崩溃，远端通道失败本身可能为环境问题 |
| P2：插件 Hook 处理器缺失 | main:806–812，6 次 PreToolUse 与 1 次 Stop handler not found | 处理器调用失败已确认；是否涉及插件卸载、热更新及具体降级行为未验证 |
| P2：远端 Skill 展示元数据路径被当作本地路径 | main:1946–2250，39 条 ENOENT，路径为 C:/home/ubuntu/.agents/skills/... | 本地读取 Linux 路径失败已确认；源码 skill-service.ts 的 loadSkillPackagePresentationIcon 抛错后忽略 presentation，不据此声称 Skill 执行整体失效 |
| P2：重试与活动轮次冲突 | main:598、608、653；render 对应 MessageListFooter resume failed，共 3 次 Session already has an active turn | 用户恢复入口失败已确认；需区分重复点击、自动续跑竞争与状态未同步 |

其他失败：09:25 两个插件开发服务器绑定 53955/53953 端口遭 EACCES；09:26 模型请求返回 403 ENTITLEMENT_ERROR；另有网络变化、连接重置和取消请求。它们不能仅凭日志认定为产品代码缺陷。

启动 runtime-and-cli 的 7618ms、3500ms、1573ms 慢任务提示、Electron 弃用/CSP 警告与 federation 重复注册应和功能失败分别评估。im 当日日志未匹配到 error/warn。

## 被否决的方案

不直接按报错次数定位根因，不通过重启抹去现场，不调用真实模型或主动连接远端复现。当前请求为查看日志，不自动扩大为修复、UI 自动化或完整检查。

## 代码/测试/指标锚点

- 日志位置：`apps/desktop/src/main/logger.ts:24`。
- Hook 缺失返回：`apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.ts:325`。
- Skill 展示错误降级：`apps/desktop/src/main/skills/skill-service.ts:201`。
- 使用 PowerShell Select-String 对 error/warn、same key、uncaughtException、presentation ignored、Plugin hook handler not found 分类计数并核对日志行号。采样 main 为 28 条 error、57 条 warn；日志仍可能继续追加。
- 未运行测试、bun run check 或 verify:ui：没有代码变更且本轮仅分析，尚无隔离的失败复现。未修改发布说明：仅保存本次调查证据，无产品行为或发布内容变更。

## 失效条件与置信度

日志可靠证明上述失败曾发生，不能证明当前仍可复现。不同时间存在开发实例重启，不将全日日志视作一次启动。代码热更新、构建产物版本差异、远端状态变化均可能改变结论；根因均待隔离验证。

## 下一步触发信号

进入修复时按独立 concern 建立 Bug/Issue 与关联 Task；优先建立会话创建超时/失效、重复事件列表、SSH 握手断连的隔离回归。Hook 关注注册/销毁与已有会话快照；Skill 关注远端元数据是否通过宿主文件读取边界。复现前不把候选根因写为已确认结论。

## 2026-10-16 源码、记录与 Git 追查

本轮续接用户的原因与修复历史查询，仍为分析；不修改实现、不提交、不推送。`HEAD` 与本地缓存的 `origin/dev` 均为 `a4ccf2938`；未 fetch，不能证明服务器当前分支位置。工作区仅本调查报告与 Research 索引未提交。未证实正在运行的进程加载的构建版本，不能以源码存在等同现场修复生效。

### 已能连通的 Skill 失败链路

`createDesktopSkillResourceRuntime` 复用 `createDesktopSessionResourceRuntime`。后者在 SSH cwd 下返回 `presentRemotePathsAsSeenByTools` 包装，其 `getSkills` 把 filePath/baseDir 从 SSH URI 转成远端绝对路径。`SkillService.list` 随后把这两个字段送入 `loadSkillPackagePresentationIcon`，该函数直接使用本机 `readFileSync` 和 `statSync`，没有经过项目资源访问端口。远端 `/home/ubuntu/...` 因而在 Windows 本地读取中失败，与 39 条 ENOENT 一致。可确认消费者接线不匹配，尚未执行隔离回归。

- 相关历史：`3d3abc9b0`（2026-09-20，远程项目读取远端指令与技能）；`3e0d7008f`（同日，模型所见技能路径由内部 URI 改为远端绝对路径），后者已包含于 HEAD。
- 这两项并非展示读取错误的修复；路径展示包装被技能列表复用，遗漏了本地 presentation 消费者。未找到本次症状的专项 Bug/Task 或修复提交。
- 代码锚点：`apps/desktop/src/main/agent-runtime/resource-runtime.ts`、`skills/skill-service.ts:193`、`abilities/presentation/skill-package-presentation.ts:37`。

### SSH：高置信候选缺口，非已完成根因复现

`packages/ssh-transport/src/ssh2-runner.ts` 的 tryConnect 在 onError 中 cleanup 移除 ready/error 监听，reject 后 catch 调用 client.destroy；失败连接不会进入 installClient，也就没有其常驻 error 监听。若失败后的清理再触发 error，存在无人监听的窗口，可解释全局握手异常。现有 ssh2-runner.test.ts 的 FakeClient.emitError 在无 error 监听时自动补 no-op，无法证明真实 Client 在此窗口安全。必须以隔离的连续错误/销毁事件测试确认。

- 相关 BUG-0057 / TASK-0165、`925868a08` 修的是交互认证预算与口令复用。
- 相关 BUG-0061 / TASK-0169、`3bb76e5c8` 修的是失效后的迟到连接/探测；不是上述失败连接 error 生命周期。
- 未检索到专门处理本次未捕获握手异常的记录或提交。远端 Channel open failure 的服务端原因仍未知。

### 续跑：已有相邻修复，但不是本次错误

BUG-0109 / TASK-0261 对应 `c35d10034`（2026-10-15），已包含于 main。它修复持久路径被当作 runtime ID，并增加跨会话身份守卫。Task 记录了 3 文件 12 例通过，同时明确忙碌/recovery_required 提示未实现；Bug 正文仍写待实施，与 Task 的交付记录不同步。

今天的报错为 Session already has an active turn，说明与旧 SESSION_NOT_FOUND 不同。当前 MessageListFooter 的 showResumeBar 只以 interruptedErrorKind/runtimeSessionId/retryLabel/pendingLabel 门控，未直接检查活动轮次；onResume 无本地在途点击锁。由此存在旧错误残留、自动续跑或连续点击与真实活动轮次竞争的候选路径，尚不能从日志判定是哪一种。不能用 BUG-0109 已修复来关闭今天的问题。

### 其余三类：已定位边界，未锁定唯一原因

- 重复 key：MessageListView 的 getKey 为 conversationItemRenderKey，优先 renderKey，再 entryId、id；document 的 nativeConversationEntryId 为 event-${sequence}。说明 event-N 是事件/文档身份，不能由报错直接判定持久层已写入重复事件。聚合跨会话缺作用域、历史与 live 合并重复、或其他列表消费者均需继续隔离。已有 item-key 与 transcript-window 保持身份的实现（相关提交 `a083bbc18`、`3131b4e1c`），没有找到覆盖今天 252 条报错的专项修复记录。
- Hook：plugin-host-bridge 按 pluginId/handlerId/activationId 查 Map，缺项直接返回日志中的错误；注册的 disposable 会删除该项。已定位为请求身份与当前注册表不一致，激活失败、热更新/销毁、旧会话持有旧 activationId 都是候选，未证实其中任一，也未找到专项修复记录。
- 会话创建：1840161ms 落在整个 runtime-create；agent-backend-admission 中 route.acquire failed 也会包裹 defaultBackend.createAssembly 内部失败，不能把观察名解释为排队等待了 30 分钟。最终为 conversation_not_found，但等待发生在后端哪个步骤、记录是否在期间被删除未知。TASK-0223 / BUG-0085 的约 30 分钟问题针对 Provider 流停滞重试，不是会话创建，不能因时长接近而混同。

查询范围为现有 project/bugs、tasks、issues 与本地 `git log --all`、目标路径历史；“未找到”不等于证明仓库外没有记录。此次未运行测试，以上分别标注源码接线证据与待复现假设。

## 全部保留日志复核（2026-10-16）

### 范围、计数与限制

扩展检查开发实例 `desktop-app/logs` 的 30 个日志，以及仓库 `temp/log` 的 15 个归档，共 45 文件、约 7.87MB；时间覆盖 2026-09-28 至 2026-10-16。包含 main/render/im、action-cli/pdf-cli 及 10-13 独立日志。没有读取其他生产状态目录、会话正文或凭据。提取标准 warn/error 头 3858 条；规范化、脱敏后为 162 个签名，详见[完整签名附表](dev-log-audit-inventory.md)。初步较弱归并为 168 类，最终附表进一步合并路径/主机差异为 162 类，不等于 162 个 Bug。

计数为出现次数：同一故障可能同时写 main/render、console/diagnostics；归档也可能复制现场证据，不能当作独立事故总数。针对多行错误额外核对 stack、errorCode、message、Schema path；不是只凭第一行分级。旧日志、旧机器的打包日志与本机 dev 分开判断；报错时间晚于提交也不能单独证明运行时已载入该提交。所有“无再现”均仅指可用日志，不能证明已彻底修复。

### 当前源码仍有证据的新增缺口

1. **[BUG-0118](../bugs/BUG-0118-report-canvas-showcase-enum.md)，P2：report-canvas 展示元数据失效。** 共 25 次 ZodError，最近 dev/main/2026-10-15.log:3154。`packages/skill-presets/report-canvas/ability.json` 默认/英文 showcase.canvas 为 markdown，Schema 只接受 design/code/docs/generic/browser/terminal/board。不是缺少 detail.format，union 的第一分支会产生伴随诊断，真正匹配 inline 分支的字段错误是 showcase.canvas。已用 Bun 导入真实 marketplaceDetailBlockSchema，对实际 JSON 的首个 block 执行 safeParse：report-canvas=false，architecture-canvas=true。引入相关提交 `0d7605a87`，未找到后续修复。影响展示，不等于技能执行失败。
2. **[BUG-0119](../bugs/BUG-0119-terminal-owner-listener-retention.md)，P2：终端监听器残留。** dev/main/2026-10-12.log:1333–1343 明确 11 个 destroyed listener，栈指向 trackOwner。当前 terminal.ts 中导航 release 清掉 owner Set，却没有移除另外两个 once；重开会重新注册。attachSubscription 也未配对解除生命周期监听。`0710cd6a1` 加强 PTY 崩溃回收但未补成组解绑，未发现后续修复。已核对源码，尚未跑隔离生命周期回归，不夸大为已测得内存泄漏。
3. **远端 Skill 展示读取仍错位。** 全量共 195 条（此前单日 39），10-08 至 10-16 持续出现；原因与 Git 链路见前节，未找到展示消费者修复。
4. **忙碌会话仍可点击续跑。** 全量 main 4 条、renderer 对应 4 条（同一批失败的两侧记录），最近 10-16；BUG-0109 修的是 ID，不覆盖活动轮次竞争，TASK-0261 也保留忙碌错误提示缺口。

除两条新立案外，其余 concern 继续在本调查跟踪；未进入实施，不新建修复 Task。

### 必须继续跟踪，尚不能宣称已修复

| 问题 | 失败证据与最近日期 | 与源码/Git 对照后的判断 |
|---|---|---|
| 会话历史预览及重开失败 | 10-15 main:4386 的 viewer-open 无 reader，4419 的 create 无 backend owns，renderer:382 同步失败 | session-services 按 canRead 选择 reader，session-backend 按 catalog.ownsSession 路由，均未匹配。可能为删除后的旧索引、所有权记录丢失或无适配后端；不能只归为 BUG-0097，后者只改善能力断言错误分类。未找到此次普通会话重开失败的专项修复 |
| Renderer 实际崩溃 | 10-14 main:1678，reason=crashed，exitCode=-36861；清理 12 个订阅，后续访问已销毁帧又失败 | 不是普通 React 警告；日志栈采样也失败，无 dump，不能定因为 OOM、终端监听或 BUG-0101。未找到针对该崩溃的已验证修复 |
| Markdown Hooks 顺序错位与路由崩页 | 10-15 render:1–26，MarkdownContent2 的第 17 个 Hook 从 useEffect 变成 useCallback，随后 ref 写入失败 | 之前 01:08 的 `b5fdde595` 修改 streaming.ts 的自定义 Hook，时间与开发热更新相近，HMR 保留旧 Hook 状态是候选；当前源码未据此证明条件 Hook 错误，也没有冷启动复现。此提交修短语亮度，不是 Hooks 崩页修复 |
| sessionId 未定义 | 10-14 render 多次 ReferenceError，48 条，最近 20:10:08 | 现场无组件来源栈，可能为开发中间态或未捕获变量引用；不能因后续 `c35d10034` 也涉及 sessionId 就说已修。保留待定位，无隔离复现 |
| 原生文件拖出失败 | 10-05 main 4 次 native drag failed: Invalid paths | 当前 native-file-drag 已生成非空 file/files；目标存在检查也在，不能只凭日志把锅归给空路径。没有确定后续修复，需区分 Electron 平台限制、目录/多文件和当时构建 |
| allstar-coding 展示身份不匹配 | 4 次，最近 10-10 main:2057，运行时身份为 0.2.0 | 当前源码 plugin.json 与 ability.json 均为 0.3.2，`6094052f4` 已有版本联动，但报错来自旧安装/构建也可能。不能宣布现行源码仍必错，也不能宣称已完成现场验证 |
| 插件缺失 Hook/超时 | 全量 PreToolUse 缺失 117、Stop 缺失 5；另 PreToolUse 超时 1、UserPromptSubmit 超时 2、Stop 超时 1 | 缺失身份注册问题仍见 10-16，超时最近 10-14，二者分开。`22d90527c` 的 ac-fence 会话门是主/子会话判定修复，不覆盖宿主 activation 注册表生命周期 |
| SSH 握手逃逸/远端通道失败 | 握手 uncaughtException 2，10-16；另多主机目录读取超时与 Channel open failure | 握手监听缺口见前节；通道 open failed/timeout 可能是远端权限、SSH 服务配置或失效连接，缺少隔离证据，不擅自连接真实主机 |
| 配置应用失败 | 10-16 main:475，AGENT_CONFIGURATION_APPLY_FAILED，随后自动重试 | 只记录操作与 code，没有内层原因，无法把它确定归因于前面的订阅 403 或网络；尚无针对性修复证据 |

### 已有明确相关修复，不能重复当作新发现

| 历史症状 | 记录与 Git | 本轮结论 |
|---|---|---|
| setIgnoreMouseEvents 调用失败（main/renderer 各 90） | BUG-0086，`470ade9da` 10-12 12:43 | 保留日志最后 10-12 11:04，早于修复；不计入当前新增未修复清单 |
| flushSync DEV 告警 74 | BUG-0083，`e8377d854` 10-10 09:54 | 最后 09:36，早于修复 |
| ac-fence 审计 fs.write 拒绝 | BUG-0088，`7494ffa44` | 日志最后 10-09，修复 10-12；与 10-16 Hook handler 缺失不是同一故障 |
| CLI shim EPERM copyfile | BUG-0089，`efec1dc25` | 最后 10-10，修复 10-12 |
| updater 缺 app-update.yml / feed 404 | BUG-0090，`43967e587` | 缺文件最后 10-08，404 最后 10-10，修复 10-12；其他网络断连不因此消失 |
| team 整体恢复回滚、不可读会话无法删除 | BUG-0093 / BUG-0087 / BUG-0108，`967967daf` / `55f6b45c0` / `64ccf25c1` | 历史证据主要 10-10，分别已有隔离/尽力清理修改；不能拿来关闭 10-15 普通会话无后端认领问题 |
| 文件锁竞争、终态恢复、压缩并发版本冲突 | BUG-0100 / BUG-0091 / BUG-0110，`903ceead2` / `91596a60e` / `628d0e46f` | 压缩最后失败 10-14（含取消/熔断），串行提交修复 10-15；其余典型日志早于对应修复 |
| 团队测量 Maximum update depth | BUG-0101，`3e9cea960` 10-13 12:30 | 10-13 独立日志 09:22，早于修复 |
| tar 不支持 --force-local、ResizeObserver 噪音、浏览器导航废弃 API、无效代理、后台通知丢失、孤儿 tool_call | BUG-0023 / BUG-0046 / BUG-0048 / BUG-0099 / BUG-0098 / BUG-0096 / BUG-0095 | 均有专项记录；本轮不据旧症状重复立案，不把 verifying 等同人工已验收 |
| retry IPC unknown assistant event type | ISSUE-0022；后续容错提交 `154d03fa8` 与相关协议调整需按错误类型区分 | 最后证据在旧归档 09-28，没有新现场失败；不只凭该容错提交就保证 retry 事件语义已正确，仍以原记录验收为准 |

### 开发环境错位、外部失败与低置信诊断

- **SSH 传输页**：onTransferEvent 非函数 62 条，另 sshTransfers/sshTransferItems 未定义共 3 条。TASK-0240 明确记录旧 preload 与 HMR 的 Renderer 不匹配，以及重建 preload/重启处置；未定义变量的日志在 10-12 17:33–17:34，早于最终 `1c627a0f2` 17:58 提交，当前源码已存在相关变量，不重复立案。
- **Vite/插件导入**：10-14 插件缺导出、module reload 失败，以及早期 renderApp 动态导入失败，均缺冷启动重现。content-creation 10-05 的 unregistered capability 亦需区分旧 SDK/宿主构建错位；不当成已复现的当前合同缺陷。
- **网络/权限/取消**：模型订阅 403、模型未配置、远端 timeout/reset、updater 网络失败、语音模型下载失败、能力 session inactive/aborted、系统插件覆盖被拒等分别保留签名；这些可能是合理拒绝或外部环境失败，不直接升格为软件 Bug。
- **启动与资源提示**：runtime-and-cli 慢任务 27 条；Electron console-message 弃用；federation 重复注册 76 条；开发 CSP 提示；iframe 脚本被 sandbox 阻断、allow-scripts+allow-same-origin 警告、aria-hidden 焦点警告。需要具体用户影响或安全边界复核才能立案；现有 RichCodeBlock 的 sandbox 为空，脚本阻断可能是设计行为。未从告警数量推断打包版存在同一 CSP/隔离缺陷。
- 原始签名、最后时间和文件行号均可由附表追索；“未找到专项修复”仅针对本地已保留历史，不覆盖尚未 fetch 的分支或独立私有仓库。

### 本轮交付与验证

新立 BUG-0118、BUG-0119，未建修复 Task、未修改生产或测试实现。保留原六类 concern，补充全量签名附表与已修复/环境/待定位分类。实际验证为日志分类、Git 历史对照、源码核对、Bun 实际描述 Schema 校验及 git diff --check；没有运行完整测试/check、UI 自动化或真实 Provider。新记录与索引尚未提交，未推送。

## chenxvhua 分支来源复核

用户所称 chenxuhua 在本地远端引用中名为 `origin/chenxvhua`。仅核对本地 Git 对象，未 fetch，不把提交作者或分支包含关系单独当作因果证据。

- **可明确关联的历史缺陷**：`b64f463f9`（Chenxvhua，10-05）引入 ac-fence 审计写入而 plugin.json 只声明 agent.skills.control/agent.hooks.register/agent.hookHandler.execute，没有 fs.read/fs.write；经 `8935058fd` 合入 main。对应日志 BUG-0088 的 fs.write 拒绝，已由 `7494ffa44` 修复并包含于当前 HEAD。该次 merge 相对第一父提交仅涉及 allstar-coding 与发布说明，没有修改终端、SSH 资源包装或 report-canvas。
- **另一明确关联的历史缺陷**：`22ebf3a69`（Chenxvhua，10-08）新增黑盒 shell/读域判定，BUG-0082 记录复合命令与路径穿越的失败回归；修复 `62f3bd0b2`、`c3a55e53c` 已在当前 HEAD。ISSUE-0032 登记的更广写域/重定向/URL 边界仍需单独判断，不等于原 BUG-0082 没修。
- **不能据插件归属定责的现存异常**：allstar-coding PreToolUse handler not found 与插件相关，但 vetta-ui-design Stop 也发生同类错误；缺失由宿主 plugin-host-bridge activationId 注册表判定，尚未隔离证明是该分支插件代码、宿主生命周期或开发热更新所致。不能直接归为 Chenxvhua 引入。
- **本轮新增缺口不来自该次分支合并**：BUG-0118 相关 `0d7605a87`（xinquanhuang，09-24）；BUG-0119 相关 `1f2a7a524` / `0710cd6a1`（09-21）；远端 Skill 包装 `3e0d7008f`（09-20）。它们早于上述 ac-fence 合并，且不在该 merge 的变更路径内；没有证据把这些具体缺口归因于 chenxvhua 的 allstar 改动。
- 缓存的 chenxvhua 另有较新 `350e878e1`（流水线职责收束）与 `9550b16d3`（围栏路径归一化）不在当前 HEAD；它们不能解释当前 main 已运行日志，也不能当作当前 main 已取得对应修复。分支合入 origin/dev 的 merge 不能反过来证明 dev 上所有旧问题都由该分支引入。

会话创建、重复 key、Renderer 崩溃、Markdown Hooks 等仍没有足够的引入提交/隔离复现证据；本轮不按分支猜测归因。
