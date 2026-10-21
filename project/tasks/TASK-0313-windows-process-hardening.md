---
id: TASK-0313
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement:
plan:
source: RESEARCH-0032 / pi agent CHANGELOG 0.75.4 (#4699) 与 0.84.4 (#6596)
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
  - packages/runtime-node/src/coding/host/bash-executor.ts
  - packages/runtime-node/src/coding/host/process-tree.ts
write_paths:
  - packages/runtime-node/src/coding/host/bash-executor.ts
  - packages/runtime-node/src/coding/host/process-tree.ts
  - packages/runtime-node/src/coding/host/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# Windows 进程加固：windowsHide 与 taskkill 绝对路径/error 监听

## 目标

Windows 下 bash 工具 spawn 加 `windowsHide: true` 消除控制台窗口闪烁；`killNodeProcessTree` 的 taskkill 改用 `%SystemRoot%\System32\taskkill.exe` 绝对路径（不依赖 PATH），并为 spawn 挂 `error` 监听——当前 try/catch 接不住异步 ENOENT，未处理 `error` 事件会让宿主进程崩溃。

## 范围

### 并发评估

- 结论：支持（本会话串行执行）
- 执行方式：serial
- 可并行 Task：TASK-0310/0311/0312（不同文件域）
- 前置依赖：无
- 冲突文件/独占路径：`bash-executor.ts`、`process-tree.ts` 及其测试
- Branch：main
- Worktree：不拆出
- 集成负责人：本会话
- 集成顺序：随 main 串行提交

### 做

- `bash-executor.ts`：`executeLocal` 与 `executeWithOperations` 的 `spawn` 选项加 `windowsHide: true`。
- `process-tree.ts`：导出可测的 taskkill 路径解析（优先 `SystemRoot`/`SystemRoot` 环境变量，回退 `taskkill`）；spawn 后挂 `error` 监听吞掉 ENOENT/EPERM（进程可能已退出）。
- 回归测试：路径解析函数按环境变量构造绝对路径（含大小写两种变量名与缺省回退）；win32 分支调用不抛同步异常。

### 不做

- 不改 POSIX 分支（进程组 kill）语义。
- 不引入 taskkill 存在性预检 spawnSync 探针（error 监听已兜底）。

## Given / When / Then

- Given：Windows 用户在会话中运行 bash 工具或中止运行中的命令；
- When：executor spawn shell / 中止触发 `killNodeProcessTree`；
- Then：无控制台窗口闪烁；taskkill 从 System32 绝对路径启动；taskkill 不可用时仅记录/忽略，宿主进程不崩溃；中止后命令仍以取消态收尾。

## 必须保持

- 中止语义：`resolveOnce(undefined, true)` 取消收尾与输出 collector 清理顺序不变。
- POSIX 平台行为完全不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-node/src/coding/host/`（bash-executor 既有测试复跑 + process-tree 新测试）
- 用户流程：运行命令 → 中止 → 会话不中断（既有 bash-executor 取消测试覆盖流程）
- 质量检查：`bun run test:impact -- <changed>`；收尾 `bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：待验收（Windows 实机无窗口闪烁与中止稳定，附步骤）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Windows 实机 dev 实例
- 操作步骤或 AI 任务输入：让 Agent 执行长时 bash 命令，观察是否闪控制台窗口；执行中按停止
- 预期行为与最终产物：全程无黑框闪烁；停止后会话可继续对话
- 不通过表现与已知限制：—
- 验收反馈及回归案例：

## 交付记录

- 实际修改：`bash-executor.ts` spawn 加 `windowsHide: true`；`process-tree.ts` 新增 `resolveWindowsTaskkillCommand`（`SystemRoot`/`windir` → System32 绝对路径，缺省回退裸命令），`killNodeProcessTree` 改用绝对路径并挂 `error` 监听吞异步 ENOENT/EPERM。测试：新建 `process-tree.test.ts`（路径解析表驱动 + win32 下伪 SystemRoot 异步 ENOENT 不崩溃的行为验证）；`bash-executor.test.ts` 以包裹真实 `node:child_process` 的 mock 捕获 spawn 选项断言 `windowsHide`。
- 实际运行：定向 2 套件（process-tree 4 例 + bash-executor 6 例）全绿；`test:impact` 全量执行。
- 未运行及原因：Windows 实机目验（无黑框闪烁、中止稳定）留人工验收，测试已覆盖选项合同与不崩溃行为。
- Worktree：未拆出（串行小改动）
- 剩余风险：POSIX 分支行为未变（既有测试守卫）；taskkill 存在性不做预检（error 监听已兜底）。

### test:impact 归因汇总（TASK-0310～0313 共用）

`test:impact`（desktop、cli-host、coding-agent、runtime-desktop、runtime-node 并行）exit 非 0：cli-host、runtime-desktop 过；runtime-node 7 红、coding-agent 1 红串行复跑均为 `spawn rg ENOENT`（本机 PATH 无 ripgrep，TASK-0307 已记录的同款存量环境红，与本轮改动无关）；desktop 改包内 `bun run test` 串行复跑两次：4 个收集崩溃文件与 BUG-0107 记录的四个文件逐一相同（`process.resourcesPath` TypeError，2026-10-14 起存量 investigating），其余红（useSessionManager 队列、model-call-frame、远程 SSH 流、ImBridge 超时）在两次同树运行间集合不同、属负载型 flaky/超时类，均不在本轮改动域；首轮通过 5076/5077。完整 `bun run check` 全绿（期间修复 biome 一处 import 排序，并补齐并行会话 TASK-0309 合并遗漏的 15 个声明头使 ratchet new=0，另作 chore 提交）。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
