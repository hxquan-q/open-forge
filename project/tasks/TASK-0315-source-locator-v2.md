---
id: TASK-0315
type: task
status: verifying
priority: P1
owner: packages/plugins
requirement: REQ-0005
plan: PLAN-0018
source: PLAN-0018 F1/F2 数据层（用户目标指令 2026-10-18）
related_requirement: [REQ-0005]
related_plan: [PLAN-0018]
related_tasks: [TASK-0309]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0315-source-locator-v2
worktree: unassigned（已集成，待推送后清理）
base_commit: 511c36e4fc8066e258c1aac6bf115c62b531a6d0
read_paths:
  - project/plans/PLAN-0018-design-plugin-roadmap-v2.md
  - packages/plugins/presets/vetta-ui-design/engine/vite.config.mjs
  - packages/plugins/presets/vetta-ui-design/engine/src/bridge.ts
  - packages/plugins/presets/vetta-ui-design/src/canvas/bridge-client.ts
  - packages/plugins/presets/vetta-ui-design/src/canvas/selection-ask.ts
  - packages/plugins/presets/vetta-ui-design/src/tools.ts
write_paths:
  - packages/plugins/presets/vetta-ui-design/engine/plugins/source-tagger.mjs
  - packages/plugins/presets/vetta-ui-design/engine/vite.config.mjs
  - packages/plugins/presets/vetta-ui-design/engine/src/source-payload.ts
  - packages/plugins/presets/vetta-ui-design/engine/src/bridge.ts
  - packages/plugins/presets/vetta-ui-design/src/engine/engine-files.ts
  - packages/plugins/presets/vetta-ui-design/src/shared/source-locator.ts
  - packages/plugins/presets/vetta-ui-design/src/canvas/bridge-client.ts
  - packages/plugins/presets/vetta-ui-design/src/tools.ts
  - packages/plugins/presets/vetta-ui-design/src/vetd/design-session.ts
  - packages/plugins/presets/vetta-ui-design/test/source-locator.test.ts
  - packages/plugins/presets/vetta-ui-design/test/source-locator.test.ts
  - packages/plugins/presets/vetta-ui-design/test/source-tagger.test.ts
  - packages/plugins/presets/vetta-ui-design/test/source-payload.test.ts
  - packages/plugins/presets/vetta-ui-design/test/engine-config.test.ts
  - packages/plugins/presets/vetta-ui-design/test/layout-probe.test.ts
exclusive_paths:
  - packages/plugins/presets/vetta-ui-design/engine
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 源码定位 v2（file:line:column）与元素上下文包数据层（PLAN-0018 F1 + F2 数据层）

## 目标

按 [PLAN-0018](../plans/PLAN-0018-design-plugin-roadmap-v2.md) F1/F2 数据层落地 dyad tagger 方案与 react-grab 式上下文包（不引入第三方代码，按方案自研等价实现；许可矩阵见 RESEARCH-0031）：

1. **源码定位 v2**：插桩值从 `frames/x.tsx:42`（仅行）升级为 `frames/x.tsx:42:9`（文件:行:列，列 1-based 与编辑器一致）。抽取 `engine/plugins/source-tagger.mjs`（vite.config.mjs 引用），保留 dev-only、相对设计根、重复注入保护。列号是后续 AST 写回（TASK-0316）按起始列指纹重定位的基础。
2. **消费端兼容解析**：新增 `src/shared/source-locator.ts`——`parseSourceLocator` 同时容忍旧 `file:line` 与新 `file:line:col`，供工具输出与备注锚消费；历史缓存/旧引擎实例的旧值不抛。
3. **元素上下文包数据层**：`engine/src/source-payload.ts`（新，无重依赖可测）提供 `outerHtmlSnippet(element)`（截断 2KB）与 `styleSummaryFor(element, getComputedStyle)`（白名单：display/flex-direction/gap/font-size/font-weight/color/background-color/border-radius/width/height）；`engine/src/bridge.ts` 的 `payloadFor` 挂接，`SelectedElementPayload` 增可选字段 `outerHTML`/`styleSummary`，流向全部既有消费方（追问锚、vetd_notes 保鲜、resolveElement）。
4. **vetd_notes 元素条目增强**：agent 读备注时，元素锚输出在 `source` 原文外补解析后的 locator、outerHTML 片段与 styleSummary。

## 范围

### 并发评估

- 结论：条件支持并行。与 TASK-0316（ast-edit 骨架）同包不同文件：其写域 `src/inspector/**`、`package.json`、`bun.lock`、`test/ast-edit-*.test.ts`，与本任务 write_paths 文件级不相交（test 文件逐个列名，不占目录）；已与执行会话双向确认分工。
- 执行方式：parallel（专用 Worktree `../open-forge-wt/task-0315-source-locator-v2`），基线 `main@ee0c00f54`（已含 TASK-0309 P0）。
- 集成：先到先集成，后到方 ff-only 对齐后集成；共享文件仅 `bun.lock`/`package.json`（本任务不改依赖，无冲突面）。

