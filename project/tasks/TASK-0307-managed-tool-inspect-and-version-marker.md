---
id: TASK-0307
type: task
status: in_progress
priority: P2
owner: packages/runtime-node
requirement: REQ-0016
plan:
source: RESEARCH-0030
related_requirement: [REQ-0016]
related_plan: []
related_tasks: [TASK-0308]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0307-managed-tool-inspect
worktree: unassigned（创建中，由 task:worktree 回填）
base_commit: bb722cd71
read_paths:
  - project/research/RESEARCH-0030-managed-coding-tool-doctor-inspection.md
  - packages/runtime-tools/src/coding/host/
  - packages/runtime-node/src/coding/host/managed-executables/
write_paths:
  - packages/runtime-tools/src/coding/host/executable-resolver.ts
  - packages/runtime-node/src/coding/host/managed-executables/
  - packages/runtime-node/src/coding/host/index.ts
  - packages/runtime-node/src/coding/index.ts
  - packages/runtime-node/test/coding-suite/managed-executables.test.ts
exclusive_paths:
  - packages/runtime-node/src/coding/host/managed-executables/
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 受管编码工具 inspect() 解析记录与缓存侧 version 标记（REQ-0016 A1）

## 目标

给 fd/rg 受管工具解析链补一个 additive 的只读解析记录面：`resolve()` 合同不动，新增可选 `inspect(tool)` 返回 `{ tool, source, path, version?, lastError?, offline }`；缓存侧落 `<toolsDir>/<tool>.version` 标记文件，让后续 doctor 出口（TASK-0308）不必 spawn 即可报版本。设计依据与修正见 RESEARCH-0030。

## 范围

### 并发评估

- 结论：支持并行——写域集中在 `packages/runtime-node` 受管执行目录 + `runtime-tools` 接口文件，当前无在途任务占用。
- 执行方式：parallel（建议独立 Task Worktree）。
- 可并行 Task：与 TASK-0308 无写路径重叠，但 0308 集成依赖本任务导出。
- 前置依赖：无。
- 冲突文件/独占路径：`packages/runtime-node/src/coding/host/managed-executables/`。
- Branch / Worktree：派工时由 `task:worktree -- create --task TASK-0307` 回填。
- 集成负责人：Coordinator；集成顺序：本任务先于 TASK-0308。

### 做

- `packages/runtime-tools/src/coding/host/executable-resolver.ts`：接口加可选 `inspect?` 方法与 `CodingToolInspection` 类型；`source` 枚举 `"cache" | "path" | "missing" | "download-failed"`，语义为**纯静态检查**（不下载、不联网、不触发解析副作用）。
- managed resolver 侧新增自由函数 `inspectManagedCodingToolExecutable(tool, dependencies)`（DI 风格对齐既有 `resolveManagedCodingToolExecutable`），并挂到 `createManagedCodingToolExecutableResolver` 返回对象上。
- 版本来源两路：
  - PATH 侧：把 `commandExists` 探针升级为同时捕获 `--version` stdout（managed 与 local 两处探针都改 pipe 并解析版本）；
  - 缓存侧：`CodingToolDownloadPlan` 扩 `version` 字段，`CodingToolArchiveOperations` 增 `writeVersionMarker` 操作，`installCodingToolArchive` 成功路径写 `<toolsDir>/<binaryFileName 去扩展名>.version`；存量缓存无 marker 且二进制存在时回退一次 `spawnSync --version`（RESEARCH-0030 修正三的二选一，本任务定死为回退 spawn）。
- `lastError`：同 resolver 实例记录最近一次 `resolve()` 下载失败（best-effort）；跨进程/静态调用场景恒为 `undefined`，接口层文档化「doctor 出口不依赖该值」。
- 导出：`runtime-node` coding/host 与 coding 两级 index 同步导出新符号。
- 测试：沿 `managed-executables.test.ts` 依赖注入合同风格补用例——cache+marker（零 spawn 断言）、cache 无 marker 回退、PATH 捕获版本、missing+offline 标志、install 写 marker 的 operations 断言、plan 带 version。
- 被修改的上游存量文件按声明头门禁补 `// Modified by The Open Forge contributors.`，保持 `new=0`。

### 不做

- 不改 `resolve()` 返回值与解析/下载/离线/android 分支行为；
- 不实现 local/SSH resolver 的 `inspect`（接口可选，生产链是 managed resolver）；
- 不做下载失败持久化到磁盘（RESEARCH-0030 已否决）；
- 不加 CLI / IPC / UI 出口（TASK-0308 负责）。

## Given / When / Then

- Given：`<toolsDir>/rg(.exe)` 与 `rg.version` 均存在；When：`inspect("rg")`；Then：返回 `{source:"cache", path, version}` 且全程零 spawn、零网络。
- Given：缓存无 fd、PATH 上有 fd；When：`inspect("fd")`；Then：返回 `{source:"path", path:"fd", version:<--version 输出解析>}`。
- Given：两者皆无、`PI_OFFLINE` 未设；When：`inspect("fd")`；Then：返回 `{source:"missing", offline:false}`，不尝试下载。
- Given：同实例此前 `resolve("fd")` 下载失败；When：`inspect("fd")`；Then：`lastError` 含失败信息（允许实现降级为 undefined）。

## 必须保持

- `resolve()` 公共合同与返回值逐字不变；所有既有消费方（grep/glob/find/tree、tool-environment、SSH 实现与测试替身）零改动通过类型检查；
- `CodingToolArchiveOperations` 既有操作签名不变（只增不改）；
- 下载与安装流程行为不变（marker 写失败不得让安装失败，best-effort）。

## 测试与验证

- 定向：`packages/runtime-node` coding-suite（managed-executables / executable-resolver 套件）。
- 质量检查：`bun run check`（含声明头 ratchet `new=0`）；vitest 不查型，另跑根 tsgo。

## 验收分层

- 工程验证：待执行；技术评审：自审（接口 additive 证明＝消费方零改动编译通过）；集成：pending（先于 TASK-0308）；人工功能验收：不适用（无用户可见面，出口在 TASK-0308）；发布：未授权（实施时按 fragments 留一句内部改动）。

## 功能验收包

- 无独立入口；以 TASK-0308 的 doctor/诊断包验收覆盖。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：未拆出（ready 待派工）。
- 剩余风险：
