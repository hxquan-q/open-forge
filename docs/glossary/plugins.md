<!-- Modified by The Open Forge contributors. -->
# 插件与扩展

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 可信插件（trusted plugin）

Vetta 桌面插件的信任定位：**一方/可信 + 策展分发**——插件由官方或合作方编写、经审核后上架，继续跑在 renderer 进程内、经 Module Federation 共享宿主 React 单例（见 `plugin-host-shim`）。因此插件 SDK 暴露的 API 是「**策展过的能力出口 + 权限门控**」（ergonomic + `PluginPermission` 校验），刻意**不**追求 iframe/worker 沙箱与异步消息桥——那是「不可信第三方」模型才需要的，当前明确不走。新增对话类 API 时按此前提设计：可同步、可直接传 React 组件实例、可读宿主 store。

### 文件预览插槽（file preview slot）

[[可信插件]] 的第二类 UI 扩展点（第一类是 App.tsx 的全局 slot）：插件按**文件扩展名**贡献一个预览组件，挂进 desktop 活动面板的 `FilePreviewView`。

**优先级 = 仅补空白**：内置显式支持的扩展名（image/audio/pdf/html/docx/markdown/json，见 `FilePreviewView` 的 `*_EXTENSIONS` 集）一律走内置，插件**无法**抢占；只有内置不认、本会掉进文本兜底（`CodePreview`）的扩展名（如 `.drawio`）才查插件注册表，命中即渲染插件组件，否则维持文本兜底。一个坏插件不会退化任何现有内置预览体验。

**组件契约（slot 组件首次接收 props）**：与全局 slot「零 props 自包含」不同，预览组件收到 `{ path, name, extension, mime, size }` + 一组内容访问器 `readText() / readBytes(): ArrayBuffer / getUrl(): string(可 fetch 的流式 URL)`。宿主**不**替插件预读/猜编码——插件自决按文本还是二进制读，`path` 也直接暴露，便于走原生 fetch。由此天然兼容二进制格式与大文件（宿主不再全量 base64 进内存）。

**声明机制**：`activate` 内命令式注册，`ctx.ui.registerFilePreview({ extensions: ["drawio"], component })`，与 `registerGlobalSlot` 同构、插件启动时注册（沿用现有 eager 激活，不引入 manifest 声明式/懒加载）。同一扩展名多插件抢注时**先注册者胜** + `console` 警告。

**权限**：注册需新权限位 `ui.slot.file-preview`（与 `ui.slot.global` 对称）。但内容访问器（readText/readBytes/getUrl）**不**额外要 `fs.read`——读的是用户主动点开、宿主中介交付的那一个文件，非任意文件系统访问，边界止于此。

### 活动面板插件 tab（plugin activity tab）

[[可信插件]] 的第三类 UI 扩展点（前两类是全局 slot 与[[文件预览插槽]]）：插件经 `ctx.ui.registerActivityTab({ id, label, icon?, component })` 命令式注册（与 `registerGlobalSlot` 同构，一个插件可注册多个），注册仅进入「可添加池」，**不直接渲染**——由用户在活动面板手动 attach 后才出现为一个 tab。权限位 `ui.slot.activity-tab`。

**attach 单位是 contribution 而非插件**：一条 attach 记录指向 `pluginId:tabId`。**作用域 key = 当前会话的 cwd**：普通项目所有 session 共享项目 cwd → attach 天然项目级同步；默认「对话」项目每个 session 有独立子目录 cwd（ADR-0007）→ attach 天然 per-session 隔离，**不靠任何对「对话项目」的特判**（见 ADR-0026）。attach 记录（cwd → contribution 列表）持久化在 renderer localStorage，与 sidebar width 等 UI 偏好同一套路。

**增删同一入口**：hover tab 栏右侧浮现"+"按钮，弹出勾选列表（勾=attach、取消勾=remove），不给 tab 本身加右键/关闭交互。插件 tab 追加在所有内置 tab（含动态 todo/后台任务/调试）之后、按 attach 顺序排列，无拖拽。**渲染 = attach 记录 ∩ 当前已注册 contribution**：插件禁用 tab 即隐、重新启用即回，记录不随插件状态联动删除。组件契约与全局 slot 同构（零 props，会话上下文走 [[对话插件 API]] hooks），icon 传 React 节点而非 iconify class 字符串（后者依赖宿主 CSS 扫描、静默失败）。

IM 会话查看器（SessionViewerPage）**首期不支持**——其 cwd 是单一固定目录，无法满足 per-session 隔离语义。

**面板作用域出口**：插件 tab 组件经 SDK hook `useActivityTab()` → `{ cwd }` 拿到「自己被渲染在哪个 cwd 的面板里」（plugin-sdk 定义 React Context、宿主渲染时 Provider 注入）。不要用 `useActiveConversation().cwd` 代替——项目详情页的 ActivityPanel 是显式项目 cwd，活动会话可能属于别的项目，两者会错位。

