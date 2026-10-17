---
id: TASK-0300
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0298]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: ddcab9556
read_paths:
  - apps/desktop/scripts/run-dev-electron.mjs
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

# dev 启动器加 GPU 禁用逃生开关（本机 GPU 进程启动失败）

## 目标

用户终端 `bun run dev` 在本机遭遇 `GPU process launch failed: error_code=18` → `FATAL: GPU process isn't usable. Goodbye.`（Electron 39.8.10；今晨同机可用，GPU 栈状态此后变化；与 Agent 上下文 0x80000003 GPU 崩溃同类）。canary 验证路径已有 `--disable-gpu` 先例但捆绑在 `VETTA_UI_VERIFICATION=1`（会切换 configDir，破坏日常 dev home）。补一个**独立**逃生开关：`VETTA_DESKTOP_DISABLE_GPU=1` 仅追加 `--disable-gpu`，不动 configDir/其余行为——日常 dev 在 GPU 异常机器上一条环境变量即可起。

## 范围

### 并发评估

- 结论：不支持并行；serial；单脚本切片。

### 做

- `run-dev-electron.mjs` 导出纯函数 `resolveGpuLaunchFlags(environment)`（读 `VETTA_DESKTOP_DISABLE_GPU`，"1" 时返回 `["--disable-gpu"]`），main() 接线；新增最小单测（开关开/关/缺省/非"1"值）。

### 不做

- 不改默认行为（其它机器 GPU 正常，不静默禁用）；不加 `--no-sandbox`（与 GPU 问题无关且有安全面）；不诊断驱动根因（机器层，重启/驱动恢复后用户可去掉开关）。

## Given / When / Then

- Given：`VETTA_DESKTOP_DISABLE_GPU=1`，When：dev 启动，Then：electron 参数含 `--disable-gpu`，configDir 仍为缺省 `.openforge-dev`。
- Given：未设置或非 "1"，When：启动，Then：参数与现在完全一致。

## 必须保持

- 既有 canary 分支（VERIFICATION+CANARY 双旗标）行为不变。
- 缺省路径零变化。

## 测试与验证

- 定向：新单测；完整 `bun run check`。用户侧冒烟：设置开关后 `bun run dev` 起到 CDP 就绪。

## 验收分层

- 工程验证：待执行；技术评审：自审（纯函数化便于测试）；集成：pending；人工验收：用户终端一条命令冒烟；发布：未授权（dev 工具脚本，不进产品包）。

## 功能验收包

- GPU 异常机器上 dev 实例可启动（软件合成），qwen3.8 复测可继续。

## 交付记录

- 实际修改：`run-dev-electron.mjs` 导出 `resolveGpuLaunchFlags(environment)`（`VETTA_DESKTOP_DISABLE_GPU === "1"` → `["--disable-gpu"]`），main() 接线在 user-data-dir 之前；新增 `run-dev-electron.test.mjs` 2 例（开/关/缺省/非 1 值）。
- 实际运行：定向 2/2 绿；完整 `bun run check` exit 0（单轮通过）。
- 未运行及原因：Agent 侧 electron 冒烟被宿主沙箱阻断（BUG-0127 台账已录）；用户终端冒烟待执行——一条命令：`$env:VETTA_DESKTOP_DISABLE_GPU="1"; bun run --cwd apps/desktop dev`。
- 发布说明：未更新——纯 dev 工具脚本，不进产品包。
- Worktree：未拆出（单脚本切片）。
- 剩余风险：软件合成下 UI 动画/字体渲染略有差异（对主进程性能复测无影响）；驱动恢复后移除开关即可回到硬件加速。
