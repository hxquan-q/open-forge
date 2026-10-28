---
id: TASK-0406
type: task
status: ready
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@8d0f6f3c19495227d24816e6a5e51cc7620bd538
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014]
related_tasks: [TASK-0407]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d
read_paths: [packages/runtime-mcp, packages/runtime-node/src/mcp, apps/desktop/src/main/agent-runtime/mcp-supervisor.ts]
write_paths: [packages/runtime-mcp/src/server/supervisor.ts, packages/runtime-mcp/test/server-supervisor.test.ts]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# MCP 候选服务启动失败后的退避重试

## 目标

相同 MCP 配置首次启动暂时失败后，后续正常请求能在退避期后重试并恢复，无需重启应用。来源与选择性适配边界见 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md)。

## 范围

### 并发评估

- 结论：本批必须串行；执行方式 `serial`，无并行 Task。
- 前置依赖：无；输出作为 TASK-0407 的交付顺序前置条件。
- 冲突文件/独占路径：supervisor 与其测试；当前未申请独占租约，实施前检查其他活跃工作。
- Branch：`main`；Worktree：当前主工作区，不另拆；集成负责人：Coordinator。
- 集成顺序：0406 → 0407 → 0408 → 0409。

### 做

- 首先在现有 supervisor fixture 中证明旧实现对失败签名的处理会阻止预期恢复；确认后建立 Bug 并关联本 Task。
- 区分成功应用签名与失败尝试签名/时间；以 30 秒为初始退避，后续正常 refresh/请求驱动重试。退避内重复请求不产生启动风暴，配置变化可立即尝试。
- 候选失败清理候选资源；已有可用 generation 和在途租约按现有合同继续工作。成功后清除失败状态，后续相同配置不重复启动。
- 输入为已有配置/正常刷新入口；输出为可恢复状态、受控错误和回归证据，不修改公开工具 Schema。

### 不做

不增加后台重试定时器，不自动重放失败工具调用，不绕过配置校验，不改 MCP 工具暴露粒度，不连接真实用户 MCP 服务。

## Given / When / Then

- 同一配置的候选首次启动失败 → 退避期内多次正常请求 → 无额外启动，失败不被标记为已应用。
- 退避时间已到、服务恢复 → 下一次正常请求/刷新 → 启动一次并成功提供工具；用户不必重启 Desktop。
- 退避期间配置发生变化 → 正常刷新 → 可立即按新配置尝试，不被旧失败签名拦住。
- 已有可用 generation 且有在途租约 → 新候选失败或稍后成功 → 旧调用不被提前终止；候选与退休资源最终正确释放。
- 等待/重试时取消或关闭 supervisor → 后续时钟推进/请求 → 不复活已关闭状态，不泄漏客户端或租约。

## 必须保持

延迟初始化、空闲缓存/回收、generation/lease 所有权、配置作用域、工具错误/取消/usage/stop 语义不变；配置无效与连接暂时失败不能不加区分地自动重试。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/runtime-mcp/test/server-supervisor.test.ts`，使用可控时钟和本地假客户端，覆盖上述连续流程、退避边界及既有回收用例。
- 影响面：`bun run test:impact -- packages/runtime-mcp/src/server/supervisor.ts`；若公共生命周期/跨包合同变化，按政策补 `test:changed` 并扩大消费者验证。
- 质量检查：实现完成后 `bun run check`。记录旧实现失败、新实现通过的同一证据；未建立本仓复现前不宣称修复。

## 验收分层

- 工程验证：待执行；本轮仅立项。
- 技术评审：未执行；实施时审核失败分类、旧 generation 保留及关闭语义。
- 集成：pending；未提交功能实现。
- 人工功能验收：待验收；提供隔离故障恢复场景和实际版本，不使用真实用户服务测试。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本，隔离配置中的可控 MCP fixture 首次启动失败、随后恢复。
- 操作：触发正常工具发现/请求，退避期内再请求，到期后再次请求；追加一次配置变化与关闭场景。
- 预期：提示可理解的启动失败；恢复后同一会话可正常发现/使用工具，旧可用工具和在途调用保留。
- 不通过：仍需重启、频繁启动、旧调用被打断、关闭后重新拉起。反馈写回本 Task/关联 Bug，补对应回归。

## 交付记录

- 实际修改：仅新增立项合同与索引，运行时代码未修改；本轮文档验证见 PLAN-0025 的立项交付记录。
- 未运行：上述功能测试、完整检查及用户验收，原因是本轮未实施。
- Worktree：串行规划沿用主工作区，未创建独立 Worktree。
- 剩余风险：失败分支分类及现有 generation 生命周期需在复现中确认；源码证据不能代替运行结果。
- 发布说明：本轮不适用的依据见 PLAN-0025；实施时在届时未发布版本记录实际恢复行为。