### 做

- 上述四项 + engine 文件内容变更经 `engineFilesHash` 自动重物化的验证（不需升 ENGINE_VERSION，TASK-0309 已核实该机制）。

### 不做

- 不改 frame 通信与独立 origin（penpal 属后续切片）；不碰 `src/inspector/**`（TASK-0316）；不加任何 npm 依赖；不做拾取 overlay UI 与 bippy props（F2 交互层后续）；不改 `.vetd` 格式与工具名。

## Given / When / Then

- Given：设计含 JSX 元素；When：dev serve 编译；Then：每个 JSX 开标签带 `data-vetd-source="<file>:<line>:<column>"`，生产构建不注入。
- Given：旧格式 `file:line` 值（历史快照/旧引擎实例）；When：`parseSourceLocator` 解析；Then：返回 `{file, line, column: null}`，不抛。
- Given：用户选中元素并「让 Open Forge 去做」/读备注；When：payload/工具输出生成；Then：agent 可见列级 locator、≤2KB outerHTML 片段与样式摘要；缺省字段（旧引擎实例）不破坏既有消费方。

## 必须保持

- `SelectedElementPayload` 既有字段与语义不变（新增字段全部可选）；备注锚 JSON 向后兼容；engine 模板结构不变（仅内容 hash 变化触发重物化）。
- 生产导出产物无 `data-vetd-*`（沿用现状）；layout-probe 探针对新旧格式均不抛。

## 测试与验证

- 新增 `test/source-locator.test.ts`（新旧格式解析、畸形输入 null）、`test/source-tagger.test.ts`（值构造 `rel:L:C`、列 1-based、重注入保护）、`test/source-payload.test.ts`（截断、白名单样式、getComputedStyle 注入）。
- 扩展 `test/engine-config.test.ts`（vite.config 引用 source-tagger、dev-only）与 `test/layout-probe.test.ts`（fixtures 升级 `:L:C`）。
- 命令：插件包内 `bun run test`；根 `test:impact` 与 `check:quick`；集成时完整 `check`。

## 验收分层

- 工程验证：上述测试全绿。技术评审：自审。集成：pending。
- 人工验收：待用户实机——画布选中元素后追问/vetd_notes 里的 locator 带列号、上下文含 HTML 片段与样式；旧设计目录打开不报错。

## 交付记录

- 实际修改：
  - `engine/plugins/source-tagger.mjs`（新，抽取自 vite.config 内联实现）：注入值升级 `file:line:column`（列 1-based），保留 dev-only/相对路径/重复注入保护；`engine/vite.config.mjs` 改为引用；
  - `engine/src/source-payload.ts`（新）：`outerHtmlSnippet`（2KB 截断）+ `styleSummaryFor`（10 键白名单，getComputedStyle 注入）；`engine/src/bridge.ts` 的 `payloadFor` 挂接，`SelectedElementPayload` 增可选 `outerHTML`/`styleSummary`（两侧接口同步）；
  - `src/shared/source-locator.ts`（新）：`parseSourceLocator` 跨代解析（v1 仅行、v2 行列、文件段禁冒号、畸形 null）；
  - `src/tools.ts`：vetd_notes 元素视图在保鲜循环里经新鲜 payload 带出 `locator`/`outerHTML`/`styleSummary`（不持久化进锚点，向后兼容）；工具描述同步 file:line:column；
  - `src/engine/engine-files.ts`：登记两个新模板文件（内容 hash 自动触发重物化，无需升 ENGINE_VERSION）；
  - 附带存量修复：`src/vetd/design-session.ts` 备注元数据恢复改类型谓词——包内 `tsc --noEmit` 长期红的 `Record<string, unknown>` → `FrameMeta`（根 `check:types` 不覆盖 plugins，CI 不可见；0309/0315 两工作树复现同一错误，独立提交归属）。
- 实际运行：定向 32/32（source-locator/tagger/payload/engine-config/layout-probe）；包内 `tsc --noEmit` 修复后 0 错；包内全量与 impact 待 desktop 套件让路后串行复跑（首轮全量 548/548 断言全过、29 文件收集失败系与后台 desktop 套件并发资源枯竭，单跑复现已转绿）。
- 未运行及原因：引擎真实 dev serve 的端到端（tagger babel 链路、上下文包在画布上的呈现）待用户实机；real-model 回合不适用（纯确定性合同）。
- 剩余风险：babel 访问器本体仅经工厂签名与值构造测试锁定，端到端依赖实机 dev serve；旧引擎实例（未重物化）回传的 payload 无上下文包字段——消费方按可选字段处理，已测。
