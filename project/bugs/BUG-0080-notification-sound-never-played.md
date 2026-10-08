---
id: BUG-0080
type: bug
status: investigating
priority: P2
owner: desktop notifications
source: VERIFY-0017 组二（TASK-0161 人工验收实测中发现）
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0161]
related_issues: []
created: 2026-10-08
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 设置页有「提示音」开关，但 Agent 终结事件在真实应用中不会响

## 用户流程与实际行为

- Given：设置 → 通用设置 → 通知，「提示音」为开、「提示音时机」= 始终（默认），「试听提示音 → 播放」能正常出声。
- When：在会话里用任一 provider 跑完一轮（完成 / 失败 / 等待审批）。
- Then（实际）：**无声**。既没有应用内提示音，Agent 事件的系统横幅本身也是静默的（`silent: agentEvent !== null`），即三类 Agent 终结事件在真实应用里整体无声。

## 期望行为

按设置页文案「任务完成、失败或等待审批时播放提示音」，`soundEnabled` 为真时每个终结事件应播放一次内置音色（音量取 `soundVolume`）；只有关掉开关才静音。

## 环境与失败证据

- 应用版本 0.1.3，提交 `cc0d2fd5b`（main），Windows 11 Pro 26200；隔离 Debug profile `04987e4e`（`bun run verify:ui:start:debug`），渲染进程源 `http://127.0.0.1:42672`（重启后为 `59802`）。
- **证据 1（静态，决定性）**：主进程 `notifications/notification-service.ts:130-135` 在 `decision.soundId` 非空时执行 `webContents.send(NOTIFICATION_SOUND_CHANNEL, { soundId, volume })`，通道常量 `:15` = `vetta:notification:sound`；preload `preload/apis/notification.ts:18-25` 暴露 `window.vetta.notification.onSound(handler)` 并做载荷校验。但**渲染进程没有任何订阅者**：全仓搜 `notification:sound|onSound(` 命中 7 个文件，除主进程发送端与 preload 定义外，只有设置页的 `onSoundEnabledChange` 等同名相邻回调；`playNotificationSound` 的唯一调用点是设置页试听（`domains/settings/components/useGeneralSettingsModel.ts:318`），`root-layout/useRootLayoutModel.ts:206-212` 只订阅了 `onNavigate`。主进程侧也没有替代播放器（`afplay` 仅用于 macOS 截图音效）。
- **证据 2（动态，带阳性对照）**：在渲染进程替换 `window.Audio` 记录构造/赋 `src`/`play()`。
  - 阳性对照：点设置页「试听提示音 → 播放」→ `new Audio()` + `src = data:audio/wav;base64,…`（10,750 字符，`RIFF/WAVE`）+ `play()`；1.5 s 后 `duration = 0.5`、`currentTime = 0.5`、`paused = true` ⇒ 记录器有效且音频确实播完。
  - 阴性：同一记录器下跑三轮真实回合（本地 provider，夹具请求日志 `requests.ndjson` 记录 `21:24:17Z`、`21:25:57Z`、`21:27:10Z` 三次 `/v1/responses`，会话 JSONL 相应新增回复）→ **0 条** Audio 记录。此时 `soundEnabled = true`、`soundScope = "always"`、`events.completed.systemEnabled = true`，即策略上 `soundId` 必然非空。
- **不能直接观测的部分（如实记录）**：主进程无「已发送 sound」日志行，且 `window.vetta.notification.onSound` 无法在页面里补挂订阅（Electron host API 拒绝：`Host API access denied`），故「主进程确实发出了命令」只有静态证据。但「渲染进程从不播放」有静态与动态两侧一致证据；第三轮（系统通知已静音）回合仍正常完成并渲染回复，排除「事件没到」这一替代解释。
- **交付记录与实现对不上**：TASK-0161 交付记录写有「root-layout onSound 播放接线」，而特性提交 `3a49e5c2a` 的 37 个文件里没有 root-layout 变更，上游 `1794ef9db` 的对应接线未移植。

## 最小复现

1. `bun run verify:ui:start:debug`，设置 → 通用设置 → 通知：确认「提示音」= 开、「提示音时机」= 始终。
2. 页内注入 `window.Audio` 记录器（`new Audio` / `src` setter / `play`）。
3. 用本地 provider 跑完一轮 → 有回复、记录器为空；再点「试听提示音 → 播放」→ 记录器立即出现 3 条记录（阳性对照）。

## 影响

P2：设置页承诺的功能整体不可用（完成 / 失败 / 等待审批全部无声）。由于 Agent 横幅是 `silent: true`，用户在应用不在前台时对终结事件完全无感——这恰是「提示音」要解决的场景。不涉及数据、安全与权限。

## 根因证据

主进程 → preload → 渲染进程三段链路断在第三段：发送端（`notification-service.ts:130-135`）与 API 暴露（`preload/apis/notification.ts:18-25`）都在，渲染进程缺少 `onSound` → `playNotificationSound` 的订阅接线。`silent: agentEvent !== null`（`notification-service.ts:152`）与注释「Agent 通知的声音由应用内播放器负责」表明设计上就依赖这条接线。

## 回归测试

缺一条渲染进程级断言：`window.vetta.notification.onSound` 收到载荷时应调用 `playNotificationSound(soundId, volume)`。现有 `shared/audio/notification-sound-player.test.ts` 只测播放器本体，`main/notifications/*.test.ts` 只测到「命令已发送」，两侧都不覆盖这段缺失的接线，故缺陷得以通过 580 例定向测试。

## 修复与验证

- 修复：未修（等用户裁定修复授权）。
- 测试：未增。
- 检查：未跑。
- 未运行及原因：修复未授权；本轮范围为人工验收。
