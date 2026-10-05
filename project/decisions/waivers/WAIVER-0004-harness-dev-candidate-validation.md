---
id: WAIVER-0004
rule: docs/dev/agent-rules/testing.md；collaboration 的提交与集成前全影响包测试通过要求（仅 Policy）
status: resolved
owner: runtime-core/coordinator
reason: 用户在获知跨包测试失败后明确同意临时测试豁免，要求先提交推送 dev 再并入本地主树
risk: CLI 启动首帧超时尚未归因，Desktop 完整跨包验证未闭环，候选可能含未发现回归
compensation: 保留 verifying 与失败证据；完整静态 check 和定向合同测试必须通过；只提交本 Task，fast-forward 推 dev，不 force、不发布、不覆盖他人修改；到期前修复并复验或回退候选
created: 2026-10-03
expires: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0198 开发候选的限时测试豁免

## 授权与精确范围

用户先要求「提交推送 dev，然后并入主树」；Agent 报告五个 CLI 文件复验 9 failed / 30 passed，并明确询问是否接受临时测试豁免；用户回复「ok」。本条仅允许 TASK-0197 分支上的 TASK-0198 有界只读工具并发候选在已知跨包验证未全绿时提交、推送 origin/dev、尝试集成本地 main。不是工程完成、人工接受或稳定发布授权。

## 未通过与已通过证据

- CLI 重跑使用仓库 Node runner、--maxWorkers=1 和原有超时，39 项中 9 failed / 30 passed，主要为 20 秒首次 get_state/prompt 超时、frames=0、子进程仍运行。未确认是本次回归或既有失败，不能擅自归因。
- 之前 test:changed 的 Desktop 在不完整 Electron 依赖上收集失败；依赖补齐后宿主合同单文件 4 项通过，不代表 Desktop 全包通过。旧失败批次已停止，未将其改记通过。
- 本切片已获得 test:impact 679 项、最终 Agent 定向 49 项及完整 bun run check 通过。合并远端之后仍须复验相关合同和完整 check；本豁免不覆盖静态门禁。
- 详细命令和演变记录保留在 TASK-0197 / TASK-0198，不删失败、不放宽断言或超时、不跳过用例。

## 不可豁免的边界

不豁免包依赖、类型/协议、权限、凭据、用户状态、他人修改保护与 Git 授权等 Invariant。不 force push，不推 origin/main/tag，不发布或上传制品。用户指定的 dev→本地 main 顺序单独构成该推送顺序的授权，不允许绕过 fast-forward 检查。

主树仍有其他任务修改时，不为清洁工作区 stash、移动、删除或代为提交它们；若安全合并被阻止则保留 dev 候选并报告。TASK-0195 的摘要边界阻断及未实施的重同步不属于此次实现交付。

## 到期处理

2026-10-10 前重新定位 CLI/完成 Desktop 验证；消除失败后 resolved，不能验证或候选不可接受则回退本切片。不自动续期、不以本条为后续其他任务的通用豁免。

## 解决记录（2026-10-05）

- 两个未决项已按「到期处理」闭环（证据见 TASK-0197 的 2026-10-04 复验段）：
  - CLI 启动类失败已归因负载：同一五文件用例集在低竞争环境串行复跑 39/39 通过（约 153s），对照负载期 9 failed / 30 passed、约 480s（3.1× 放缓），启动首帧正常；剩余 4 例为精确工具清单断言漂移，已由 TASK-0203 修复（done，`76109c3ed`）。
  - Desktop 完整范围已复验：包内 `bun run test` 923 文件中 919 passed / 4 skipped，4921 项中 4906 passed / 15 skipped，exit 0。
- 候选交付未越界：只提交本 Task，fast-forward 推 dev（`a163b58b1`），未 force、未推 origin/main/tag、未发布；静态 check 与定向合同均通过。
- 状态转 `resolved`，不等待 2026-10-10 到期。TASK-0198 保持 `verifying` 至人工验收（属功能接受，不在本条范围内）。
