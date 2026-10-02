---
id: TASK-0169
type: task
status: ready
priority: P1
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018; RESEARCH-0019; BUG-0061
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158, TASK-0165, TASK-0172, TASK-0178]
related_issues: []
related_bugs: [BUG-0061]
execution: serial
branch: main
worktree: unassigned
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport/src/ssh-connection-manager.ts, packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/ssh2-runner.ts, apps/desktop/src/main/ssh]
write_paths: [packages/ssh-transport/src/process-runner.ts, packages/ssh-transport/src/node-process-runner.ts, packages/ssh-transport/src/ssh-connection-manager.test.ts, packages/ssh-transport/src/ssh-connection.test.ts, packages/ssh-transport/src/ssh2-runner.test.ts, packages/ssh-transport/src/ssh2-runner.loopback.test.ts, packages/ssh-transport/src/ssh-connection-manager.ts, packages/ssh-transport/src/ssh-connection.ts, packages/ssh-transport/src/ssh2-runner.ts, apps/desktop/src/main/ssh, project/tasks/TASK-0169-ssh-connection-lifecycle.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153, TASK-0165]
conflicts_with: [TASK-0158, TASK-0178]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# SSH 配置失效与实时连接状态

## 原规划背景（以下保留历史）

按 hostId/配置代次绑定连接身份，主机更新或删除时清理旧 Client、helper 和转发；处于握手中的旧连接不得在失效后复活。平台缓存和实时连通性分开，迟到 probe/close 不能污染新代次。保留 target 去重、known_hosts、ProxyJump 与两平台后端，不自动重放写入。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：更新端口/私钥→invalidate→新请求使用新配置；删除后同 target 重建不复用旧 Client；握手/probe 迟到、断线和转发清理；真实本地 ssh2.Server 与 manager 公共入口。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。

## 新增的兼容前置

TASK-0165 的 ssh2 交互认证预算/KI 密码回退已有独立参与者在主树实施。本任务须在其验证/集成后以实际新基线适配，不复制旧 ssh2-runner 或覆盖该批 WIP；保留其新增回环与认证测试。

## 集成后合同细化（TASK-0172，2026-10-02）

优先级保持 P1，转 ready 仅表示合同可执行，本轮未实施。0153/0165 已由 TASK-0171 集成，不能再把它们当作主树 WIP。新增 [BUG-0061](../bugs/BUG-0061-stale-ssh-probe-status.md)：真实 manager 源码在 deferred probe 成功返回后出现 connecting→disconnected→connected，已建立失败证据。

- 先覆盖 invalidate 后迟到成功/失败和新旧探测交错；然后处理 hostId 配置代次与 target runner session 的失效接缝，避免修 UI 状态而留下旧 Client/helper/转发。
- 宿主 update/delete 已调用 invalidate，不是缺少调用；不另加平行入口。修改配置/删除/同 target 重建都须验证旧代次不可复活，其他主机不被一起关闭。
- 保留已建立的局部取消/共享连接合同、认证降级、known_hosts 与错误分类。共享 readyPromise 的首调用方预算是当前合同，本任务不直接重设超时策略；若需改变，先单独说明兼容影响。
- 实施范围包括 manager/connection/ssh2 runner 与必要的 process-runner 失效端口、对应测试及 Desktop ssh-runtime/host-service 接线；跨包公共接口需核对生产者/消费者，不私自更改认证策略（与 TASK-0178 串行）。
- 验收：旧 probe/握手在失效后晚到不能广播新状态、安装旧 Client 或残留转发；新代次正常连接，局部请求取消不终止其他合法等待者；一次失败后能恢复。
- 先在 ssh-connection/ssh2 的测试边界用可控延迟和本地 ssh2.Server 回归；cwd packages/ssh-transport 使用 `bun ../../scripts/quality/run-vitest.mjs run src/ssh-connection.test.ts src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts`。manager 专用测试可新增，不复制整套内部实现。
- Desktop 用 `bun ../../scripts/quality/run-vitest.mjs run src/main/ssh`；之后 test:impact、公共合同 test:changed 与完整 check。真实用户主机、真实会话和 UI 未获授权。

当前只有成功迟到的隔离探针已执行，其他流程未测试/未修复。原状态和历史 WIP 描述以上述新基线为准；集成仍 pending。
