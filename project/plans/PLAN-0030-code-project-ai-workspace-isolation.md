---
id: PLAN-0030
type: plan
status: verifying
priority: P1
requirement: REQ-0031
owner: desktop
created: 2026-11-05
updated: 2026-11-06
depends_on: []
related_requirement: [REQ-0031]
related_tasks: [TASK-0479]
---
<!-- Copyright The Open Forge contributors. -->

# Code 项目 AI 工作区隔离

## 背景与目标

落实 [REQ-0031](../requirements/REQ-0031-code-project-ai-workspace-isolation.md) 与已确认的工作区需求文档。项目源码根继续承担产品交付；Code 项目的 AI 辅助文件进入 Vetta 用户数据目录下按项目隔离的工作区。覆盖本地和 SSH 项目、单 Agent 与 Team。

## 当前事实

- `workspacePath` 是全局工作区根，不是当前项目工作区；项目文件 IPC 当前授权项目根和全局 workspace 根。
- Allstar 项目说明当前写入 `<project>/.vetta/allstar/project-config.md`；Code Prompt 指向该路径。
- Memory rollover 默认把 MEMORY.md / JOURNAL.md 写入会话 cwd。
- 项目登记、Allstar 项目册、会话 cwd 与 Team 项目工作区已存在；文件工具按 cwd 及本机/SSH 适配器分别创建。
- TASK-0423 仍在收尾，配置 UI、Code Prompt 与 Release Notes 是重叠写域；本 Plan 下 Task 与其串行。

## 候选方案与取舍

1. **按显示名或 basename 建目录**：否决。同名项目会冲突，重命名也会改变身份。
2. **按 Allstar 条目 ID 建目录**：否决。历史未登记 Code 会话和同路径普通册/Allstar 册交叉使用时无法稳定解析同一工作区。
3. **按规范化项目位置生成稳定 ID**：采纳。用本地规范化路径，或 SSH 的 host + 远端 POSIX 路径生成不可逆目录键；身份独立于显示名与登记册，路径变更自然成为新工作区。工作区置于 Vetta 用户数据下的专属 Code 项目目录，不把全局 workspace 根授权给 Agent。
4. **把整个 Vetta 数据目录或所有项目工作区加进 Agent 授权**：否决。违反最小权限与跨项目隔离。
5. **仅给远程工具新增本机 `read` 白名单**：不足。Code 需要在本机 AI 工作区保存与编辑辅助材料；SSH 会话需通过本机文件工具访问被单独授权的工作区，同时远端项目文件继续走 SSH。

## 阶段

1. 建立纯路径身份/目录解析与独立迁移服务，先覆盖路径归一、同名隔离、copy-then-delete、失败和冲突合同。
2. 将工作区映射接入 Code Runtime、Memory / Journal 与 Prompt；在 Node、SSH 文件工具路径中只增加当前会话工作区授权，保持项目根原行为。
3. 将项目配置读取/保存改走工作区服务，入口覆盖 Allstar 册和可见 Code 历史项目；同批串接归档/移除/硬删除生命周期。
4. 补齐 Agent/Team、本地/SSH、持久化与权限测试；运行影响面、全仓检查和 Release Notes 格式校验。

## 不做什么

- 不迁移旧 project-config 文件；不移动任何 `.vetta/**` 项目资源、代码、transcript 或桌面日志。
- 不改 Memory / Journal 并发语义，不自动把 AI 辅助文件纳入项目 Git。
- 不启动真实 Desktop、真实模型或真实 SSH 主机，不执行发布/部署。

## 验证与回滚

- 路径、复制迁移、生命周期、权限 resolver 先以 Node 单测证明；IPC/Renderer 配置往返与主进程服务用实际接线的合同/集成测试覆盖；SSH 使用 fake transport 验证本机与远端路径路由。
- 每批定向测试后运行 `bun run test:impact -- <files...>`；多个包及权限合同运行 `bun run test:changed -- <files...>`；收尾执行 `bun run check`。
- 回滚源码可恢复旧行为；新生成工作区为 Vetta 用户数据，不自动删除或迁移。旧 `.vetta/allstar/project-config.md` 保持原位，回滚不会丢失。
- 如果现有 Runtime 文件工具无法在不扩权的情况下访问第二根，先改相应宿主/工具合同，不以全局 Vetta 根或所有项目根作为回退。

## 升级信号

- 同 basename、不同本地路径及不同 SSH host/path 得到不同 workspace identity。
- 相同项目重启/Team session 复用路径；显示名修改不变；路径变化不自动迁移。
- Memory / Journal 失败或冲突时 workspace 仍能启用且源文件保留。
- Agent 探测其他 workspace 或 Vetta 用户数据失败；Code 项目配置入口不依赖 Allstar 登记状态。

## 需要的 ADR

- [ADR-0153](../../docs/adr/0153-code-project-ai-workspace-identity-and-access.md)：项目路径身份、双根工具授权、SSH 本机工作区路由与逐文件迁移合同。
