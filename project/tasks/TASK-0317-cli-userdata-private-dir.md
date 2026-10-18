---
id: TASK-0317
type: task
status: in_progress
priority: P1
owner: apps/desktop
requirement:
plan:
source: RESEARCH-0032 回移积压 #16（与 GHSA-jfgx 同类，pi 上游同类修复 ea3465a8）
related_requirement: []
related_plan: []
related_tasks: [TASK-0310]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0317-cli-userdata-private-dir
worktree: ../open-forge-wt/task-0317-cli-userdata-private-dir
base_commit: a47121bfa1b188ae79232b11383a13dd481fa9f1
read_paths:
  - apps/desktop/src/main/main.ts
  - project/research/RESEARCH-0032-pi-security-advisory-backport-audit.md
  - docs/upstream/pi.md
write_paths:
  - apps/desktop/src/main/cli/
  - apps/desktop/src/main/main.ts
exclusive_paths:
  - apps/desktop/src/main/cli/
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# CLI 子进程 userData 迁出共享 tmpdir 到用户私有目录

## 目标

Electron CLI 模式（ocr/pdf/action/help/agent-rpc）把 userData 设到
`os.tmpdir()/openforge-*-cli[-<pid>]`：路径可预测且位于共享临时目录，多用户
Linux/macOS 主机上其他本地用户可预置/篡改该目录内容（与 GHSA-jfgx 同类，
RESEARCH-0032 积压 #16）。改为 `<vettaHome>/tmp/<原目录名>`（vettaHome 位于
用户主目录，天然私有），创建即 `0700` 并对已存在目录 chmod 收紧；目录命名与
per-pid/per-command 隔离语义不变。

## 范围

### 并发评估

- 结论：支持（本会话独立 Worktree 单 Worker 执行，占用独立并行 scope）
- 执行方式：parallel
- 可并行 Task：无在途（TASK-0315/0316 已集成）
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/main/main.ts` CLI 分支、`src/main/cli/` 新模块
- Branch：task/TASK-0317-cli-userdata-private-dir
- Worktree：../open-forge-wt/task-0317-cli-userdata-private-dir
- 集成负责人：本会话（Coordinator 集成后推送 origin/dev）
- 集成顺序：单 Task，独立合并

### 做

- 新增 `apps/desktop/src/main/cli/cli-user-data.ts`：`createCliUserDataDirectory(cliUserDataDir)`
  计算 `join(getVettaHomePath(), "tmp", cliUserDataDir)`，`mkdirSync(recursive, 0o700)` 后
  `chmodSync(0o700)` 兜底（覆盖旧版本已存在的宽松目录），失败仅告警不阻断（Electron
  仍会尝试自行创建），返回私有路径。
- `main.ts` CLI 分支改用该函数；`tmpdir` 导入若再无其他使用点则移除。
- 回归测试 `cli-user-data.test.ts`：路径位于 vettaHome/tmp 而非 os.tmpdir；目录名与
  per-pid 命名保持；非 Windows 断言 mode 0700（含对预存在 0777 目录的收紧）；
  Windows 跳过位断言但断言路径与创建成功；vettaHome 不可创建时返回原路径并告警。

### 不做

- 不改非 CLI（桌面主实例）userData。
- 不清理历史 `os.tmpdir()/openforge-*-cli*` 残留（无害残留，用户可自行删除）。
- 不同步处理 artifact-store `tmpdir()/vetta-artifacts`、ssh-runtime `tmpdir()/vetta-ssh`
  回退等同族路径（登记到 RESEARCH-0032 后续分诊，不在本 Task 扩大范围）。

## Given / When / Then

- Given：任意主机上以 CLI 模式（含 agent-rpc sidecar）启动 desktop 可执行文件；
- When：进入 CLI 分支设置 userData；
- Then：userData 位于 `<vettaHome>/tmp/<openforge-…-cli[-pid]>`（非 Windows 可断言
  0700），不再依赖 `os.tmpdir()`；各 CLI 命令间与跨实例的目录隔离命名不变。

## 必须保持

- ocr/pdf（固定名）与 action/help/agent-rpc（pid 后缀）的目录命名语义不变。
- CLI 模式其余开关（disable-gpu、disk-cache-size=0、无沙箱回退等）不变。
- 桌面主实例 userData 与单实例锁行为不受影响。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/cli/`
- 用户流程：CLI/agent-rpc 子进程启动即落私有目录（由单元合同覆盖路径与权限）
- 质量检查：`bun run check:quick` → 集成后完整 `bun run check` + `test:impact`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：不适用（无 UI 面；路径与权限由测试断言）
- 发布：未授权

## 功能验收包

- 入口与前置条件：任一 CLI 子命令（ocr/pdf/action/help/agent-rpc）启动
- 操作步骤或 AI 任务输入：运行 CLI 子命令后检查 `~/.vetta/tmp/`
- 预期行为与最终产物：私有 userData 目录（0700）；共享 tmp 不再新建 openforge-*-cli*
- 不通过表现与已知限制：Windows 上 mode 断言跳过（ACL 语义不同）
- 验收反馈及回归案例：

## 交付记录

- 待实施。
