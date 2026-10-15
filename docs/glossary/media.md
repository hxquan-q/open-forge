<!-- Modified by The Open Forge contributors. -->
# 图像、音频与媒体

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 黑胶播放器（vinyl player）

desktop 文件预览（`FilePreviewView`）中音频文件的预览形态：旋转黑胶唱片 + 唱臂起落动画 + 常规进度条 + 频谱可视化（Web Audio AnalyserNode 驱动）。覆盖 Chromium 原生可解格式（mp3/wav/ogg/flac/m4a/aac/opus/webm），其余音频格式维持「不支持 + 下载」现状。

唱片中心贴文件内嵌封面（ID3 APIC / FLAC picture，主进程经 music-metadata 解析并连同标题/艺术家经 IPC 返回），无封面降级为纯 CSS 盘面 + 文件名。播放/暂停驱动唱臂搭上/抬起与唱片加速起转/减速停下；打开**不自动播放**。控制集：播放/暂停、进度 seek、音量、循环、倍速。

_Avoid_: 把音频预览的「拖拽」理解为往预览面板拖文件——它专指**进度条 seek**；文件拖入语义属于 [[drop overlay (of ChatPage)]]，不因音频预览改变或新增 drop 区。

### 媒体流协议（media streaming protocol）

desktop 主进程注册的自定义 protocol（`vetta-media://`），把校验过的本地媒体路径映射为支持 Range 的流式 URL，供 `<audio>`（未来含 `<video>`）直接作 `src`。与既有预览的 `readFile` IPC + base64 全量加载**并存**：图片/pdf/docx 等小文件维持旧路径，只有音视频走本协议。见 ADR-0021。

_Avoid_: 把音频也塞进 readFile base64 路径——无损音频可达百 MB，全量 IPC 会阻塞且内存翻倍。

### 图像生成插件（Image Generation Plugin）

桌面端插件，提供两处 UI：AI 输入栏的[[图像模式]]开关、每条消息下的[[图像预览 swiper]]。图像的**实际生成与编辑**都由 coding-agent 的**内置 tool**（`generate_image` / `edit_image`，薄包装）完成，tool 内部转调[[主进程图像服务]]；插件只负责 UI 与交互，二者通过 tool-call / tool-result 事件对接。这是「内置 tool 出能力 + plugin 出界面」的刻意拆分。

> 历史备注：曾有第三处 UI——活动面板「图像编辑」选项卡，编辑在面板内直调 IPC、不经 agent、不写会话历史（见 ADR-0028 原方案）。后废弃：编辑统一收敛到 AI 输入栏，改走 agent `edit_image` tool、成为正式[[生成轮次]]（见 ADR-0029）。

> 历史备注：曾考虑用 coding-agent extension 注册该 tool，但 desktop 当前不加载 extension（`ExtensionUIContext` 全 no-op、扫描目录未启用），建整套 extension 加载子系统比内置 tool 的 6+ 注册点更重，故改为内置 tool。

### 图像模式（Image Mode）

权限选择器右侧一个可开关的输入动作（input action）chip。开启后再次点击关闭。是**软隔离意图标记**（非能力闸）：插件经输入插槽的 prompt 装饰器给 `PromptRequest` 注入 `imageMode`，input-pipeline 注入隐形指令，明确「本轮要产出图像」。`generate_image` / `edit_image` **始终按工具 `scope_use` 暴露**——未开开关时，用户自然语言明确要求生图/改图也可调用；开启则加强引导、优先走工具而非纯文字描述。开启且**无**[[图像编辑 attach]] 时，agent 自感知——按 prompt 语义自行决定调 `generate_image`（全新主题）还是 `edit_image`（在最近一张图基础上改）。

### 图像编辑 attach（Image Edit Attach）

[[图像预览 swiper]] 里点某张图右上角「编辑」icon 后进入的状态：该图浓边框高亮，AI 输入栏顶部胶囊区（与文件 / skill 同排）出现一枚「编辑选中图片」缩略图胶囊。语义是**强制把该图作为本轮 `edit_image` 的 source**——发送时注入 `metadata.editImageId`（**只传 id 引用，图像字节不进 LLM 上下文**，承袭 ADR-0028），agent 无生成/编辑选择权。是**一次性**：编辑轮次发出后自动释放（回到[[图像模式]]自感知）。关闭胶囊亦可手动取消。与[[图像模式]] toggle 相互独立、各占一处 UI。

### 图像预览 swiper（Image Preview Swiper）

每条产出图像的消息下方、横向一直向右排列的版本条（超出屏幕可左右箭头翻页）。展示该图所属[[编辑谱系]]的全部版本；**同一谱系只在最新一条消息下渲染**，旧消息的卡自隐，避免多条消息重复堆叠同一 swiper。编辑/生成进行中时，最前面插入一张「正在生成」骨架卡并把 swiper 滚到最前。

### 文生图 / 图改图（Text-to-Image / Image-to-Image）

文生图：仅凭文本 prompt 生成图像，对应 `/v1/images/generations`。图改图（亦称「编辑」）：以一张已有图像 + prompt 生成新图像，对应 `/v1/images/edits`。

### 生成轮次（Generation Turn）

一次「用户 prompt → image tool 调用 → 产出基准图像」的完整轮次。一个生成轮次可能一次产出多张候选图（OpenAI `n` 参数），但它们属于同一轮次。

### 编辑谱系（Edit Lineage）

一张基准图像 + 它后续所有[[图改图]]编辑版本（v1 → v2 → v3 …）构成的链，按 `createdAt` 线性追加、同 `rootId` 归组。编辑是**追加**而非替换：在 v2 上编辑产出 v5（谱系变 v1..v5），v2 保留。谱系在[[图像预览 swiper]] 里平铺呈现，而非整个会话的图库，也不是一次生成的并列候选。

> 「轮」在口语里被同时用于[[生成轮次]]和[[编辑谱系]]。本文档刻意区分二者，后续讨论与代码命名以这两个术语为准。

### 主进程图像服务（Image Service）

desktop 主进程的图像 IPC 服务：读[[插件设置]]拿 endpoint/模型/key，调用 OpenAI `/v1/images`（生成 / 编辑），把图像字节按 session 落盘，返回引用 id + `vetta-media://` URL。两条入口共用它：生成走 coding-agent 内置 image tool（薄包装转调，tool 通过 host 注入拿到该服务句柄，因 coding-agent 不能依赖 desktop）；[[图改图]]面板编辑走插件经 SDK 直调。是「一份实现、两条入口」的单一真相源。
