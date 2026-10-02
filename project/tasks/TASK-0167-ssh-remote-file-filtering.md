---
id: TASK-0167
type: task
status: draft
priority: P1
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018
related_requirement: [REQ-0001]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport, apps/ssh-helper, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/main/ipc, apps/desktop/src/preload, packages/capability-sdk, packages/plugins]
write_paths: [packages/ssh-transport, apps/ssh-helper, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/main/ipc, apps/desktop/src/preload, packages/capability-sdk, packages/plugins, project/tasks/TASK-0167-ssh-remote-file-filtering.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153]
conflicts_with: [TASK-0158]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 远端文件名筛选与完整调用链接线

## 目标与取舍

从 TASK-0158 拆出独立底座：适配上游 8c6872ac8 与 bb3a23ef8，仅移植 names/ignoredDirectories 的校验、远端截断前筛选和完整生产者/消费者接线。保留 Open Forge helper 名称/目录；旧 helper 不能伪称找全超出旧 limit 的文件；必要时显式兼容执行。不引入脚本面板 UI。

证据来自 [RESEARCH-0018](../research/RESEARCH-0018-ssh-upstream-optimization.md) 和本次调用链核对；生命周期问题仍需失败复现，不将静态风险宣称为已复现 Bug。draft 不是已经实施。开工前细化实际文件/失败基线，达到 ready 后在隔离 Task Worktree 实施。

## Given / When / Then 与验证

- Given：已登记的 SSH 主机及现有远端项目。
- When：通过正常入口执行本任务下列流程。
- Then：正常文件系统/插件入口→Schema/IPC→remote filesystem→helper/exec fallback；匹配清单位于无关文件之后仍可找出；空 names、非法 basename、忽略目录、旧 helper、取消与权限拒绝；Go test ./... 与 TS 合同测试。
- 使用仓库 Node runner 的定向/用户流程测试、test:impact，公共合同使用 test:changed，完整 bun run check；Go 改动另跑 Go 工具链。实际命令开工核实后回填。

## 不变量与不做项

保护 [VERIFY-0014](../verification/VERIFY-0014-ssh-selective-protection.md) 的现有 WIP、Windows ssh2、认证降级、known_hosts、安全提示、远端权限、helper 品牌及错误/取消语义。手机配对、P2P、中继、远程桌面和移动端不在范围。不连接真实主机或付费 Provider，不启动用户实例，不发布。

## 并发与验收

当前串行规划、没有多 Agent 授权。SSH 共享合同与 TASK-0158 冲突，集成顺序为 0153→生命周期→恢复/筛选/回环（按领域依赖细化）；先从 0158 分离筛选再接脚本面板。主树脏时不合并。工程未执行；技术评审待执行；集成 pending；人工接受待用户；发布未授权。

## 调用链核对补充

- 当前普通入口为 PluginFsApi.listFilesRecursive(rootPath) → plugin-capabilities IPC → foundation filesystem adapter/provider → listFilesystemFilesRecursive → listRemoteFilesRecursive → SshConnection.listFilesRecursive → fs.listRecursive 或 buildListFilesRecursiveCommand。
- 当前 helper 在加入 files 之前应用 limit，尚无 names 过滤；exec fallback 是 find | head。适配时必须在两条路径的截断之前筛选，客户端后过滤不能恢复已经被旧 helper 截掉的匹配项。
- 上游底层只有 6 文件，消费者提交另有 22 文件。不能只合底层就宣称插件入口可用；必须核对 capability schema、preload、renderer plugin-host-apis、SDK 类型导出、插件 API 版本及兼容消费者。
- 本仓 helper 保留 IncludeHiddenEntries、Open Forge 名称/缓存目录与后台任务协议。Go helper 当前不支持 Windows 构建，行为回归需 POSIX Go 环境；Windows 上交叉编译不等于 go test -race 通过。
- docs/capabilities/catalog.json 属于派生产物时先找到生成器，不手改；SDK 版本和文档只按本仓合同增量处理，不复制上游 release notes、包名或版本。
- 下一步先确定旧 helper 能力识别/安全 fallback 与空 names 的稳定语义，再将实际写路径收窄、补可失败用户流程测试并进入 ready；暂不标记已实现。
