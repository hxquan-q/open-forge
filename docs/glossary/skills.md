<!-- Modified by The Open Forge contributors. -->
# Skills、能力分发与授权

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 技能管理字段（skill management fields）

[[技能市场]]里一个 Skill/Scene 的平台侧可管字段：`type`(skill|scene)、`category`、`tags`、`version`、`author`、`alias`、`description`、`is_enabled`、`download_count`。**真相源是平台数据库，不是 SKILL.md。** SKILL.md 的 `metadata` 块仅在**上传那一刻**作导入兜底（用来预填表单初值），入库后一切以 DB 为准、由 admin 编辑；agent 触发只读包内 SKILL.md 原文。
_Avoid_: 把 SKILL.md 的 `metadata` 当成运行期真相源——第三方 skill 不该为了上传被迫改造 metadata。

### market description

[[技能市场]]列表/详情给人看的展示性描述，admin 上传/编辑时填写，**留空降级到 SKILL.md frontmatter 的 `description`**。**纯展示层**：客户端存在 manifest 的 `marketDescription`，不回写包内 SKILL.md。
_Avoid_: 与 **SKILL.md description** 混为一谈——后者是 agent 判断何时触发该 skill 的功能性描述，二者用途不同、互不覆盖。

### skill version（技能版本口径）

Skill 的版本以**服务端 DB 值为唯一真相**。来源优先级：**上传表单值 > SKILL.md metadata.version > 兜底**（新包 `1.0.0`、重传在当前 DB 版本上 `patch+1`）。单包上传时 metadata.version 预填表单、admin 可改；批量上传无表单，新包取 metadata.version、重传取 metadata.version 否则 patch+1。客户端安装时把服务端下发的 version 经 `meta` 存入 [[skills-manifest]]，**绝不重新解析本地 SKILL.md**；`needsUpdate = manifest.version !== market.version`。
_Avoid_: 客户端装完重解析本地 SKILL.md 取版本——SKILL.md 常缺 version，服务端缺省 `0.0.1` 与本地解析缺省 `0.0.0` 永不相等，导致「一直可更新」。

### skill category（技能分类）

Skill/Scene 的分类，**独立受管实体**（id + 名称 + `scope` 区分 skill / scene），admin 有「分类管理」入口 CRUD，上传/编辑时按当前 type 过滤后**单选一个**。与 [[模型分组 tag]] 同构思路：从 metadata 自由文本解耦，改分类不需重传包。`tags` 仍是自由描述性标签、与 category 分离。

### skills-manifest

客户端 `~/.vetta/skills-manifest.json`，记录每个已装 Skill/Scene 的安装态（`version`/`source`/`enabled`/`type`/`alias`/`marketDescription`）。本地文件扁平铺在 `~/.vetta/{skills,scene}/<name>/`，**同名同时只存一个版本**，路径不含版本号。manifest 里的 `version` 是 [[skill version]] 的更新比对基准。

### skill download_count（下载量）

Skill 的热度计数，**后端 `DownloadArchive` 每成功一次 +1，不按用户去重**（含重装/更新）。admin 表格与 desktop 市场页都展示，市场页可按热度排序。
_Avoid_: 当成「装机量/独立安装数」——它是原始下载次数，不减卸载、不去重。

### 通用 Agent Skill 作用域（generic agent skill scope）

Vetta 之外的、跨 Agent 通用的 Skill 存放约定：全局 `~/.agents/skills/` 与项目级 `<cwd>/.agents/skills/`。与 Vetta **专属作用域**（全局 `~/.vetta/agent/skills/`、项目级 `<cwd>/.vetta/skills/`）并列，是「适配通用 Agent Skill」能力把别的 Agent 写好的 skill 原样纳入 Vetta 发现范围的入口。

发现规则刻意**只认子目录 `SKILL.md`**（不认根目录散装 `.md`），严格对齐业界 Agent Skill 约定——这正是「通用」的含义；根目录散装 `.md` 是 Vetta 专属作用域的特例，不带进通用目录。

来源标记上与专属作用域区分：从此处加载的 skill 打 `source = "agents-user"`（全局）或 `"agents-project"`（项目级），区别于专属的 `"user"`/`"project"`，使 [[skills-manifest]] / desktop 列表能识别其为「通用、无平台托管」从而**只读呈现**（不可在[[技能市场]]卸载/启停/版本管理）。

同名碰撞时 **Vetta 专属优先于通用**：通用 Agent Skill 目录在所有 Vetta 原生来源（`user`/`project`/`scene`）之后加载，先加载者胜，故加载顺序为 `user → project → scene → agents-user → agents-project`——通用 Agent Skill 是补充而非覆盖内置（含 scene）。两处目录均纳入 agent 路径保护（只读、禁止 agent 新增/修改），与 Vetta 自家 skill 目录同等对待。

