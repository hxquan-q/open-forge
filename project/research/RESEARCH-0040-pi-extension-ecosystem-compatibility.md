---
id: RESEARCH-0040
type: research
status: done
priority: P1
owner: packages/coding-agent
source: 用户请求插件系统调研与Pi生态兼容方案；Pi官方文档/类型/固定版本生态源码
created: 2026-10-22
updated: 2026-10-22
related_requirement: [REQ-0028]
related_plan: [PLAN-0022]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# Pi 扩展生态兼容边界与固定版本样本

## 问题与范围

为 Open Forge 适配 Pi 生态提供外部证据：核实当前官方扩展、包、Skill、Prompt、Theme、Provider、会话树和 RPC/TUI 合同，并以八个独立仓库的固定源码样本判断移植成本。本文以外部兼容研究为主；本仓插件系统完整现状及路线汇总在[PLAN-0022](../plans/PLAN-0022-pi-ecosystem-and-plugin-evolution.md)，目标见[REQ-0028](../requirements/REQ-0028-pi-ecosystem-and-plugin-evolution.md)。

本轮只读文档、manifest、入口与关键依赖源码，没有安装、执行、打包或实机验证第三方扩展，没有使用真实 Provider、费用 API、用户状态或历史。“候选”仅为源码判断，不表示已兼容。样本是有目的的能力覆盖，不能推导全生态兼容率或规模。

## 事实来源

研究日期按客户端为2026-10-22。GitHub返回的官方commit日期同为2026-10-22，未出现跨日期矛盾。以下“当前”限定为本轮读到的固定源码快照，不声称该main等于已发布npm版本。

