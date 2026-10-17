---
id: TASK-0308
type: task
status: verifying
priority: P2
owner: apps/cli-host + apps/desktop
requirement: REQ-0016
plan:
source: RESEARCH-0030
related_requirement: [REQ-0016]
related_plan: []
related_tasks: [TASK-0307]
related_issues: []
related_bugs: []
execution: serial
branch: task/TASK-0307-managed-tool-inspect（与 0307 同树叠作）
worktree: ../open-forge-wt/task-0307-managed-tool-inspect-and-version-marker
base_commit: fb1448727
read_paths:
  - project/research/RESEARCH-0030-managed-coding-tool-doctor-inspection.md
  - apps/cli-host/src/run-cli.ts
  - apps/cli-host/src/debug-command.ts
  - apps/desktop/src/main/diagnostics-bundle.ts
  - packages/runtime-desktop/src/coding-agent-tool-environment.ts
write_paths:
  - apps/cli-host/src/doctor-command.ts
  - apps/cli-host/src/run-cli.ts
  - apps/cli-host/test/doctor-command.test.ts
  - packages/runtime-desktop/src/coding-agent-tool-environment.ts
  - apps/desktop/src/main/diagnostics-bundle.ts
  - apps/desktop/src/main/diagnostics-bundle.test.ts
exclusive_paths:
  - apps/desktop/src/main/diagnostics-bundle.ts
depends_on: [TASK-0307]
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# doctor 双出口：openforge doctor 子命令与诊断包解析记录（REQ-0016 A2）

## 目标

把 TASK-0307 的 `inspect()` 解析记录透出到两条既有通道：CLI 新增 `openforge doctor` 打印 tool → source/path/version/lastError/offline 表；Desktop `vetta:diagnostics:export` 诊断包附带同等记录。不开新面（无新 IPC、无设置 UI、i18n 零负担），参照 CometixCode `/doctor` 的「报实际用哪个二进制」先例（RESEARCH-0030）。

## 范围

### 并发评估

- 结论：条件支持——本任务与其它任务可并行，但消费 TASK-0307 的 inspect 导出，集成顺序 A1 → A2。
- 执行方式：serial（等 TASK-0307 集成后从干净基线开工，主树串行集成）。
- 前置依赖：TASK-0307（inspect 导出与 version 标记）。
- 冲突文件/独占路径：`apps/desktop/src/main/diagnostics-bundle.ts`（与在途 main 串行任务无文件重叠，独占声明防并行误占）。
- Branch：main；Worktree：视届时主树状态定。
- 集成负责人：Coordinator；集成顺序：TASK-0307 → 本任务（CLI 与 Desktop 两片分别原子提交）。

### 做

- **CLI**：新增 `apps/cli-host/src/doctor-command.ts`（parse/run，仿 debug-command.ts 的子命令注册模式挂进 run-cli.ts 分发表与 HELP_TEXT，`openforge doctor [-h]`）；**不**走 debug 的 RPC 通道——本地静态检查，Desktop 未运行时必须可用；tools 目录用 `join(getAgentDir(), "bin")`；输出英文表（tool/source/path/version/lastError/offline），缺 `--version` 信息如实留空。
- **runtime-desktop**：导出小 helper `resolveDesktopCodingToolsDirectory(agentDir?)`，`coding-agent-tool-environment.ts` 的 `createDesktopNodeToolHost` 改调用它（单一事实源），诊断侧共用。
- **Desktop**：`diagnostics-bundle.ts` 新增 `addManagedTools(zip)` → `managed-tools.json`（每工具 source/path/version/offline；lastError 静态场景恒缺省）；不动既有 zip 内容与预算。
- **测试**：cli-host 新增 doctor-command 测试（参数/stdout/退出码，含缓存/PATH/缺失三分支夹具，风格对齐 debug-cli-entry.test.ts）；desktop 新增 diagnostics-bundle 测试（zip 含 managed-tools.json；electron `app` 不可直用则把采集纯逻辑下沉后测组装）；runtime-desktop helper 单测；按 cli-host AGENTS，bin/exports 不变不触发 `verify:artifact:installed`，但需跑 compile-standalone 守卫确认新模块入独立可执行文件。
- 被修改的上游存量文件补声明头，保持门禁 `new=0`。
- 发布说明：两片各留 fragments（CLI 为用户可见命令，Desktop 为诊断包内容变化）。

