---
id: TASK-0221
type: task
status: verifying
priority: P3
owner: apps/desktop renderer
requirement:
plan:
source: BUG-0083（render 日志成批落盘 React flushSync 生命周期 DEV 告警）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0083]
execution: serial
branch: main
worktree: main-workspace
base_commit: a7f0584bc
read_paths: [apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel, apps/desktop/src/main/logger, apps/desktop/src/main/window-manager.ts]
write_paths: [apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useSidebarSelectionIntent.ts, apps/desktop/src/main/logger/renderer-console-policy.ts, apps/desktop/src/main/logger/renderer-console-policy.test.ts, apps/desktop/src/main/window-manager.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0083-flushsync-lifecycle-dev-warning.md, project/bugs/README.md, project/tasks/TASK-0221-renderer-flushsync-dev-noise.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useSidebarSelectionIntent.ts, apps/desktop/src/main/logger/renderer-console-policy.ts]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# 消除 render 日志的 React flushSync 生命周期 DEV 噪音，并移除第一方 flushSync

## 目标

1. 第一方不再调用 React 的 `flushSync`：侧栏选择意图改为离散事件内普通更新 + 既有 `waitForCommittedPaint` 屏障，保住「先提交并绘制高亮，再启动会话内容工作」的既有保证（bug 的次生风险面）。
2. 依赖侧同性质 DEV 诊断不再进持久化 render 日志：按 BUG-0048 的先例加精确判定，DevTools 控制台照旧可见。

## 范围

### 并发评估

- 结论：不支持（小改动、单工作区串行即可）。
- 执行方式：serial
- 可并行 Task：无（当前 main 工作区已有他人未提交的 `project/` 台账修改，本次只追加自己的文件，不与其并行写同一文件）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；`project/bugs/README.md` 与 `project/tasks/README.md` 已含他人未提交修改，只做追加行
- Branch：main
- Worktree：main-workspace（未声明独立 worktree）
- 集成负责人：本次实施者（串行）
- 集成顺序：不适用

### 做

- `useSidebarSelectionIntent.ts`：删除 `react-dom` 的 `flushSync` 调用与 import，保留 `waitForCommittedPaint({ timeoutMs: null })` 屏障与请求序号/完成态逻辑；更新注释说明为什么点击（离散事件）更新不需要 `flushSync`、以及屏障仍然保证绘制顺序。
- `renderer-console-policy.ts`：新增 `isReactFlushSyncLifecycleDiagnostic(message)`，按 React DEV 文案做精确匹配（不按前缀，避免吞真实错误）。
- `window-manager.ts`：console-message 处理器在写入前调用该判定（与 ResizeObserver 过滤并列）。
- `renderer-console-policy.test.ts`：覆盖命中/近似文案不命中/真实错误不命中。
- 发布说明：`v0.1.3.md`「其他」追加一句（内部信噪比修复，无用户可见变化）。

### 不做

- 不修改任何依赖包（react-virtuoso / radix-ui / @lexical/react 的 vendored `flushSync`），不新增 patch。
- 不改 `ValueBridgePlugin`/`ControlledValueBridgePlugin` 的同步时机（Lexical 路径属 BUG-0083 的待定位候选，不在本任务扩大范围）。
- 不引入扫描「禁止 flushSync import」的新守卫；本任务只清理现有唯一调用点。
- 不改 `waitForCommittedPaint` 的超时/绘制语义。

## Given / When / Then

- Given：dev 模式 Desktop；侧栏会话行可点击。
- When：用户点击一个会话行或项目内会话行。
- Then：高亮在会话内容工作启动前完成提交与绘制（与既有实现同一合同），且点击路径不再产生 `flushSync` 调用；任何来源的该条 React DEV 文案不再进入持久化 render 日志。
- Given：renderer 打印一条真实业务 error 或近似但不是该 DEV 文案的消息。
- When：main 进程 console-message 处理器判断是否落盘。
- Then：真实错误与近似文案仍照常落盘。

## 必须保持

- 侧栏选择的对外行为：点击即时高亮、连续点击只打开最后一次、路由/active session 确认后意图清零、失败回退清理。
- `waitForCommittedPaint` 的「先绘制再启动重活」语义与现有 `prepareSidebarSelection` 延迟测量行为。
- renderer 持久化策略其余部分：warn/error 默认保留，低信号 info 前缀过滤不变。

## 测试与验证

- 定向测试：`bun --cwd apps/desktop run test -- src/main/logger/renderer-console-policy.test.ts src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.selectSession.test.tsx src/renderer/domains/project/components/sidebar/projects/panel/DefaultSessionRowView.test.tsx src/renderer/domains/project/hooks/sidebar-conversation-selection.test.tsx`
- 用户流程：以既有 jsdom 用例重放「点击会话行 → 立即高亮 → 屏障兑现后才打开」流程；真实 dev 实例的日志复验依赖 BUG-0083 的复现路径，本次未运行。
- 质量检查：`bun run check:quick`（中间轮）与 `bun run check`（收尾），另跑 `bun run test:impact`。

