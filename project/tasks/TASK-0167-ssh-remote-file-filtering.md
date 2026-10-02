---
id: TASK-0167
type: task
status: verifying
priority: P1
owner: ssh-transport + desktop
source: user-request; RESEARCH-0018
related_requirement: [REQ-0001]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0158]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport, apps/ssh-helper, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/main/ipc, apps/desktop/src/preload, packages/capability-sdk, packages/plugins]
write_paths: [packages/ssh-transport, apps/ssh-helper, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/main/ipc, apps/desktop/src/preload, packages/capability-sdk, packages/plugins, project/tasks/TASK-0167-ssh-remote-file-filtering.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0153]
conflicts_with: [TASK-0158, TASK-0196]
integration_status: integrated（实现 cfeec25d1，随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-03
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

## 交付记录（2026-10-03，TASK-0196 批次）

- 实际修改（自底向上，适配上游 8c6872ac8 + bb3a23ef8，保留本仓 IncludeHiddenEntries/helper 品牌与后台任务协议）：
  - `packages/ssh-transport/src/remote-command.ts`：`ListFilesRecursiveOptions.names`；`find` 命令在 `-print` 前加 `\( -name a -o -name b \)`，上限只算命中。
  - `packages/ssh-transport/src/ssh-connection.ts`：helper `fs.listRecursive` 透传 `names`；helper 结果恒经 `keepNamedFiles` 按 basename 兜底再筛（旧 helper 不认识该字段也不会漏筛）；exec 路径由命令本身筛选。
  - `apps/ssh-helper/internal/server/fs.go`：`listRecursiveParams.Names` + wanted 集合，遍历中在 limit 判定前过滤；`server_test.go` 新增「命中前筛、上限只算命中」用例；README 说明旧版忽略语义。
  - `packages/capability-sdk/src/foundation/filesystem.ts`：`filesystemBaseNameType`（拒绝分隔符与 `.`/`..`，≤255/项、64 项）与 `ListRecursiveInput` schema 替换 `PathInput`；`foundation.ts` 导出新类型；`docs/capabilities/catalog.json` 由 `catalog:generate` 再生成（+18 行）。
  - `apps/desktop`：`filesystem-service.ts`（`ListFilesRecursiveOptions`，本地 walk 过滤 + 忽略目录并集）、`remote-filesystem.ts`（透传）、`foundation-providers.ts`（解构透传）、`ipc/plugin-capabilities.ts`（`optionalListRecursiveOptions` 形状收窄 + 第三参）、适配器 `capabilities/integrations/plugin/foundation/filesystem.ts`、preload 类型与实现、renderer `plugin-host-apis.ts`。
  - `packages/plugins/plugin-sdk`：`PluginFsListFilesRecursiveOptions` + 签名 + `index.ts` 导出；版本 0.3.11 + CHANGELOG。**版本取舍：上游把本功能定为 2.8.0，但本仓 2.8.0 已用于 Artifact Renderer，fork 版本线独立，故本功能为 Plugin API 2.9.0。**
  - `docs/plugin/conversation-and-agent.md`：`options` 用法与旧宿主兼容说明。
- 实际运行：
  - 红测先行：`ssh-transport`（find 无 names 条件→返回被截断的无关文件）、`capability-sdk`（schema `clean` 剥离未知字段→丢失 names）、desktop 两套件（编译期签名不存在）均按预期红。
  - 绿：`test:pkg ssh-transport`（29 例）、`test:pkg capability-sdk`、desktop `filesystem-service.test.ts` + `filesystem-service.remote-flow.test.ts`（23 通过/1 平台跳过；回环真实 bash 走通 service→remote→exec 全链）。
  - Go：`GOOS=linux GOARCH=amd64 go build ./...` 与 `go vet ./internal/server/` 通过。
  - 批次门禁：`test:changed`、完整 `bun run check`（见回填）。
- 未运行及原因：
  - Go helper 行为回归（`go test`）：本机为 Windows 工具链，`internal/server` 依赖 `syscall.Kill` 等 POSIX 专属，无法在本机构建运行；仓库无 ssh-helper 的 POSIX CI workflow。已用交叉编译 build+vet 与 TS 侧回环真 shell 覆盖 exec 路径；helper 二进制行为待 POSIX 环境或用户验收复跑。
  - 真实远端主机验证：不连接真实主机（任务边界）；回环夹具即远端语义证据。
- 剩余风险：
  - 部署中的旧 helper + 超大远端仓库：命中数超 1 万时旧 helper 仍会先截断（客户端兜底只能筛不能恢复），需新版 helper 部署后彻底消除；正常升级按摘要自动更新二进制。
  - `names` 含 shell 特殊字符时由 `quoteShellArgument` 保护（既有引用路径复用），schema 已拒绝路径分隔符与 `.`/`..`。