### 不做

- 不加设置 UI、不加新 IPC 通道、不动 `vetta:diagnostics:export` 合同；
- doctor 不做下载/修复、不做网络探测（RESEARCH-0030 已否决）；
- 不覆盖 SSH 远端项目的远端解析；
- 不改诊断包既有条目（日志/ring buffer/system-info/perf）。

## Given / When / Then

- Given：PATH 与缓存均无 rg、Desktop 未运行；When：终端执行 `openforge doctor`；Then：表格 rg 行 `source=missing` 并标注 offline 状态，退出码 0，全程无下载与网络请求。
- Given：缓存已有 rg 与 version 标记；When：设置 → 通用 → 导出诊断包；Then：zip 内 `managed-tools.json` 的 rg 行 `source=cache` 带版本，既有诊断内容不变，无新增 IPC。
- Given：仅 PATH 提供 fd；When：`openforge doctor`；Then：fd 行 `source=path` 带捕获版本。

## 必须保持

- `action` / `debug` / `agent` 子命令行为与帮助文本结构不变（只增 doctor 行）；
- doctor 失败（如 toolsDir 不可读）不得使诊断包导出整体失败（collector try/catch 降级，对齐 perf-snapshot 先例）；
- CLI 输出保持英文，不引入 i18n。

## 测试与验证

- 定向：cli-host doctor-command 测试、desktop diagnostics-bundle 测试、runtime-desktop helper 测试。
- 质量检查：`bun run check`；desktop 测试须包内 runner（根 runner 导入假红）。

## 验收分层

- 工程验证：待执行；技术评审：自审；集成：pending（依赖 TASK-0307 先集成）；人工功能验收：待验收——用户实机各跑一次 `openforge doctor` 与诊断包导出；发布：未授权。

## 功能验收包

- 入口与前置条件：已安装 CLI（或包内 dist）；诊断包验收需可启动的 Desktop dev 实例。
- 操作步骤：终端 `openforge doctor`；设置 → 通用 → 导出诊断包，解包查看 `managed-tools.json`。
- 预期行为与最终产物：两处均能看到 fd/rg 的来源/路径/版本（或缺失+offline），与实际环境一致。
- 不通过表现与已知限制：自定义 agentDir 会话与导出时默认目录可能不同（静态检查反映默认目录，已知限制）；SSH 远端项目不在覆盖面。
- 验收反馈及回归案例：待记录。

## 交付记录

- 实际修改：CLI 片 `de97b1c2e`——新增 `apps/cli-host/src/doctor-command.ts`（parse/run + `renderDoctorReport` 纯渲染，tools 目录缺省 `join(getAgentDir(), "bin")` 与 CLI runtime 一致），`run-cli.ts` 分发与 HELP_TEXT 增 doctor 行，测试 `doctor-command.test.ts`（解析/渲染/注入执行 + `bun src/cli.ts doctor` 进程级冒烟：fixture 缓存+标记命中免 spawn 分支）。Desktop 片 `0e653fd94`——`runtime-desktop` 导出 `resolveDesktopCodingToolsDirectory`（工厂与诊断共用单一事实源），`diagnostics-bundle.ts` 新增 `addManagedTools` → `managed-tools.json`（采集失败降级不阻断导出），测试 `diagnostics-bundle.test.ts`（electron/logger/ring/perf 全 mock，注入 inspector 断言 zip 内容与失败降级）。发布说明 v0.1.3 新增节一条。
- 实际运行：cli-host 定向（doctor + debug 入口 + entrypoints + compile-standalone）11 例绿；desktop 包内 runner 定向 2 例绿；`bun run check` exit 0；test:impact 覆盖 resolver 接口消费面（结果见下）。
- 未运行及原因：`verify:artifact:installed` 未跑——bin/exports 未变化（按 cli-host AGENTS 的 Policy 触发条件不适用）；`verify:runtime-contract` 未跑——runtime selection 未变（同上）。compile-standalone-entry 测试已跑绿。
- Worktree：与 TASK-0307 同树叠作（base `fb1448727`），CLI 与 Desktop 两片分别原子提交。
- 剩余风险：自定义 agentDir 会话与导出时默认目录可能不同（静态检查反映默认目录，Task 已声明为已知限制）；doctor 的 PATH 探针依赖宿主环境 PATH（设计内）。
