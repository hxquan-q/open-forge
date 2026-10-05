---
id: RESEARCH-0024
type: research
status: done
priority: P2
owner: packages/runtime-mcp/packages/coding-agent
source: user-request；linux.do/t/topic/2984656 帖子、pi.dev 官方 MCP 与 Codemode 文档、Pi coding-agent CHANGELOG
created: 2026-10-06
updated: 2026-10-06
related_requirement: [REQ-0010]
related_plan: [PLAN-0017]
related_tasks: []
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0021, RESEARCH-0010, RESEARCH-0007]
---
<!-- Copyright The Open Forge contributors. -->

# Pi 1.0 工作流帖与官方文档的产品层设计对照

## 问题与范围

用户提供一篇 linux.do 帖子（《Pi Windows 工作流第五版：升级到 1.0，接入原生 MCP、Codemode》，作者 xk128，2026-10-05，Pi 1.0.2），要求看看其中的 Pi Agent 设计。本文提炼帖子暴露的 Pi **产品层**设计，用官方文档与 CHANGELOG 交叉核对，再与 Open Forge 当前源码对照。

续接 [RESEARCH-0021](RESEARCH-0021-pi-deepseek-harness-absorption.md)：该文聚焦 Agent core 与 harness，本文补产品层（MCP 暴露、会话树状态、授权审计、自治边界、文件回退）。

本轮仅研究：不实现、不运行外部项目、不调用真实 Provider、不运行测试。帖子是用户视角的配置笔记，**不是官方设计文档**；其中 Plan、Goal、Rewind、Subagents、Magic Context 等第三方插件的行为只来自作者描述，未读插件源码。

## 事实来源

### 身份锚点

- **Open Forge**：本地 `main`，HEAD `7b372b006a502328b5b9e2a8bb38ead004eb4492`（2026-10-06，工作区干净）。结论来自静态阅读，未运行应用或测试。
- **Pi 官方文档**：`pi.dev/docs/latest` 的 MCP 与 Codemode 两页，2026-10-06 取回。
- **Pi CHANGELOG**：`packages/coding-agent/CHANGELOG.md` 的 main 分支快照，2026-10-06 取回，含 1.0.3（2026-10-05）与 Unreleased；未记录提交 SHA。
- **帖子**：`https://linux.do/t/topic/2984656`。原页被 Cloudflare 拦截（403），使用用户保存的副本，评论数为 0；帖内附件 `AGENTS.md.txt` 在副本中只有链接，未读。

### 来源索引

| 编号 | 来源 | 支持的事实 |
|---|---|---|
| F1 | 帖子 MCP 与 Codemode 章节 | 原生 `mcp.json`、`exposure` 与 `toolExposure` 的实际配法、`defaultTools` 与 `codemode.mode` |
| F2 | pi.dev MCP 文档 | 暴露四档、工具级覆盖、项目级覆盖、后台连接与首轮等待、权限管线与 `parentToolCallId` |
| F3 | pi.dev Codemode 文档 | QuickJS 沙箱与资源限制、`store/load` 写入会话自定义条目、脚本内调用走工具管线 |
| F4 | CHANGELOG 0.86.0、0.87.0、0.99.0、1.0.0、1.0.1、1.0.2 | 缓存保温、随恢复与分支保留的提示词与工具变更、`ContextEditEntry`、MCP 与 codemode 与 tool_search 内置、嵌套调用审计、项目级 MCP 覆盖、Anthropic 工具内联 |
| F5 | 帖子 Plan、Goal、Rewind、Subagents、Magic Context 章节 | 第三方插件行为（**未交叉核对**） |

## 当前结论

### 1. Pi 产品层设计要点

