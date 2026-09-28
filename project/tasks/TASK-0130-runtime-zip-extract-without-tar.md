---
id: TASK-0130
type: task
status: in_progress
priority: P1
owner: desktop
requirement:
plan:
source: dev 日志巡检
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0046]
execution: parallel
branch: task/TASK-0130-runtime-zip-extract-without-tar
worktree: ../open-forge-wt/task-0130-runtime-zip-extract-without-tar
base_commit: aaf85f02e238fce2d25e8bfa80b112bdac98b3cd
read_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts, apps/desktop/src/main/archive/safe-zip-extract.ts, apps/desktop/src/main/runtimes/manifest.json]
write_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts, apps/desktop/src/main/runtimes, .github/release-notes/v0.1.3.md, project/tasks/TASK-0130-runtime-zip-extract-without-tar.md, project/tasks/README.md, project/bugs/BUG-0046-windows-gnu-tar-runtime-zip-extract.md, project/bugs/README.md]
exclusive_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# 托管 runtime 的 zip 解压改走内置解压器，不再依赖外部 tar

## 目标

修复 [BUG-0046](../bugs/BUG-0046-windows-gnu-tar-runtime-zip-extract.md)：Windows 上 PATH 含 GNU tar 时 Node runtime 的 zip 包解压必失败。zip 归档改用进程内解压，tar 只服务 tar.gz。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel（独立 Worktree）
- 可并行 Task：TASK-0131、TASK-0132（写路径不相交）
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/main/runtimes/runtime-archive-installer.ts`
- Branch：task/TASK-0130-runtime-zip-extract-without-tar
- Worktree：`../open-forge-wt/task-0130-runtime-zip-extract-without-tar`
- 集成负责人：Coordinator
- 集成顺序：与 TASK-0131 / TASK-0132 任意顺序

### 做

- `runtime-archive-installer.ts` 中 `archiveType === "zip"` 时改用仓库已有的 `extractZipArchiveSafely`（`src/main/archive/safe-zip-extract.ts`，adm-zip 实现，带路径穿越/大小上限防护），不再 spawn `tar`。
- tar.gz 路径保持现有 tar + flavor 探测逻辑不变（BUG-0023 的兼容面不回退）。
- 补回归测试：zip 路径在 GNU tar 环境（或不调用 tar 的可证伪断言）下安装成功；tar.gz 路径仍走 tar。
- 发布说明写入当前版本 `.github/release-notes/v0.1.3.md`。

### 不做

- 不更换 tar.gz 解压实现；不引入新依赖（adm-zip 已在依赖中）；不改 manifest 的归档类型与下载源；不处理 python runtime（win32 也是 tar.gz，不受此 bug 影响）。

## Given / When / Then

- Given：Windows 机器 PATH 中 GNU tar 先于 bsdtar，本机无 node runtime。
- When：RuntimeManager 下载并安装 `node-v22.22.2-win-x64.zip`。
- Then：解压不经过外部 tar，安装成功，`runtimes/node` 就绪；两个下载源不再报 `zip extract failed`。

## 必须保持

- tar.gz 安装路径行为与 BUG-0023 修复后的兼容面不变（bsdtar 不加 `--force-local`，GNU tar 加）。
- staging 目录安装/回滚语义、`.vendor-version` marker 写法不变。
- zip 解压继续拒绝路径穿越条目（沿用 safe-zip-extract 既有防护）。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/runtimes/runtime-archive-installer.test.ts`（新增/更新用例：zip 不经 tar 成功安装；tar.gz 仍调 tar；模拟 GNU tar 时 zip 不再失败）。
- 用户流程：删除 `~/.openforge-dev/runtimes/node` 后 dev 启动，Node runtime 后台下载安装成功（可在任务收尾时人工确认一次）。
- 质量检查：`bun run check:quick`，收尾 `bun run check`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：未拆出 worktree，改动小且写路径与其他在途任务不相交。
- 剩余风险：
