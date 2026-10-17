---
id: TASK-0310
type: task
status: verifying
priority: P0
owner: packages/coding-agent
requirement:
plan:
source: RESEARCH-0032 / GHSA-jfgx-wxx8-mp94（上游修复 ea3465a8）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 7d26d1df6
read_paths:
  - packages/coding-agent/src/resources/packages/resource-package-locations.ts
  - packages/coding-agent/src/resources/packages/package-lifecycle.ts
  - packages/coding-agent/src/resources/contracts/resource-source.ts
  - packages/runtime-node/src/host/resource-package-host.ts
write_paths:
  - packages/coding-agent/src/resources/packages/resource-package-locations.ts
  - packages/coding-agent/src/resources/packages/package-lifecycle.ts
  - packages/coding-agent/src/resources/contracts/resource-source.ts
  - packages/runtime-node/src/host/resource-package-host.ts
  - packages/coding-agent/test/
  - packages/runtime-node/src/host/resource-package-host.test.ts
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 临时扩展缓存迁出共享 tmp（GHSA-jfgx 本地提权）

## 目标

临时（`scope === "temporary"`）资源包的安装根从 `os.tmpdir()/pi-extensions/...` 迁到按 agent 私有的 `<agentDir>/tmp/extensions`，目录创建即 `0700`（含对已存在目录的 chmod 收紧），消除共享主机/SSH 远端上路径可预测带来的本地提权与缓存投毒面。对齐上游 pi `ea3465a8`（GHSA-jfgx-wxx8-mp94）。

## 范围

### 并发评估

- 结论：支持（但本 Task 由当前会话串行执行）
- 执行方式：serial
- 可并行 Task：TASK-0311/0312/0313（不同文件域）
- 前置依赖：无
- 冲突文件/独占路径：`resource-package-locations.ts`、`package-lifecycle.ts`、`resource-source.ts`（契约 `ensureDirectory` 加可选 mode）、`resource-package-host.ts`
- Branch：main（本地提交，不经 worktree；改动集中且无并行写入）
- Worktree：不拆出——单会话串行、改动面小
- 集成负责人：本会话
- 集成顺序：随 main 串行提交

### 做

- `ResourcePackageLocations.temporaryDir()` 根改为 `join(agentDir, "tmp", "extensions")`，保留 `prefix/hash8/suffix` 结构（缓存路径稳定性合同不变）。
- `ResourcePackageFilePort.ensureDirectory(path, options?: { mode?: number })` 可选参数；Node 实现带 mode 时 `mkdir(recursive, mode)` 后 `chmod(mode)`（覆盖已存在目录的宽松权限）；临时安装前先以 `0700` 确保根目录存在。
- 回归测试：temporary 安装路径落在 `<agentDir>/tmp/extensions` 下、不再位于 `locationFacts.temporaryDirectory` 下、非 Windows 上根目录 mode 为 `0700`；既有 user/project 路径不回归。

### 不做

- 不清理历史 `os.tmpdir()/pi-extensions` 残留（无害残留，用户可自行删除）。
- 不改 `ResourceScope` 语义、设置持久化与资源投影。
- 不动 SSH 专有代码（远端跑同一份 runtime，自动受益）。

## Given / When / Then

- Given：任意主机上的 coding-agent 运行时，`agentDir` 指向用户私有目录；
- When：以 `temporary` scope 安装/解析 npm 或 git 资源包（`resolveAdditionalSources` + `installMissing`）；
- Then：安装根为 `<agentDir>/tmp/extensions`（0700，非 Windows 可断言），路径不再依赖 `os.tmpdir()`；user/project scope 行为与路径不变。

## 必须保持

- 缓存路径确定性：同一 `prefix/suffix` 的 sha256 前 8 位哈希结构不变（`ResourcePackageDigestPort` 合同）。
- `npmInstallPath`/`gitInstallPath` 其余 scope 的路径不变；`.gitignore`/`package.json` 引导行为不变。
- SSH 远端与本地走同一代码路径，无分叉。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run`（coding-agent `resource-package-locations`/`package-manager` 相关 + runtime-node `resource-package-host.test.ts`）
- 用户流程：资源包 temporary 安装 → 解析投影路径正确（现有 package-manager 测试流）
- 质量检查：`bun run test:impact -- <changed>`；收尾 `bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：不适用（无 UI 面；路径与权限由测试断言）
- 发布：未授权

## 功能验收包

- 入口与前置条件：任一使用 temporary 扩展的会话启动
- 操作步骤或 AI 任务输入：加载 temporary npm/git 扩展
- 预期行为与最终产物：包安装于 `<agentDir>/tmp/extensions`；共享 tmp 不再出现 `pi-extensions` 新目录
- 不通过表现与已知限制：Windows 上 mode 断言跳过（ACL 语义不同）
- 验收反馈及回归案例：

## 交付记录

- 实际修改：`resource-package-locations.ts` 新增 `temporaryRoot()`（`<agentDir>/tmp/extensions`）并让 `temporaryDir()` 以其为根（`prefix/hash8/suffix` 结构不变）；`resource-source.ts` 的 `ensureDirectory` 端口加可选 `mode`；`package-lifecycle.ts` 在 npm/git 临时安装前以 `0o700` 确保私有根；`resource-package-host.ts` Node 实现带 mode 时 `mkdir+chmod`（覆盖已存在目录）。测试：`resource-package-locations-port.test.ts`（私有缓存路径 + 不落共享 tmp）、`package-manager.test.ts`（lifecycle 先建根后执行外部命令、0700）、`resource-package-host.test.ts`（mode 创建/收紧）、`git-update.test.ts`（改用生产路径助手，消除对真实系统 tmpdir 的读写污染）。
- 实际运行：定向 5 套件（locations-port / package-manager / resource-package-host / package-manager-ssh / git-update）103 例全绿；`test:impact` 全量执行（见 TASK-0313 交付记录的归因汇总）。
- 未运行及原因：Windows 下 0700 位断言按平台跳过（ACL 语义不同），由调用合同断言与 Linux CI 补充。
- Worktree：未拆出（串行小改动）
- 剩余风险：历史 `os.tmpdir()/pi-extensions` 残留目录不主动清理（无害残留）；`locationFacts.temporaryDirectory` 合同字段保留但本消费方不再使用。
