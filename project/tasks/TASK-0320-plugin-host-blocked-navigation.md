---
id: TASK-0320
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0131
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0131]
execution: serial
branch: main
worktree: .
base_commit: 1155c7078
read_paths: [apps/desktop/src/main/ipc/session.ts, apps/desktop/src/main/plugins, apps/desktop/src/main/window-manager.ts, apps/desktop/src/renderer/domains/plugins, .github/release-notes]
write_paths: [apps/desktop/src/main/ipc/session.ts, apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts, apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0131-blocked-navigation-stuck-plugin-host.md, project/bugs/README.md, project/tasks/TASK-0320-plugin-host-blocked-navigation.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 被拦截的主窗口导航不再卡死插件工具宿主

## 目标

修复 [BUG-0131](../bugs/BUG-0131-blocked-navigation-stuck-plugin-host.md)：页面内发起、被 `will-navigate` 拦截的主窗口导航不得让 `PluginToolRendererHostLifecycle` 永久停在 `loading`。只有真正提交的主 frame 导航才失效渲染端租约。

## 范围

### 并发评估

- 结论：不支持并发（改动集中在主进程单个 IPC 注册入口与一个新增适配模块，无并行写收益）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/main/ipc/session.ts`、`apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts`、对应测试与项目记录
- Branch：`main`（本地主工作区串行，未拆 worktree：改动小且无并行写者）
- Worktree：`.`
- 集成负责人：coordinator（按交付合同集成）
- 集成顺序：本 Task 单独集成

### 做

1. 把 `session.ts` 内联的导航 → 宿主状态接线抽到 `apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts`，保持现有行为作为重构基线；
2. 新增回归测试：被拦截的 `did-start-navigation` 后宿主仍为 `ready`；`did-navigate` 后进入 `loading`，`markReady()` 后恢复；解绑后不再响应；
3. 将失效点从 `did-start-navigation` 改为 `did-navigate`（主 frame 导航提交）；
4. `session.ts` teardown 改用适配器返回的解绑函数；
5. 更新 `BUG-0131`、`TASK-0320` 与两份索引，并在 `.github/release-notes/v0.1.3.md` 的「修复」补一条。

### 不做

- 不改 `window-manager` 的 `will-navigate` 拦截策略（TASK-0309 的安全边界）；
- 不改渲染端 `reportAgentContributionHostReady()` 的时机、插件工具协议、权限声明或错误文案；
- 不处理历史 `ACTION_NOT_FOUND` 诊断走偏，不改设计引擎的 spawn/退出行为；
- 不修改真实 Provider 配置、不读取真实凭据；UI 验证仅在隔离 Fresh 实例中以本地模型替身完成（用户后续授权 `verify:ui`）。

## Given / When / Then

- Given：插件工具宿主已处于 `ready`，设计插件的 `vetd_status` 可用；
- When：页面内发起一次主 frame 导航，`will-navigate` 将其拦截，Electron 仍发出 `did-start-navigation`；
- Then：宿主保持 `ready`，后续插件工具调用继续派发，不被 loading 拒绝。
- Given：主窗口发生真实整页重载 / 程序化导航并提交；
- When：Electron 发出 `did-navigate`；
- Then：宿主进入 `loading`，在途调用被拒绝；渲染端完成插件加载并上报 `HOST_READY` 后恢复 `ready`。

## 必须保持

- `will-navigate` 仍然拦截所有页面内发起的主窗口导航，外部内容仍走系统浏览器；
- `render-process-gone` 仍将宿主置为 `unavailable` 并清理订阅；
- `PLUGIN_HOST_READY` IPC 仍是唯一的 `markReady()` 触发点；
- 插件工具的身份、权限、错误消息与 `acquire()` 租约语义不变；
- teardown 后不残留导航监听，重复注册不累积监听。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.test.ts apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.test.ts`；
- 红/绿证据：先在行为保持的重构基线上运行新用例（旧实现仍监听 `did-start-navigation`），3 例全红；改为 `did-navigate` 后三条全绿；
- 用户流程：设计插件已启用 → `vetd_status` 成功 → 触发被拦截的主窗口导航 → 再次 `vetd_status` 仍成功（真实 dev 实例复现与验收由人工完成）；
- 质量检查：`bun run test:impact -- <本次修改文件>`、`bun run check`；Desktop 主进程改动涉及类型与守卫，完整 `check` 必跑。

## 验收分层

- 工程验证：已执行。新回归用例旧实现下 3 例全红，改为 `did-navigate` 后与既有生命周期用例共 6 例全绿；impact 直接用例 3 例、关联用例 26 例通过（2 个套件为 BUG-0107 存量收集失败）；完整 `check` 全绿。
- 技术评审：自审；重点核对 Electron 事件语义、teardown 与监听数量。
- 集成：`integration_status: pending`，本地 `main` 串行。
- 人工功能验收：UI 自动化验证已执行（用户授权 `verify:ui`，隔离 Fresh 实例 + 本地模型替身）：被拦截导航后插件工具成功派发、回合正常结束；真实 reload 后 `host loading` → `host ready` 恢复。待用户最终确认。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop dev 实例已启动，`vetta-ui-design` 已启用，会话中 `vetd_*` 工具可用；
- 操作步骤：调用一次 `vetd_status` 确认可用 → 在主窗口触发一次被 `will-navigate` 拦截的页面内导航（例如 `location.href = "http://127.0.0.1:3020/#/"`）→ 不重载页面，再次调用 `vetd_status` → 最后执行一次真实 `Ctrl+R`，再次调用；
- 预期行为与最终产物：拦截后工具仍成功；真实重载后短暂 loading 随即恢复；不再出现只能重启才能恢复的永久 `loading`；
- 不通过表现与已知限制：若再次出现 `Plugin host renderer is loading` 且重试不恢复，即本 Bug 未修复；`verify:ui` 通道已在隔离 Fresh 实例取证，未使用真实模型、真实凭据或用户日常实例；
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：新增 `apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts`（导航失效适配器，监听已提交的 `did-navigate`）与 `plugin-tool-renderer-host-navigation.test.ts`（3 例回归）；`apps/desktop/src/main/ipc/session.ts` 改为调用适配器并在 teardown 复用解绑函数；同步更新 BUG-0131、TASK-0320、两份索引与 v0.1.3 修复说明。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.test.ts apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.test.ts`（6/6 通过）；旧实现基线同命令 3/3 失败；`bun run test:impact -- <上述三个源文件>`（直接 3 例、关联 26 例通过；2 个套件按 BUG-0107 存量收集失败）；`bun run --cwd apps/desktop typecheck:incremental` 与 `bun run check` 退出码 0。
- UI 验证（用户授权 `verify:ui`，`bun run verify:ui:*`，隔离 Fresh 实例，未连接真实 Provider / 未读取真实凭据 / 未操作用户日常实例）：
  - 真实渲染端发起 `location.href = "https://example.com/openforge-blocked-navigation-probe"`，URL 与文档均未变化；主进程日志出现 `[warn] [window] blocked main-window navigation`，确认被 `will-navigate` 拦截。
  - 拦截后不重载，在同一文档提交 prompt，由隔离配置中的本地 OpenAI 兼容替身（`127.0.0.1:18080`）返回一次 `content_creation_search` 工具调用；该调用经共享插件工具宿主成功执行并返回真实结果（`isError: false`），回合以 `stop` 正常结束，主日志该时段无 `Plugin host renderer is loading` / warn / error。证明拦截后宿主仍为 `ready`。
  - 真实 `page.reload()` 对照：渲染端日志 `[plugin-agent] host loading` 后出现 `[plugin-agent] host ready`，证明提交型导航的失效与恢复路径未变。
  - 验证后执行 `bun run verify:ui:stop` 停止实例，并清理临时探针与本地替身文件；未改真实模型配置。
- 未运行及原因：用户日常 dev 实例中的人工复现未执行（需用户自行操作其日常环境）；真实模型质量与真实 Provider 调用未授权、未执行。
- Worktree：未拆 worktree（`worktree: .`），改动在主工作区串行完成。
- 剩余风险：`did-navigate` 在导航提交后发射，理论上存在提交到事件处理之间的极短派发窗口；该窗口内旧文档已被替换、新文档尚未上报 ready，派发可能收到渲染端错误。与永久卡死相比属可接受的窄窗口，需在评审中确认。
