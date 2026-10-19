---
id: BUG-0131
type: bug
status: done
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户反馈 + dev 日志（~/.openforge-dev/desktop-app/logs 2026-10-19 main/render 双侧）+ Electron 41.10.7 最小探针
related_requirement: []
related_plan: []
related_tasks: [TASK-0320]
related_issues: []
related_bugs: []
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 被拦截的主窗口导航把插件工具宿主永久留在 loading，设计插件工具全部被拒

## 用户流程

- Given：`vetta-ui-design` 插件已启用，会话中的 `vetd_*` agent 工具此前调用正常。
- When：主窗口发生一次页面内发起的主 frame 导航，被现有 `will-navigate` 守卫拦截。
- Then：插件工具宿主仍保持可用，后续 `vetd_status` / `vetd_create` 等工具照常派发；只有渲染文档真正重载后才进入 `loading`，并在渲染端上报就绪后恢复。

## 实际行为

- 15:19:52 与 15:21:42 三次导航被 `window-manager` 拦截；其中 15:21:42 之后没有新的插件 activation 或整页重载。
- 主进程 `PluginToolRendererHostLifecycle` 被 `did-start-navigation` 置为 `loading` 后不再恢复。
- 15:35:14–15:39:30 的 `vetd_status` 连续 8 次以上返回 `Plugin host renderer is loading; retry the tool after it is ready`，模型按 5/8/15/20/30 秒退避反复重试。
- 设计引擎本身仍在 15:32:45 启动并监听 3704；插件工具已注册，失败点在主进程派发前的可用性租约。

## 期望行为

- 被 `will-navigate` 取消、从未提交的导航不得让宿主进入 `loading`。
- 只有主 frame 导航真正提交（文档被替换）时才失效当前渲染端租约；渲染端重新上报 `HOST_READY` 后恢复。
- 不改变 `will-navigate` 拦截策略，也不改变插件工具的身份、权限与错误语义。

## 环境与失败证据

- Open Forge 0.1.3 dev 实例，Windows 11，Electron 41.10.7。
- `~/.openforge-dev/desktop-app/logs/main/2026-10-19.log`：
  - `15:19:52.281`、`15:19:52.359`、`15:21:42.064` `[warn] [window] blocked main-window navigation { url: 'http://127.0.0.1:3020/#/' }`
  - `15:32:45.336` 设计引擎 `spawn-10 node ... port 3704`
- 会话日志 `~/.openforge-dev/agent/sessions/.../齐套分析/*.conversation.jsonl`：15:35:14 起 `vetd_status` 连续返回上面的 loading 错误，`details.code = AGENT_TOOL_EXECUTION_FAILED`。
- 最小 Electron 探针（同一 Electron 版本）确认：`did-start-navigation` 先于 `will-navigate` 触发，且 `preventDefault()` 不会撤销已经发出的 `did-start-navigation`。

## 最小复现

1. 启动 dev Desktop，启用 `vetta-ui-design`，在会话中成功调用一次 `vetd_status`。
2. 在主窗口渲染端执行一次页面内发起的主 frame 导航（例如 `location.href = "http://127.0.0.1:3020/#/"`），让 `will-navigate` 拦截它。
3. 不重载页面，再次调用 `vetd_status`。
4. 观察主进程返回 `Plugin host renderer is loading; retry the tool after it is ready`；重试不会恢复。
5. 执行一次真实 `Ctrl+R` / 应用重载后，工具恢复。

## 影响

所有插件 agent 工具（不只是设计插件）在主进程层被拒绝，设计会话、插件工作流与模型自动重试同时受影响；用户只能手动重载窗口或重启应用恢复。属于 P1 用户可见功能阻断，有临时绕过手段。

## 根因证据

- `apps/desktop/src/main/ipc/session.ts:1771-1775` 在 `did-start-navigation` 上直接 `markLoading()`，没有区分导航是否会被 `will-navigate` 取消。
- `apps/desktop/src/main/window-manager.ts:162-165` 对页面内发起的主窗口导航一律 `preventDefault()`；该守卫本身是 TASK-0309 的预期安全行为。
- `apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.ts:54-60` 在 `loading` 状态下拒绝所有 `acquire()`；`markReady()` 只由 `PLUGIN_HOST_READY` IPC 调用（`session.ts:646-649`）。
- `apps/desktop/src/renderer/domains/plugins/components/PluginGlobalSlotHost.tsx:146-151` 只在插件加载流程走完后调用 `reportAgentContributionHostReady()`；被拦截的导航不会触发该流程，因此没有恢复信号。
- Electron 41.10.7 的 `did-start-navigation` 在 `will-navigate` 之前发射，且不因后者 `preventDefault()` 回滚；`did-navigate` 只在主 frame 导航提交后发射，且不覆盖同文档导航。

