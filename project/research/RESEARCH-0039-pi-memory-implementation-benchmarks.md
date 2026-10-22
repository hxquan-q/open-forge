---
id: RESEARCH-0039
type: research
status: done
priority: P1
owner: packages/coding-agent
source: user-request; Pi ecosystem first-party repositories and source files inspected on 2026-10-22
created: 2026-10-22
updated: 2026-10-22
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: []
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0038]
---
<!-- Copyright The Open Forge contributors. -->

# Pi 生态持久记忆实现对照

## 问题与范围

延续 [RESEARCH-0038](RESEARCH-0038-agent-persistent-memory.md)，从 Pi 的真实实现核对轻量 Coding Agent 记忆的可借鉴部分，为 Open Forge 的项目记忆与全局记忆方案提供依据。本轮只读取公开源码和官网，不安装扩展、不执行其脚本、不调用模型、不访问运行中的用户状态，也没有运行对照项目的测试。

产品目标见 [REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)，具体候选设计、责任边界、迁移、切片和验收见 [PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)。

本文名称中的 benchmarks 指实现对照，不是实测性能排名。按固定 SHA 核查当前源码；不将 2026 年新增实现反推为早期 Pi 已有的默认能力。不把 Pi 核心、第三方扩展、各个同名 Desktop、Open Forge 的独立实现视为同一来源。

## 当前结论

