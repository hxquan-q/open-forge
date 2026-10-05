---
id: PLAN-0017
type: plan
status: draft
priority: P2
requirement: REQ-0010
owner: runtime-mcp/coding-agent
source: user-request；RESEARCH-0024
created: 2026-10-06
updated: 2026-10-06
related_requirement: [REQ-0010]
related_tasks: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# MCP 工具暴露粒度（direct / deferred）最小设计

## 背景与目标

交付 [REQ-0010](../requirements/REQ-0010-mcp-tool-exposure-granularity.md)：让用户按 server 与工具选择 MCP 工具“常驻”还是“按需”。对照依据见 [RESEARCH-0024](../research/RESEARCH-0024-pi-workflow-post-design-review.md)。

本计划只给方案，状态为 `draft`，**不进入实施**。实施需用户另行授权，并按切片先建 Task。

## 当前事实

均来自静态阅读，未运行应用或测试。

1. 渐进披露是整体开关。`McpDeferredToolController` 默认阈值 15，可见 MCP 工具合计超过阈值则全部延迟；`explicit` 激活模式为白名单且不延迟、不提供 `tool_search`。见 `packages/runtime-mcp/src/deferred-tool-controller.ts` 与 `packages/coding-agent/src/composition/tool-surface/mcp-session-coordinator.ts`。
2. 停用级已存在。`disabled`、`disabledTools`（原始工具名）定义在 `protocol/types.ts` 的 `McpServerCommonConfig`，由 `tools/server-runtime-tool-source.ts` 在发布前过滤。目录缓存签名 `computeMcpServerConfigSignature`（`server/catalog-cache.ts`）已排除 `disabledTools`，注释写明开关切换不应打穿缓存。
3. 工具描述符只有 `name`、`description`、`serverName`。快照 `revision` 由 `sameDescriptors` 决定；工具实现是否重新注册由 binding 的 `fingerprint` 决定（`runtime-tool-synchronizer.ts`）。
4. 配置变更会换 server generation。supervisor 的 `configsEqual` 是整份配置的 JSON 相等；不等则启动候选 generation 并退役旧的（`server/supervisor.ts` 的 `reconcileToEffectiveConfig`）。按静态阅读，现在改任何字段，包括 `disabledTools`，都会重连该 server；新字段若不特殊处理同样会触发。
5. 配置校验有三处：runtime-mcp 的 TypeBox 加字段级校验（`config/schemas.ts`，对象允许额外属性）；Desktop 的严格键白名单（`apps/desktop/src/main/mcp-config-validation.ts`，未知键抛错）；Capability SDK 域 Schema（`packages/capability-sdk/src/domain/mcp.ts`，`additionalProperties: false`）。
6. Desktop 保存路径会校验整份配置并以 `...previous, ...data` 合并（`apps/desktop/src/main/mcp/mcp-settings-service.ts` 的 `upsert`、`replaceConfig`）。因此手写的新键只有在 Desktop 白名单接受后，才不会让保存其他 server 失败。
7. 项目配置存在：`<agentDir>/mcp.json` 与 `<projectRoot>/<配置目录>/mcp.json`，按字段浅合并（`packages/runtime-node/src/mcp/config/file-config-source.ts` 的 `mergeConfigs`）。
8. 提示词渲染是单模式：`renderMcpToolsPromptSection(tools, { deferred })` 要么全延迟要么全常驻，纯模式输出由 `deferred-tool-contract.test.ts` 锁定。调用方经 `McpDeferredPromptState { tools, deferred }`，由 `CodingAgentModelCallFrameComposer.readMcpPromptState` 与 `system-prompt-policy.ts` 的 `mcpDeferred` 消费。
9. 工具名前缀为 `mcp_[servername]_`，紧凑索引用正则 `^mcp_([^_]+)_(.+)$` 拆出 server，含下划线的 server 名会拆错；描述符本身已带 `serverName`。

## 最小设计

### 1. 配置合同

全部可选，缺省即自动规则：

```jsonc
"<server>": {
  "exposure": "direct",          // 或 "deferred"
  "toolExposure": { "<server 原始工具名>": "direct" }
}
```

