---
id: TASK-0352
type: task
status: blocked
priority: P1
owner: desktop-packaging
requirement: REQ-0002
plan: PLAN-0020
source: user-request; RESEARCH-0035 修复授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0020]
related_tasks: [TASK-0350]
related_issues: []
related_bugs: [BUG-0137]
execution: serial
branch: main
worktree: .
base_commit: a524856ef0cd94a182ebc35380494fda7ec9f21c
read_paths: ['apps/desktop/scripts/prepare-pack.js', 'apps/desktop/scripts/windows-sandbox-artifacts.mjs', 'apps/desktop/src/main/sandbox']
write_paths: ['apps/desktop/scripts/prepare-pack.js', 'apps/desktop/scripts/windows-sandbox-artifacts.mjs', 'apps/desktop/src/main/sandbox', 'project/tasks/TASK-0352-windows-sandbox-artifact-repair.md', '.github/release-notes/v0.1.3.md']
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# Windows沙箱制品完整性与运行时定位

## 目标与范围

来源为[RESEARCH-0035](../research/RESEARCH-0035-fourteen-day-log-performance-audit.md)及用户「请你立项修复」。实现本concern的可复现修复、配套回归与交付记录。当前行为/期望以正文合同及后续复现为准，未知唯一根因不提前写死。

## Given / When / Then

- Given：受影响的正常入口与受控资源/系统/时间替身，不使用真实用户状态。
- When：隔离Windows资源树缺失/错位沙箱二进制时必须阻断打包；合规资源树可被运行时解析；保持清单/hash与fail-closed边界。
- Then：上述公开行为可由旧实现失败、新实现通过的隔离回归证明，并覆盖成功→失败/重载→恢复的连续流程。

## 必须保持

- 角色、工具调用、取消、错误、usage/stop与原有持久化兼容语义不变；权限最小化，不禁用安全校验。
- 不读取凭据/会话正文；日志只含必要身份/阶段聚合，不保存用户内容。
- 不删除测试、不提高阈值、不修改生成文件消除失败。

## 并发评估

- 条件支持独立只读调查；生产实现由当前Coordinator在main串行执行，不共享目录并行写代码。
- 本轮原生只读子任务仅查看源码/测试并返回证据，不修改文件/Git、不运行真实实例。
- branch/worktree：main / 当前主检出。共享Project索引与最终集成由Coordinator维护。归属Open-Forge-only；不创建代码Worktree。
- 顺序依PLAN-0020；真实发现扩大写域/合同前更新本记录。没有任务依赖不等于同时写入。

## 输入输出与不做项

- 输入：当前源码/测试、既有Bug/Task、脱敏日志证据；输出：修复、回归、指标/边界及验收包。
- 不做：真实Provider/SSH/UI测试、依赖升级、发布/制品上传、私有业务服务端、历史已修复项重做、生成用户页面源码修改。

## 测试与验证

- 首个候选定向命令：`bun run vitest --run apps/desktop/scripts/windows-sandbox-artifacts.node-test.mjs apps/desktop/scripts/sandbox-staging-guard.node-test.mjs`；依实际测试接缝调整并回写，不把测试收集失败当目标红灯。
- 修改后：定向回归、代表性用户流程、`bun run test:impact -- <本Task实现路径>`、中间`check:quick`，交付前完整`bun run check`；组合按影响执行test:changed。
- 性能切片保留相同受控条件的前后调用数/耗时证据，不以生产收益承诺代替测量。

## 验收分层与验收包

- 工程验证：待执行；独立评审：待原生只读审查；集成pending。
- 人工功能验收：待真实Desktop场景确认，不以单元测试冒充已接受；发布未授权。
- 入口：该Task的正常功能入口；执行上列连续流程，结果及失败恢复须符合合同。详细入口/限制在完成时回写。

## 交付记录

- 待记录红/绿、修改、实际命令、评审、未运行项、风险和本地提交。

## 当前阻断证据

源码复核确认此症状与既有BUG-0022/TASK-0159的受控制品缺失相同：sandbox/bin不存在，清单sourceCommit和三份摘要全为null，现有打包阻断正常。不能把当前预期拒绝伪装为已修复；已向用户询问受控构建来源，未下载/信任任意第三方exe。其余切片继续。

用户于本轮确认「这个还没有」：尚无可信构建仓库、固定提交或制品目录。保留既有制品校验与安全拒绝，未编造SHA-256、未信任第三方可执行文件。本记录追踪BUG-0022/TASK-0159的同一外部依赖，并非新的独立沙箱缺陷。解除条件：可信源码/固定提交与三份受控制品齐备，再验证摘要、打包路径和隔离行为。
