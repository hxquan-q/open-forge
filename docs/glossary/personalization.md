<!-- Modified by The Open Forge contributors. -->
# 个性化与 Provider 配置

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 个性化（personalization）

一个**全局、跨所有项目/session** 的系统提示词追加能力，入口在 desktop 设置页「Agent配置」最上方。由两部分组成：一个 [[人设]] 单选 + 一段 [[自定义指令]] 自由文本。配置写入 `~/.vetta/agent/settings.json` 的 `personalization` 块（`{ personaId, customPrompt }`），与 [[image budget]] 的 `maxRecentImages` 同文件不同字段。

生效走 [[个性化懒重建]]：点「应用」只落盘、不触发任何 session 重建；每个 session 在**下一个 user prompt** 时按需检测并重建系统提示词。语义刻意复刻 MCP 的懒重建（mcp.json 写盘不 fan-out，prompt 入口 diff-reload）。

默认态（`personaId = "default"` 且 `customPrompt` 为空）**什么都不追加**，系统提示词与未开启该功能时完全一致。

### 人设（persona）

[[个性化]] 的预设提示词项，**唯一编辑来源**是 coding-agent 的 `src/core/personas/*.md`（一人设一个 md，frontmatter 存 `id / label / description`，正文存提示词）。构建期由 `scripts/generate-personas.mjs` 把 md 内联成 `src/core/personas-data.ts`（`FILE_PERSONAS`），`personas.ts` 引入它合成 `PERSONAS`——**运行时零文件系统依赖**。settings.json 只存 `personaId`，提示词正文在系统提示词构建时由注册表解析。desktop 通过 IPC 拉取注册表渲染选择器，避免前后端清单漂移；日后改预设措辞对存量用户自动生效。

**为何 codegen 而非运行时读盘**：coding-agent 会被 desktop 的 `vite.main.config.ts` 打进 main bundle（不在 external 列表），打包后基于 `__dirname` 的 `readdirSync` 会落到 desktop 的 dist 路径、读不到 md（同 photon-node 的 `__dirname` 失效问题，注释已记载）。曾先用运行时读盘，desktop 里只显示「默认」即此故。内联成字面量后任何打包/二进制场景都稳。

特殊成员 `default`：no-op 占位，不落 md、在 `personas.ts` 里合成并永远置顶。首期除 `default` 外有 `务实`（回答精炼、切入准、不绕弯、专注任务）与 `交互`（主动提问对齐需求、附推荐方向、获授权再执行）。**人设正文用英文写**（label/description 保持中文供 UI 展示）。新增人设 = 往目录加一个 md（按文件名排序决定展示顺序）后重新构建（`bun run build` 会先跑 `generate:personas`），不触碰存储与注入逻辑。

人设正文是**预设、产品维护**的；与 [[自定义指令]] 正交——后者是用户自己写的。

### 自定义指令（custom instructions）

[[个性化]] 中用户在 [[人设]] 之上追加的一段自由文本（设置页 textarea），存于 settings.json `personalization.customPrompt`。与人设**相互独立**：即便选「默认」人设，只要本文本非空就照样追加。

刻意不叫「全局提示词」——「全局」在本系统里已指 [[个性化]] 的作用域，复用会歧义。

### 个性化懒重建（personalization lazy reload）

[[个性化]] 的生效机制，与 MCP 懒重建、`image budget` 懒重读同构：desktop 写 settings.json 后**不** fan-out 重建；coding-agent 在每次 `prompt()` 入口对 `personalization` 块做签名比对（缓存上次签名，相等走 fast-path、无副作用），变化时才重建系统提示词、令本轮 prompt 立即看到新人设/指令。

刻意与 `APPEND_SYSTEM.md` 文件注入分离：那条路径只在 session 初始化/显式 `reload()` 时读盘，无 per-prompt 懒重载；个性化需要「应用后下一轮即生效」故走独立的轻量签名路径。注入位置见 [[个性化]]——拼在系统提示词末尾，顺序为 `APPEND_SYSTEM.md → 人设 → 自定义指令`。

### 预设模板（provider template）

服务端下发的、用于「免配置接入大模型服务商」的**目录条目**:每个模板描述一个服务商的 `baseUrl`、模型列表(含上下文/输入形态/是否思考/价格等能力元数据)、`api` 类型、供应商图标等——但**不含 key**。客户端启动时 fetch 一份(BYOK 直连,见下),用户只需填入**自己的 key** 即可使用该服务商的预设模型。

与 [[远程网关]] 是**两个独立、并存**的来源,术语上刻意不复用 "remote":
- **预设模板 = BYOK 直连**:请求直发服务商原站(`api.anthropic.com` / `api.deepseek.com` …),用**用户自己的 key**,服务端只提供目录、**不碰 key、不转发流量、不扣 credits**。
- **远程网关**:请求经服务端代理(`gatewayUrl`),用登录 JWT 当 key,服务端可计费。

**采纳即持久化(snapshot-on-key)**:用户给某模板填入 key 的那一刻,该模板被落成本地 [[models.json]] 里的一个普通 provider 条目(带 `apiKey`),并打上来源标记 `source:"template"` + `templateId`。由此 `getAvailable()` / `ModelSelector` / 离线 fallback 全部复用既有机制。手搓的自定义服务商无此标记,**任何同步逻辑都不得触碰**。

**在线合并 / 离线回退快照**:每次 fetch 成功,用服务端最新的 url/模型/参数**覆写** `source:"template"` 的本地条目(只保留用户填的 `apiKey`);服务端删除该模板或 fetch 失败时,本地已持久化的快照照常可用——「服务端能修正错误配置」与「离线/下线不影响存量用户」二者兼得。

设置页中作为**独立的「预设服务商」区**呈现,与「服务商」(手搓自定义、models.json 中无 `source` 标记)、[[远程网关]]「远程服务商」三区语义并列、互不重复:`source:"template"` 的条目只在预设区显示、从手搓区隐藏。fetch / 合并 / 写回 [[models.json]] **只发生在 desktop main 进程**;coding-agent 不感知模板,仅需其 ProviderConfigSchema 容忍 `source`/`templateId`/`icon` 字段,复用同一份已持久化的 models.json。无内置种子目录:首启离线且 fetch 失败时预设区为空 + 提示重试。填入 key 即持久化启用、**不做 /models 校验**,首次真实请求才暴露无效 key。

### 远程网关（remote gateway）

见 [[预设模板]] 的对比定义。指现有的 `fetchRemote → /providers/models.json` 机制:登录后服务端下发模型,请求经服务端代理转发(`gatewayUrl`),以登录 JWT 为 key,服务端可计费。是与预设模板**并存**的另一条链路。同样携带 [[icon symbol]]。