_Avoid_: 把它当成第三个"自动渲染"插槽——全局 slot 与文件预览插槽注册即生效，本插槽注册只是入池，attach 才生效。

### 移动UI预览（mobile UI preview）

[[活动面板插件 tab]]形态的外置示例插件（id `mobile-ui-preview`，位于 `packages/plugins/externals/`，需用户自行安装）：在仿真移动设备边框（react-device-mockup，命名机型预设表映射形态+逻辑分辨率，含 iPhone 三形态 / Android / iPad，自绘 iOS/Android 两套仿真状态栏，支持横竖屏）内预览当前作用域的 HTML 页面。html/htm 候选按面板 cwd 递归列出（复用平台递归排除规则），iframe src 走 [[静态文件协议]]故相对资源可用；所选 html 变更自动刷新 + 手动刷新兜底。机型/横竖屏偏好全局记忆，所选 html 按 cwd 记忆。

_Avoid_: 把设备边框当像素级真机渲染——逻辑分辨率 + 整体 scale 适配面板宽度，是 UI 形态仿真不是真机仿真。

### 静态文件协议（vetta-file://）

desktop 主进程注册的通用静态文件协议：`vetta-file://local/<绝对路径>`，**pathname 承载路径**（区别于 [[媒体流协议]] 的 query 参数形态），故 HTML 内的相对资源（css/js/图片）能按目录正确解析；mime 按扩展名映射常见 web 资源，路径校验复用预览沙箱（项目根/主目录内可读）。动机：iframe `srcDoc` 无法加载相对资源，凡需「整页带资源地预览项目内 HTML」走本协议。见 ADR-0027。

_Avoid_: 与 [[媒体流协议]] 混用——vetta-media 专责音视频 Range 流，vetta-file 专责静态整文件，不合并。

### 对话插件 API（conversation plugin API）

[[可信插件]] 在 agent 对话场景可用的能力出口，首期三类（斜杠命令明确**不**做、steer 缓）：

**读状态（hook 为主 + 事件补非 React）**：宿主从 `@vetta-org/plugin-sdk` 导出 hook —— `useActiveConversation()`（→ id/cwd/title/model/isStreaming）、`useConversationMessages()`（→ ChatMessage[]）等，hook 内部读宿主默认 store 的 `activeSessionAtom` / `chatMessagesAtom` / `isStreamingAtom`、自动 rerender。落地靠：宿主在 `installPluginHostShim` 时把 jotai store/atoms/actions 注入 plugin-sdk 的内部 bridge，Module Federation 令宿主与插件共享同一份 pluginSdk 实例，故注入对插件 hook 可见（plugin-sdk 不反向依赖 desktop）。权限：`agent.session.read`。

**事件（实时、细粒度）**：`ctx.conversation.on(event, cb)`，是 `window.vetta.session.subscribe` 生命周期流策展成的插件友好事件，刻意做到「agent 每次调用都有事件、可实时反应」——成员：`turn-start` / `turn-end`（agent_end，携 stopReason）/ `message-added` / `message-updated`(delta) / `tool-call-start` / `tool-call-end` / `conversation-changed`(活动 session 切换)。权限：`agent.session.read`。

**写/驾驶**：`ctx.conversation.sendPrompt(text)`（复用 session.prompt IPC，往活动会话发一轮）、`insertText(text)`（纯 renderer 改 InputBar atom，填而不发，供「建议 prompt」类插件）、`abort()`（复用 session.abort）。权限：`agent.session.write`。

**「活动会话」是环境量**：API 默认作用于当前活动 session（desktop 同时只看一个），不让插件枚举/持有任意 session 句柄。

### 插件内聚 MCP（plugin-scoped MCP）

[[可信插件]] 通过 `plugin.json` 的 `agent.mcpServers`（相对路径 `.mcp.json` 或内联 map）+ 权限 `agent.mcp.control` 贡献自带 MCP server。作为 **第三配置源** 进入会话 `McpManager`，与用户全局 / 项目 `mcp.json` **并列且不回写**用户文件。运行时名为 `plugin-<pluginId>-<localName>`（kebab、无 `_`）。生命周期绑定插件启停：禁用/卸载 reconcile 拆除进程。见 ADR-0040、`docs/plugin/mcp.md`。

_Avoid_: 把插件 MCP 写入 `~/.vetta/agent/mcp.json`——卸载与版本切换会脏化用户配置。

### 系统插件（system plugin）

随 App 一起发布、**用户不可删除/修改**的[[可信插件]]，与用户自行安装的插件（`source: "archive" | "remote"`）相对，来源标记 `source: "system"`。物理上从**只读位置直服**——打包后在 `process.resourcesPath/system-plugins/<id>/`，dev 下在 `packages/plugins/presets/<id>/`——`vetta-plugin://` 解析按 source 选 base 目录，**不**拷进 `~/.vetta`、**不**写进 `plugins-manifest.json`（该文件只存用户态：用户插件记录 + 用户对系统插件的偏好覆盖）。`listPlugins()` 时由运行时发现并与用户插件合并呈现。因随 App 发布，版本跟随 App，不走用户插件的安装更新流。

