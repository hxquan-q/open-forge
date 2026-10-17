---
id: TASK-0301
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: []
related_tasks: [TASK-0300]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: fc3ef986d
read_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
  - apps/desktop/scripts/run-dev-electron.test.mjs
write_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
  - apps/desktop/scripts/run-dev-electron.test.mjs
exclusive_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
  - apps/desktop/scripts/run-dev-electron.test.mjs
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# dev 启动器对 GPU 沙箱 FATAL 自动回退一次

## 目标

用户直接运行 `bun run dev` 仍复现 TASK-0300 记录的机器级故障：Electron 39.8.10 在本机 GPU 进程反复 `GPU process launch failed: error_code=18`，随后 `FATAL: GPU process isn't usable. Goodbye.` 并以 code 3 退出；concurrently 随即连带终止 renderer/themes，表现为整条 dev 链 exit 1。TASK-0300 的手动开关（`VETTA_DESKTOP_DISABLE_GPU=1` → 软件合成）可用，但要求用户每次记得设置且牺牲硬件加速。本任务让启动器只在**实际发生该 FATAL** 时自动追加 `--no-sandbox` 重试一次，保留硬件加速，缺省路径零变化。注意同一 error 18 也会打掉 renderer 进程（主进程日志 `render-process-gone reason=launch-failed`），只关 GPU 沙箱会得到空白窗口，因此回退必须关整个进程沙箱。

## 范围

### 并发评估

- 结论：不支持并行；serial；单脚本 + 单测试文件切片。

### 做

- `run-dev-electron.mjs` 导出 `isGpuProcessFailureOutput`、`GPU_PROCESS_FALLBACK_SWITCHES` 与 `shouldRetryElectronWithGpuSandboxFallback` 纯函数；`launchElectron` 把 stderr 透传并保留尾部窗口识别 GPU FATAL；`main()` 在 `code === 3 && sawGpuFailure` 且未显式禁用 GPU 时追加 `--no-sandbox` 重试一次；SIGINT/SIGTERM 转发给当前子进程。
- `run-dev-electron.test.mjs` 覆盖识别、回退条件、回退旗标与显式禁用不重试。

### 不做

- 不改缺省启动参数；不把 `--no-sandbox` 常态化；不扩大到产品打包路径；不诊断 Windows 沙箱根因（机器层）。

## Given / When / Then

- Given：Chromium 沙箱起不来的机器、未设开关，When：`bun run dev`，Then：首轮 code 3 + FATAL 被识别，自动追加 `--no-sandbox` 重试；GPU 与 renderer 进程均存活、页面渲染出内容，renderer/themes 不被连带终止。
- Given：正常机器，When：启动，Then：参数与退出码行为与改动前一致（仅 stderr 由直通改为透传并保留内容）。
- Given：`VETTA_DESKTOP_DISABLE_GPU=1`，When：启动，Then：沿用软件合成，不再触发回退重试。

## 必须保持

- canary 分支（`VETTA_UI_VERIFICATION=1` + `VETTA_DESKTOP_RUNTIME_CANARY=1`）参数不变。
- 非 GPU 的启动失败不重试，退出码语义不变。
- 用户显式选择软件合成时不叠加第二次尝试。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/scripts/run-dev-electron.test.mjs`。
- 用户流程：本机 `bun run dev` 全链路启动（renderer + themes + electron）。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：定向 8/8 通过；`bun run dev` 全链路实测通过（首轮 GPU FATAL → 自动回退 → 第二实例 ready；GPU + 2 个 renderer 进程存活；CDP 读回 `#root` 完整 DOM 与页面文本）；完整 `bun run check` exit 0（lint、五路 typecheck、全部 guards）。
- 技术评审：自审；首版把 `waitForExit` 的 `code` 误写成 `exitCode` 导致回退未触发，已统一字段名；第二版回退旗标用 `--disable-gpu-sandbox`，但同一 error 18 会打掉 renderer 进程，出现空白窗口，已改为 `--no-sandbox`。
- 集成：pending。
- 人工功能验收：待用户确认窗口可用。
- 发布：不适用（dev 工具脚本，不进产品包）。

## 功能验收包

- 入口与前置条件：本机 GPU 沙箱异常（`error_code=18`），未设 `VETTA_DESKTOP_DISABLE_GPU`。
- 操作步骤：`cd apps/desktop && bun run dev`。
- 预期行为：日志出现一次回退提示后应用窗口正常打开，侧栏与对话内容可见，硬件加速保留（进程列表含 `--type=gpu-process`）。
- 不通过表现：窗口空白或仍出现 `GPU process isn't usable` 后退出；空白时查主进程日志 `render-process-gone`/`loadURL failed`，并回退到 TASK-0300 手动开关上报。

## 交付记录

- 实际修改：`run-dev-electron.mjs` 增加 GPU FATAL 识别（stderr 尾部 512 字符窗口）、回退判定纯函数与单次 `--no-sandbox` 重试；SIGINT/SIGTERM 转发改为指向当前子进程；`run-dev-electron.test.mjs` 新增 6 例。
- 实际运行：定向 8/8 通过；`bun run dev` 全链路实测：首轮 code 3 + FATAL → 自动回退 → 主进程 ready，GPU 与 2 个 renderer 进程存活；CDP 读回页面标题「小爱ai」、`#root` 完整 DOM 与侧栏/会话文本（160 万字符）。
- 未运行及原因：真实用户点击交互目验由用户确认（Agent 侧已确认渲染内容，不代替人工验收）。
- Worktree：未拆出（单脚本切片）。
- 剩余风险：`--no-sandbox` 关闭整个 Chromium 进程沙箱（仅 dev、仅在已发生 FATAL 后）；若机器另有问题导致 code 3，不满足 FATAL 标记则不重试。
