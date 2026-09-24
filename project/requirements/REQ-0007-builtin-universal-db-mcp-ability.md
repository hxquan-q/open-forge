---
id: REQ-0007
type: requirement
status: ready
priority: P1
owner: apps/desktop
source: user-request; https://github.com/Anarkh-Lee/universal-db-mcp
created: 2026-09-24
updated: 2026-09-24
related_plan: []
related_requirement: []
related_tasks: [TASK-0086]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 官方内置数据库 MCP 能力（宿主注入连接参数）

## 用户问题

希望在 **能力 → 发现** 中看到官方数据库连接器，添加流程与其它内置/推荐 MCP 一样：点添加 → 填写可配置项 → 写入本地 MCP 配置 → 会话中可用。内核使用开源 [universal-db-mcp](https://github.com/Anarkh-Lee/universal-db-mcp)，不改造成 Desktop 插件。

## 用户结果

- 能力发现中出现「通用数据库」类官方连接器卡片。
- 添加时弹出配置表单（库类型、主机、端口、用户、密码、库名等）。
- 保存后卡片在发现页显示已添加状态，并可在设置 → MCP 列表中查看；Agent 可调用其 MCP 工具做只读查询与 schema 探查。
- 卸载/删除后配置与工具面撤除，无残留台账脏状态。

## 范围

- Desktop 能力页：恢复「客户端列出的内置 MCP 预设」进入发现列表的合成路径（此前为迁 Notion/Figma/GitHub 到市场而移除）。
- 在 `BUILTIN_MCP_PRESETS` 增加 `universal-db`（或同等 slug）：`command: npx`、`args` 仅含 `-y universal-db-mcp@<钉版本>`（无连接模式启动），`secrets` 收集 `DB_*` 写入 `env`。
- **宿主注入连接**（Option D）：stdio 模式上游只认 argv 或运行时 `connect_database` tool（`DB_*` env 仅 HTTP 模式消费，已在 2.14.0 dist 核实）。采用「无连接启动 + 宿主每次连接后自发 `tools/call connect_database`」：凭据不进 argv、不进 LLM 上下文，复用已发布的官方 tool API。
- 新增**通用**配置字段 `postConnectToolCalls`（非 universal-db 专用）：落盘 args 只允许 `{env:KEY}` 模板 token，resolve 只发生在内存并随 tools/call 发出，不回写磁盘。
- 连接参数模板解析：env 缺失**或值为空串/纯空白**时剔除该 key（不置空串——`host:""` 会让上游以空地址静默误连）；支持 `:number`/`:boolean` 等类型标记。
- bootstrap 执行前先以 `tools/list` 的目标 tool `inputSchema` 做**通用反射浅校验**（tool 存在性、spec args 键 ⊆ schema properties、resolved 值类型兼容、schema required ⊆ resolved keys），不符即 fail-fast 报「上游 schema 不兼容」；执行器不硬编码具体 tool 的私有预期形状。
- `disabledTools` 对 agent 隐藏 `connect_database`/`disconnect_database`（宿主内部调用不受影响）；`get_connection_status` 保持可见（已核实返回体不含凭据）。
- i18n（zh/en）、图标、简短 setup 引导；`DB_TYPE` 用 select 限定上游合法值；表单必填随 `DB_TYPE` 联动（sqlite 仅要求 `DB_FILE_PATH`，网络库要求 `DB_HOST` 等连接字段），避免静态必填与 SQLite 场景冲突。
- 钉死 npm 包版本（`universal-db-mcp@2.14.0`），通过 `npx -y` 启动。
- 默认只读：不暴露 `DB_ALLOW_WRITE` / `--danger-allow-write`，不设写库开关。

## 不做什么

- 不把凭据写进 argv（`--password` 等命令行参数会进进程列表/EDR 采集面）。
- 不让 LLM 触达凭据：`connect_database` 由宿主在连接建立后自发调用，不经 agent loop、不进会话上下文。
- 不改造成 Plugin / `registerTool` / `providers.services` 全量内置驱动。
- 不做 `managed-binary` 打包（该上游是 Node + 原生模块，不适用 ADR-0092 首期形态）。
- 不在本需求内重建完整 `open-forge-marketplace` 仓；市场镜像可后续另立 Task。
- 不默认开放写库；高级用户可自行手动添加 MCP 并用 argv/工具参数配置。
- 不一次性把 Canva/Slack 等未列出预设全部重新挂回发现页（仅恢复「可列出」机制，本需求只挂数据库这一项）。
- 不引入 safeStorage 凭据库迁移：env 落盘与现有预设同级，vault 化是独立的后续加固项。
- 不 vendor/patch 上游包（Option E 仅作 D 被证伪时的兜底）。

## Given / When / Then

- Given：干净安装、未配置该连接器；When：打开能力 → 发现；Then：可见官方数据库连接器卡片。
- Given：用户点击添加并填写必填连接参数；When：确认；Then：`mcp.json` 出现对应 server——`env` 含 `DB_*` 值、`postConnectToolCalls[].args` 只含 `{env:…}` 模板 token、`disabledTools` 隐藏连接管理工具、`args` 无明文凭据；缺必填项时不写入。
- Given：已添加且参数齐全；When：在会话中请求查库/看表结构；Then：首次调用触发连接与 bootstrap，Agent 可用查询/schema 工具（受宿主审批策略约束）；idle 回收后的重连自动再次 bootstrap，用户无感。
- Given：已添加但凭据错误或库不可达；When：server 被首次调用；Then：bootstrap 失败使 server 进入错误态并透出上游错误信息，不静默成功。
- Given：仅 SQLite 场景（填 `DB_TYPE=sqlite` + `DB_FILE_PATH`）；When：连接建立；Then：`connect_database` 的 arguments 不含 host/port/user/password 键。
- Given：用户删除该能力；When：确认删除；Then：mcp.json 条目移除，发现页可再次添加。

## 必须保持

- MCP 仍走独立安装轨（写 `mcp.json`），不与 skill/plugin 物理安装合并（ADR-0049）。
- 插件内聚 MCP、用户手动 MCP、市场 MCP 三源聚合语义不变。
- **凭据不进 argv、不进 LLM 上下文**；resolve 后的值只存在于宿主内存与 stdio 载荷，不落盘。
- **bootstrap 调用参数不进任何可观测性表面**：`onDiagnostic`、console、遥测、调试 UI 均不得出现 resolve 后的 args。
- lite 构建不依赖云市场即可发现并添加该内置项。
- 未 `listedInDiscover` 的预设仍不出现在发现列表；Trust/审批档位与 `mcp_<server>_<tool>` 命名不变。

## 验收标准

- 能力发现可见；添加表单字段齐全（`DB_TYPE` 为限定枚举 select）。
- 写盘断言：序列化后的 `mcp.json` 中 `postConnectToolCalls[].args` 无任何 secrets 明文凭据。
- bootstrap 合同测试：时序（initialize 后、catalog/agent 调用前）、env→args 映射、缺失 key 剔除（含 sqlite 子集）、schema 浅校验 fail-fast、重连再执行、诊断消息无 resolved 值。
- 定向能力/预设/运行时测试 + `check:quick` 绿。
- 文档站或能力说明中有一条用户可见描述（可与实现同任务或紧随文档 Task）。

## 风险与失效条件

- 上游 `connect_database` tool schema 漂移 → 钉 2.14.0 + 启动期浅校验 fail-fast（报「不兼容」而非错位调用）；升级版本需回归。
- `npx` / Node 原生模块在部分环境安装失败 → 用户看到可恢复错误，不静默成功。
- bootstrap 失败（凭据错/库不可达）→ server 错误态透出上游信息；**透出前做凭据清洗**——上游驱动报错文本可能回显连接 URI（`scheme://user:password@host`）或 secret 形态参数值，密码一律抹除，host/user 等非敏感上下文可保留。
- 误配生产库只读账号仍可能泄露数据 → setup 引导强调只读账号。
- `postConnectToolCalls` 作为通用机制被后续预设复用 → schema 与模板约定按通用合同设计，不做 universal-db 私有形状。
