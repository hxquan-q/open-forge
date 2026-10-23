---
id: TASK-0377
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S3；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0376]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 8f7132a37
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - apps/desktop/src/renderer/domains/memory
  - apps/desktop/src/renderer/domains/project
  - apps/desktop/src/renderer/domains/settings
  - apps/desktop/src/renderer/router.tsx
  - apps/desktop/src/shared/i18n
write_paths:
  - apps/desktop/src/renderer/domains/memory
  - apps/desktop/src/renderer/domains/project
  - apps/desktop/src/renderer/domains/settings
  - apps/desktop/src/renderer/router.tsx
  - apps/desktop/src/shared/i18n
  - project/tasks/TASK-0377-memory-desktop-control-ui.md
  - .github/release-notes/v0.1.3.md
  - apps/desktop/src/renderer/shared/i18n/i18next.d.ts
  - apps/desktop/src/renderer/shared/i18n/index.ts
exclusive_paths:
  - apps/desktop/src/renderer/domains/memory
  - apps/desktop/src/renderer/domains/project
  - apps/desktop/src/renderer/domains/settings
  - apps/desktop/src/renderer/router.tsx
  - apps/desktop/src/shared/i18n
depends_on: [TASK-0376]
conflicts_with: [TASK-0378, TASK-0387]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 记忆查看、纠正、遗忘与设置界面

## 目标

让用户从全局设置和当前项目查看并控制记忆，形成第一批可用功能闭环。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S3）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0376](TASK-0376-memory-desktop-control-api.md)。
- 输出：用户连续流程、错误/可访问性/异步顺序与人工验收包；真实UI留授权后验证。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0376`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0377`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 按既有设计实现列表搜索/范围切换、来源/历史详情、纠正/忘记/暂停和模式选择；少暴露内部技术字段。
- 覆盖空、加载、保存、冲突、失败、暂停与部分可用；先提交页面壳和草稿再启动昂贵准备，键盘/i18n完整。
- 从正常UI串联启用→明确记住→新会话使用→纠正→切项目隔离→忘记→重新打开；组件/Hook和IPC合同证明流程。

### 不做

- 不默认启动verify:ui或常驻dev，不先扩大automatic默认。
- 不以装饰性dashboard或只有成功态替代控制面。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 全局/项目记忆入口正常打开 | 搜索、读来源、更正、忘记和暂停 | 状态/反馈明确，失败保留输入，键盘可操作 |
| 尚未初始化或检索降级 | 进入页面并切项目 | 页面壳先呈现，过期响应不写错项目，语义不可用被如实说明 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：搜索、读来源、更正、忘记和暂停→状态/反馈明确，失败保留输入，键盘可操作；进入页面并切项目→页面壳先呈现，过期响应不写错项目，语义不可用被如实说明。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- apps/desktop/src/renderer/domains/memory/components/MemoryPage.test.tsx apps/desktop/src/renderer/domains/memory/hooks/useMemoryModel.test.tsx`
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
- 预期产物：用户连续流程、错误/可访问性/异步顺序与人工验收包；真实UI留授权后验证。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：隐藏新入口并关Feature，不删除数据/策略，旧页面行为保持。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 合同修正：写域补入 renderer i18n 类型增强/实例（ns 注册必要），fragments 改 v0.1.3.md。
- 实际修改：①`renderer/domains/memory/`（MemoryPage：壳先行 loading/空/失败/重试，模式选择（off/explicit/automatic，保存态）、范围切换、搜索与降级标注、列表分页、详情（修订+来源）、纠正（冲突态、取消）、忘记（确认+来源处理登记）；useMemoryListModel 状态机；memoryControlClient 薄封装）；②i18n：zh/en memory catalog + NAMESPACES/resources 三处注册 + 类型增强；③router 挂 /memory 路由（lazy）。文案全部 i18n（zh/en），操作用原生可聚焦 Button（D03 合同）。
- 实际运行（2026-10-22，win32-x64，jsdom）：定向 6/6（壳先行+空/失败/重试、模式 IPC 保存、详情历史/来源、纠正冲突呈现与重试、忘记传参与清空、搜索降级标注）；完整 `bun run check` 全绿（含 DESIGN/ratchet/类型增强）。
- 未运行：真实 Electron 实机（verify:ui 未授权）；与设置页/项目页导航入口（后续用户反馈决定挂载点，当前路由直达）。
- 承载提交即集成绑定；人工功能验收：待用户在实机打开 /memory 页验证完整流程（启用→记住→新会话使用→纠正→切项目→忘记→重开）。
- 剩余风险：更正 expectedRevision 取自已打开详情长度（未开详情时为 1），冲突时提示重开详情；无障碍深度审计留实机验收。
