---
id: TASK-0061
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: parallel
branch: task/TASK-0061-canvas-activity-tab
worktree: ..\open-forge-wt\TASK-0061-canvas-tab
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/main/artifacts, packages/theme-ui, packages/plugins/presets/vetta-ui-design]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, packages/plugins/presets/vetta-ui-design]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/builtins/index.ts]
depends_on: [TASK-0060]
conflicts_with: [TASK-0064, TASK-0027]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Canvas 内置 tab 与渲染器

## 目标

Activity Panel 新增常驻内置 `canvas` tab：workspace 级 artifact 列表（按来源会话分组）、Markdown/代码只读渲染、HTML 经 `<webview>` 沙箱交互预览、文本选区附加到草稿、缺失文件可恢复态、「保存到项目」入口；设计插件 tab 改名「设计画布」消歧。

## 范围

### 并发评估

- 结论：条件支持——与 TASK-0062/0063 不同目录可并行；与 TASK-0064 共享 `builtins/index.ts` 一行注册，声明冲突。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0062、TASK-0063。
- 前置依赖：TASK-0060（artifact 服务与读取面）；TASK-0059（i18n key 骨架）。
- 冲突文件/独占路径：`builtins/index.ts`（与 0064 共享，集成时串行落一行）；vetta-ui-design 插件自身 locale（不与他人共享）。
- 集成负责人：coordinator；集成顺序：在 TASK-0060 之后。

### 做

- `canvas` builtin tab definition：常驻（`useMeta` 不做内容门控）、`removable`、order 介于 file(0) 与 browser(15) 之间、icon 与 i18n key 走 0059 骨架。
- 列表视图：workspace 全部 artifact 按来源会话分组；标题/kind/版本/时间/文件缺失态；空态引导文案。
- 渲染：Markdown 与代码复用现有渲染组件只读呈现；HTML 用 `<webview>`（`contextIsolation`、`nodeIntegration: false`、无特权 preload、导航拦截、CSP），按 ADR 安全基线实现。
- 文本选区 → 附加草稿：Markdown/代码选区生成 artifact 锚点 attachment（artifactId+version+选区摘要），走既有 composer prompt attachment 通道。
- 「保存到项目」：目标目录选择、冲突提示、成功后 descriptor uri 已重指；「外部更新」标记与「文件缺失」可恢复态。
- 新产出提示：Agent `create` artifact 后 Canvas tab 显示未读徽标/选中提示（不抢焦点），由 artifact 事件驱动。
- 插件类型 artifact 入列：已知类型（如 `.vetd`）点击跳到其已注册 surface（设计画布 tab），未知类型显示元信息卡（descriptor 元数据 + 渲染方指引），不显示内容预览。
- `vetta-ui-design` 插件 tab 标签改为「设计画布」（仅其自身 locale/标签，不改画布功能）。

### 不做

- Canvas 内直接编辑源文件、HTML 内元素点选（Phase 2）。
- 消费插件 renderer registry（归 PLAN-0007，依赖 TASK-0027 产出）。
- 自定义 shadow/厚边框等违反 `apps/desktop/DESIGN.md` 的样式；手写按钮。
- Release Notes（coordinator 统一写）。

## Given / When / Then

- Given：会话中 Agent 产出了 Markdown artifact；When：用户打开 Canvas tab；Then：列表按会话分组显示该 artifact，点开渲染为只读 Markdown。
- Given：HTML artifact；When：用户打开预览；Then：在隔离 `<webview>` 中可交互运行，脚本无法访问宿主 DOM/Vetta API/Node。
- Given：artifact 文件被删除；When：列表/预览打开；Then：显示「文件缺失」可恢复态而非空白或崩溃。
- Given：Agent 刚 `create` 一个 artifact 且用户未打开 Canvas；When：artifact 事件到达；Then：Canvas tab 出现未读提示，打开后定位到新 artifact，不抢当前焦点。
- Given：workspace 有 `.vetd` artifact；When：在 Canvas 列表点击；Then：跳到「设计画布」tab；Given：未知插件类型 artifact；Then：显示元信息卡而非空白/报错。
- Given：项目里有 `.vetd` 设计稿；When：看标签栏；Then：「Canvas」与「设计画布」两个 tab 文案可区分。

## 必须保持

- 渲染只读 descriptor/文件投影，UI 不成为事实源。
- `<webview>` 沙箱：无 nodeIntegration、无 allow-same-origin 逃逸、导航一律拦截走外部确认；不复用 `HtmlPreviewView` 的宽限 iframe 属性。
- 键盘可达、焦点与 aria 语义符合 `apps/desktop/DESIGN.md` 与用户语言规范。

## 测试与验证

- 定向测试：tab meta/排序/可见性解析；列表分组与缺失态；选区→attachment 载荷；webview 沙箱属性断言；设计插件改名后标签解析。
- 用户流程：产出→列表→渲染→选区回引→发送→Agent update→新版本刷新→保存到项目→外部编辑→「外部更新」。
- 质量检查：组件测试 + `bun run test:impact -- <files>` + `check:quick`；真实 webview 沙箱行为用本地 fixture 定向 Electron E2E。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