作用域支持是 coding-agent 核心**默认开**（CLI 也享受），desktop 侧由「Agent配置 → 扩展功能 → 适配通用 Agent Skill」开关控制（默认开、可关），关闭时向会话传入禁用标志。desktop 聊天侧技能选择器（`/` SlashPanel）经 `vetta:skills:list(cwd)` **按当前会话 cwd 列出**：既有全局 `~/.agents/skills`，也有该项目的 `<cwd>/.agents/skills`（不传 cwd 则只列全局来源）。技能**市场页**（技能广场）以独立的「通用 Agent Skill」**只读分区**展示全局 `~/.agents/skills`（按当前 tab 的 skill/scene 类型分流，可预览 SKILL.md，但不可安装/卸载/启停——这些是纯文件、无平台托管）。
_Avoid_: 把 `agents-*` 来源当成可在市场管理的条目——它们无 manifest、无平台托管，纯文件、纯展示。

### Ability（能力）

平台侧**可分发扩展单元的统一概念**：Skill / Scene / MCP Server / Plugin / Bundle 在服务端收敛为**一张 `abilities` 表**、靠 `type` 判别，在 desktop 收敛为**一个「能力」列表 + 一套详情页**。

**统一只发生在「数据存放」与「概念呈现」两层，刻意不统一物理分发与安装**：skill 装 `~/.vetta/skills/`、scene 装 `~/.vetta/scene/`、plugin 装 `~/.vetta/plugins/`、MCP 写进 `~/.vetta/agent/mcp.json` 的一个 key ——三条安装轨道原样保留，因为它们本来就是三种不同的运行时机制。scene 是这一模式的既有先例：服务端与 skill 同表同归档，仅客户端目录不同。

标识为 `(type, slug)` 联合唯一，引用形式 `"skill:figma-ui"`。不来自市场的内置能力（`skill-presets`、系统插件）采用不会与市场冲突的 slug 命名空间，因此无需去重或优先级判定。

**与 [[Capability（授权契约）]] 是完全不同的东西**，不要因中文都能读作「能力」而混用。

### Capability（授权契约）

`@vetta-org/capability-sdk` / `@vetta/capability-runtime` 里的权限契约层：Capability ID、Grant、access session、constraint、audit（见 `docs/capabilities/README.md`）。回答的是「某个 subject 能否调用某个宿主能力出口」。

中文正式叫法为**「授权契约」**，把「能力」这个中文词让给 [[Ability（能力）]]，避免 desktop 市场条目与授权层同名不可分辨。

### bundle（能力套装）

`type = bundle` 的 [[Ability（能力）]]：一组**各自独立可用**的能力的松散组合。自身**永远无产物**（`artifact_key` 恒空），安装 = 逐成员走各自既有安装轨道，不引入任何新的打包/解包机制。

成员以 `(type, slug)` 引用已上架的能力行为主；只有 **mcp** 允许「私有内联」（内联一段 config），因为 mcp 本就无产物。skill / scene / plugin 成员必须是引用——一旦允许内联带产物的成员，bundle 就要长出自己的打包格式与校验解包逻辑。

**bundle 不可嵌套 bundle**。可被组合的 type 只有 `skill / scene / plugin / mcp`，成员集合恒为一层，不存在递归展开。

**与 [[插件内聚]] 的判据**：bundle 是**松散**组合，成员对用户可见、可单独安装/卸载/启停；plugin 内聚（ADR-0040 的 `agent.mcpServers`、`agent.skillPaths`）是**紧耦合**，成员对用户不可见、随插件生死。要发「不单独上架的 skill/MCP」，答案是打进 plugin，不是塞进 bundle。

### 能力安装台账

`~/.vetta/abilities.json`，desktop 侧记录「装了哪些 [[Ability（能力）]]、什么版本」的**单一索引**，键为 `<type>:<slug>`。

它**只是索引，不是安装位置**：skill / scene / plugin 的产物与 mcp 的配置仍分别落在各自既有位置，台账不复制内容。存在的理由是统一「已安装 / 版本 / 是否可更新」的判定——在它之前这三件事分别来自 skill 目录下的 manifest、`plugins-manifest.json`、以及「`mcp.json` 里有没有这个 key」，其中 mcp 连版本都没有，导致 admin 改了市场 MCP 的 config 后存量用户永远收不到更新。

[[bundle（能力套装）]] **不进台账**：它的安装态、启用态、可更新态全部由成员派生，因此不存在台账与实际状态漂移的可能。
