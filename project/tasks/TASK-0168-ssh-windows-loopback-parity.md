---
id: TASK-0168
type: task
status: draft
priority: P2
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158, TASK-0165]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport/src/testing.ts, packages/ssh-transport/src/ssh-connection.loopback.test.ts, apps/desktop/src/main/filesystem, apps/desktop/src/main/plugins, apps/desktop/src/main/agent-runtime]
write_paths: [packages/ssh-transport/src/testing.ts, packages/ssh-transport/src/ssh-connection.loopback.test.ts, apps/desktop/src/main/filesystem, apps/desktop/src/main/plugins, apps/desktop/src/main/agent-runtime, project/tasks/TASK-0168-ssh-windows-loopback-parity.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153, TASK-0165]
conflicts_with: [TASK-0158]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# Windows SSH 回环夹具与 Desktop 流程适配

## 目标与取舍

从 TASK-0153 拆出 d643c881f：适配 Git Bash POSIX 路径和本地临时目录，保留本仓 setsid 边界、helper 品牌、真实 ssh2 回环。拒绝原样复制一个维护不同取消/输出语义的 Windows runner；优先复用进程端口。保留仅 POSIX/Go 支持的测试平台边界，不删断言冒充跨平台通过。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：Windows 临时目录带空格→URI/文件读写/取消/资源与插件命令流程；端口动态分配，不用保留端口；符号链接无权限时单独报告而非跳过整条流程；POSIX 同套用例继续通过。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。

## 新增的兼容前置

TASK-0165 的 ssh2 交互认证预算/KI 密码回退已有独立参与者在主树实施。本任务须在其验证/集成后以实际新基线适配，不复制旧 ssh2-runner 或覆盖该批 WIP；保留其新增回环与认证测试。
