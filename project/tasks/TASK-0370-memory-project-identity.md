---
id: TASK-0370
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S1；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0369, TASK-0371]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 17861fae7
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - apps/desktop/src/main/projects
  - apps/desktop/src/main/conversations/session-paths.ts
  - packages/ssh-transport
  - packages/runtime-memory
write_paths:
  - apps/desktop/src/main/projects/memory-identity.ts
  - apps/desktop/src/main/projects/memory-identity.test.ts
  - apps/desktop/src/main/projects/memory-identity-storage.ts
  - apps/desktop/src/main/projects/memory-identity-storage.test.ts
  - project/tasks/TASK-0370-memory-project-identity.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/main/projects/memory-identity.ts
  - apps/desktop/src/main/projects/memory-identity.test.ts
  - apps/desktop/src/main/projects/memory-identity-storage.ts
  - apps/desktop/src/main/projects/memory-identity-storage.test.ts
depends_on: [TASK-0369, TASK-0371]
conflicts_with: []
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 稳定项目记忆身份与 Worktree 关联

## 目标

将记忆scope绑定稳定身份，处理同名仓库、临时cwd、路径迁移与同仓Worktree，保留现有项目主键。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S1）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0369](TASK-0369-memory-runtime-contracts.md)、[TASK-0371](TASK-0371-memory-sqlite-revision-store.md)；身份映射使用已交付的同库存储合同，不另造文件事实源。
- 输出：身份映射持久化/重启合同、碰撞测试与供Desktop/CLI注入的受控输入。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行；依赖SQLite同库身份存储，不能与TASK-0371同时交付未收敛的映射持久化。
- 执行方式：`serial`。
- 可并行Task：当前无并行代码承诺，独立只读调查可并行。
- 前置依赖：`TASK-0369`、`TASK-0371`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。本Task串行，不创建独立Worktree；若改并行先更新合同并重做写域门禁。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 实现principal/profile及project UUID、location alias、authority、workspaceView映射，宿主输入经校验后生成允许scope。
- git-common-dir仅产生关联候选；未确认Worktree不共享，确认后仅共享项目事实而隔离任务/分支假设。
- 覆盖无Git目录、对话UUID子cwd、同名clone、Windows大小写/链接、SSH路径及明确移动/副本映射。

### 不做

- 不重写ProjectEntry/cwd全局主键，不仅凭remote或basename共享。
- 不访问真实SSH、不自动迁移旧目录或跨IM身份共享。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 同名独立仓库与同仓两个Worktree | 解析身份并确认其中的同仓关联 | 前者隔离，后者共享项目scope且view不同 |
| 已绑定项目换路径或导入成副本 | 走显式重新关联或复制映射 | 移动保留ID，副本新ID，旧会话路径不被重写 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：解析身份并确认其中的同仓关联→前者隔离，后者共享项目scope且view不同；走显式重新关联或复制映射→移动保留ID，副本新ID，旧会话路径不被重写。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- apps/desktop/src/main/projects/memory-identity.test.ts apps/desktop/src/main/projects/memory-identity-storage.test.ts`
- 质量检查：实际实施按选定文件运行test:impact与check:quick，代码任务完成运行完整 `bun run check`；完整检查不替代行为测试。
- 仅使用仓库Node runner；不裸跑bun test或直接Vitest。Go命令在 `apps/im-gateway` 执行，根检查不替代Go。
- 不默认启动dev或verify:ui，不调用真实Provider；真实模型质量、跨平台/真实窗口证据无授权或无环境时单列未执行。
- 当前版本发布碎片在实施时按Desktop manifest核实；并行Worker不改汇编正文或公共索引。

## 验收分层

- 工程验证：待执行；必须绑定版本、实际命令、上述GWT结果和未运行项。
- 技术评审：未执行；允许的评审方式与实际发现届时记录，不伪造独立评审。
- 集成：pending；尚无实现commit/Worktree，不因建Task而标integrated。
- 人工功能验收：待验收；工程完成后提供正常入口验收包，用户沉默不算接受。
- 发布：未授权；Task存在和工程完成都不自动发布。

## 功能验收包

- 入口与前置：前置依赖工程验证通过并在隔离状态中装配本Task能力；本轮尚无可用新功能。
- 操作步骤：按GWT的连续路径执行，覆盖明确失败/取消或越权分支。
- 预期产物：身份映射持久化/重启合同、碰撞测试与供Desktop/CLI注入的受控输入。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：关闭新记忆解析器并保留映射记录，不改项目目录与旧列表。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：新增 `apps/desktop/src/main/projects/memory-identity.ts`（principal/project UUID/location alias/authority/workspaceView 解析：alias 规范化与大小写不敏感比较、git-common-dir 仅产生关联候选、confirmWorktreeAssociation 显式确认、moveProjectBinding 保留 ID、copyProjectAsNewBinding 新 ID、resolveConversationProjectRoot 子 cwd 归属、SSH 客户端命名空间不回落本机目录、allowedScopes 受控输出）与 `memory-identity-storage.ts`（JSON 注册表：版本标记、原子写 tmp+rename、损坏/不兼容显式报错不静默重建、重启 roundtrip）；不重写 ProjectEntry/cwd 主键。
- 存储位置说明：本切片注册表是身份映射唯一事实源（desktop 记忆状态目录 identity-registry.json）；runtime-memory v1 schema 已在 SQLite 预留 memory_identity_bindings 表，宿主接线（0375+）按行平移入同库，不双写。
- 实际运行（2026-10-22，win32-x64）：`bun run test:impact` 定向两文件 13/13 全绿（同名仓库隔离、Worktree 候选/确认/view 隔离、移动/复制、Windows 大小写分隔符、对话子 cwd、SSH、损坏注册表报错、重启 roundtrip）；完整 `bun run check` 全绿。
- 未运行：真实 SSH 连接（不访问，仅客户端命名空间）；真实用户状态目录（未接线，Feature 关闭）；UI。
- 承载提交即集成绑定；人工功能验收不适用（内部解析层，用户入口在后续控制面切片）。
- 剩余风险：确认关联后的跨项目事实共享在检索层（0372/0374）实现；Worktree 探测输入（gitCommonDir）由宿主接线时提供真实值。
