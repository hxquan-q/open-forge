---
id: TASK-0276
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0119
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0119]
execution: parallel
branch: unassigned（原分支 task/TASK-0272-terminal-lifecycle-listener-release 已合并淘汰，保留在 origin/task/TASK-0272-terminal-lifecycle-listener-release）
worktree: unassigned（原 worktree 已集成淘汰，落地提交见交付记录）
base_commit: 96fbe05c1f18a3b662ab659db5162f533562fd9d
read_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts, apps/desktop/src/main/terminal]
write_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0276-terminal-lifecycle-listener-release.md]
exclusive_paths: [apps/desktop/src/main/ipc/terminal.ts, apps/desktop/src/main/ipc/terminal.test.ts]
depends_on: []
conflicts_with: [TASK-0197, TASK-0154, TASK-0218, TASK-0223]
integration_status: integrated
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
- 可并行 Task：TASK-0275 / TASK-0277 / TASK-0278
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；与其它三个 Task 无文件交集；`.github/release-notes/v0.1.3.md`（Bug 修复按交付规则补写发布说明）与 TASK-0197、TASK-0154、TASK-0218、TASK-0223、`project/tasks` 目录级声明重叠，均按合同登记 `conflicts_with`，集成时按行合并
- Branch：`task/TASK-0276-terminal-lifecycle-listener-release`
- Worktree：`../open-forge-wt/task-0276-terminal-lifecycle-listener-release`
- 集成负责人：Coordinator
- 集成顺序：任意（文件不相交）

### 做

- `trackOwner`（`apps/desktop/src/main/ipc/terminal.ts:85-97`）：`release` 内对 `destroyed` / `did-navigate` / `render-process-gone` 三个事件名成组 `removeListener`（幂等），不再依赖 `once` 的自清语义留下另外两个；`release` 同时撤销该 sender 的全部事件订阅。
- 新增订阅登记（如 `Map<WebContents, Map<terminalId, () => void>>`），`attachSubscription`（`:70-80`）注册时先撤销同 terminalId 的旧订阅；`CLOSE`（`:127-129`）在 `dispose` 之外调用撤销；teardown（`:143-150`）遍历已登记 owner 与订阅逐个摘除后再清空。
- 回归测试（`terminal.test.ts`）：受控 WebContents 替身 + fake `TerminalService`，从公开 IPC handler 走 `OPEN → did-navigate → OPEN` 多轮，断言 `listenerCount("destroyed")` 有界且不随轮次递增；覆盖 `OPEN → CLOSE` 后订阅不再转发、`render-process-gone` 触发回收。

### 不做

- 不提高 `MaxListeners` 上限或加 `setMaxListeners` 掩盖（BUG-0119 明确约束）。
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

- 工程验证：通过——定向红 5→绿 14、impact 14+14、包内全量 4977 passed（4 个收集期失败为 BUG-0107 存量）、完整 `check` 见上节；记录面三个守卫通过。
- 技术评审：自审（本轮无独立评审机制，不声称已独立评审）——逐行复核 diff：成组解绑幂等、`CLOSE` 与 teardown 不再遗留闭包、`disposeOwnedBy` 与三种回收路径语义未变。
- 集成：pending（Coordinator 集成；release notes 与并行 Task 按行合并）
- 人工功能验收：待验收（真实终端重开与崩溃恢复）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例，打开终端面板。
- 操作步骤或 AI 任务输入：打开终端 → 跑一条命令 → 导航到别的页面再回来 → 再开终端 → 重复若干次。
- 预期行为与最终产物：终端输出正常；`dev/main/*.log` 不再出现 `MaxListenersExceededWarning`，同一窗口反复重开终端后 `destroyed` 监听数量不随轮次增长（工程侧已用受控替身断言，实机日志需人工复核）。
- 不通过表现与已知限制：继续告警、旧终端输出串到新页面、PTY 未被回收。已知限制——事件序以替身模拟，真实 Electron 的导航与崩溃时序未在实机复核；发布说明文件与另三个并行 Task 共享。
- 验收反馈及回归案例：待填写。

## 交付记录

