---
id: TASK-0272
type: task
status: ready
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0115
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0115]
execution: parallel
branch: task/TASK-0272-terminal-lifecycle-listener-release
worktree: ../open-forge-wt/task-0272-terminal-lifecycle-listener-release
base_commit:
read_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts, apps/desktop/src/main/terminal]
write_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts, project/tasks/TASK-0272-terminal-lifecycle-listener-release.md]
exclusive_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 终端 owner 与事件订阅的生命周期监听器成组解绑

## 目标

让终端 IPC 在导航、销毁、渲染进程崩溃与模块 teardown 时把同一组生命周期监听与事件订阅一起解除，使监听数量有界、旧订阅不再转发，同时保持既有 PTY 回收语义。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel
- 可并行 Task：TASK-0271 / TASK-0273 / TASK-0274
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；与其它三个 Task 无文件交集
- Branch：`task/TASK-0272-terminal-lifecycle-listener-release`
- Worktree：`../open-forge-wt/task-0272-terminal-lifecycle-listener-release`
- 集成负责人：Coordinator
- 集成顺序：任意（文件不相交）

### 做

- `trackOwner`（`apps/desktop/src/main/ipc/terminal.ts:85-97`）：`release` 内对 `destroyed` / `did-navigate` / `render-process-gone` 三个事件名成组 `removeListener`（幂等），不再依赖 `once` 的自清语义留下另外两个；`release` 同时撤销该 sender 的全部事件订阅。
- 新增订阅登记（如 `Map<WebContents, Map<terminalId, () => void>>`），`attachSubscription`（`:70-80`）注册时先撤销同 terminalId 的旧订阅；`CLOSE`（`:127-129`）在 `dispose` 之外调用撤销；teardown（`:143-150`）遍历已登记 owner 与订阅逐个摘除后再清空。
- 回归测试（`terminal.test.ts`）：受控 WebContents 替身 + fake `TerminalService`，从公开 IPC handler 走 `OPEN → did-navigate → OPEN` 多轮，断言 `listenerCount("destroyed")` 有界且不随轮次递增；覆盖 `OPEN → CLOSE` 后订阅不再转发、`render-process-gone` 触发回收。

### 不做

- 不提高 `MaxListeners` 上限或加 `setMaxListeners` 掩盖（BUG-0115 明确约束）。
- 不改 `main/terminal/**` 的会话表、缓冲与忙闲语义。
- 不顺手改渲染端终端组件（本 Bug 的现场证据都在主进程侧）。

## Given / When / Then

- Given：同一 Desktop WebContents 打开终端。
- When：页面导航释放 owner 后再次打开终端；或反复打开并关闭终端；或渲染进程崩溃。
- Then：旧 owner/订阅监听被释放，监听数量有界，旧终端的输出不再转发到新页面，PTY 按既有语义回收。

## 必须保持

- 导航、`destroyed`、`render-process-gone` 三种情形下 PTY 仍被回收（不得因为改动漏掉任一条）。
- 正常终端输入/输出/重置大小/前台进程查询/focus 与快照通道语义不变。
- `disposeAllTerminals` 的退出回收语义不变。

## 测试与验证

- 定向测试：`bun run test:pkg desktop`（若该面出现根 runner 导入假红，改用 `apps/desktop` 包内 `bun run test`）并附 `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/ipc/terminal.test.ts`。
- 用户流程：打开终端 → 切换页面/重开终端 → 命令输出仍正确；崩溃恢复后旧 PTY 不再挂留。
- 质量检查：`bun run test:impact -- apps/desktop/src/main/ipc/terminal.ts apps/desktop/src/main/ipc/terminal.test.ts`；完整 `check` 由集成后统一跑。

## 验收分层

- 工程验证：待执行
- 技术评审：待执行
- 集成：pending
- 人工功能验收：待验收（真实终端重开与崩溃恢复）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例，打开终端面板。
- 操作步骤或 AI 任务输入：打开终端 → 跑一条命令 → 导航到别的页面再回来 → 再开终端 → 重复若干次。
- 预期行为与最终产物：终端输出正常，`dev/main/*.log` 不再出现 `MaxListenersExceededWarning` 且 `destroyed` 监听数量不随轮次增长。
- 不通过表现与已知限制：继续告警、旧终端输出串到新页面、PTY 未被回收。
- 验收反馈及回归案例：待填写。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：创建/初始化/检查/清理结果
- 剩余风险：
