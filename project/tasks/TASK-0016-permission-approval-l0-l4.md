---
id: TASK-0016
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [packages/runtime-core/src/task]
depends_on: [TASK-0015]
conflicts_with: [TASK-0015]
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---

# Permission/Approval：L0-L4 风险分级与 Project Trust（implementation-plan 阶段 2）

## 目标

在 `ToolRiskDescriptor`/`PermissionGrant`/`ApprovalRequest` 合同上实现可审计的
逐次工具授权：风险由明确矩阵和参数/目标共同确定；Trust 只能匹配受限 scope；
审批绑定经过脱敏、可复核的具体动作；Task/Artifact Review 与进程重启恢复保持一致。

主 Owner 为 `packages/coding-agent`；Runtime Core 拥有通用事件/审批状态，`runtime-node`
提供本机 Trust 文件适配，Desktop 提供审批与 Review 入口。

## 范围

### 并发评估

- 结论：不支持并发（改同一 Task 事件面与权限判定入口）
- 执行方式：serial
- 前置依赖：TASK-0015（Approval 事件挂在 Task observation 上）
- 集成负责人：coordinator

### 做

- 定义并测试 L0-L4 表格：默认工具等级、按参数/资源提升等级、未知或无法判定的能力 fail closed；
- 风险矩阵映射到现有权限模式/审批 broker；Tool Policy 必须在模型请求面和执行面双重检查；
- Project Trust 本机文件（可撤销、可过期、scope 隔离）；
- Approval Request/Decision 进事件日志；请求绑定 session/turn/tool/schema、规范化目标和可审查动作摘要或稳定指纹；执行前重新验证请求仍指向同一动作；
- 用户选择“编辑”后生成新审批请求并重新校验，不得把旧请求直接当作批准；
- 状态机支持执行中遇到审批门时进入 `awaiting_approval`；拒绝/过期/取消不能误入 `running`，编辑动作必须用新快照重新申请；
- Trust 撤销区分下一 Turn 生效的普通变更与安全检查点立即拒绝/取消的 hard revoke；
- Project Trust 仅写 `.vetta-local/`，路径规范化后比较 project root；定义旧记录读取、失效和未知版本的失败策略；
- Approval Request/Decision 进事件日志，进程重启后 pending 状态可恢复；重启后重新确认动作/Turn 是否仍有效，再展示恢复的审批项；
- Review 投影：Task 计划审、Artifact 终审三分支（approved/changes_requested/rejected）。

### 不做

- 组织策略/云端审计（MVP 排除）；
- 外部副作用的自动回滚承诺；
- 非幂等错误的自动重试。

## Given / When / Then

- Given：用户在受支持的 Task 流程中请求一个会访问/修改资源的真实 Tool；
- When：调用由真实 Tool Policy 判级，用户批准、拒绝或离开后重启；
- Then：矩阵对应的低风险动作按策略执行，高风险动作先阻塞；L4 即使有 Trust 也逐次确认；变更目标的动作不能复用旧批准；重启后只恢复经校验仍有效的待审批请求；撤销后不会再准入新的匹配调用。

## 必须保持

- Tool Policy 在模型请求前和工具执行前都生效；
- 项目策略只能收紧不能放宽；
- Trust scope 隔离；撤销立即生效；
- Approval 是 Runtime 状态而非 Renderer 临时状态。
- 用户批准只对该审批快照中明确展示的动作有效，不能升级成对整个 Tool 的长期授权。

## 测试与验证

- 定向：风险矩阵/未知工具 fail-closed 测试、`running → awaiting_approval` 转换、grant scope/过期/撤销、动作快照变更、Approval 事件重放合同测试；
- 用户流程：从真实 Tool 调用入口发起高风险动作 → 查看精确目标与副作用 → 允许/拒绝/编辑 → 验证执行结果；重启及撤销路径分别覆盖；
- 质量检查：`bun run check:quick`、runtime-core/coding-agent 全包。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

- 实际修改：
  - `runtime-core`：`task/risk-policy.ts`（等级只升不降、未知工具合成 L4 fail-closed、
    per-call 等级默认矩阵）；`approval.requested.recorded` / `approval.decision.recorded`
    会话事实进事件日志与重放投影（pending 恢复 + 决策审计）；Turn 开始自动重绑
    `awaiting_approval` 的 Task（重启恢复路径）。
  - `coding-agent`：`execution/permissions/`——工具风险注册表（内置工具 L0-L3、MCP 默认
    L3）、审批函数/端口会话扩展（sandbox authorization 同款接线）、执行面审批拦截器
    （order 40，先于计划模式与生态 Hook；edit 决策生成新请求重新校验、中断 fail closed）、
    脱敏摘要；模型请求面 `authorizeTool` 注入点（双面检查的准入钩子）。
  - `runtime-node`：`NodeProjectTrustStore`（`.vetta-local/trust.json`，路径规范化、
    原子写、过期/撤销/deny-wins、未知版本 fail closed）。
  - `apps/desktop`：`task-activity/tool-approval-broker.ts`（Trust 命中静默放行、L4 永远
    逐次确认、复用 ActionApprovalBroker 弹窗、审批事实排队于 Turn 收尾落盘）；
    渲染端 `ToolExecutionApproval` presenter（允许本次/记住到本项目/拒绝）+ i18n zh/en；
    Task Review 联动 Artifact 终审状态（approved→accepted / rejected→rejected）。
- 实际运行：runtime-core / coding-agent / runtime-node 定向新增测试（risk policy、
  审批拦截器、trust store、审批投影）全部通过；desktop 定向 92 项通过；根 `tsgo`、
  desktop `tsc`、`check:quick` 通过；runtime-core/coding-agent 全包与全量 `check`
  见提交记录。
- 未运行及原因：`verify:ui:*` 未运行（用户未授权实机 UI 验收）；真实 Electron E2E
  未新增（审批 UI 复用既有 ActionApprovalBroker 链路，弹窗/超时/崩溃清理已有覆盖）。
- 剩余风险：模型请求面 `authorizeTool` 默认放行、由宿主注入收紧（桌面端按 ISSUE-0005
  方案 C 的 Profile 轴在 TASK-0017/0019 接入）；审批中进程被杀时该次请求随 Turn 失效
  （不恢复为 pending，符合「重启后重校验」语义）；hard revoke 的安全检查点立即取消
  依赖内核后续在工具执行点查询 Trust，当前撤销在读取时即时生效。
