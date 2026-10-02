---
id: TASK-0166
type: task
status: draft
priority: P2
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/helper-deployment.ts]
write_paths: [packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/helper-deployment.ts, project/tasks/TASK-0166-ssh-helper-recovery-measurement.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153, TASK-0169]
conflicts_with: [TASK-0158]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# SSH helper 可恢复失败与首次可用测量

## 目标与取舍

区分不支持平台与临时连接失败；对临时失败提供有上限、可取消的恢复，避免认证弹窗风暴；共享平台在途只读探测。先测首次可用各阶段再决定是否合并往返，不改变上传摘要复验、修订冲突保护或后台任务语义。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：并发首次读取共享探测；helper 临时失败后可恢复、unsupported 不忙重试；取消结束在途恢复；采样不包含主机地址、命令、凭据或文件内容。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。
