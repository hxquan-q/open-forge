---
id: TASK-0333
type: task
status: in_progress
priority: P1
owner: project/agent-workflow/coordinator
requirement: REQ-0019
plan: PLAN-0019
source: user-request; TASK-0332
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0325, TASK-0326, TASK-0327, TASK-0328, TASK-0330, TASK-0331, TASK-0332]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（临时独立干净副本验证，不并行开发）
base_commit: 36bf63f44
read_paths: [project, scripts/quality, scripts/agents, schemas/agents, apps, packages, .agents, .github]
write_paths: [project/tasks/TASK-0333-autonomy-dev-push.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0332]
integration_status: pending
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发候选提交与 dev 推送

## 目标和范围

用户明确要求提交推送。最新工作已提交至 main，初始已 fetch 的 origin/dev 为 `399fdf1ff2bb0f77b9362efe751f2c87722af662`，本地领先 18 个提交、无分叉。批次覆盖 PLAN-0019 自主控制器、CLI/Desktop 修复、WSL 环境及原生入口文档；只推个人仓库 origin/dev，不推 origin/main、upstream、tag 或发布。

原工作区 tracked/index 干净，另有七个既有 temp 未跟踪文件。它们原位保留，不读取、移动、删除、忽略或提交；不新增 dirty-worktree waiver。以已提交 main 建立独立临时干净 Git 副本，在其中按冻结锁安装 Windows 依赖、运行整批 test:changed --base origin/dev 和完整 check；确认同一候选、本地 main、干净状态、远端未分叉后从该副本执行标准 main:dev fast-forward 推送。原工作区不在后台测试期间继续写产品代码。

## 合同与并发

- serial，当前 Agent 负责验证、Git 批次与推送；无代码 Worker、无并行开发 Worktree。
- 输入：现有已集成提交、锁文件、远端 dev 和用户明确推送授权。输出：实际验证日志、成功的远端 dev 提交及本 Task 记录。
- Given 同一已提交候选通过所需测试和 check，When 推送，Then origin/dev 与候选一致，无 force；Given 失败、分叉或未知变更，Then 保留现场，先诊断，不把部分绿灯当通过。
- 只使用既有测试，不降低断言、超时或门禁；不运行 verify:ui、真实 Provider、远端矩阵手动触发或发布。完整产品单测按仓库入口运行，与真实 CI/UI 延期分别记录。
- 临时副本只复制 Git 已提交内容，独立 .git/node_modules，不复制 Windows 登录态、用户应用状态或未跟踪文件。凭据仅由 Git 的既有认证机制用于用户授权推送，不读取或输出凭据值。
- 若验证发现实际缺陷，先记录来源并按原流程修复；本 Task 不默默夹带无关功能。临时验证目录保留直到交付，不执行递归删除。

## 验证与交付

- 远端 fetch、完整 git log origin/dev..main、冻结依赖安装、test:changed --base origin/dev、bun run check、Git clean/fast-forward 与远端提交确认。
- 工程验证：待执行；技术评审：核对既有任务证据与整批变更归属；集成：pending；人工功能验收：本 Git 操作不适用，不代表用户接受产品行为；发布：未授权。
- 本任务内部完成标准为授权的开发分支确实前进且完整验证证据留存；其他 verifying 功能 Task 不自动改 done。

## 交付记录

- 待补：临时副本路径、候选/远端 commit、实际安装/测试/检查结果、失败归属、推送回执和未执行项。