- 键用 server 原始工具名，精确匹配，与 `disabledTools` 一致；不用带 `mcp_` 前缀的名字，不支持通配符。
- 只有 `direct`、`deferred` 两个取值。“不可见”继续由 `disabled`、`disabledTools` 表达，且优先于一切。
- 项目覆盖沿用既有字段级浅合并，因此项目的 `toolExposure` 整体替换全局的，与 `disabledTools` 数组行为一致；在文档与测试里写明。

### 2. 解析规则

纯函数，位于 runtime-mcp：工具级 > server 级 > 自动。被 `disabled` 或 `disabledTools` 命中的工具不进入描述符，也不参与解析。

### 3. 发布路径

工具源发布 binding 时解析出暴露方式，写入 binding 与描述符的可选字段。`sameDescriptors` 增加对该字段的比较，使暴露变化提升快照 `revision`；**不进入 binding `fingerprint`**，否则会无谓地重新注册工具实现。

### 4. 控制器规则

- `explicit` 激活：不变。白名单内常驻，`deferred` 声明被忽略，不提供 `tool_search`。
- 其余激活方式：
  - `direct` 的工具常驻；
  - `deferred` 的工具只有被 `tool_search` 激活后才可见；
  - 未声明的工具组成“自动组”，自动组数量超过阈值（15）则整体延迟，否则常驻；
  - 无任何声明时自动组等于全部，行为与现状一致。
- 阈值只计自动组。这样给一个大 server 单独设 `deferred`，不会把其余未声明的工具一并拖进延迟。
- `tool_search` 仅在存在延迟工具时提供；检索范围以及“已激活”“总延迟数”只覆盖延迟工具。
- `bindToolVisibility()` 在 Turn 准入时冻结解析结果；本 Turn 内的新配置不可见，`tool_search` 激活仍即时生效（现有行为）。

### 5. 提示词

- 纯常驻与纯延迟的输出逐字节保持现状。
- 混合时先输出常驻工具清单，再输出延迟索引与 `tool_search` 用法。
- 紧凑索引按描述符的 `serverName` 分组，不再从名字里拆。
- `McpDeferredPromptState` 需要表达分组（例如在现有字段外增加延迟子集），并同步 `CodingAgentModelCallFrameComposer` 与 `system-prompt-policy.ts` 的消费方。具体形状由 S1 决定，新增字段须有向后兼容的默认值。

### 6. 不重启（本方案风险最高处）

暴露字段是宿主侧可见性策略，不应导致 server 重连。设想做法：

- 把这些字段从 supervisor 的 `configsEqual` 比较中排除；
- 让仍在运行的 generation 就地更新这些字段（原子替换冻结对象），下一次工具源刷新即可发布新描述符；
- 目录缓存签名同样排除，沿用 `disabledTools` 先例。

这会改动 supervisor 的 generation 与 lease 状态机，因此 S1 **先写失败测试固定行为**：仅暴露字段变化时不创建新 generation，且下一次刷新能看到新暴露。

`disabledTools` 是否并入同一集合另议：并入会把现有的“改动即重连”变为“就地生效”，属用户可观察行为变化，不在本批。

### 7. 校验

- runtime-mcp 沿用既有字段级错误契约，例如 `Invalid server config for '<name>': 'exposure' must be "direct" or "deferred"`。`toolExposure` 必须是工具名到这两个取值的映射。
- Desktop 的 `mcp-config-validation.ts` 同步允许键与取值，`preload/api-types/mcp.ts` 同步类型。
- Capability SDK 域 Schema 本批不改：设置服务的脱敏输出不含新字段，手写字段由 `upsert` 保留。

## 候选方案与取舍

- **A（采用）**：`mcp.json` 增加两个可选字段，控制器按工具解析。最小；沿用既有合并；缺省行为不变。代价：要处理 supervisor 不重启与三处校验。
- **B（否决）**：独立策略文件或 Desktop 设置存储。分裂配置面，仍需用户与项目两级合并，也偏离“与其他 MCP 客户端同格式”的配置习惯。
- **C（否决）**：照搬 Pi 四档加通配符加 codemode 默认档。codemode 在 PLAN-0015 中明确不做；`hidden` 与现有停用级重复；通配符没有需求证据。
- **D（否决）**：只让全局阈值可配置。仍是全有或全无，无法表达“这个 server 常驻、那个按需”。
- **E（否决）**：由模型或使用频率动态决定。不可预测，违背 Turn 内能力视图不可变与缓存稳定。

