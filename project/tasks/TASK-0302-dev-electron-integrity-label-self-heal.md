---
id: TASK-0302
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0128
related_requirement: []
related_plan: []
related_tasks: [TASK-0301]
related_issues: []
related_bugs: [BUG-0128]
execution: serial
branch: main
worktree:
base_commit: e0c3040c5
read_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
  - apps/desktop/scripts/run-dev-electron.test.mjs
write_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
  - apps/desktop/scripts/run-dev-electron.test.mjs
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# dev 启动前自愈 Electron 二进制的 Low 完整性标签（保留 Chromium 沙箱）

## 目标

在 Windows 开发环境启动 Electron 前检测 Electron dist 是否带 Low 强制完整性标签；若存在，则把 dist 树恢复为 Medium，再以默认参数启动。修复发生在启动器内部，不关闭 Chromium 沙箱，也不要求用户手工跑 `icacls`。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（启动器脚本与测试为独占路径；当前无其他在途 Task 修改该文件）
- 前置依赖：TASK-0301 已提交（`e0c3040c5`），本任务在其回退逻辑上续接
- 冲突文件/独占路径：`apps/desktop/scripts/run-dev-electron.mjs`、`apps/desktop/scripts/run-dev-electron.test.mjs`
- Branch：`main`
- Worktree：不拆出（单文件改动 + 测试，当前工作区无并行写者）
- 集成负责人：本轮 Agent
- 集成顺序：先实现与定向测试，再跑影响面与完整 check，最后单独提交

### 做

- 在 `run-dev-electron.mjs` 增加 Windows 专用的完整性标签探针：`icacls <electron dist> /save <tempfile> /T /C /Q`，以 UTF-16LE 读取保存文件，检测 `(ML;;NW;;;LW)`。
- 仅当探针确认存在 Low 标签时，执行 `icacls <electron dist> /setintegritylevel Medium /T /C /Q`，把 Electron dist 树（exe、DLL、资源）恢复为 Medium。
- 探针或修复失败时只写诊断日志，不阻断启动；保留 TASK-0301 的 code 3 + GPU FATAL → `--no-sandbox` 一次性回退作为兜底。
- 增加纯函数与可注入命令执行的单元测试，覆盖解析、决策、参数与失败路径。

### 不做

- 不修改 Codex/agent 沙箱的工作区供给逻辑（仓库外）。
- 不默认添加 `--no-sandbox`，不关闭 Chromium 沙箱。
- 不修改仓库源码树的 ACL，不触碰 `node_modules` 之外的文件。
- 不改变 `VETTA_DESKTOP_DISABLE_GPU`、`VETTA_UI_VERIFICATION` 等既有开关。
- 不处理应用自身的 runtime sandbox host（`packages/runtime-*` 的 agent 执行沙箱）缺失提示。
- 不改打包产物行为或发布流程。

## Given / When / Then

- Given：Windows 开发机，Electron dist 被标为 Low（BUG-0128 现场）；
- When：运行 `bun run dev`；
- Then：启动器在 spawn 前把 dist 恢复为 Medium，Electron 以默认参数启动，GPU/renderer 不再出现 `error_code=18`，Chromium 沙箱保持启用。

- Given：Electron dist 是正常的 Medium 或无显式标签；
- When：运行 `bun run dev`；
- Then：探针不触发修复，启动参数与现有行为完全一致。

- Given：dist 上有 High/System 等非 Low 标签；
- When：运行 `bun run dev`；
- Then：探针不匹配 Low，不降级这些标签。

- Given：`icacls` 不可用、探针读取失败或修复被拒绝；
- When：Electron 仍因沙箱失败退出；
- Then：现有 `--no-sandbox` 回退仍生效，dev 可启动；日志说明修复未生效，不静默假装成功。

## 必须保持