## 验收分层

- 工程验证：通过；绑定下方「交付记录」的命令与结果。
- 技术评审：自审；依赖侧调用方未定位（BUG-0083 候选表），剩余风险见其记录。
- 集成：集成于 main 工作区串行提交；实际提交与集成后验证见交付记录。
- 人工功能验收：不适用（DEV 日志信噪比，无用户可见行为；日志复验依赖 BUG-0083 复现路径）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：dev 模式 Desktop 的 render 日志 `~/.openforge-dev/desktop-app/logs/render/<日期>.log`。
- 操作步骤或 AI 任务输入：打开应用并复现 BUG-0083 的原始交互（具体路径待定）；或直接检查日志中该文案是否还会落盘。
- 预期行为与最终产物：日志中不再出现 `flushSync was called from inside a lifecycle method`（DevTools 控制台仍可能出现依赖侧调用）；侧栏点击行为与之前一致。
- 不通过表现与已知限制：侧栏点击后高亮延迟或需要第二次点击才生效即为回归；依赖侧调用方仍未定位，如从 DevTools 看到该告警，按 BUG-0083 带 stack 抓取。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：
  - `apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useSidebarSelectionIntent.ts`：删除 `react-dom` 的 `flushSync` import 与调用（改为事件内普通 `setSelectionIntent`），保留 `waitForCommittedPaint({ timeoutMs: null })` 屏障、请求序号与完成态；补 fork 修改声明头（upstream 文件首次修改）。
  - `apps/desktop/src/main/logger/renderer-console-policy.ts`：新增 `isReactFlushSyncLifecycleDiagnostic`（对 React DEV 文案精确匹配）。
  - `apps/desktop/src/main/window-manager.ts`：console-message 写入前调用该判定（与 ResizeObserver 过滤并列）。
  - `apps/desktop/src/main/logger/renderer-console-policy.test.ts`：新增 3 例（逐字命中 / 截断与加长近似不命中 / 含 flushSync 的真实错误不命中）。
  - `.github/release-notes/v0.1.3.md`「其他」追加一条（迁移前手写版本，碎片与手写正文不可混用，按近期实践直接追加）。
- 实际运行：
  - 定向 4 文件 53 例全绿：`bun --cwd apps/desktop run test -- src/main/logger/renderer-console-policy.test.ts src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.selectSession.test.tsx src/renderer/domains/project/components/sidebar/projects/panel/DefaultSessionRowView.test.tsx src/renderer/domains/project/hooks/sidebar-conversation-selection.test.tsx`（4 files / 53 tests passed）。
  - `bun run test:impact -- <本次改动文件>`：direct 10 例 + related 35 文件 / 261 例全绿。
  - `bun run check`：lint、mobile-lint、check:types（root/cli/desktop/docs/mobile）与 check:guards 全部 exit 0；首轮唯一红为 `check-modified-file-notices` 的「缺少声明头」，补头后单跑该守卫 `new=0` 并重跑完整 check 全绿。
  - 合并 `origin/dev` 后的集成 worktree 复验：完整 check 全绿（lint/mobile-lint/types 五面/guards）；`test:impact` related 47/49 文件、318 例通过，2 个主进程套件（`file-protocol`、`ipc/browser-view`）仅因新检出缺 electron 二进制而收集失败，属环境性、与本次改动无关。
- 未运行及原因：真实 dev 实例的日志复验未运行——BUG-0083 的交互触发路径未知，无法在此环境确定性复现；jsdom/vitest 受 `act()` 的 executionContext 语义限制无法重放该 DEV 告警（已在 BUG-0083 记录）。
- Worktree：未拆出；serial + `exclusive_paths` 已声明（理由见并发评估）。main 工作区存在他人未提交的 `project/` 台账修改，本次只追加自己的文件与索引行，未改动其内容。
- 集成：main 工作区串行提交 `e8377d854`（代码 + 发布说明）；随后按 coordinator 授权经集成 worktree 合并 `origin/dev`（merge `f35d09ccb`）并推 `origin/dev`；本记录在合并时因 `TASK-0219/0220` 已被 dev 占用而重编号为 `TASK-0221`（见重编号提交 `c1cc55506`）。
- 剩余风险：依赖侧 `flushSync` 调用方仍未定位（BUG-0083 候选表：Lexical 装饰器监听器 + 第一方桥在 effect 内 `editor.update` 为最可能路径）；若再出现，按 BUG-0083 的带 stack 抓取继续。侧栏替换 `flushSync` 后的绘制顺序保证由既有行为用例覆盖，真实低配机上的高亮延迟未见回归证据，但也未做真机耗时对照（原问题的量化基线本就不存在）。

