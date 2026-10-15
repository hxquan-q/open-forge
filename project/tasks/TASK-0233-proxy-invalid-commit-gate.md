---
id: TASK-0233
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: BUG-0098（无效代理配置无有效性门即可保存，运行时静默降级）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0098]
execution: serial
branch:
worktree:
base_commit: ba5f5bbc2
read_paths: [apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.ts, apps/desktop/src/main/proxy/proxy-runtime.ts, project/bugs/BUG-0098-proxy-invalid-saved-silently.md]
write_paths: [apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.ts, apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.test.tsx, .github/release-notes/v0.1.3.md, project/bugs/BUG-0098-proxy-invalid-saved-silently.md, project/tasks/TASK-0233-proxy-invalid-commit-gate.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 代理设置文本提交加有效性门

## 目标

`updateText` 的防抖提交只在「下一个草稿通过 `isProxyDraftInvalid`」时安排——无效 host/port 不再静默落盘：

1. **门控点**：`updateText` 内 `setDraft` 回调里算出 `next` 后，`!isProxyDraftInvalid(next)` 才 `commitDebounced(patch)`；草稿照常更新（输入跟手、页内提示照常显示）。
2. **语义不变**：`disabled` 时 `isProxyDraftInvalid` 返回 false → 文本照常落盘（关着代理随便改不拦）；`enabled` 下输入中间态（逐字符敲合法值）不受影响——每个中间合法态照常提交。
3. **不动运行时侧**：`proxy-runtime` 的 invalid 降级与 warn 保持（防御层仍在）。

## 约束

- desktop AGENTS：renderer hook 测试用既有 `.test.tsx` 风格 + `window.vetta` fake + 假时钟/直接 flush。
- 不新增 UI 文案/组件——门控只在提交路径，既有 `invalidConfig` 提示复用。
- `setEnabled`/`setProtocol`/`setProviderUseProxy` 等非文本提交不门控（值域受限不可能非法）；「保存的非法 host + 手动开代理」残留路径如实记账不扩大。

## 验收（Given/When/Then）

- Given：enabled + host 输入非法值 → When：防抖窗口到点 → Then：`config.set` 不被调用，draft 保留非法值供提示。
- Given：enabled + host 逐步输入合法值 → Then：防抖后正常 `config.set`（防过度门控回归）。
- Given：disabled + host 非法值 → Then：照常落盘（判据只在 enabled 生效）。
- Given：旧实现 → Then：非法值防抖后仍 `config.set`（红基线）。

## 交付记录

- 红基线等效：新测试对旧实现必然红——旧镜像 `isProxyDraftInvalid` 对 `127.0.0.1:7890` 返 false 且 `updateText` 无门控，`config.set` 必被调用。
- 实际修改：`useProxySettingsModel.ts`——`updateText` 在防抖安排前过 `isProxyDraftInvalid(next)` 门；判据函数整体改为调共享 `resolveProxyConfig`（消灭手写镜像漂移，顺带捕获旧镜像漏掉的 host 冒号情形）。draft 更新、`invalid` 提示、`commit`/`commitDebounced` 机制与非文本 action 全部不变。
- 测试：`useProxySettingsModel.test.tsx` 4 例（enabled+host:port 一格值、enabled+合法 host、enabled+越界端口、disabled+非法 host）。
- 全量：impact（desktop 相关套件）264 例过；4 套件 `window-manager.ts:25` 既有 import 失败（与本改动无关）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 未运行：`bun run check` 全量（`.ua/` 既有 guard 残留会红）。
- 遗留演进项：存量已保存非法配置不回滚、运行中 invalid 的页面外提示通道仍缺——如实记账。
