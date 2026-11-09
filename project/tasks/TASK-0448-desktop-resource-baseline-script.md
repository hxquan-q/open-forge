---
id: TASK-0448
type: task
status: in_progress
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3179282c470bdb2ccab8d9bdbfb7ff836b5eb66a
read_paths:
  - project/research/RESEARCH-0044-desktop-startup-resource-audit.md
  - project/research/RESEARCH-0049-desktop-host-and-controller-refactor-references.md
  - apps/desktop/src/main
  - scripts/quality
write_paths:
  - scripts/perf
  - project/verification
  - biome.json
  - package.json
  - scripts/quality/test-changed.mjs
  - scripts/quality/quality-gates.test.mjs
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 分进程资源基线测量脚本与基线记录（PLAN-0029 Phase 0.2）

## 目标

补齐 RESEARCH-0044 指出的分进程基线缺口，为 PLAN-0029 后续每个阶段（Host 出进程、原生 sidecar 替换、Tauri 决策门）提供可复算的对照数据。

## 范围

### 并发评估

- 结论：支持；与 TASK-0449/0450 无共享写域。
- 执行方式：serial（主工作区）
- 前置依赖：无

### 做

- 可重复运行的测量脚本，输出 JSON：分进程（main/renderer/GPU/utility）启动耗时、空闲内存、N 个会话下的内存、主进程事件循环延迟 p50/p95。
- 大仓扫描与搜索耗时 p95（固定样本仓库或本仓），供 PLAN-0029 Phase 5 Rust 决策使用。
- 一份 `project/verification/VERIFY-xxxx` 基线记录：机器、版本、提交、命令和数值。

### 不做

- 不做任何性能优化；不修改 Desktop 运行时代码（如需埋点，另拆 Task）。
- 不把单机单次数值写成承诺指标。

## Given / When / Then

- Given：已构建的 Desktop（dev 或 packaged，记录形态）与固定样本仓库。
- When：运行测量脚本 N 次（≥3）。
- Then：产出结构化 JSON 与汇总，同条件重复运行波动在记录范围内；VERIFY 记录可被后续阶段直接复跑对照。

## 必须保持

- 不读取或输出用户真实状态目录与凭证；使用隔离的测试数据目录。
- 启动 Desktop 用于测量属于 UI/真实运行验证，实施前须取得当前任务授权。

## 测试与验证

- 定向测试：脚本的解析与汇总逻辑单元测试（走仓库 Node runner）。
- 质量检查：`bun run check:quick -- <file...>`，完成时 `bun run check`。

## 验收分层

- 工程验证：本轮修复定向测试与 check:quick 已通过；全量检查/影响测试仍有下述失败，真实基线尚未测量。
- 技术评审：本轮修复经原生子任务独立只读复核，无阻断发现。
- 集成：pending
- 人工功能验收：不适用（内部度量工具）
- 发布：未授权

## 2026-11-06 评审修复

- 来源：用户要求修复本轮 review 的 SIGTERM 清理缺口和性能脚本测试漏跑。
- 本轮在已有 `xquan` 候选上串行修复；保留其他修改，不切换或集成分支，不启动真实 Desktop，也不执行实测基线。
- 输入/输出：SIGINT 或 SIGTERM → 等待当前运行的同一清理 Promise 后退出（130 / 143）；仅修改 `scripts/perf` → 常规质量测试被选中且包含性能脚本测试。
- Given 清理尚未完成 / When 收到终止信号或重复信号 / Then 不提前退出、不重复清理；Given 仅性能脚本变化 / When test:changed 或 CI 执行质量套件 / Then 两份性能测试均在范围内。
- 保留：数据隔离、原采样顺序、统计口径、Desktop 实测授权边界；没有 UI 验证授权不影响普通 Node fixture 测试。
- 验证：先补失败回归，再跑性能/质量选择定向测试、`test:impact`、`bun run check`；真实 Desktop 测量仍未授权。
- 决策：沿用现有质量套件与变更选择器，不另建 CI 作业；信号处理提供窄的进程事件测试接缝，避免为测退出而启动 Electron。
- 发布说明候选（当前 manifest 0.1.4 已发布，不改既有正文）：内部工具修复资源基线脚本终止时的进程清理，并将相关测试纳入常规质量门禁；下一次版本准备时汇编。
- RED：新增回归在修复前失败 7 例（含本 Task 的 SIGTERM/重复信号和测试选择断言）；未削弱既有断言。
- GREEN：`bun scripts/quality/run-vitest.mjs --run scripts/agents/contracts.test.mjs scripts/perf/desktop-baseline.test.mjs scripts/perf/baseline-stats.test.mjs scripts/quality/quality-gates.test.mjs`，4 文件 179 例通过。
- `bun run check:quick -- <本轮 11 个文件>` 最终 exit 0（包含全部 guards）；`git diff --check` 通过。
- `bun run test:impact -- <本轮 6 个源码/测试文件>` 确认选入 `scripts/perf`，共 67 文件 808 例：797 通过、11 失败；失败涉及 agents 的 Git 子进程超时、release identity 超时、Windows 发布 Bash 夹具和临时目录 EPERM，保留原门禁与日志。
- 以 `--maxWorkers=1` 复跑上述 4 个定向文件及 5 个失败文件，9 文件 275 例：270 通过、5 失败，agents/integrate/release/runner 与 release identity 均通过；仅未修改的 `desktop-release-workflow.test.mjs` 稳定复现 1 个临时目录 EPERM 和 4 个 Bash 发布夹具失败。未修改超时、跳过测试或放宽门禁。
- `bun run check` exit 1：根/CLI/Desktop 类型检查、lint 与 mobile lint 通过；docs-site 缺少 `fumadocs-ui` 模块，mobile 缺少 `react-native` 类型并有派生类型错误。上述目录及依赖段本轮未改；本轮修改导致的声明头/表达式赋值问题均已修正并经最终 check:quick 确认。
- 独立审查：`/root/review_fixes` 对照修复前快照，只读复核，无阻断；真实 OS 信号与 Electron 进程树未实测。
- 上一轮候选保留在原工作区，未提交、集成或推送。本轮修复不表示 TASK-0448 的真实基线记录已完成。

## 候选分支提交（2026-11-06）

- 用户在知悉上述验证失败后明确要求“提交推送”；本提交承载基线脚本、退出清理修复及自动测试接线，目标为现有上游 `origin/xquan`。
- 改动归属：Open-Forge-only。复用已有定向、check:quick 与独立审查证据，完整门禁失败与未实测边界保留。
- 本次仅保存候选，不表示已集成本地 main、完成真实资源基线或通过开发候选验收；`integration_status` 保持 pending。
- 提交前回读当前候选还包含应用数据根隔离、计时器上限、进程创建时间识别、系统工具绝对路径及 readline 信号转发等新增内容；本会话保留并核对这些改动，补跑相同 4 个定向文件，共 191 例通过。此前 179 例和独立审查证据仅对应上一轮增量，不冒充新增内容的独立或实机验收。
- 预提交检查规范化了 Node 路径导入顺序。提交期间的后续候选还包含根进程退出后的 PID 复用保护及扫描根真实路径校验，属于行为加固；对应 README 与本条同步澄清，不能将整个后续候选称为仅格式化。全量门禁失败与真实进程未实测边界继续保留。

## 集成补记（2026-11-07）

- 基线脚本与配套修复已随本地 `main` 集成并推送 `origin/dev`（16d7e620f），`integration_status` 补记为 integrated；真实资源基线测量仍未执行（需当前任务授权），Task 保持 in_progress。