- 修复成功时**不**追加 `--no-sandbox`。
- 探针与修复只作用于 Electron dist 目录（`dirname(electronPath)`），不遍历仓库。
- 修复失败不得抛出未捕获异常或阻断后续启动路径。
- 现有 GPU 回退判据（`code === 3`、`sawGpuFailure`、未显式 `VETTA_DESKTOP_DISABLE_GPU=1`）与开关语义不变。
- 非 Windows 平台零额外命令、零行为变化。
- 单元测试不依赖真实 ACL、真实 Electron 或管理员权限。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/scripts/run-dev-electron.test.mjs`
- 影响面：`bun run test:impact -- apps/desktop/scripts/run-dev-electron.mjs`
- 质量检查：`bun run check:quick`、`bun run check`
- 用户流程/行为：
  1. 在仓库实际 Electron dist 上运行启动器自愈逻辑（或直接跑 `bun run dev`），确认 exe/DLL 标签变为 Medium。
  2. 用同一 Electron 启动最小探针，不加 `--no-sandbox`，断言 `loadURL ok` / exit 0 / 无 `error_code=18`。
  3. 默认 `bun run dev` 启动，确认 GPU/renderer 存活、页面 DOM 正常；记录是否仍需人工干预。

## 验收分层

- 工程验证：定向 18/18 通过；仓库 Electron 实测 78 个文件 Low→Medium，沙箱探针（无 `--no-sandbox`）`loadURL ok` / exit 0；重新标 Low 后 `bun run dev` 出现自愈日志，`ready-to-show` 与 `did-finish-load` 正常，全程无 `error_code=18`，180s 超时结束后无残留进程；`check:quick` 与完整 `check` 均 exit 0。
- 技术评审：自审；探针读取 `icacls /save /T` 的 UTF-16LE SDDL，仅 Windows + `(ML;;NW;;;LW)` 触发；临时目录在 finally 清理；探针/修复失败只告警。`test:impact` 因桌面 vitest include 只匹配 `.test.ts` 未选中 `.mjs`，回退整包 suite（含 BUG-0107 存量收集期红）后停止，改用仓库 runner 直接跑定向文件。
- 集成：integrated（`d8e1b7e45`）。
- 人工功能验收：待验收（用户在自有终端运行 `bun run dev`）。
- 发布：不适用（dev 工具脚本，不进产品包）。

## 功能验收包

- 入口与前置条件：Windows 11，仓库内 Electron dist 当前带 Low 标签（或由用户工作区被 agent 沙箱标记）。
- 操作步骤或 AI 任务输入：在 `apps/desktop` 运行 `bun run dev`，不设置 `VETTA_DESKTOP_DISABLE_GPU`，不手工加 `--no-sandbox`。
- 预期行为与最终产物：启动器日志出现一次 Low 标签自愈提示；Electron 正常启动并渲染主页面；stderr 无 `GPU process launch failed: error_code=18`；Chromium 沙箱未关闭。
- 不通过表现与已知限制：若日志显示修复失败并出现 GPU FATAL，则回退到 `--no-sandbox` 仍可启动，但本次根修未生效，需要收集 `icacls` 输出与权限信息。
- 验收反馈及回归案例：用户回贴启动日志与页面状态；若再次出现 error 18，记录当时的 `icacls <electron.exe>` 与 `icacls <dist> /save` 输出。

## 交付记录

- 实际修改：`run-dev-electron.mjs` 新增 Low 标签 SDDL 解析、Windows 决策、`icacls /save /T` 探针与仅 Low 时的 `icacls /setintegritylevel Medium /T /C /Q` 自愈，`main()` 在首次 spawn 前调用；`run-dev-electron.test.mjs` 新增 10 例（解析、平台决策、参数、探针/修复失败、临时目录清理）。
- 实际运行：定向 `bun scripts/quality/run-vitest.mjs --run apps/desktop/scripts/run-dev-electron.test.mjs` → 1 文件 / 18 例通过；仓库 Electron 自愈后 `icacls` 显示 Medium，沙箱探针 `loadURL ok` / exit 0；重新标 Low（78 个文件）后 `bun run dev` → 自愈日志、`ready-to-show`、`did-finish-load`，日志无 `GPU process` / `error_code=18` / `launch-failed`，180s timeout 结束且无残留；`check:quick` exit 0；`bun run check`（lint、types、guards、mobile-lint）exit 0；`node scripts/release/release-notes.mjs --check` 通过。
- 未运行及原因：`test:impact` 的整包回退 suite 未跑完（`.mjs` 不在桌面 vitest include，回退到含 BUG-0107 存量红的整包 suite，已停止；定向文件已用仓库 runner 直接验证）；真实用户点击目验待用户确认；`verify:ui:*` 未获授权且非本任务必需。
- Worktree：未拆出（单文件启动器改动；当前无并行写者）。
- 剩余风险：探针依赖 `icacls /save` 的输出格式，格式变化时跳过修复并回到既有 `--no-sandbox` 兜底；修复写入显式 Medium 标签，`bun install` 重装 Electron 后下一次启动会重新检查；Electron dist 位于本仓 `node_modules/.bun` 的隔离安装目录（工作区共享），标签修复对该目录生效（恢复 Medium 是安全默认）；并发启动多个 dev 实例时两者都可能探测/修复，`icacls` 操作幂等。