- 实际修改：
  - `apps/desktop/src/main/ipc/terminal.ts`：owner 登记从 `Set<WebContents>` 改为 `Map<WebContents, OwnerEntry>`，登记三个生命周期监听与该 owner 的订阅表。`trackOwner` 改用 `on` 注册；`release` 先成组 `removeListener` 并撤销该 sender 的全部订阅，再删登记并 `disposeOwnedBy`（幂等）；`attachSubscription` 注册前先撤销同 terminalId 的旧订阅；`CLOSE` 在 dispose 之外撤销该 terminalId 的订阅；teardown 遍历登记成组解绑后再 `disposeAll`。全程未使用 `setMaxListeners`。
  - `apps/desktop/src/main/ipc/terminal.test.ts`：WebContents 替身补齐 `on`/`removeListener`/`listenerCount` 与「once 先摘后调」语义；新增 5 例回归（导航重开监听有界、反复开关监听有界且关闭后不再转发、重开同一终端只留一路转发、导航释放后新一轮 owner 仍被回收、teardown 摘净监听）。
  - `.github/release-notes/v0.1.3.md`：`## 修复` 追加一条（BUG-0119 / TASK-0276）。
  - 两个改动文件按修改声明头门禁补 `// Modified by The Open Forge contributors.`——本次首次改动使它们从基线豁免转为必须带声明头。
- 实际运行：
  - 红（旧实现，包内 runner）：`apps/desktop` 下 `bun run test src/main/ipc/terminal.test.ts` = 5 failed | 9 passed（14）；失败点为 destroyed 监听 2≠1、12 轮开关 13≠1、重复转发 2 条 envelope、导航后重复回收 `[21,21,21]`、teardown 残留 2 条。
  - 绿（修复后）：同命令 14 passed；biome 格式化后复跑仍 14 passed。
  - `bun run test:impact -- apps/desktop/src/main/ipc/terminal.ts apps/desktop/src/main/ipc/terminal.test.ts`：直接测试与相关测试各 14 passed。
  - `bun run --cwd apps/desktop test`（包内全量 936 个文件）：4977 passed | 15 skipped；4 个文件收集期失败，按 BUG-0107 存量基线（`file-protocol.test.ts`、`ipc/browser-view.test.ts`、`conversations/desktop-conversation-service.test.ts`、`app-debug/conversation/cli-runtime-canary.test.ts` 因 `process.resourcesPath` undefined 在 `window-manager.ts:25` 崩），与本改动无导入关系。
  - `bun run check`：通过——lint 4818 文件无问题、`check:types`（根 tsgo / CLI / Desktop 增量 tsc / docs / mobile）全绿、guards 全绿（声明头 ratchet `new=0`）、mobile lint 通过。首轮曾因两个改动文件缺修改声明头判负，补头后复跑全绿。
  - 记录面：`check-task-worktrees`、`check-project-indexes`、`release-notes.mjs --check` 均通过。
  - 环境准备（非交付改动）：worktree 缺 Electron 二进制（`path.txt` 缺失，BUG-0102 同型），按包内自愈脚本 `bun scripts/ensure-electron-binary.mjs` 补齐；workspace 依赖无 `dist`，用 `bun x turbo run build --filter='@vetta/desktop^...'` 构建。
- 未运行及原因：真实 Desktop 实例的终端重开与崩溃恢复人工验收未运行——需启动 dev 实例且本任务未获 UI 验证授权；`verify:ui:*` 同理未运行。
- Worktree：沿用调度方预建的 `../open-forge-wt/task-0276-terminal-lifecycle-listener-release`，未创建也未清理；`git status` 仅本 Task 声明的四个路径。
- 剩余风险：
  - 真实 Electron 的 `WebContents` 事件序（尤其 `did-navigate` 与渲染进程重建的先后）由替身模拟，未在真实进程里复核；实机告警是否消失仍待人工验收。
  - `.github/release-notes/v0.1.3.md` 与 TASK-0197/0154/0218/0223 共享，集成时按行合并。
  - 未量化监听闭包的实际内存占用（BUG-0119 亦未量化）；本次只保证数量有界且旧订阅不再转发。