### 预置插件（preset plugin）

`packages/plugins/presets/<name>/` 下的插件**源码**，在 monorepo 内授权、维护——是[[系统插件]]的「源」面。构建期逐个 build 产出**解压态** `dist/ + plugin.json`（非 zip）：打包时拷进 desktop 的 `resources/system-plugins/<id>/` 随包发布，dev 下直接就地读 `packages/plugins/presets/<id>/{plugin.json, dist/}`。运行时零解压、零拷贝。「放进 `packages/plugins/presets/` 即成系统插件」是该目录的约定语义。

### 插件市场（plugin marketplace）

服务端分发 [[可信插件]] zip 包的目录，与 [[技能市场]] 同构：admin 上传 zip，后端解压读取包内 `plugin.json` 自动入库（id / name / version / description / author / permissions），消费接口需登录 token（不限平台，照 [[技能市场]] 鉴权）。**真相源是平台数据库**——`plugin.json` 仅上传那一刻作为元数据来源，入库后 admin 可改展示字段。与技能市场刻意保留三处差异：

- **不设分类受管实体**：技能有 [[skill category]] 独立实体，插件**只保留自由 `tags`**（jsonb，未来做 taglist 筛选，当前不消费），不引入分类 CRUD。
- **下载原样返回上传的 zip**：[[技能市场]] 下载是从 S3 散文件**重打包成 tar.gz**；插件本质是 zip、且要被 desktop 的 `installPluginFromUrl` 直接消费，故插件**整包作单个 S3 对象存、下载原样吐 zip**，不解包不重打包。
- **单表扁平、不留版本历史**：以 manifest `id` 为唯一键，重传同 id **原地覆盖**（更新 version + 覆盖 zip + 保留 download_count 与创建时间），市场侧只暴露「当前版本」。详见 [[插件版本口径]]。

### 插件版本口径（plugin version semantics）

[[插件市场]]里一个插件的 version 以**服务端 DB 当前行为唯一真相**，来源是上传 zip 内 `plugin.json` 的 `version`。单表扁平、**不保留版本历史**：同 id 重传即原地覆盖旧版本，无回滚、无旧版查询。

这与 desktop 端 [[系统插件]]/用户插件自带的更新流**刻意不对称**——更新流是客户端「装了旧版、市场出了新版」的比对机制，市场侧只需提供「这个 id 当前是哪个版本的 zip」即可驱动它，不需要自己存版本历史。一期采纳与 [[技能市场]] 同构的扁平模型而非 Plugin + PluginVersion 双表，是为最小化首期实现面；代价是市场无法回滚或并存多版本。

### 引导词（guidingWords）

[[可信插件]] 在 `plugin.json` 顶层声明的 `guidingWords?: string[]`：一组该插件想在用户开新会话时主动建议的提示语。是插件**第一个声明式 UI 贡献**——与全局 slot / [[文件预览插槽]] / [[活动面板插件 tab]] 等**命令式** `ctx.ui.register*`（需 `activate` 运行、走权限位）刻意不同：纯静态清单数据，随 [[description]] 同路径从 manifest 流到 `InstalledPlugin`，**无 `PluginPermission`、无运行时注册**。

**唯一消费者是 NewSessionPage**：欢迎页在[[技能管理字段|技能徽章]]下方按插件**分组**展示——每组组标题取插件 `name`，下挂其引导词。入选条件 = 插件 `enabled` 且 `guidingWords` 非空。点击一条引导词＝以其文本为 `overrideText` 走 `openSession → sendMessage(text)` **立即发送**（不填入输入框、不经 atom 异步，规避 stale read）。

**展示用轮播限额**（非数据截断）：同时最多 3 组、每组最多 4 词；组数超 3 则组级 12 秒轮播、某组词超 4 则该组词级 3 秒轮播；未超出则静态。与 [[对话插件 API]] 的运行时 `insertText`(填而不发) / `sendPrompt`(发一轮) 是**两条独立通道**——引导词是会话**开始前**的声明式建议，对话 API 是会话**进行中**的命令式驱动。
_Avoid_: 把引导词与 NewSessionPage 的[[技能管理字段|场景/技能]]混为一谈——后者来自 `skills.list()`（SKILL.md 体系），引导词来自 `plugins.list()`（plugin.json 体系），是两套数据源。

### 插件设置（Plugin Settings）

类似 VSCode `settings.json` + 设置视图的通用机制：每个插件可声明自己想要的设置项，desktop 提供统一的「插件配置」入口渲染它们，值持久化后由插件（renderer）与相关主进程服务共同读取。[[图像生成插件]]用它来配置图像 endpoint / 图像模型 / api key——即[[主进程图像服务]]读取的就是该插件的设置值，而非独立配置文件，也非复用对话模型的 models 配置。
