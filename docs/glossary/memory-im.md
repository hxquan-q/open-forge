<!-- Modified by The Open Forge contributors. -->
# 记忆与 IM 会话

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### im-gateway cwd

`~/.vetta/im-gateway/conversation/`，im-gateway 所有 IM 渠道（wechat / feishu / ilink ...）共用的工作目录。session 文件落在 `<im-gateway cwd>/.vetta/sessions/`，agent 生成的产物（html/py/md 等）落在 cwd 根。路由 key 仍是 `(im_user, chatID)`（继承自 ADR-0004），单一 cwd 内靠 sessions 文件名区分不同 IM 会话。

与 [[conversation cwd]] 物理分离：桌面「对话」与 IM 入口的 session / 产物互不可见，desktop sidebar 不再展示 IM session（ADR-0005 推翻了 ADR-0004 的混合展示形态）。

### im-gateway inbox

`~/.vetta/im-gateway/conversation/<YYYY-MM-DD>/`，im-gateway 把 IM 入站的图片/文件**原样字节**落盘到此（按本地日期分目录），文件名形如 `<msgId>-<原文件名或 ext>`。落盘后由 router（`router.go`，不是 bridge）在 prompt 文本头部为每个 `Attachment.URL` prepend 一行 `@<abspath>`，agent 通过 Read 工具自行读取（图片走 `resizeImageBuffer` 自动缩放）。落盘 + `Attachment` 填充是**各 transport 自己的职责**；router 的 `@<abspath>` 拼接是平台无关的，任何 transport 只要填好 `Attachment.URL` 就自动接入。

「原样字节」的获取方式按平台而异：wechat 需先 CDN 下载再 AES-128-ECB 解密（见 ADR-0006）；feishu 走鉴权后的 `Im.MessageResource.Get`（image_key/file_key + Type），SDK 直接回放明文流，**无解密步骤**。

**刻意不走 RPC `images[]`**：避免 im-gateway 重复造缩放轮子，复用 Read 既有图像处理，且把"是否要看图"的决策权留给 agent。与 desktop 的 `attachedImage` 多模态直投是不同路径——两者刻意不统一，IM 端走 [[mentionedFile]] 单轨。

### im_send_attachment

coding-agent 内置工具（`packages/coding-agent/src/core/tools/...`），仅在 `--mode rpc --enable-host-bridge` 启动时注册，对 TUI / CLI / desktop 启动的 agent 不可见。签名：`im_send_attachment({path: string, kind: "image"|"file", caption?: string})`。

实现通过 [[host_request / host_response]] 同步等待宿主（im-gateway）真实发送结果（30s 超时）；成功返回 `messageId`，失败返回结构化 error（如 `quota_exhausted` / `peer_unreachable`）。Agent 拿到真实结果再决定收尾文本怎么说，避免"声称已发送实际没发"。

每次成功调用占用 1 次 wechat per-peer quota，与最终 digest 文本独立计数。

### memory-mode

coding-agent 的一个**门控开关**（拟 `--memory-mode` 启动参数，默认关）。开启后激活下面整套「记忆 + 滚动」机制：[[MEMORY.md]] 注入、[[memory 工具]]、[[memory flush]]、[[session rollover]] 接管 [[Layer2 压缩]]、[[日期工作史]]。

刻意做成门控而非全局默认：仅 im-gateway 为 [[im-gateway cwd]]（Claw 这一个固定且唯一的项目）spawn coding-agent 时传入；desktop / TUI 永不传，行为完全不变。靠**显式 flag 而非 cwd 探测**——不引入「按目录猜行为」的魔法。与 [[host_request / host_response]] 所依赖的 `--enable-host-bridge` 是两个正交的门控（记忆不必依赖出站 IM 工具，反之亦然）。

记忆的归属是**项目级单一**：Claw 是单 owner 的客户端，不区分 user/project、不考虑多租户，全部 IM 会话共享同一份 [[MEMORY.md]] 与 [[日期工作史]]。

### MEMORY.md

[[im-gateway cwd]] 根下的**单一项目级记忆文件**（策展式 Markdown），是 Claw 跨会话记忆的常驻层。由 coding-agent 的 `resource-loader` 在 session 启动时**作为冻结快照**注入 system prompt——与现有 `AGENTS.md / CLAUDE.md` 注入走同一通道。

「冻结快照」是硬纪律：当前进程内 system prompt 里的 MEMORY.md 内容**不随写入实时变化**，agent 通过 [[memory 工具]] 的返回值看到自己的写入，新内容**下一次进程加载时**才进 system prompt。目的是保住 Anthropic 前缀缓存（每次改写 system prompt 会令缓存失效，吃掉约 75% token 成本节省）。因 im-gateway `closeOnIdle` 每条消息重启进程，「下一次加载」≈ 下一条 IM 消息，故记忆跨消息近实时生效。

借鉴 Hermes 的 `MEMORY.md`，但**合并掉 `USER.md`**——单 owner 下「关于用户」与「关于项目」无意义区分。

### memory 工具

memory-mode 下注册给 agent 的工具，签名 `add / replace / remove` 操作 [[MEMORY.md]] 条目，原子写盘。agent 主动决定何时记。与 [[memory flush]] 互补：flush 是保证写入点，工具是随时写入。

