---
id: BUG-0179
type: bug
status: verifying
priority: P2
owner: scripts/agents Git integration
requirement:
plan:
source: `test:changed` Windows default-TEMP failure, reproduced in `scripts/agents/integrate.test.mjs`
related_requirement: []
related_plan: []
related_tasks: [TASK-0443]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Windows 8.3 TEMP 路径别名导致 Git 仓库根校验误拒绝

## 用户流程与实际行为

- Given：Windows 用户在默认 `%TEMP%`（例如 `C:\\Users\\CHENXU~1\\AppData\\Local\\Temp`）下创建临时 Git 仓库。
- When：`scripts/agents/git.mjs:snapshot()` 获取 `git rev-parse --show-toplevel` 并验证传入路径为仓库根。
- Then：即使两条路径指向同一目录，校验也抛 `worktree must name its repository root`，导致 integrate/runner/release 测试不能运行。
- Expected：可靠地规范化 Windows 8.3 短用户名路径与 Git 返回的长用户名路径后比较。

## 环境与失败证据

- Windows 11，默认 Node temp：临时目录通过 Node 得到 `C:\\Users\\CHENXU~1\\AppData\\Local\\Temp\\...`；Git `--show-toplevel` 返回 `C:/Users/Chenxuhua/AppData/Local/Temp/...`。
- 直接探针显示 `realpathSync()` 对短路径保留 `CHENXU~1`，对 Git 长路径则得到 `Chenxuhua`；`realpathSync.native()` 将两边都解析为长路径。
- `scripts/agents/integrate.test.mjs` 默认 TEMP 复跑失败 6 例，错误来自 `snapshot()` 仓库根断言；同一套件改用工作区临时目录曾通过。

## 最小复现

1. 在 Windows 默认 `%TEMP%` 创建独立 Git repository。
2. 对仓库执行 `snapshot(root)`。
3. 观察根校验由于短/长路径别名而失败。

## 影响

P2：Windows 默认 TEMP 下 Agent Git 集成相关测试与本地 Agent 工作流被错误拒绝；不影响仓库内容或 Git 本身。

## 根因

路径比较使用 `realpathSync()`（Node JS fallback），不能统一当前环境中的 8.3 短路径与 Git 输出的长路径。`realpathSync.native()` 可通过 Windows 原生路径解析统一两者。

## 回归测试

- 创建默认 `tmpdir()` 下的 git fixture 并提交基线，断言 `snapshot(root)` 接受仓库自身。
- 回归测试先红（`worktree must name its repository root`），修复后 `git.test.mjs` + `integrate.test.mjs` 共 28/28 通过。

## 修复与验证

- 修复：仓库根和 Git 返回路径均用 `realpathSync.native()` 规范化；保留严格根边界与干净 worktree 检查。
- 测试：新回归测试先红后绿；默认 TEMP 下 `git.test.mjs` + `integrate.test.mjs` 28/28 通过。完整 `scripts/agents` 曾在并行负载下出现 2 个 5 秒 timeout，随后重跑 142/142 通过；隔离 `integrate.test.mjs` 6/6。
- 检查：`test:impact` quality 脚本 727/727 通过；`bun run check` 全绿。
- 未运行及原因：真实 Agent provider 与产品流程未运行；完整 `scripts/agents` 后续重跑 142/142，通过。