1. **Pi 的会话持久化与跨会话项目记忆是两个层次。** 核心 SessionManager 提供 JSONL 追加树、分支和压缩投影；这不自动产生有项目/全局作用域、可检索与演化的知识库。已核默认工具集合不含独立 memory CRUD。[Pi SessionManager](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/packages/coding-agent/src/core/session-manager.ts#L976)、[默认工具集合](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/packages/coding-agent/src/core/tools/index.ts#L95)
2. **Chasen-Liao 的项目 LTM 可以证明“SQLite + 工具 + 生命周期观察”的轻量方案真实存在，但不是完整语义/时态记忆。** 查询是 FTS5/BM25 和短词 LIKE，去重是词面相似度；不能将它写成自动 LLM 抽取、向量检索或双时态图。[SQLite 实现](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/sqlite-backend.ts)、[相似度实现](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/jaccard.ts)
3. **最值得组合借鉴的机制**：Chasen 的小接口、参数化 SQL、事务和索引重建；pi-mind 的 Markdown 事实源、可重建索引与 Git worktree 归并；openpi-memory 的小索引/主题文件与注入调度；pi-hermes-memory 对前台读取、后台学习、初始化、退出和额外费用的明确分离。不能直接将其中任何一套当作已满足 Open Forge 的隔离/删除/模型协议合同。
4. **删除、身份和来源存在实质差异。** Chasen 删除最新版本会恢复旧版本为 latest；pi-hermes 的项目最终名称仍依赖 basename；有 source 字段不代表实际保存工具已填写原始消息引用。升级方案需要自行定义合同，不能从库名或 README 推断完成。

## 事实来源与固定版本

SHA 由公开 GitHub commit/tree API 确认，源码按对应 raw URL 读取；下文链接固定到这些 SHA。日期是提交 UTC 日期，核对日期统一为2026-10-22。

| 项目 | 固定 SHA / 提交日 | 核查深度与许可证 |
|---|---|---|
| `badlogic/pi-mono` → 当前 `earendil-works/pi` | `58c0b02ce552adab76014e7ed712ab7981359aa8` / 2026-10-21 | SessionManager、compaction reference、默认工具源码；[MIT](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/LICENSE) |
| `Chasen-Liao/pi-agent-desktop` | `3a097c1d53a42d842d170137eda7640d1c2e1cbd` / 2026-10-16 | 深读 LTM 类型、配置、后端、service、观察 payload、工具与 RPC 接线；[MIT](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/LICENSE) |
| `linellazatin/openpi-memory` | `702bb0b5c4c10f5405d5402e6c6e64263c60f597` / 2026-10-13 | 扩展入口、memory-core 的配置/目录/锁/注入相关实现；[MIT](https://github.com/linellazatin/openpi-memory/blob/702bb0b5c4c10f5405d5402e6c6e64263c60f597/LICENSE) |
| `shog-lab/pi-mind` | `241faed3a97ca87583d789ed7058a222ae94597e` / 2026-07-03 | memory extension/core、路径归并、物理遗忘代码；[MIT](https://github.com/shog-lab/pi-mind/blob/241faed3a97ca87583d789ed7058a222ae94597e/LICENSE) |
| `chandra447/pi-hermes-memory` | `d09bc48564129b06dc4541f6aad50396524b7b60` / 2026-10-21 | 配置、后台评审、项目身份、SQLite/Markdown 同步路径；[MIT](https://github.com/chandra447/pi-hermes-memory/blob/d09bc48564129b06dc4541f6aad50396524b7b60/LICENSE) |
| `vastsa/PI-Desktop` | `657621dac8780dcfb7b1262c8c1818c80310a2df` / 2026-10-22 | 限定阅读 project-memory prompt、目录与声明；[LGPL-3.0](https://github.com/vastsa/PI-Desktop/blob/657621dac8780dcfb7b1262c8c1818c80310a2df/LICENSE) |
| `abcwyc/pi-agent-desktop` | `d414e9db0cc41e88d2cc4c243b728b4d28dd5ea9` / 2026-10-20 | 限定阅读 workspace-memory；[MIT](https://github.com/abcwyc/pi-agent-desktop/blob/d414e9db0cc41e88d2cc4c243b728b4d28dd5ea9/LICENSE) |

`pi-desktop.app` 官网的 GitHub 链接指向 **DLYZZT/pi-desktop**，不是上述三个同名 Desktop。官网/仓库说明只能证明其自身产品信息，本轮没有审计其记忆引擎；不借它为其他仓库背书。[官网](https://pi-desktop.app/)、[官网所链仓库](https://github.com/DLYZZT/pi-desktop)

许可证行只记录指定文件，不表示已完成依赖、模型权重、NOTICE、分发形式与宿主许可证兼容审计；源码可见也不自动等于适合复制。

## Pi 核心：JSONL 树、上下文压缩与长期记忆的边界

SessionManager 把会话条目追加到 JSONL，通过 `id/parentId` 构成树，以 leaf 指针表示当前位置。`buildSessionPath` 沿祖先回溯；`buildContextEntries` 选择当前分支的最新 compaction 与保留区间。`CompactionEntry` 包含 `summary/firstKeptEntryId/tokensBefore/usage`，`BranchSummaryEntry` 表示离开分支的摘要。[类型与投影源码](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/packages/coding-agent/src/core/session-manager.ts#L91)

压缩采用“新增摘要条目 + 重建模型可见投影”，原始 transcript 仍保留。当前文档还描述 `session_before_compact` 扩展钩子及失败/取消时不追加成功压缩条目。它解决当前会话上下文窗口与分支连续性；跨会话检索、稳定的项目身份、偏好晋升和隐私擦除须由独立机制承担。[compaction reference](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/packages/coding-agent/docs/compaction.md)

已核默认工具为 read、bash、powershell、edit、write、grep、find、ls。由默认集合和上述会话路径，能确认这些并非一套默认项目/全局记忆 CRUD 服务；不能据此否认扩展可读原始 JSONL，也不声称穷尽 Pi 当前所有实验包。早期 Pi 的具体特性应另锁早期 tag/commit，不能用这份当期代码代替历史取证。[工具源码](https://github.com/earendil-works/pi/blob/58c0b02ce552adab76014e7ed712ab7981359aa8/packages/coding-agent/src/core/tools/index.ts#L95)

## Chasen-Liao：轻量 SQLite 项目 LTM 的完整链路

### 入口与启用

`lib/ltm/config.ts` 默认 `enabled:true`、`observeAgentEnd:true`、`observePreCompact:true`，数据库为 `agentDir/memory/ltm.sqlite`。关闭时 service 使用 Noop backend，不创建目录或打开数据库。配置变化以 key 重新建 service；初始化错误缓存30秒后允许重试。[配置](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/config.ts#L19)、[service](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/service.ts#L16)

RPC 创建会话时注册 `desktopLtmInlineExtension`；工具是 `memory_save/recall/forget`。工具调用时根据宿主 `getCwd()` 绑定项目，调用者不能通过工具参数指定另一个 projectId。Plan 模式保留 recall，移除 save/forget。Ask 模式未单独确认这些记忆工具；这是一项实际产品选择，不是 Open Forge 应照搬的授权策略。[RPC 装配](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/rpc-manager.ts#L880)、[工具注册及模式筛选](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/desktop-ltm-extension.ts#L32)

### 自动观察是真实接线，但要限定覆盖面

| 入口 | 实际行为与边界 |
|---|---|
| `rpc-manager.ts:200` 订阅 `agent_end` | 取最后 user/assistant 文本后 `void safeLtmAgentEndObserve`；失败不终止 Agent |
| `rpc-manager.ts:539` 显式 compact 命令分支 | `void safeLtmPreCompactObserve` 后调用 `inner.compact`；本轮未发现其注册核心 `session_before_compact` 观察，不能扩张为所有自动压缩路径均已覆盖 |
| `observe-payload.ts` | zero-LLM 字符串截断/拼接：user≤500、assistant≤4000、pre-compact≤6000；后端 narrative 又整体限4000，前置上限不代表最终全部保留 |
| `observe-hooks.ts` | catch 后 console.error；不是持久任务队列，也没有在这条链路中得到失败后必重放的合同 |

接线证据见[RPC agent_end](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/rpc-manager.ts#L200)、[RPC compact](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/rpc-manager.ts#L539)、[payload](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/observe-payload.ts)、[观察错误处理](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/observe-hooks.ts#L100)。这些观察本身不调用 LLM，但 Agent 使用记忆工具与读取额外上下文仍有模型 token 代价。

此外 `contentToText` 会拼入 text 和 thinking block，再被观察路径调用。不能将该转换原样用于本仓长期记忆：需明确排除推理内容，并分离用户事实、模型结论与工具证据。[实际转换](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/observe-hooks.ts#L7)

### 存储、检索和演化

| 维度 | 已核事实 | 本仓借鉴与限制 |
|---|---|---|
| 项目身份 | `path.resolve(cwd)`，Windows转小写，再SHA-256截取16位 | 能作路径隔离；子目录、迁移、符号链接、不同worktree没有显式repo归并，不能直接当稳定projectId |
| 存储 | `node:sqlite/DatabaseSync`；observations和memories分表；WAL、foreign_keys、busy_timeout | 小依赖边界值得参考；本仓仍需单独验证Electron/Node/Bun实际打包能力，不能由外部项目使用推定可用 |
| 检索 | FTS5 trigram，BM25；SQL限定project；memory仅`is_latest=1` | 本地关键词基础；没有向量或语义重排，不保证同义词命中 |
| 中文短词 | 短于3字符token走逐token LIKE fallback，去重后与FTS结果合并 | 已处理“记忆”等两字短词；LIKE会扫描项目记录，且fallback按任一短词补命中，不等价于严格全查询匹配 |
| 写入演化 | 扫描项目全部latest记忆，Latin Jaccard阈值0.7；CJK bigram Dice阈值0.5；第一个近似命中成为parent，旧记忆置非latest | 是词面近似替换，不是事实一致性判断；大项目线性扫描与错误supersede要另测 |
| 来源 | schema有`source_json`、`source_observation_ids_json`；类型有sessionId | 当前memory_save工具仅传content/type，没有自动填sourceObservationIds；观察接线也没传source，不是完整消息级provenance |
| 时间 | created_at、updated_at、parent_id、is_latest | 有系统记录和版本；没有事实有效区间valid_from/to，不构成双时态 |

证据分别见[project-id.ts](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/project-id.ts#L4)、[schema和FTS](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/sqlite-backend.ts#L253)、[写入事务](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/sqlite-backend.ts#L370)、[短词补召回](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/sqlite-backend.ts#L537)、[词面阈值](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/jaccard.ts#L70)、[memory_save参数传递](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/desktop-ltm-extension.ts#L117)。

SQLite 官方明确：trigram 的 full-text query 中少于3个Unicode字符的子串无法匹配；这是tokenizer边界，不代表“支持中文”就解决分词、短词或语义召回。[SQLite FTS5 trigram](https://www.sqlite.org/fts5.html#the_trigram_tokenizer)

### forget 是版本操作，不能直接等同隐私擦除

`forgetOnce` 同事务删除目标memory和FTS行；**如果删除latest且存在parent，会将parent重新设为latest**。这是恢复上一版本的明确实现。对于“撤销最新错误版本”可能合理，但对“忘掉这件事”的用户意图，会让旧事实重新进入召回。[固定SHA删除实现](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/ltm/sqlite-backend.ts#L707)

工具 `memory_forget` 只暴露memoryIds，未提供连带observation删除。已核路径没有删除墓碑、来源抑制或防止原始会话再次抽取同一事实的机制。本仓须明确区分“撤销版本”“使事实失效”“删除某条记录”“隐私擦除及防重生”，不能复用一个模糊forget语义。[工具删除入口](https://github.com/Chasen-Liao/pi-agent-desktop/blob/3a097c1d53a42d842d170137eda7640d1c2e1cbd/lib/desktop-ltm-extension.ts#L172)

## 三个扩展的具体参照

### openpi-memory：小索引、主题文件和注入调度

固定版本默认位置是 `~/.pi/agent/memory`，`shared_dir:true`可将索引/主题文件放到`~/.agents/memory`；这是跨工具共享目录，不是自动隔离每项目。`MEMORY.md`作为索引注入，主题文件按需读取，扩展入口提供write/remove/pin工具。默认注入间隔为5个用户prompt，压缩前重置注入状态；自动resume和压缩后consolidate默认false。[入口](https://github.com/linellazatin/openpi-memory/blob/702bb0b5c4c10f5405d5402e6c6e64263c60f597/extensions/index.ts)、[core配置与路径](https://github.com/linellazatin/openpi-memory/blob/702bb0b5c4c10f5405d5402e6c6e64263c60f597/extensions/memory-core.mjs#L43)

core有同目录临时文件+rename及共享目录锁。可借鉴“人可读事实源 + 注入状态机 + 原子写”；本轮不将其remove工具推定为全来源隐私删除，也不把共享目录推定为权限隔离。consolidation若开启，会通过Agent follow-up执行，属于额外模型工作。[core原子写](https://github.com/linellazatin/openpi-memory/blob/702bb0b5c4c10f5405d5402e6c6e64263c60f597/extensions/memory-core.mjs#L303)、[入口follow-up](https://github.com/linellazatin/openpi-memory/blob/702bb0b5c4c10f5405d5402e6c6e64263c60f597/extensions/index.ts#L524)

### pi-mind：Markdown事实源、可重建图索引与worktree归并

`knowledge/*.md`及frontmatter是事实源，SQLite FTS/vector/KG是派生索引；graph triples来自frontmatter，syncIndex能清理磁盘已删除文件的索引。FTS采用unicode61；vector默认可用Ollama `nomic-embed-text`。它有L1常驻预算和L2相关性检索预算，不能简单称为“一个MEMORY.md”。[core](https://github.com/shog-lab/pi-mind/blob/241faed3a97ca87583d789ed7058a222ae94597e/packages/memory/extensions/memory/core.ts#L5)

路径优先`PI_MIND_DIR`，否则通过`git rev-parse --git-common-dir`定位主checkout的`.pi-mind`，让linked worktree共享。这比仅hash cwd更贴近项目身份，但共享项目历史仍需额外分支/commit有效性过滤。[路径代码](https://github.com/shog-lab/pi-mind/blob/241faed3a97ca87583d789ed7058a222ae94597e/packages/utils/src/paths.ts#L25)

curated memory主要经可见`remember_this/observe`工具写入；源码明确移除了旧的后台curator和compaction classifier。然而它仍会归档会话、保存压缩摘要、同步索引；`saveMemory`引入的forget维护每50次写触发物理清理：user/project不自动删，agent-feedback60天、reference90天、raw session14天。**“无后台LLM写curated memory”不能扩大为“完全没有自动维护或删除”。** [扩展生命周期](https://github.com/shog-lab/pi-mind/blob/241faed3a97ca87583d789ed7058a222ae94597e/packages/memory/extensions/memory/index.ts#L4)、[遗忘规则与触发](https://github.com/shog-lab/pi-mind/blob/241faed3a97ca87583d789ed7058a222ae94597e/packages/memory/lib/forget.ts#L1)

### pi-hermes-memory：读取模式与后台学习要分开看

默认`memoryMode:"policy-only"`不意味着停止记忆学习：`reviewEnabled/flushOnCompact/flushOnShutdown/autoConsolidate/correctionDetection`当前均默认true，lazyInitialization默认false。后台review默认走进程内completion side-channel，必要时fallback到子进程；有活动review与session abort/退出等待边界。这些机制有额外LLM调用及费用，不能用“policy-only”推导无模型开销。[配置](https://github.com/chandra447/pi-hermes-memory/blob/d09bc48564129b06dc4541f6aad50396524b7b60/src/config.ts#L47)、[background-review](https://github.com/chandra447/pi-hermes-memory/blob/d09bc48564129b06dc4541f6aad50396524b7b60/src/handlers/background-review.ts#L1)

其项目检测会处理Git linked worktree，但最终存储位置按projectName，主要来自repo root的basename，且兼容旧cwd basename目录。因而不同路径下的同名仓库仍需碰撞测试。本仓应使用稳定ID和显式别名，不能只照搬basename。[项目解析](https://github.com/chandra447/pi-hermes-memory/blob/d09bc48564129b06dc4541f6aad50396524b7b60/src/project.ts#L23)

Markdown是source of truth，SQLite按精确target/project范围同步，并删除孤儿索引；这对“磁盘删除后索引不残留”有参考价值，但还不是覆盖原始session/backfill、备份与来源重抽取的全链路删除证明。[同步与清理](https://github.com/chandra447/pi-hermes-memory/blob/d09bc48564129b06dc4541f6aad50396524b7b60/src/store/sqlite-memory-store.ts#L497)

## 其他名单与证据强度

| 名称 | 本轮定位结论 | 可以使用的证据边界 |
|---|---|---|
| pi-memory | 找到[josephkern](https://github.com/josephkern/pi-memory)、[tickernelz](https://github.com/tickernelz/pi-memory)、[catlain](https://github.com/catlain/pi-memory)、[SiliconState](https://github.com/SiliconState/Pi-Memory)等同名项目 | 未获用户作者/包名时无法唯一对应原说法；仅定位，未逐一源码审计，不能拼接特性 |
| openpi-memory | 可定位linellazatin/openpi-memory | 本文已核固定版本；不等同其他openpi项目 |
| pi-mind | 可定位shog-lab/pi-mind | 本文已核固定版本；不等同名字含mind的其他扩展 |
| pi-hermes-memory | 可定位chandra447/pi-hermes-memory，存在其他fork/移植 | 本文仅核原仓固定版本，不混用fork新特性 |
| pi-workspace-memory | 本轮未取得可唯一归属的第一方仓库/包记录 | 保持未核实；不将Desktop中的workspace-memory文件当成此扩展 |
| vastsa/PI-Desktop | 有明确project-memory prompt | 源码明确把记忆当durable user context而非更高优先级指令；本轮未据此认定自动抽取/向量检索已经实现。[prompt](https://github.com/vastsa/PI-Desktop/blob/657621dac8780dcfb7b1262c8c1818c80310a2df/packages/agent-runtime/src/project-memory-prompt.ts#L1) |
| abcwyc/pi-agent-desktop | `lib/workspace-memory.ts`实际是localStorage里的workspace→last sessionId | 是恢复上次打开会话的UI状态，不是长期事实库；该文件不能用于证明Agent LTM，也不能据此否认仓库其他功能。[源码](https://github.com/abcwyc/pi-agent-desktop/blob/d414e9db0cc41e88d2cc4c243b728b4d28dd5ea9/lib/workspace-memory.ts#L1) |
| pi-desktop.app | 明确链接DLYZZT/pi-desktop | 独立项目，官网级确认；没有为其声明未经核查的记忆实现 |

## 被否决的方案与可执行设计输入

以下是本研究推导的Open Forge设计要求，不声称这些项目都已实现。

| 暂不照搬 | 推荐吸收的合同 | 实施前验证 |
|---|---|---|
| cwd hash或repo basename作为永久项目身份 | 稳定projectId + 本地路径/worktree别名；branch/commit另作事实适用条件 | 子目录、同名独立仓库、worktree、改名/迁移、Windows大小写与链接 |
| 用Jaccard/Dice近似即覆盖旧事实 | 近似只用于候选去重，事实更新要比较主体/属性/作用域/有效时间与证据 | 相似但不同约束、否定句、新旧分支决策 |
| 将所有观察存成事实 | observation、candidate、confirmed、superseded分态，保留来源角色及原始定位 | 模型猜测、工具错误、thinking内容、用户纠正 |
| fire-and-forget观察即可靠记忆 | 可重放outbox、幂等ID、预算、失败观测与关闭/取消边界 | 写锁/磁盘满/退出/取消/重复事件/重启 |
| 全文/向量/图索引成为事实源 | 事件/记录事实源，索引可重建并受同一scope和删除策略约束 | 索引迁移、删除后重建、旧embedding版本 |
| forget仅删latest且恢复parent | revoke-version与erase分开；erase覆盖版本链、索引、来源抑制与待处理任务 | 删后立即检索、重建、恢复旧会话、backfill及队列重试不能重生 |
| 名为local或policy-only即免费 | 单列存储、embedding、抽取/整理模型费用与默认触发器 | 断网降级、无provider、单turn最大调用数、预算耗尽 |

## 代码 / 测试 / 指标锚点与下一步

优先转化为本仓验收用例的是：正常创建/恢复会话真的启用记忆；项目与全局过滤；三字和短词中文检索；近似但矛盾的事实；同名仓库与worktree；delete/erase不复活；索引迁移重建；Provider与SQLite不可用；取消/关闭/重启后outbox只执行一次。

对照项目存在相关测试文件只能证明它们提供了测试源码，本轮未执行，不以“测试数量”作效果证据。Open Forge应沿自身runtime装配、Node runner、隔离临时状态和打包流程验证，不能直接运行这些项目的安装器或复用真实用户数据库。

本轮文档与索引的路径/frontmatter/围栏、项目索引及test:impact选择结果，统一记录于 [PLAN-0021 本轮交付](../plans/PLAN-0021-agent-persistent-memory.md#本轮交付与验证事实)。这些文档检查不等于上述外部系统或拟定方案运行通过。

## 失效条件与置信度

- 高置信度：固定SHA可直接核查的schema、工具参数、默认配置、触发点、版本恢复与源码中的词面检索逻辑。
- 中置信度：从已读路径推导的集成风险；如“所有自动压缩覆盖”“全链路隐私擦除”，本轮没有足够证据时保持未证实。
- 未验证：任何准确率/延迟/成本收益、最终打包ABI、全依赖许可证兼容、生产可靠性与长期数据增长。
- 若候选项目版本、Pi扩展生命周期、作用域设计或本仓sqlite宿主实现变化，应重读对应源码；当前结论不替代后续实现Task的合同与验证。
- 当前只提供研究与方案输入；进入实现需要另有授权及本仓REQ/PLAN/Task准入，不由本记录自动启动编码。