### memory flush

[[session rollover]] 前的**抢救步骤**：注入一条系统消息邀请 agent 把即将被滚动掉的重要信息写进 [[MEMORY.md]]，再执行滚动。借鉴 Hermes `flush_memories()`。是 MEMORY.md 不会长期为空的保证写入点。

### session rollover

memory-mode 下取代 [[Layer2 压缩]] 的会话滚动：上下文逼近压缩阈值时，不在原 jsonl 原地做 LLM 压缩，而是 ① 先 [[memory flush]]；② 复用 compaction 现成逻辑生成「保留近期尾巴（`keepRecentTokens`，默认 ~20k）+ LLM 摘要」；③ 把尾巴+摘要**写进一条新 jsonl**，`SessionHeader.parentSession` 指回旧文件，旧 jsonl 归档不再追加。

承接进新会话起始上下文的 = 近期尾巴 + 摘要 + （resource-loader 注入的）[[MEMORY.md]]。

存在的**理由是 im-gateway 专属**，不同于 Hermes：im-gateway `closeOnIdle` 每条消息 spawn 新进程并**全量解析整条 jsonl**，而原地压缩只追加 entry、不截断文件 → jsonl 无限增长 → 每条消息冷启动解析成本随时间上涨。rollover 给单文件大小封顶。Hermes 是长驻进程不付此成本，故不做 rollover。

[[Layer1 microcompact]]（免费裁旧工具输出）在 memory-mode 下**照常运行**，只有 [[Layer2 压缩]] 被 rollover 取代。`session_search`（跨 jsonl 全文回溯，借 parentSession 链）**延后到二期**，一期只留好指针。

### Layer1 microcompact

coding-agent 现有压缩的第一层：纯函数、零成本，每次 LLM 调用前裁掉旧的工具结果 / bash 输出、删旧 thinking block（留 signature）。memory-mode 下保留。

### Layer2 压缩

coding-agent 现有压缩的第二层：Layer1 后仍超阈值时触发的 LLM 摘要压缩，结果以 `compaction` entry 写回**同一** jsonl。默认阈值贴近上下文 80%（`minFreePercent:20`），是「逼近阈值后每轮都重压缩」卡顿的根因。memory-mode 下被 [[session rollover]] 取代。

### 日期工作史

memory-mode 下的**按需渐进披露记忆层**，与常驻的 [[MEMORY.md]] 互补。物理形态：agent 的**运行 cwd 设为今日日期目录** `<im-gateway cwd>/<YYYY-MM-DD>/`，故 agent 写 `./` 产物自然落今日目录、读 `../<昨天>/` 回溯。与 [[im-gateway inbox]] 的按日分目录天然同构（入站媒体、出站产物、当日 [[JOURNAL.md]] 同处一个日期目录——刻意**按日期而非按 session 物理隔离**）。

「问 agent 昨天干了什么」即由此成立：agent 自助翻昨天的日期目录（读 [[JOURNAL.md]] + 产物文件）。产物被视为记忆的一部分。

借鉴 ADR-0007 desktop 的 per-cwd 隔离思路，但轴是**日期**而非 sessionId（IM 不做 per-session 产物隔离）。

### JOURNAL.md

[[日期工作史]] 每个日期目录下的当日日报，是「昨天干了什么」的渐进披露索引。填充来源：**每个 turn-end coding-agent append 一行精简摘要**（做了什么 / 生成了什么文件）+ [[session rollover]] 时额外写一段提炼。两路保证轻聊日子也有记录、重度日子有提炼。

### 活动回合（live turn）

im-gateway 一个 IM 会话（路由 key `(userID, chatID)`）从**首条消息**起、到 agent 交付**本轮最终答复**（`agent_end`，最终回复「落定」）止的这段区间。判定刻意**不依赖时间间隔**，只看「本轮是否已答复」这一个状态——因为时间间隔无法区分「用户分多条说同一需求 / 中途想纠偏」与「另起新需求」。

「已答复」在两平台统一以 `agent_end` 为界，故飞书流式打字途中、微信 defer 整轮期间都属于活动回合、都可被 [[消息折叠]]。活动回合不设时长上限：用户持续追加就持续延长，这正是「只要没答复就能一直打断补充」的体现。

### 消息折叠（message folding）

活动回合期间所有入站 IM 消息**并入同一回合、最终只产出一组回复**的策略，取代「一条消息=一轮=一组回复」的旧行为。落点分两段：

- **prompt 未发出**（仍在 acquire host session 的冷启动窗口）：新消息**并入首个 prompt**。冷启动延迟本身充当免费合并窗，不额外加防抖定时器。
- **prompt 已发、agent 运行中**：新消息走 coding-agent RPC 现成的 `steer` 命令注入，agent 在下一个工具边界重新规划并纳入，**保留已做的工作**（不 abort 重跑）。飞书在同一条消息气泡内续写，不另起气泡。

活动回合期间的消息**一律 steer**，不再过 slash 命令解析；命令只在 `IDLE`（无活动回合）时生效。`agent_end` 后到达的消息才另起新回合。无「硬取消」出口——纠偏即发消息。
