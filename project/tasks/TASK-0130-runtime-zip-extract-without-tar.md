---
id: TASK-0130
type: task
status: verifying
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
worktree: unassigned（已集成，待推送后清理）
base_commit: cdb15bb905f0eece45e870291a867065d29b0cac
read_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts, apps/desktop/src/main/archive/safe-zip-extract.ts, apps/desktop/src/main/runtimes/manifest.json]
write_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts, apps/desktop/src/main/runtimes, .github/release-notes/v0.1.3.md, project/tasks/TASK-0130-runtime-zip-extract-without-tar.md, project/tasks/README.md, project/bugs/BUG-0046-windows-gnu-tar-runtime-zip-extract.md, project/bugs/README.md]
exclusive_paths: [apps/desktop/src/main/runtimes/runtime-archive-installer.ts]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0131, TASK-0132]
integration_status: integrated
created: 2026-09-28
updated: 2026-10-08
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

- 实际修改：`runtime-archive-installer.ts` 中 `archiveType === "zip"` 改走进程内 `extractZipArchiveSafely`（adm-zip，路径穿越/大小上限防护沿用），不再 spawn `tar`；`extractArchive` 转 async；tar.gz 路径的 flavor 探测与 `spawnSync("tar")` 不变；`installRuntimeArchive` await 新签名。
- 测试：`runtime-archive-installer.test.ts` zip fixture 改用 AdmZip 生成（脱离宿主 tar 实现），新增断言 zip 安装路径下 `spawnSync` 未被调用（不依赖 PATH 中的 tar 实现即可证伪）；tar.gz 用例保持调用 tar 的断言；损坏 zip 报 `zip extract failed` 且保留旧 runtime。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/runtimes/runtime-archive-installer.test.ts`（9 passed / 1 skipped 平台门禁）；集成后同一文件重跑通过；pre-commit biome+guards 通过。
- 未运行及原因：`check`/`test:changed` 由 Coordinator 在批次验收统一跑（见集成提交）；「删 `~/.openforge-dev/runtimes/node` 后 dev 启动实装 Node runtime」属人工冒烟，未执行——Windows GNU tar 先行环境需真实终端，交付时保持 verifying。
- Worktree：`task-0130-runtime-zip-extract-without-tar`（branch `task/TASK-0130-runtime-zip-extract-without-tar`，集成提交 `9d6981fac` + merge `32012e373`）。
- 剩余风险：真实 GNU tar 环境的端到端安装未人工复验；回归测试以「zip 路径完全不经 spawnSync」为证伪锚点，覆盖风险等价。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑声明的定向套件；另核验本机是否**就是**合同描述的那台机器形态。

| 项 | 本次读数 |
|---|---|
| `runtime-archive-installer.test.ts` | **1 文件 / 9 例通过 \| 1 跳过**（跳过项为平台门禁），0 失败。关键断言仍在：zip 安装路径下 `spawnSync` **未被调用**（⇒ 不依赖 PATH 里的 tar 即可证伪），tar.gz 仍调 tar，损坏 zip 报 `zip extract failed` 且保留旧 runtime |
| 合同前置（本机形态） | **成立且更极端**：`tar --version` 为 **GNU tar 1.35**（`/usr/bin/tar`、`/bin/tar`、`C:/WINDOWS/system32/tar`、`scoop/git/current/bin/tar` 皆 GNU；`which bsdtar` **无命中**）⇒ 本机正是「GNU tar 先于 bsdtar 且无 bsdtar」的故障形态 |
| 真实安装路径的旁证 | Debug profile `04987e4e` 的 `runtimes/node/22.22.2` 已就位且 `node -v` = **v22.22.2**（与合同点名的 `node-v22.22.2-win-x64.zip` 同版本）；host.log 中 `zip extract failed` **零命中** |

- **未覆盖**：**真实走一遍下载安装**。上面那条「已安装 node 22.22.2」的**安装时刻不可考**（无法判定是 TASK-0130 交付前还是交付后装的），因此**不能**据此断言「新代码路径真跑过」——只能作为「本机形态与合同一致、且当前无解压失败」的旁证。要拿到用户面证据需在隔离 profile 内删除并重新安装一次托管 runtime（走真实下载），本轮未执行。
- **关闭建议**：`spawnSync` 未被调用这条断言是对「不经过外部 tar」的**直接证伪式**证据，且本机形态恰好命中故障前提条件 ⇒ 倾向 `done`；是否要求补一次真实下载安装，请用户裁定。
