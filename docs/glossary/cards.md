<!-- Modified by The Open Forge contributors. -->
# 结果卡片

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 卡片描述符（card descriptor）

消息列表下方一张卡片的**声明式、可序列化**身份：`{ type, key?, payload, title?, icon? }`。`type` 选[[卡片渲染器注册表]]里的渲染器（命名空间化、由产卡方拥有）；`payload` 存**稳定引用**（如 image id / rootId）而非内容快照，渲染器据此解析实时状态；`key` 用于[[卡片跨轮去重]]；`title`/`icon` 供[[卡片收纳]]的 tab 标签（描述符为主、注册默认兜底、再回退插件名）。

跨 agent→desktop 边界序列化，故 `title` 是字符串、`icon` 是 [[icon symbol]] 式符号串；只有注册默认值（活在插件 bundle 内）才可为 React 节点。见 ADR-0030。
_Avoid_: 把 payload 当成内容快照——它是引用，实时内容由渲染器解析（image-gen 即拿 id 异步取[[编辑谱系]]）。

### details.cards（卡片产出契机）

工具产物里承载[[卡片描述符]]的字段。工具结果有两条通道：`content`（模型可见的结果文本）与 `details`（模型**永不可见**的 out-of-band 结构化数据，`extractToolImagePreview`/`extractToolUiDetails` 已在用）。卡片描述符作为 `details.cards: CardDescriptor[]` 搭 `details` 这条车，随 tool_call block 持久化进 jsonl、精确锚定到 `toolCallId`。

是本期**唯一**的产卡契机（应用本地命令式 `host.pushCard` 仅预留、不实现）。取代了 [[图像生成插件]] 旧的把 image refs 夹带进 `content` 文本的 `<vetta-images>` 标记 hack。
_Avoid_: 把卡片数据塞回 `content`——那会污染模型可见通道、解析脆弱，正是被本机制取代的旧做法。

### 预备描述符（pending card descriptor）

工具 **start**（仍 pending、无 result）时就挂到 tool_call block 上的 `status: "pending"` 的[[卡片描述符]]，让「生成中骨架」也占一个卡片/ tab。工具完成后 `details.cards` 按 `key` 替换之。存在的理由：描述符常态只随 result 落地，但 in-flight 卡片若不进描述符层，host 就不知道它存在、骨架进不了 tab，破坏「host 权威掌握卡片列表」。

### 卡片渲染器注册表（card renderer registry）

按 `type` 把[[卡片描述符]]映射到渲染组件的运行时注册表。与现有 `pluginMessageSlotsAtom` **同机制**（jotai atom，插件 `activate()` 经 `registerCardRenderer({ type, component, title?, icon? })` 注册、Disposable 卸载），区别只是从「数组、逐个 mount」改成「按 `type` 查」。host 永不枚举或硬编码 `type`；应用内置卡片用同一接口平权注册。

这是相对旧模型的**反转**：旧模型每条消息 mount 全部 slot、各 slot 自己 `null` 自隐，host 对真实可见性不透明；新模型 host 持有每条消息的描述符列表、按 type 查表只渲染真实存在的卡片——[[卡片收纳]]的 tab 可见性与标签由此才算得出来。见 ADR-0030。

### 卡片跨轮去重（card cross-turn dedup）

同 `key` 的[[卡片描述符]]跨轮（跨消息）出现时视为**同一逻辑卡片**，host 只在其**最新锚点**（最后产出该 key 的消息）下渲染，旧锚点不渲染。把 [[图像预览 swiper]] 今天 host 端的 `latestOwnerByRoot` 行为上升为描述符层的通用能力。无 `key` 的卡片退化为逐个独立、不去重。

### 卡片收纳（card stacking / 收纳）

消息下方**多张卡片**的展示策略。≥2 张卡片才在卡片区上方出现操作 area（<2 张时直接裸渲染、同今天）：左侧 tab 切换卡片、右侧两个 icon「列表 / 收纳」切布局。**收纳（tab 切换）是基本形态**，列表（向下平铺）是**不持久化的临时形态**——状态存卡片区组件内，卸载/切会话即回落收纳。tab 顺序按卡片在消息里出现的顺序（工具执行顺序），默认激活第一个。依赖 host 经[[卡片渲染器注册表]]对卡片列表的权威认知才得以成立。
