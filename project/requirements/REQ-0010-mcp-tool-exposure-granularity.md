---
id: REQ-0010
type: requirement
status: draft
priority: P2
owner: runtime-mcp/coding-agent
source: user-request；RESEARCH-0024
created: 2026-10-06
updated: 2026-10-06
related_plan: [PLAN-0017]
---
<!-- Copyright The Open Forge contributors. -->

# MCP 工具暴露粒度：按 server 与工具选择常驻或按需

## 用户问题

MCP 的渐进披露现在是整体开关：同一会话里可见的 MCP 工具合计超过 15 个，全部工具就改为“先用 `tool_search` 激活再调用”。结果是：

- 常用的小工具（如文档查询）也得先搜索再用；
- 体量很大的 server（如浏览器类）无法在工具总数较少时单独设为按需；
- 用户能做的只有停用（`disabled`、`disabledTools`，对模型完全不可见），无法表达“常驻”或“按需”。

证据与对照见 [RESEARCH-0024](../research/RESEARCH-0024-pi-workflow-post-design-review.md)。

## 用户结果

用户可以在 MCP 配置里，对单个 server 或单个工具声明：

- `direct`：常驻，始终出现在模型的工具列表里；
- `deferred`：按需，模型先经 `tool_search` 激活后才能调用。

没有声明的工具保持现有的自动规则。

## 范围

- `mcp.json` 新增两个可选字段：server 级 `exposure`，工具级 `toolExposure`（键为 server 原始工具名，精确匹配）。取值只有 `direct`、`deferred`。
- 全局配置与项目配置沿用既有的按字段合并规则，项目覆盖全局。
- 暴露策略的变化只影响后续 Turn，且不重启或重连 MCP server。
- 提示词里的 MCP 说明与 `tool_search` 的检索范围，按实际暴露方式分组。

## 不做什么

- 不做 codemode 或脚本化工具编排。
- 不新增 `hidden` 取值：不可见继续由 `disabled`、`disabledTools` 表达，且优先于一切暴露设置。
- 不支持通配符或正则匹配。
- 不做 Settings 界面，不改 Capability SDK 的公共合同（另立）。
- 不把 server 的 `description` 引入提示词或搜索排序。
- 不做 `tool_search` 激活结果的持久化。
- 不改变 Plan 模式下 MCP 工具的可见性。
- 不改变项目 MCP 配置的信任模型。
- 不按使用频率自动调整暴露。

## Given / When / Then

1. **混合配置**：Given 会话里有三个 server：`docs`（2 个工具，声明 `direct`）、`browser`（20 个工具，声明 `deferred`）、`notes`（3 个工具，未声明）。When 开始新 Turn。Then 模型的工具列表含 `docs` 的 2 个工具、`notes` 的 3 个工具（未声明的工具数量未超阈值，按自动规则常驻）与 `tool_search`，不含 `browser` 的工具，尽管 MCP 工具总数已超过 15 个；提示词的按需索引只列 `browser` 的工具；模型用 `tool_search` 激活后，被激活的工具在下一次模型调用起可见。
2. **无配置**：Given 没有任何 `exposure` 或 `toolExposure`。When 进行任意会话。Then 工具列表、提示词与 `tool_search` 行为和当前版本完全一致。
3. **运行中修改**：Given 会话进行中用户修改了暴露声明。When 下一个 Turn 开始。Then 新策略生效；当前 Turn 不受影响；MCP server 连接不被重启。
4. **优先级**：Given 同一 server 同时有 server 级与工具级声明，或工具被 `disabledTools` 停用。When 解析暴露方式。Then 工具级优先于 server 级；被停用的工具无论如何都不可见。
5. **显式白名单智能体**：Given 某智能体使用显式工具白名单。When 白名单内的 MCP 工具被声明为 `deferred`。Then 该工具按白名单常驻，`deferred` 声明被忽略；白名单外的 MCP 工具不可见。
6. **非法取值**：Given 配置里出现 `exposure: "lazy"` 之类的非法值。When 加载配置。Then 沿用既有 MCP 配置错误语义，给出字段级错误，不静默忽略。

## 必须保持

- 无声明时，工具列表与提示词内容逐字节不变；既有的渐进披露、提示词与 `tool_search` 合同测试不改动即通过。
- 同一 Turn 内能力视图不可变：本 Turn 的工具可见性只受本 Turn 自己的 `tool_search` 激活影响，不读取新的外部配置。
- 显式激活（白名单）智能体的语义不变；Plan 模式的工具闸门不变。
- `disabled`、`disabledTools` 的语义不变，仍对模型零可见。
- 暴露声明的变更不触发 MCP server 的重连或重启，也不使目录缓存失效。
- 来自磁盘的配置在首次进入领域边界时做运行时校验。
- Desktop 设置页保存其他字段时，不丢弃、不拒绝手写的暴露声明。

## 验收标准

- 上述 Given / When / Then 均有自动化测试覆盖，包含“无配置”基线和“仅暴露字段变化时不新建 server generation”。
- 在固定的假工具目录上记录声明的工具 schema 体积与 `tool_search` 往返次数，对比声明前后；只记录，不设收益阈值，不调用真实 Provider。
- 用户文档的 MCP 页补充字段说明，中英文同步。

## 风险与失效条件

- 配置字段会进入 Desktop 的严格白名单校验；旧版 Desktop 会拒绝含新字段的配置文件保存，存在降级风险，需与运行时同批发布并在发布说明提示。
- 把体量很大的 server 设为 `direct` 会抬高每次请求的工具声明体积，属用户自行取舍。
- 在 `direct` 与 `deferred` 之间切换会改变工具声明，造成一次提示词缓存失效。
- 若在固定目录上看不到声明体积或往返次数的可测改善，应关闭本需求。