## 阶段

每片都需用户授权后建 Task，失败测试先行。

| 切片 | 内容 | Owner | 依赖 |
|---|---|---|---|
| S1 | runtime-mcp 核心：类型与字段级校验、解析函数、描述符与 synchronizer、控制器、提示词渲染、supervisor 不重启 | runtime-mcp | 无 |
| S2 | 配置回路与文档：Desktop 白名单与类型，确认 `upsert` 保留手写字段；coding-agent 模型调用帧消费分组状态；用户文档 MCP 页中英文（`apps/docs-site/content/docs/product/mcp.mdx` 与 `en/` 镜像） | desktop/coding-agent | S1 |
| S3（可选，另立） | Settings 工具清单的三态控件（默认、常驻、按需）、i18n、Capability SDK 域 Schema 与 Catalog；遵循 Desktop 的设计与用户语言规范 | desktop | S2，且视 S1/S2 的使用反馈 |

并发结论：S1 内部紧耦合，串行。S2 与 S1 的文件集基本不重叠，但依赖 S1 的字段合同，先 S1 后 S2；各用一个 Task Worktree，具体读写与独占路径在 Task 合同里登记。S1 与 S2 必须同批发布（见降级风险）。

## 不做什么

整体换核、codemode、`hidden` 新取值、通配符、Settings 界面（S3 另立）、Capability SDK 公共合同变更（S3 另立）、server `description` 进提示词与排序、`tool_search` 激活持久化、Plan 模式下 MCP 可见性、项目 MCP 配置信任模型、`disabledTools` 重连语义变更、真实 Provider 评测、发布与稳定分支晋升。

## 验证与回滚

- 每片：失败测试、实现、定向测试与 `test:impact`；跨包合同变化再跑 `test:changed`；完成后完整 `bun run check`。
- S1 测试清单：
  - 解析优先级表驱动测试；
  - 控制器合同：沿用 `deferred-tool-contract.test.ts` 形态，覆盖常驻不入检索、延迟激活前不可见、`tool_search` 按需提供、Turn 冻结、`explicit` 优先；
  - 工具源：描述符暴露方式（工具级 > server 级 > 无），`disabledTools` 仍优先；
  - synchronizer：只改暴露时 `revision` 提升而不重新注册工具实现；
  - supervisor：仅暴露字段变化时不新建 generation；
  - 配置校验：合法、非法、额外键；
  - 既有测试一字不改仍通过，作为“无配置”基线。
- S2 测试清单：Desktop 校验（接受新键与取值、拒绝非法值）；`upsert` 保留手写字段；扩展 `model-call-and-prompt-runtime.test.ts` 的同类流程测试，一个 `direct` 加一个 `deferred`。
- 度量：固定假目录（如 3 个 server、20 个工具）上记录声明的 schema 体积与 `tool_search` 往返次数，不调用真实 Provider。
- 回滚：字段全可选，无数据迁移；回退提交即恢复旧行为。已写入 `mcp.json` 的新字段会被新版之前的 runtime-mcp 忽略（对象允许额外属性），但旧版 Desktop 的严格白名单会拒绝保存，发布说明需提示降级风险。

## 升级信号

- supervisor 就地更新无法在不破坏 generation 与 lease 不变量的前提下实现：停止，评估退回“暴露变更即重连”或另立 ADR 评审。
- 固定目录上无可测收益：关闭 REQ-0010。
- 需要 Plan 模式放行只读文档类 MCP，或需要核对项目 MCP 配置信任模型：各自另立 Issue，不并入本计划。
- 实测证实 `tool_search` 激活在恢复或分支后丢失：另立 Bug 或 Issue。

## 需要的 ADR

不需要：字段全可选、缺省行为不变，可通过回退提交撤销，不满足“难以逆转”。若 S1 决定改变 `disabledTools` 的比较或重连语义，或需要新增公共 Port，再评估是否补 ADR。
