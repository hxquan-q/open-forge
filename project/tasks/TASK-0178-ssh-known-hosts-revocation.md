---
id: TASK-0178
type: task
status: ready
priority: P1
owner: ssh-transport + desktop SSH security
source: BUG-0062; RESEARCH-0019
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0177, TASK-0169, TASK-0165, TASK-0174]
related_issues: []
related_bugs: [BUG-0062]
execution: serial
branch: main
worktree: unassigned（仅规划，认证修改待实施请求）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport/src/known-hosts.ts, packages/ssh-transport/src/known-hosts.test.ts, packages/ssh-transport/src/ssh2-runner.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts]
write_paths: [packages/ssh-transport/src/known-hosts.ts, packages/ssh-transport/src/known-hosts.test.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.test.ts, project/tasks/TASK-0178-ssh-known-hosts-revocation.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0169, TASK-0177]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# known_hosts 撤销语义与宿主拒绝合同

## 事实与目标

[BUG-0062](../bugs/BUG-0062-revoked-host-key-accepted.md) 已在合成输入上证实 @revoked 被当成普通 match，真实宿主校验函数随即返回 true。当前只建 Task，**不修改认证逻辑**；实施须由后续明确请求启动。

目标是恢复“已撤销密钥必须拒绝”的安全边界，并让 marker 角色在 matcher 与宿主组合之间不丢失。Upstreamable 的通用校验修复，保留 Open Forge 现有宿主提示/存储边界。

## 范围与替代方案

- 优先做有界 marker/verdict 修复并同时迁移消费者；若需新增公共 verdict 类型，检查全部导出/调用者和未知分支，不让新拒绝态回落成首次确认。
- 对适用主机/公钥的撤销采取拒绝优先，检查所有相关行和 user/app 文件来源，不靠先遇到哪个 match 决定。
- @cert-authority 不得独自把 raw host key 标为可信；不在本任务实现证书链验证，未知 marker 也不得产生信任。
- 不改 known_hosts 原始文件、不迁移凭据目录、不自动移除 revoked 标记、不提供“仍然连接”绕过；普通同钥放行、变更拒绝和未知首次确认保持。
- 本任务不顺手修改文件不可读策略、权限存储或其他 SSH 协议；若必须扩大公共合同，先记录替代方案与兼容影响。

## Given / When / Then

1. Given 相同公钥被 @revoked 标记；When matcher 和真实宿主 verifier 处理；Then 拒绝，不触发确认、不追加记录。
2. Given 普通匹配与 revoked 同时存在，且分别位于前后行/不同文件；When 更换行序或来源顺序；Then 拒绝结果不变。
3. Given CA/未知 marker；When 对端提供恰好相同的 raw key；Then 不凭该行直接放行；有效普通条目的语义不被随意扩成证书信任。
4. Given 普通同钥、不同钥、未知主机，以及哈希/通配/取反/非默认端口；When 正常连接确认或拒绝；Then 保持既有合法流程和 key change fail-closed 行为。

## 输入、输出与并发

输入为合成 known_hosts、主机信息和可控文件/提示端口；输出为校验结果与必要提示/写入副作用，不含真实密钥。当前串行规划；实际跨包校验、宿主组合和测试需同一 Task 收口，与 TASK-0169/0177 的宿主/文档边界串行集成。不启动 Agent 或 Worktree；未来并行须另有授权。

## 验证与验收

- 先将 BUG-0062 的 matcher + 宿主链补成失败回归；已有错误的 CA 同钥断言应改成角色明确的安全测试，不能简单删掉覆盖。
- cwd `packages/ssh-transport`：`bun ../../scripts/quality/run-vitest.mjs run src/known-hosts.test.ts src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts`。
- cwd `apps/desktop`：`bun ../../scripts/quality/run-vitest.mjs run src/main/ssh/ssh-hostkey-verifier.test.ts src/main/ssh/ssh-host-service.test.ts`。
- `bun run test:impact -- packages/ssh-transport/src/known-hosts.ts apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts`；公共 verdict 变更另跑 `test:changed` 与完整 `bun run check`，显式补跑未注册入口的 SSH 测试（直到 TASK-0174 落地）。
- 文件 I/O 只使用自有临时夹具或受控端口；不得读取用户真实 ~/.ssh/known_hosts、私钥或访问真实主机。测试断言允许/拒绝及副作用，而非只检查 mock 次数。

## 当前状态与不做项

仅规划、未修复，集成 pending，尚无实现测试结果。未授权生产认证实验、真实实例、付费 Provider 或发布；不存在“用户已接受”的事实。实现后记录安全自审/授权范围、公开类型消费者、red/green、未验证平台与实际提交。