| 编号 | 设计要点 | 证据 | 核对状态 |
|---|---|---|---|
| D1 | 小内核，高频需求逐步收进内核；作者结论是插件越多越难跟上升级 | F4：0.99 起 MCP、codemode、tool_search 内置；F1：`pi-until-done` 适配版本落后、旧 `pi-rewind` 的变更工具名单漏了 `powershell` | 内置事实已核对；插件滞后案例仅帖子 |
| D2 | 会话是树，状态沿当前分支折叠：`codemode` 的 `store()` 与 `tool_search` 载入的工具写入转录，`/tree`、`/fork`、恢复后自动一致；`ContextEditEntry` 追加式修改模型上下文而不改历史 | F3、F2、F4 | 已核对；Plan 状态用 `plan-mode-state` 自定义条目仅帖子 |
| D3 | 不动缓存前缀：MCP 服务摘要变化时追加到对话而非改工具声明；Anthropic 中途新增或重定义的工具内联进对话；缓存保温 | F2、F4（1.0.1、0.86.0） | 已核对；Plan 插件冻结可执行工具表、普通模式保留 `plan_mode_*` 声明仅帖子 |
| D4 | 工具暴露四档 `direct`、`deferred`、`codemode`（默认）、`hidden`，服务级加工具级（支持 `*`，精确名优先）；项目条目不写 `command`、`url`、`type` 时只能覆盖 `enabled`、`exposure`、`toolExposure`，并继承 `env`、`headers`、`auth`；项目配置需先通过项目信任；`description` 进系统提示并参与搜索排序；`deferred` 只省提示词，启用的 server 仍在会话启动时后台连接 | F2 | 已核对 |
| D5 | 编排与被编排分别授权：脚本内每次调用仍走工具管线，权限扩展的 `tool_call` 与 `tool_result` 照常生效并带 `parentToolCallId`；沙箱无 Node、文件系统、网络、定时器，输出默认封顶 10000 token，VM 256MB，脚本不能嵌套 codemode | F2、F3、F4 | 已核对；Plan 配置里放行 `codemode` 不等于放行其所调用的工具，仅帖子 |
| D6 | 有界自治与能力天花板：`/goal` 作者配置自动 25 轮、无进展 3 轮，另可设 `--tokens` 预算；Plan 向子代理扩展注册 `allowedAgents`、`allowedTools`、`denyExtensions` 天花板，桥接加载失败即阻断 `subagent` 调用 | F5 | 仅帖子 |
| D7 | 文件回退：在用户消息与回合结束边界记录文件状态，不依赖变更工具名单；要求 Git 仓库，覆盖已跟踪与未忽略文件，不含被忽略文件与空目录，恢复不动真实暂存区，默认无保留期限；入口为 `/tree`、`/fork` | F5 | 仅帖子 |

帖子自己暴露的脆弱点（仅帖子）：Plan 与子代理两个插件之间没有公开合同，作者手写约 100 行桥接，靠深导入 `pi-subagents/capability-ceiling` 和约定的 `customType` 字符串耦合，升级时可能要改；示例配置里有 `npx -y …@latest`。

### 2. 与 Open Forge 对照（静态阅读）

| 主题 | Open Forge 现状 | 判断 |
|---|---|---|
| MCP 暴露档位 | 已有**停用级**：`disabled`、`disabledTools`（原始工具名），在工具源发布前过滤，对模型零可见。渐进披露是整体开关：Session 内可见 MCP 工具合计超过 15 个则全部延迟；`explicit` 激活模式为白名单且不延迟。**缺 `direct` 与 `deferred` 档位** | 真实差距，见 [REQ-0010](../requirements/REQ-0010-mcp-tool-exposure-granularity.md) 与 [PLAN-0017](../plans/PLAN-0017-mcp-tool-exposure-granularity.md) |
| 项目级覆盖 | 项目配置存在，按字段浅合并，项目条目可覆盖全局条目的任意字段（含 `command`、`args`、`env`、`url`、`headers`），未限制为只改暴露字段。`includeServer` 在 Desktop 组合根仅按 `resourceScope` 过滤，**未见信任门控**，本次未核对是否另有机制 | 相邻观察，**待核对**；不属于 PLAN-0017 范围 |
| `tool_search` 激活 | 激活集只在 `McpDeferredToolController` 内存中，全仓无其他引用。恢复与分支后是否保留未验证；Pi 记入转录 | **待验证** |
| Plan 与子代理 | `plan-mode-tool-policy.ts`：工具面与执行双闸门，白名单；`spawn_agent` 仅允许 `explorer`；MCP、插件、扩展工具默认不可见，注释写明 `readOnlyHint` 只是服务端自述。Pi（据帖子）靠用户自列清单与跨插件桥接 | Open Forge 在产品内闭环且更保守；代价是 Plan 下用不了只读文档类 MCP（按白名单推断，未实机验证） |
| Goal | 连续 3 次执行失败，或 3 次自动续跑无可观察活动，转 `blocked`；状态含 `usage_limited`；记录 tokens、时间、续跑数。在 `features/goal` 内未见总轮数上限与用户设定预算 | 部分已有 |
| 文件回退 | 已有逐次编辑评审快照：write 与 edit 前存 before 字节、sha256 守卫、回滚目标取自快照元数据、IPC 只收 `sessionId` 与 `snapshotId`、16MiB 上限。仅这两个工具捕获，shell 改动不在内，也未挂到会话树 | 已有，覆盖面与 Pi 互补 |
| codemode | 无。RESEARCH-0021 第 C 节已评估，PLAN-0015 明确不做。content-creation 预设刻意不执行模型生成的代码，改用 search 加 execute 两个工具。ADR-0061 的 QuickJS 实现已被 ADR-0091 取代并删除，没有现成沙箱 | 不新增；本文补充授权与审计细节 |
| Pi 扩展兼容 | 兼容档位 `pi-extension-0.84-host-neutral-v1`，API 仅 `on`、`registerTool`、`registerShortcut`、`registerFlag`、`getFlag`、`registerMessageRenderer`、`registerProvider`、`events`；coding-agent 源码无 `agent_settled` | 帖子中的 1.0 生态插件不能指望直接运行 |

### 3. 采纳顺序（提案，不是已批准计划）