- 官方仓库元数据返回 `earendil-works/pi`、默认分支main：[仓库API](https://api.github.com/repos/earendil-works/pi)。
- 官方快照：[`476a303c1250ce002215bfd08bdab5f6886f0573`](https://github.com/earendil-works/pi/commit/476a303c1250ce002215bfd08bdab5f6886f0573)；该快照coding-agent [package.json](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/package.json)为 `@earendil-works/pi-coding-agent@1.4.0`。
- 旧 `mariozechner/pi-mono` connector请求出现断连/404，不能单凭该失败断言迁移链；本轮后续以可直接读取的官方新仓及其包repository字段为准。
- 一手入口：[Extensions](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/extensions.md)、[精确类型](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/src/core/extensions/types.ts)、[Packages](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/packages.md)、[Skills](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/skills.md)、[Prompt templates](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/prompt-templates.md)、[Themes](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/themes.md)、[Custom Providers](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/custom-provider.md)、[RPC extension UI](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/rpc-extension-ui.md)、[MCP](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/mcp.md)。
- 会话树实现：[session-manager.ts](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/src/core/session-manager.ts#L1464)。
- 本仓边界：[contracts.ts](../../packages/coding-agent/src/extensions/pi-compat/contracts.ts)、[factory-adapter.ts](../../packages/coding-agent/src/extensions/pi-compat/factory-adapter.ts)、[tool-adapter.ts](../../packages/coding-agent/src/extensions/pi-compat/tool-adapter.ts)、[pi-extension-compat.test.ts](../../packages/coding-agent/test/pi-extension-compat.test.ts)。只作本轮兼容断面的源码引用，不能替代宿主装配核查。

### 八个固定样本

| 仓库 | manifest版本 | 固定SHA | 读取范围 |
|---|---|---|---|
| [badlogic/pi-skills](https://github.com/badlogic/pi-skills) | 无根manifest | [`90bb51cae365`](https://github.com/badlogic/pi-skills/commit/90bb51cae36515a648515b633a81c0c6efc8c74d) | README、树、manifest（若有）及下表指定源码 |
| [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) | 0.44.0 | [`d0e323ac935e`](https://github.com/nicobailon/pi-web-access/commit/d0e323ac935e8753d11e1853b81c057e39dee4dc) | README、树、manifest（若有）及下表指定源码 |
| [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) | 5.4.0 | [`d0e77a1532d1`](https://github.com/nicobailon/pi-mcp-adapter/commit/d0e77a1532d151f5dd53a23710ba00b804e03490) | README、树、manifest（若有）及下表指定源码 |
| [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) | 0.80.0 | [`36f0686993da`](https://github.com/nicobailon/pi-subagents/commit/36f0686993da5146b675e0523b388f7fc13244bf) | README、树、manifest（若有）及下表指定源码 |
| [jayzeng/pi-memory](https://github.com/jayzeng/pi-memory) | 0.4.2 | [`1e276a762a66`](https://github.com/jayzeng/pi-memory/commit/1e276a762a666a7031459fdf7af018cc7966663e) | README、树、manifest（若有）及下表指定源码 |
| [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) | 0.22.0 | [`ca93a5247e72`](https://github.com/tintinweb/pi-subagents/commit/ca93a5247e72e7053fcd10bea7125d6c4205f949) | README、树、manifest（若有）及下表指定源码 |
| [BlockedPath/pi-agent-plugins](https://github.com/BlockedPath/pi-agent-plugins) | 0.1.8 | [`c0e80f51d155`](https://github.com/BlockedPath/pi-agent-plugins/commit/c0e80f51d155b40bf8d584e2f09ab1bbe3298e51) | README、树、manifest（若有）及下表指定源码 |
| [pasky/pi-amplike](https://github.com/pasky/pi-amplike) | 1.4.0 | [`4019ce681df1`](https://github.com/pasky/pi-amplike/commit/4019ce681df16c65e6dadb82427a0cf16c57a147) | README、树、manifest（若有）及下表指定源码 |

`nicobailon/pi-subagents`仓库根manifest标记private，虽然声明包名和版本，也不能据此认定当前根目录就是可直接npm安装的发行物；其构建/打包产物需要另查。

## 当前结论

### 1. 生态是多种资源与运行时能力，不能按一个“插件格式”吞入

| 资源/能力 | 官方实际合同 | Open Forge应采用的策略（建议） |
|---|---|---|
| Package | npm/git/local，package.json的pi字段可声明extensions/skills/prompts/themes；无pi字段时可按约定目录发现；支持资源过滤 | 先读取、预览与筛选资源，再按实际能力装配；来源、版本、内容摘要进入安装记录 |
| Skill | Markdown指令和随附脚本/资源；并非只读文本 | 优先复用本仓Skill入口，保留baseDir/相对资源；不能把导入Skill当作脚本已授权 |
| Prompt | Markdown模板经斜杠命令展开，带参数替换 | 做模板语法和命令冲突测试，不仅复制正文 |
| Theme | Pi终端/HTML导出的颜色配置 | 独立标为终端主题；不能直接套进Electron/React设计Token |
| Extension | TypeScript/JavaScript工厂，注册工具、事件、命令、Provider与UI；与Pi进程同OS权限 | 小而显式的版本化兼容profile，不默认把任意代码加载到Renderer或主进程 |
| Provider | 支持完整Provider及legacy配置注册，可控制认证、发现与流式协议 | 独立权限与生命周期批次，先支持声明式兼容端点，不能用普通工具桥接替代 |
| TUI组件 | 真实终端Component、焦点/键盘/编辑器/主题对象 | 另做原生UI适配或终端宿主；不承诺无损转React |

此表据上述官方分项文档整理；策略列是研究建议，不是已实现事实。

### 2. 工具签名相似不等于语义兼容

官方1.4.0仍是五个参数：
`execute(toolCallId, params, signal, onUpdate, ctx)`。但最后参数现在是 `ExtensionToolContext`，除常规上下文还包含 `tools`、`executeTool()`；嵌套工具调用经过验证、tool_call/tool_result和权限路径，并保留parentToolCallId/嵌套usage等语义。

同一工具类型还包括 `executionMode`、`outputSchema/structuredContent`、`exposure`、`namespace`、`annotations`、`reachesTools`、`prepareLoadout` 等。将不认识的字段忽略会使调用面、程序性结果或权限判断发生变化。必须明确支持、可降级条件或拒绝原因，不能只根据execute形参数量判兼容。[精确类型](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/src/core/extensions/types.ts)、[工具与exposure说明](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/extensions.md#tools)。

本仓profile名是 `pi-extension-0.84-host-neutral-v1`，明确拒绝parallel/constrainedSampling；工具schema经TypeBox1编译再转入本仓结构。它保留的是有限共享上下文，并没有宣称上述1.4能力可用。[本仓工具适配器](../../packages/coding-agent/src/extensions/pi-compat/tool-adapter.ts)。

### 3. 事件必须逐项证明顺序、返回值和错误传播

官方 `pi.on()` 返回unsubscribe；事件既有通知，也有链式变换、门控、操作边界和最后覆盖等不同组合语义。tool_call失败阻止执行；session_before_*可取消；turn_end/agent_before_settle可提交后续entry并请求继续，agent_settled是另一生命周期事实。不能把相似名字映射为等价，也不能把agent_end当作所有后台工作已经稳定结束。[官方事件指南](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/extensions.md#understand-handler-composition)、[类型](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/src/core/extensions/types.ts)。

本仓兼容factory只公开白名单事件，未开放 `session_start`、`session_shutdown`、`before_agent_start`、`session_before_compact`，并且对未公开API抛错；`on()` facade返回void，`events`总线、flag、Provider等有明确拒绝理由，registerCommand不在profile中。很多生态包会在factory初始化阶段碰到这些边界，因此即使某个工具定义可转译，整个包也可能无法加载。[本仓factory-adapter](../../packages/coding-agent/src/extensions/pi-compat/factory-adapter.ts)。

### 4. 会话树和状态恢复是兼容重点

Pi的 `getBranch()`沿当前leaf追溯父节点后reverse，实际返回根到leaf顺序的当前分支路径；`getEntries()`返回全部分支entry，两者不可互换。官方建议branch-sensitive工具状态从当前分支重建，工具result.details、appendEntry、sendMessage、外部存储各有不同目的。[会话源码](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/src/core/session-manager.ts#L1372)、[状态指南](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/extensions.md#state)。

`ExtensionCommandContext`才开放waitForIdle/newSession/fork/navigateTree/switchSession/reload。生命周期handler不能随意调用命令专用操作；session replacement使旧context失效，新的withSession context才有效。兼容测试至少需要恢复、分支切换、fork、更换session、旧generation回调、关闭清理。[官方context合同](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/extensions.md#context-and-session-changes)。

### 5. Desktop对话框桥接可行，通用TUI转换不可行

RPC模式 `ctx.hasUI=true` 但 `ctx.mode="rpc"`；select/confirm/input/editor可请求响应，notify/status/widget等有部分fire-and-forget桥接。custom()不支持，setEditorComponent/footer/header等无效，widget仅支持字符串行，主题切换也不支持。因此不能把hasUI当完整终端能力标记，也不能声称“接上Pi RPC就兼容全部插件UI”。[官方RPC UI矩阵](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/rpc-extension-ui.md)。

建议首批只桥接明确的对话框、文本状态和结构化工具卡片；Terminal-only包明确显示不支持/需原生适配，或放到独立的真实终端模式。安全确认取消、超时和宿主断开必须失败闭合，不能把空实现解释成批准。

### 6. 依赖、别名和安装也必须纳入兼容

官方建议Pi宿主包与typebox放peerDependencies，运行库放dependencies；物理安装宿主包可能绕过映射形成重复class/registry，编译ESM尤其要验证。管理安装有独立模块根，不能依赖包间共享依赖实例。[Packages](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/packages.md#declare-dependencies)。

因此别名不应只换包名：必须分别检查新 `@earendil-works/*`、旧 `@mariozechner/*`、TypeBox0.34/1、ESM/CJS、顶层await、相对.ts/.js、import.meta.url、包子路径，以及包是否静态导入TUI或SDK类。静态源码扫描仅提供预警，动态import/间接依赖使其不能成为权限证明。

安装过程可能运行lifecycle scripts；样本pi-memory就有postinstall，Skill也可能要求安装npm依赖。这些不因为“只导入资源”就天然无副作用。预览、下载、依赖准备、脚本执行和启用应分离；本轮未安装任何样本。

### 7. 当前Pi已有原生MCP，避免重复所有权

官方当前快照有mcp.json、MCP扩展API和内置MCP；注册同名/mcp命令的外部扩展可替换内置实现。Open Forge已经有自己的MCP能力时，优先定义唯一runtime owner与配置投影，不盲目再启动一套MCP进程、OAuth存储和权限提示。[官方MCP](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/docs/mcp.md#replace-the-built-in-mcp-support)。

这也说明旧生态README/注释有版本边界。例如固定样本pi-agent-plugins的mcp-bridge仍写“Pi没有内置MCP”，那是该样本的旧假设，不能作为当前Pi事实。

### 8. 八样本：实际移植难点

| 样本与源码证据 | 观察到的能力依赖 | 建议兼容等级与障碍 |
|---|---|---|
| [badlogic/pi-skills brave-search](https://github.com/badlogic/pi-skills/blob/90bb51cae36515a648515b633a81c0c6efc8c74d/brave-search/SKILL.md)、[search.js](https://github.com/badlogic/pi-skills/blob/90bb51cae36515a648515b633a81c0c6efc8c74d/brave-search/search.js)、[browser-tools](https://github.com/badlogic/pi-skills/blob/90bb51cae36515a648515b633a81c0c6efc8c74d/browser-tools/SKILL.md) | 独立SKILL目录和Node脚本；baseDir、外部API、依赖/浏览器环境；根未找到package.json | 优先资源导入候选；不能按有根pi manifest的包假设处理；外部程序、凭据和平台需单独配置 |
| [pi-web-access入口](https://github.com/nicobailon/pi-web-access/blob/d0e323ac935e8753d11e1853b81c057e39dee4dc/index.ts)、[MCP server](https://github.com/nicobailon/pi-web-access/blob/d0e323ac935e8753d11e1853b81c057e39dee4dc/mcp-server.ts) | TypeBox1、工具、命令、session_start/tree/shutdown、appendEntry、TUI导入与会话结果缓存；另有独立MCP接口 | 可优先验证其MCP接口或移植纯工具核心；当前profile整包不能保证加载，网络/凭据/缓存清理属于宿主策略 |
| [pi-mcp-adapter入口](https://github.com/nicobailon/pi-mcp-adapter/blob/d0e77a1532d151f5dd53a23710ba00b804e03490/index.ts)、[host-managed](https://github.com/nicobailon/pi-mcp-adapter/blob/d0e77a1532d151f5dd53a23710ba00b804e03490/host-managed.ts) | 动态工具exposure、MCP注册、events跨扩展协议、命令、flags、OAuth/审批与生命周期；host-managed为可研究接口 | 不透明加载第二套MCP owner；可复用协议/设计或受控host-managed接口，先证明与本仓权限和连接所有权不冲突 |
| [nicobailon/pi-subagents入口](https://github.com/nicobailon/pi-subagents/blob/36f0686993da5146b675e0523b388f7fc13244bf/index.ts)、[extension/index](https://github.com/nicobailon/pi-subagents/blob/36f0686993da5146b675e0523b388f7fc13244bf/src/extension/index.ts)、[运行包定位](https://github.com/nicobailon/pi-subagents/blob/36f0686993da5146b675e0523b388f7fc13244bf/src/runs/shared/pi-spawn.ts) | 顶层动态import按环境选择模式、要求重启以替换Node已加载模块；events、消息renderer、context转换、session/后台任务与Pi SDK运行包定位 | 高耦合SDK/多Agent运行时，不能仅凭工具注册兼容；推荐原生能力适配或隔离的Pi宿主实验，不能与本仓编排职责重叠 |
| [jayzeng/pi-memory入口](https://github.com/jayzeng/pi-memory/blob/1e276a762a666a7031459fdf7af018cc7966663e/index.ts)、[manifest](https://github.com/jayzeng/pi-memory/blob/1e276a762a666a7031459fdf7af018cc7966663e/package.json)、[postinstall](https://github.com/jayzeng/pi-memory/blob/1e276a762a666a7031459fdf7af018cc7966663e/scripts/postinstall.cjs) | session/compaction/input/Prompt钩子、文件系统、child_process/qmd、嵌套模型调用、旧兼容子路径；安装有脚本 | 可作持久化/生命周期夹具，默认不开自动抽取；scope/来源/外发预算与REQ-0027方案统一，不能直接向真实用户目录试运行 |
| [tintinweb/pi-subagents主入口](https://github.com/tintinweb/pi-subagents/blob/ca93a5247e72e7053fcd10bea7125d6c4205f949/src/index.ts)、[agent-runner](https://github.com/tintinweb/pi-subagents/blob/ca93a5247e72e7053fcd10bea7125d6c4205f949/src/agent-runner.ts) | createAgentSession、SessionManager/SettingsManager/DefaultResourceLoader、内置MCP/codemode/tool-search工厂、events、持久entry、agent_settled和custom TUI | 是SDK级运行时依赖，不是单一工具；当前profile明确不可透明复用；应单独评估Pi sidecar或原生迁移 |
| [pi-agent-plugins入口](https://github.com/BlockedPath/pi-agent-plugins/blob/c0e80f51d155b40bf8d584e2f09ab1bbe3298e51/extensions/index.ts)、[MCP bridge](https://github.com/BlockedPath/pi-agent-plugins/blob/c0e80f51d155b40bf8d584e2f09ab1bbe3298e51/src/mcp-bridge.ts) | resources_discover、session_start、registerEntryRenderer、确认UI、技能与MCP配置投影；对pi-mcp-adapter有版本假设 | 可借鉴资源containment/窄组件失败，首批不叠套另一个插件管理系统；“Agent Plugins 1.0”是该社区实现声明，不能当成本仓已有协议 |
| [pi-amplike permissions](https://github.com/pasky/pi-amplike/blob/4019ce681df16c65e6dadb82427a0cf16c57a147/extensions/permissions.ts)、[handoff](https://github.com/pasky/pi-amplike/blob/4019ce681df16c65e6dadb82427a0cf16c57a147/extensions/handoff.ts)、[modes](https://github.com/pasky/pi-amplike/blob/4019ce681df16c65e6dadb82427a0cf16c57a147/extensions/modes.ts) | 同一个包内同时有可桥接tool_call确认、getBranch/newSession/withSession，以及CustomEditor/ModelSelector/TUI custom | 应按资源/extension文件分级；权限对话框候选不代表整个包兼容；“YOLO”不能绕过本仓宿主权限，handoff和编辑器需分别原生适配 |

Provider另以官方[GitLab Duo示例](https://github.com/earendil-works/pi/blob/476a303c1250ce002215bfd08bdab5f6886f0573/packages/coding-agent/examples/extensions/custom-provider-gitlab-duo/index.ts)交叉读取：它实际注册Provider并含认证/协议处理，不能降成普通tool。此例不计入八个生态仓库样本。

## 被否决的方案

- **给所有Pi包无条件映射本仓SDK**：相同名字的类、events、session和Provider不证明相同合同；会静默改变行为。
- **完整Pi TUI转为React**：Pi自己RPC模式都不能传custom组件；需要专门设计，不宜作为首版承诺。
- **Worker/子进程就是权限沙箱**：进程分离有助故障隔离与资源回收，但若继承用户权限、网络、文件系统和环境，仍可绕过宿主SDK。OS/容器/权限代理必须另证。
- **扫描源码就算兼容与安全检查**：动态行为、间接依赖、install scripts和环境分支不会被有限静态检查覆盖；分析阶段不得通过import执行不可信factory。
- **为了兼容直接启用全量Provider/flags/events**：先做注册原子性、ownership、generation teardown、版本合同；否则加载失败可遗留部分能力。
- **按八个样本计算生态支持率**：样本并非随机抽样，也没有运行验证；只能产出覆盖矩阵和测试候选。

## 代码/测试/指标锚点

本轮实际完成：GitHub一手manifest/文档/类型/关键实现只读；官方固定SHA、八样本各自固定SHA和源码行为表；本仓有限Pi facade的源码比对。

本轮未完成：样本安装/依赖解析、TypeBox跨版本运行、真实生命周期序列、取消/热重载/Provider/平台验证、兼容率或性能测量。没有将本仓fixture通过当作以上样本通过，也未执行第三方测试脚本。

后续测试建议（尚未执行）：

1. 用许可允许的最小真实代码片段固定fixture，并保留来源、版本和许可证；首次做资源预览，拒绝通过import来分析包。
2. 每种profile覆盖import/初始化成功与部分失败回滚、工具调用/更新/失败/取消、事件顺序/变换/门控、关闭和旧generation无效。
3. 同一包按单组件报告：supported/adapted/host-dependent/excluded/unsupported，并同时报告install/load/invoke/reload/restart阶段。
4. 用真实临时会话证明getBranch与getEntries区别；工具details和appendEntry恢复不穿越分支。
5. 对话框含取消/超时/窗口销毁/项目切换；不支持custom TUI需显式展示原因。
6. Pi1.4新字段不能悄悄丢失；不支持exposure、嵌套tool或structuredContent时明确拒绝或要求包声明可降级。

## 失效条件与置信度

- 对固定源码和明确字段：高置信；对整包运行兼容性：未验证。
- main快照、样本manifest和npm发行物可能不同；交付前需固定实际tarball、lock和integrity重做目标profile检查。
- 本仓loader、事件生产者、权限代理、会话或Pi facade变化后，本文“当前profile”的限制需回读源码；不能以历史记录阻止已验证的新支持。
- 上游进一步改变包/Provider/工具/会话合同，或样本引入新依赖时，矩阵应升级而非强行套旧profile。

## 下一步触发信号

先挑“资源包 + 简单工具 + 事件门控/对话框”各一个可控样本做完整安装到重启流程。只有真实需求必须使用SDK级子Agent、Provider或TUI时，才讨论扩大profile或Pi sidecar；不以“生态庞大”为理由把所有接口一次性开放。优化目标由本仓现状方案排序，本文不授权实施、模型调用、安装或发布。