**置信度**：高。日志时序、源码接线与 Electron 行为三者独立吻合；15:19:52 的拦截被随后的真实插件 reload 救回，15:21:42 的拦截之后没有新的 `HOST_READY`，与卡死时间线一致。

## 回归测试

- 在 Electron 导航边界抽出可测试接线，构造 `did-start-navigation`（模拟被 `will-navigate` 拦截）后断言宿主仍为 `ready`、工具租约仍可获取。
- 断言 `did-navigate`（真实提交）后宿主进入 `loading`，并在 `markReady()` 后恢复。
- 断言解绑后不再响应导航事件，避免 teardown 后残留监听改状态。
- 旧实现（监听 `did-start-navigation`）下用例必须失败；修复后全绿。
- 已实现于 `apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.test.ts`；旧实现下 3 例全红，修复后 3 例全绿。

## 修复与验证

- 修复：新增 `apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts`，把宿主失效点改为已提交的主 frame `did-navigate`；`apps/desktop/src/main/ipc/session.ts` 改由该适配器接线并复用其解绑函数，删除内联的 `did-start-navigation` 监听。`will-navigate` 拦截策略、`render-process-gone`、`PLUGIN_HOST_READY` 与工具租约语义均未改变。
- 测试：新增 `plugin-tool-renderer-host-navigation.test.ts` 3 例——被拦截的 `did-start-navigation` 不使宿主失效；`did-navigate` 后进入 `loading`、在途调用失败、`markReady()` 后恢复；解绑后不再响应且无残留监听。旧实现下 3 例全红（含 `expected 'loading' to be 'ready'`），改为 `did-navigate` 后与既有生命周期用例共 6 例全绿。
- 检查：`bun run test:impact -- apps/desktop/src/main/ipc/session.ts apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.ts apps/desktop/src/main/plugins/plugin-tool-renderer-host-navigation.test.ts` 直接用例 3 例通过、关联用例 26 例通过；2 个套件因 BUG-0107 的 `process.resourcesPath` 存量收集失败（与本改动无关）。`bun run check` 全绿（lint / types / guards / mobile-lint，修改声明头 new=0）。
- UI 验证（用户授权 `verify:ui`，隔离 Fresh 实例，未连接真实 Provider、未读取真实凭据、未操作用户日常实例）：
  - 在真实 Electron 渲染端执行 `location.href = "https://example.com/openforge-blocked-navigation-probe"`，URL 与文档均未变化、探针标记仍存活；主进程日志同时记录 `[warn] [window] blocked main-window navigation`，确认导航确实被 `will-navigate` 拦截。
  - 拦截后在同一文档提交一条 prompt。为避开真实 Provider，使用隔离配置里的本地 OpenAI 兼容替身（`127.0.0.1:18080`，仅回放固定响应）驱动一次 `content_creation_search` 插件工具调用。工具经共享的插件工具宿主成功派发并返回真实结果（`isError: false`，内容为 content-creation 操作索引），回合正常结束；主日志该时段无 `Plugin host renderer is loading`、无 warn/error。这直接证明被拦截导航后主进程宿主仍为 `ready`、租约仍可获取。
  - 另执行一次真实 `page.reload()`：渲染端日志出现 `[plugin-agent] host loading`，随后 `[plugin-agent] host ready`，确认「真正提交的导航 → loading → 上报就绪恢复」路径未被破坏。
  - 验证后已停止 Fresh 实例并清理本地替身与临时探针文件；未改用户日常实例或真实模型配置。
- 用户确认（2026-10-19）：重启 dev 实例后确认问题不再出现。此前截图中的 `Plugin host renderer is loading` 为重启前旧状态；画布空白系视口被滚轮平移到 frames 下方，与插件宿主无关。
