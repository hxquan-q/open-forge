---
id: TASK-0356
type: task
status: in_progress
priority: P2
owner: desktop-plugins
requirement: REQ-0002
plan: PLAN-0020
source: user-request; RESEARCH-0035 修复授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0020]
related_tasks: [TASK-0350]
related_issues: []
related_bugs: [BUG-0124]
execution: serial
branch: main
worktree: .
base_commit: a524856ef0cd94a182ebc35380494fda7ec9f21c
read_paths: ['apps/desktop/src/main/ipc/session.ts', 'apps/desktop/src/main/plugins', 'apps/desktop/src/renderer/domains/plugins/runtime']
write_paths: ['apps/desktop/src/main/ipc/session.ts', 'apps/desktop/src/main/plugins', 'apps/desktop/src/renderer/domains/plugins/runtime', 'project/tasks/TASK-0356-plugin-hook-generation-lifecycle.md', '.github/release-notes/v0.1.3.md']
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 插件Hook派发与渲染端代次生命周期对齐

## 目标与范围

来源为[RESEARCH-0035](../research/RESEARCH-0035-fourteen-day-log-performance-audit.md)及用户「请你立项修复」。实现本concern的可复现修复、配套回归与交付记录。当前行为/期望以正文合同及后续复现为准，未知唯一根因不提前写死。

## Given / When / Then

- Given：受影响的正常入口与受控资源/系统/时间替身，不使用真实用户状态。
- When：插件激活→Hook调用→renderer重载/插件更新→新激活，旧注册不被错误派发；在途lease与超时/取消/错误语义保持，失败可恢复。
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

- 首个候选定向命令：`bun run vitest --run apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.test.ts apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.hook-diagnostics.test.ts`；依实际测试接缝调整并回写，不把测试收集失败当目标红灯。
- 修改后：定向回归、代表性用户流程、`bun run test:impact -- <本Task实现路径>`、中间`check:quick`，交付前完整`bun run check`；组合按影响执行test:changed。
- 性能切片保留相同受控条件的前后调用数/耗时证据，不以生产收益承诺代替测量。

## 验收分层与验收包

- 工程验证：待执行；独立评审：待原生只读审查；集成pending。
- 人工功能验收：待真实Desktop场景确认，不以单元测试冒充已接受；发布未授权。
- 入口：该Task的正常功能入口；执行上列连续流程，结果及失败恢复须符合合同。详细入口/限制在完成时回写。

## 交付记录

- 待记录红/绿、修改、实际命令、评审、未运行项、风险和本地提交。

## 原生协作与复审

/root/identity_diagnosis、/root/plugin_diagnosis、/root/remote_diagnosis完成分域只读调查；/root/repair_review独立审查实际diff。发现并修复分页reset失败loading与请求淘汰、合法marker夹具与mock类型、绘制Hook接线覆盖、context路径重复及并发失败继续派发、Hook staged activation迟到commit。复审未发现可确认剩余阻断；上述角色均未改文件/Git、未代跑测试，不声称异模型家族评审。组合测试与完整check结果待最后回填。
