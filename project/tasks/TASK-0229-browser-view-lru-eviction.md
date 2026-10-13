---
id: TASK-0229
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0094（内置浏览器 WebContentsView 按工作区永久常驻无回收，渲染进程线性累积）
related_requirement: []
related_plan: []
related_tasks: [TASK-0039]
related_issues: []
related_bugs: [BUG-0094]
execution: serial
branch:
worktree:
base_commit: 91596a60e
read_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/browser-automation/browser-view-host.test.ts, apps/desktop/src/main/ipc/browser-view.test.ts, apps/desktop/src/main/browser-automation/webview-session-host.ts, project/tasks/TASK-0039-webview-pinned-bounds.md, project/bugs/BUG-0094-browser-view-no-eviction.md]
write_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/browser-automation/browser-view-host.test.ts, apps/desktop/src/main/ipc/browser-view.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0094-browser-view-no-eviction.md, project/tasks/TASK-0229-browser-view-lru-eviction.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器 detached view 上限 + LRU 驱逐

## 目标

非活动 `WebContentsView` 有界回收（BUG-0094），对齐 TASK-0039 pinned 页签同型先例：

1. **上限**：detached（非 attach）view 总量上限 `MAX_DETACHED_BROWSER_VIEWS = 3`，超限驱逐 `lastUsedAt` 最老的 detached 记录。
2. **驱逐点**：`attach`（attach 标记后）与 `detach`（标记 detached 后）末尾统一 `enforceDetachedLimit()`；attached 记录永不驱逐。
3. **销毁**：`webContents.close()`——`webview-session-host` 已接 `destroyed → detachWebContents`，会话控制器自动解绑；map 条目同步删除。
4. **可逆恢复**：被逐工作区重新 attach 时 `ensureView` 重建 view，renderer attach 恒带 workspace URL → 自动 `loadURL`，用户无感（地址栏地址仍在 workspace 状态里）。

## 约束

- `BrowserViewContents` 新增 `close()`；fake 实现对齐真实 API（置 destroyed + fire "destroyed"）。
- `lastUsedAt` 在 attach/detach 时刷新；attached 与已 destroyed 记录不参与驱逐计数（destroyed 直接清条目）。
- 不改 IPC 形状、不改 renderer；保留「attach 复用同 view、不重载同 URL」既有语义。
- 不引入定时器/后台扫描——只在 attach/detach 边界驱逐。

## 验收（Given/When/Then）

- Given：4 个工作区各 attach 后 detach（detached=4 > 3）→ Then：最早使用的 detached view `close()` 销毁，views 表剩 3 条 detached 记录。
- Given：1 attached + 3 detached → When：attached 工作区 detach → Then：被驱逐的是最老的 detached 而非刚 detach 的。
- Given：被逐工作区 → When：重新 attach → Then：新 view 创建且按 attach url `loadURL`（可逆恢复）。
- Given：attached view → Then：无论 detached 数多少永不驱逐。
- Given：旧实现 → Then：超限后 `destroyed` 恒 false（红基线）。

## 交付记录

- 红基线：超限驱逐断言在旧实现下 `destroyed` 恒 false（无驱逐路径），`close()` 接口不存在。
- 实际修改：`browser-view-host.ts`——`BrowserViewContents` 增 `close()`；`ViewRecord` 增 `lastUsedAt`（attach/detach 用单调序号刷新，避免同毫秒并列）；`enforceDetachedLimit()` 在 attach/detach 边界执行，attached 豁免、destroyed 清表、超限按序销毁最老 detached。
- 测试：`browser-view-host.test.ts` 18/18 过（新增超限驱逐含重开恢复、attached 豁免/刚 detach 不被逐两例；fake 补 `close()` 对齐真实 API）；`ipc/browser-view.test.ts` fake 同步补 `close()`。
- impact：desktop 190 例过；4 个套件同 `window-manager.ts:25` `process.resourcesPath` 既有环境问题（与本改动无关）。
- 检查：desktop `typecheck:incremental` 绿；改动文件 biome 绿；`check:quick` 被 `.ua/` 既有 guard 残留阻断（非本改动，已上报）。
- 未运行：完整 `bun run check`（`.ua/` 阻断同一 guards 链路）；实机内存/帧率对比属人工验收。
