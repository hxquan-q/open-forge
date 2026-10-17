---
id: TASK-0316
type: task
status: in_progress
priority: P2
owner: packages/plugins
requirement: REQ-0005
plan: PLAN-0018
source: PLAN-0018 F3 前置（Onlook parser 移植骨架，TASK-0315 互补切片）
related_requirement: [REQ-0005]
related_plan: [PLAN-0018]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0316-ast-edit-engine
worktree: ../open-forge-wt/task-0316-ast-edit-engine
base_commit: ee0c00f54
read_paths:
  - project/plans/PLAN-0018-design-plugin-roadmap-v2.md
  - packages/plugins/presets/vetta-ui-design/src/canvas/selection-ask.ts
  - packages/plugins/presets/vetta-ui-design/src/vetd/layout-probe.ts
write_paths:
  - packages/plugins/presets/vetta-ui-design/src/inspector
  - packages/plugins/presets/vetta-ui-design/test/ast-edit-locate.test.ts
  - packages/plugins/presets/vetta-ui-design/test/ast-edit-style.test.ts
  - packages/plugins/presets/vetta-ui-design/test/ast-edit-text.test.ts
  - packages/plugins/presets/vetta-ui-design/package.json
  - bun.lock
exclusive_paths:
  - packages/plugins/presets/vetta-ui-design/src/inspector
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# AST 写回引擎骨架（PLAN-0018 F3 前置：Onlook parser 语义移植）

## 目标

为 F3「视觉编辑面板 + AST 写回」先落地独立的确定性改码引擎：给定 TSX 源码与目标定位，直接改 Tailwind class 或文本并输出保持了原格式的代码，不经 LLM、毫秒级。本轮只做引擎模块与测试，不接 UI、不接工具面。

参考语义取自 Onlook `packages/parser`（Apache-2.0，已核）：addClass 走冲突合并、replaceClasses 整串替换、updateTextContent 换 JSXText。实现路径按 PLAN-0018 F3 的取舍改为 **magic-string 位置级改写**（Onlook 是 AST 节点变更+重新生成，会重排格式），定位按本仓的 `file:line:col` + 指纹重定位（与 TASK-0315 的 tagger 输出对齐）。

## 范围

### 并发评估

- 结论：与 TASK-0315（F1 tagger + attach 上下文包）互补，写域零重叠；engine/、src/canvas/、src/vetd/layout-probe.ts 归 TASK-0315，本任务不碰。
- 执行方式：parallel（专用 Worktree `task-0316-ast-edit-engine`，单 Agent 串行切片）；基线 `main@ee0c00f54`。
- 共享面：插件 `package.json` 与根 `bun.lock`（新增 4 个已入 bun store 的依赖）；`project/tasks/README.md` 不进 write_paths，索引行由集成方收口。
- 冲突：无已登记冲突路径（已与 TASK-0315 会话互认写域）。

### 做

- 新建 `src/inspector/ast-edit/`：
  - `parse.ts`：TSX 解析（@babel/parser，typescript+jsx 插件），保留 AST 与源码位置；
  - `locate.ts`：按 `{line, column}` 定位 JSXOpeningElement；行漂移时按指纹（标签名 + 祖先路径 + 子树文本摘要）重定位打分；多候选并列时拒绝（ambiguous）；
  - `style.ts`：`editClasses`——静态字符串 `className` 的 add（tailwind-merge 冲突合并）/ remove / replace；无 className 时在标签名后插入新属性；动态 className（模板串/条件/表达式）一律只读拒绝并给原因；
  - `text.ts`：`editText`——替换目标元素首个 JSXText；多行文本按 Onlook 语义拆分为 text + `<br/>`；无文本子节点时插入；
  - `index.ts`：公开 API，编辑结果 `{ ok: true, code } | { ok: false, reason }`，reason 枚举 `locator-miss` / `ambiguous` / `dynamic-class` / `no-target` / `parse-error`。
- 输出经 magic-string 保持原格式：仅目标区间变化，注释、缩进、无关属性零扰动。
- 依赖声明进插件 `package.json`（`@babel/parser`、`@babel/traverse`、`magic-string`、`tailwind-merge`）。
- 合规：style/text 文件头加 Onlook（Apache-2.0）来源注记 + "Modified by The Open Forge contributors"；根 NOTICE「Third-party code incorporated」补 Onlook 条目。

### 不做

- 不接 InspectorPanel/UI、不接 agent 工具、不改 bridge/画布/引擎（归 TASK-0315 与 F3 后续切片）。
- 不做 move/insert/remove/group 与 theme token 映射（F3 后续）。
- 不发布任何包。

## Given / When / Then

- Given：静态 `className="p-2 text-sm"` 的元素被 locator（file:line:col）命中；When：`editClasses(add: ["p-4"])`；Then：该属性变为 `p-4 text-sm`（冲突合并），文件其余字节逐字符不变。
- Given：源码在目标行上方新增 3 行导致行号漂移；When：带原指纹重定位再编辑；Then：仍精确改到同一元素。
- Given：两个无文本差异的同构兄弟节点；When：指纹重定位；Then：拒绝并返回 `ambiguous`，不做猜测性编辑。
- Given：`className={cond ? "a" : "b"}` 或模板串；When：任何 class 编辑；Then：拒绝 `dynamic-class`。
- Given：元素文本为「旧文案」；When：`editText("新文案")`；Then：仅该 JSXText 区间被替换，周围格式不变；多行文本生成 text + `<br/>` 结构。

## 必须保持

- 纯函数：不触文件系统、不依赖 DOM；同输入同输出。
- 所有拒绝路径显式返回 reason，不抛裸异常（解析失败抛带位置错误）。
- 存量源码风格零扰动（除目标区间）。

## 测试与验证

- 单元（主层级）：`test/ast-edit-{locate,style,text}.test.ts` 覆盖上述 G/W/T 与边界（自闭合标签、注释间隔、中文文本、JSX 表达式子节点跳过、remove 到空串）。
- 质量：包内 `bun run test` → 根 `bun run test:impact -- <files>` → `check:quick`；集成时完整 `check`。

## 验收分层

- 工程验证：定向单测全绿 + 包内全量回归。技术评审：自审。集成：pending（与 TASK-0315 协调集成顺序）。
- 人工验收：无 UI 面，本轮无实机项；F3 接面板后另行验收。
- 发布：未授权。

## 交付记录

- 待回填。