1. **MCP 暴露粒度**（`direct` 与 `deferred`）：差距明确、增量小、缺省行为可保持不变。本轮只落需求与方案，实施须用户另行授权。
2. **若将来做 codemode**：采用 `parentToolCallId` 嵌套调用审计与编排工具和被调工具分别授权，补充 RESEARCH-0021 第 C 节的最小证据。
3. **文件回退补充**：评估在现有评审快照之外增加回合边界快照以覆盖 shell 改动。须先定 Git 依赖、被忽略文件、保留策略，并与现有 hash 守卫并存。未立项。
4. **Goal 上限**：增加总轮数或 token 预算上限，属小改动。未立项。

## 被否决的方案

1. **照搬 Pi 的开放扩展面**（跨插件深导入、可改上下文的钩子、字符串约定的自定义条目状态）：与 [`packages/coding-agent/AGENTS.md`](../../packages/coding-agent/AGENTS.md) 的不变量冲突，即不开放 `next()` 式中间件、Feature 之间不共享对象通信、Turn 绑定不可变 generation。帖子中的桥接正是这类耦合的实例。
2. **以 `readOnlyHint` 自动放行 Plan 下的 MCP 工具**：服务端自述不可信，现有设计已明确拒绝。Pi 的权限扩展可以消费该提示，但不改变本仓取舍。
3. **暴露策略放进独立策略文件**：分裂配置面，仍需用户与项目两级合并。
4. **新增 `hidden` 取值**：与 `disabled`、`disabledTools` 重复。
5. **照抄示例配置**：`npx -y …@latest` 浮动版本，与本仓对外部配置的不可信边界立场不符。

## 代码/测试/指标锚点

| 主题 | 锚点 |
|---|---|
| 渐进披露阈值与判定 | `packages/runtime-mcp/src/deferred-tool-controller.ts`（常量 `DEFAULT_MCP_DEFERRED_THRESHOLD`、`isDeferred`、`bindToolVisibility`） |
| 激活模式接入 | `packages/coding-agent/src/composition/tool-surface/mcp-session-coordinator.ts`（`createSessionController`） |
| 停用级过滤与签名 | `packages/runtime-mcp/src/protocol/types.ts`（`McpServerCommonConfig`）、`src/tools/server-runtime-tool-source.ts`、`src/server/catalog-cache.ts`（`computeMcpServerConfigSignature`） |
| 配置合并 | `packages/runtime-node/src/mcp/config/file-config-source.ts`（`mergeConfigs`）、`apps/desktop/src/main/agent-runtime/mcp-supervisor.ts` |
| Plan 闸门 | `packages/coding-agent/src/features/plan-mode/plan-mode-tool-policy.ts` |
| Goal 刹车 | `packages/coding-agent/src/features/goal/goal-runtime.ts`（`auditTurnOutcome`）、`contracts.ts` |
| 评审快照 | `packages/runtime-node/src/coding/shared/review-capture.ts`、`packages/runtime-storage/src/conversation/review-snapshot.ts`、`apps/desktop/src/main/ipc/review-changes.ts` |
| Pi 扩展兼容档位 | `packages/coding-agent/src/extensions/pi-compat/contracts.ts` |
| 既有测试 | `packages/runtime-mcp/test/deferred-tool-contract.test.ts`、`server-runtime-tool-source.test.ts`、`packages/coding-agent/test/runtime-core/model-call-and-prompt-runtime.test.ts` |

## 失效条件与置信度

- Pi 侧锚定 1.0.2 与 1.0.3 的文档和 CHANGELOG。`exposure` 语义、codemode 限制与项目覆盖规则在后续版本可能变化，需复核。
- D6、D7 以及 D1、D2、D3、D5 中标注“仅帖子”的部分来自作者描述，置信度中低。引用的第三方插件版本：`@narumitw/pi-plan-mode` 0.58.4、`pi-subagents` 0.76.0、`pi-rewind-hook` 1.8.7、`@narumitw/pi-goal` 0.54.8。
- Open Forge 侧为静态阅读：标注“待验证”或“待核对”的条目没有运行证据，不能当作已确认缺陷。
- 本文未测量任何收益（提示词 token、往返次数、延迟）。Pi 发布说明中的“约 40% 更少提示词 token”属其 codemode 自身改动，不能外推到本仓。

## 下一步触发信号

- 用户批准实施 [PLAN-0017](../plans/PLAN-0017-mcp-tool-exposure-granularity.md)：先建 Task，失败测试先行。
- 实测发现 `tool_search` 激活在恢复或分支后丢失：立 Bug 或 Issue。
- 需要在 Plan 模式使用只读文档类 MCP 工具：立 Issue，评估用户自列白名单，需产品决策。
- 需要核对项目 MCP 配置的信任模型：立 Issue，范围独立于 PLAN-0017。
- 决定做 codemode：先读 RESEARCH-0021 第 C 节与本文 D5。
- 出现 shell 改动无法回退的反馈：评估回合边界快照。
- Pi 发布 1.1 或更高版本，或改变 `exposure` 语义：复核本文。
