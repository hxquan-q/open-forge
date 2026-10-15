---
id: RESEARCH-0025
type: research
status: done
priority: P1
owner: coordinator
source: user-request; upstream openvetta/open-vetta 7c7589c02 对照
created: 2026-10-15
updated: 2026-10-15
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 上游 0.5.60–0.5.64 同步审计与候选清单

## 问题与范围

用户要求整理上游 vetta 最近更新并识别值得同步的项。本报告对照上游 `7c7589c02`（main=dev，0.5.64，2026-10-14 发布）与本仓现状，范围限非手机（REQ-0008）；逐项给出 adopt/adapt/retain 结论与本仓代码证据，排除「本仓已有」的伪缺口。

## 事实来源

- 上游分支：`upstream/main` = `upstream/dev` = `7c7589c02a114a25cad3fa48ffc9848fa3ca693e`（2026-10-15 用户侧 fetch）。
- 相对本仓上次快照 `57c4fd32b`（2026-10-08）新增 99 个提交、3 个版本：0.5.62（10-08 组稿）/0.5.63（10-13）/0.5.64（10-14）。
- 上游发布说明 `.github/release-notes/v0.5.6{0,1,2,3,4}.md`（经 `git show 7c7589c02:…` 读取）。
- 关键上游提交：`b28d4f4ee`（Responses WebSocket 传输 + 流内瞬时错误可重试）、`22293f956`（末尾短语恢复全亮）、`c8fa6fbe2`（插件模型图像输入保留）、`a98f55365`+`2d4fb93d9`+`64c3ff927`（压缩回复内步骤）、`61072cbb3`（重进会话排队消息）、0.5.63 模型配置系列（`ce82178cc`/`3cfafb896`/`06b834d06`/`d5a1311e8`）。
- 本仓代码锚点见下节。

## 当前结论

按价值排序的同步候选（均已核实本仓现状）：

1. **网关流内瞬时错误标记可重试**（0.5.62，adopt）：本仓 `packages/ai/src/protocol/errors.ts:305` 的 `isRetryableProviderFailure` 只认 HTTP 状态码，而 `packages/ai/src/providers/openai-responses/events.ts:164` 的 `response.failed` 分支抛错不带状态码（中转网关把上游 5xx 包进流内事件）→ 判为不可重试、自动重试放弃。上游修法：`TRANSIENT_FAILED_CODES` 集合（upstream_error/server_error/internal_error/overloaded_error/rate_limit_error/service_unavailable/timeout）命中时在抛错上显式挂 `retryable: true`。本仓 `provider-error.ts:42` 已有 `readRetryableOverride` 机制可承接。
2. **流式末尾短语恢复全亮**（0.5.61 尾部修复，adopt）：上游 `22293f956` 只改 `packages/theme-ui/src/markdown/streaming-reveal.ts`(+5) 与 `streaming.ts`(+17/-2)；本仓同路径文件存在（吸收过 0.5.59 匀速流式同源代码），需 diff 对齐后小补丁。
3. **插件模型图像输入能力保留**（0.5.62，adapt 前先对照）：上游 `c8fa6fbe2` 补齐模型写入合同与 SDK 输入类型声明，防止图像能力在注册/恢复时丢失。本仓 TASK-0163 做过模型输入能力投影，是否同病需对照 `capability-sdk`/`plugin-models-api`/`model-settings-service` 合同后定。
4. **Responses/Codex 传输方式设置**（0.5.62，adapt）：本仓 2026-08 已有 Codex WebSocket 传输（`openai-codex/websocket.ts`）但无用户可见的 SSE/WS/自动入口；上游把传输抽为 Responses/Codex 共享并在桌面模型设置加选择项，修复与传输方式同一提交落地。
5. **模型拉取参数回填**（0.5.63，adapt）：本仓 2026-09-29 已有「测试可用性 + 手动勾选」；缺 models.dev 目录补空字段、聚合网关命名空间逐层剥离匹配、拉取参数（上下文窗口/最大输出/图片输入/思考档位）随勾选写入、档位拖拽排序。
6. **自动压缩改为回复内步骤**（0.5.64，defer）：上游 3 提交（runtime 带 Turn 回放 + theme-ui 视图 + 桌面接线）。与 BUG-0110/TASK-0262 同域不同缺陷，须待其收口后再评估本仓压缩渲染的适配面。
7. **重进运行中会话排队消息/压缩双等待提示**（0.5.64，defer+对照）：上游修在其 feed 架构上；本仓消息列表与队列路径分叉（TASK-0185 等），先对照确认本仓是否同病，且与 TASK-0260/0261 未提交改动同文件。

明确排除：AGENTS.md+CLAUDE.md 双读（本仓 `packages/coding-agent/src/resources/runtime/context-resources.ts:27` 已读两文件）；手机/Android/iOS/远程桌面/配对（REQ-0008 范围外）；发版出 APK 与 CI 自动上线清单（本仓发版线独立）；MCP 弹窗/滑块/mono 主题/项目详情页等纯 UI（按本仓品牌与设计口径自行取舍，主题配色与品牌层交叉不可直搬）。

## 被否决的方案

- 整体 merge 上游 dev：违反 REQ-0008 择优原则，会带入手机侧大范围改动与本仓已分叉文件的冲突。
- 只按上游发布说明清单逐条搬：无本仓现状证据，会把已有能力当缺口（如双读、Codex WS 已存在）。
- 同步 0.5.64 压缩/队列两项与本仓 BUG-0110/0109 修复并行：同文件（turn-pipeline.ts、SessionMessageList.tsx、MessageListFooter.tsx）未提交改动在途，必然互相覆盖。

## 代码/测试/指标锚点

- 本仓重试分类：`packages/ai/src/protocol/errors.ts:298-309`、`packages/ai/src/provider-kit/provider-error.ts:42-82`。
- 本仓流内错误抛出：`packages/ai/src/providers/openai-responses/events.ts:164-169`；测试夹具 `packages/ai/src/testing/provider-stream-fixtures.ts:326-358`。
- 本仓流式渲染：`packages/theme-ui/src/markdown/streaming.ts`、`streaming-reveal.ts`、`blocks/TextBlockView.streaming.test.tsx`。
- 上游参照：`git show b28d4f4ee -- packages/ai/src/providers/openai-responses/events.ts`（TRANSIENT_FAILED_CODES 原文）；`git show 22293f956`。

## 失效条件与置信度

- 上游在下次发布中再改错误分类或流式渲染语义时，1/2 两条的补丁形状需重新对照。
- 第 3/7 条是「疑似同病」，置信度中：未经本仓红测证实，实施 Task 内先证伪/证实再动手。
- 上游 main=dev 同点为 2026-10-14 状态；之后上游前进需重新审计增量。

## 下一步触发信号

- TASK-0262（BUG-0110）收口后启动压缩回复内步骤对照（候选 6）。
- TASK-0260/0261 收口后启动重进会话排队消息对照（候选 7）。
- 用户使用聚合网关遇到模型参数缺失时提升候选 5 优先级。
