---
id: TASK-0406
type: task
status: verifying
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@8d0f6f3c19495227d24816e6a5e51cc7620bd538
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014]
related_tasks: [TASK-0407]
related_issues: []
related_bugs: [BUG-0152]
execution: parallel
branch: task/TASK-0406-mcp-candidate-retry
worktree: unassigned（已集成，待推送后清理）
base_commit: 6ebd359b567da1ac46e37327c5178bc9c53fca50
read_paths: [packages/runtime-mcp, packages/runtime-node/src/mcp, apps/desktop/src/main/agent-runtime/mcp-supervisor.ts]
write_paths: [packages/runtime-mcp/src/server/supervisor.ts, packages/runtime-mcp/src/client/lazy-client-handle.ts, packages/runtime-mcp/test/server-supervisor.test.ts, packages/runtime-mcp/test/lazy-client-handle.test.ts]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0154]
integration_status: integrated
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# MCP 候选服务启动失败后的退避重试

## 目标

MCP 配置更新产生的候选首次暂时失败后，后续正常请求能在退避期后重试并恢复，无需重启应用；已有可用代继续服务。冷启动失败不在此次候选重试范围。来源与选择性适配边界见 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md)。

## 范围

### 并发评估

- 结论：按用户新指令使用独立工作树；`execution: parallel` 表示允许隔离工作树，0406/0407 仍依次实施，不并行写入。
- 前置依赖：无；输出作为 TASK-0407 的交付顺序前置条件。
- 冲突文件/独占路径：supervisor、lazy client 与测试；TASK-0154 声明整个 runtime-mcp 写域，但其工作树当前未注册。本轮不与之并行写入，集成前复查；不改动其历史记录。
- Branch：`task/TASK-0406-mcp-candidate-retry`；Worktree：由仓库工具创建并回填；集成负责人：Coordinator。
- 集成顺序：0406 → 0407 → 0408 → 0409。

### 做

- 首先在现有 supervisor fixture 中证明旧实现对失败签名的处理会阻止预期恢复；确认后建立 Bug 并关联本 Task。
- 区分成功应用签名与失败尝试签名/时间；以 30 秒为初始退避，后续正常 refresh/请求驱动重试。退避内重复请求不产生启动风暴，配置变化可立即尝试。
- 候选失败清理候选资源；已有可用 generation 和在途租约按现有合同继续工作。成功后清除失败状态，后续相同配置不重复启动。
- 只读审查发现初始化中的底层连接未被立即关闭；补充 lazy client 的 pending 连接所有权与关闭回归，保持已接纳租约和空闲重连语义。
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

- 工程验证：定向 33 例、影响 65 例、runtime-mcp 全包 84 例及完整 `bun run check` 通过；跨包 `test:changed` 未通过，不能宣称组合验收通过。
- 技术评审：独立只读 `/root/mcp_final_review` 审实际四文件及消费者；关闭 pending 客户端缺口已修复，无本次阻断发现。真实 HTTP/fetch 取消限制属于既有适配器边界，未扩展公共取消协议。
- 集成：integrated；代码候选 `d51a45afc748311d97c8e2827acb851a3b46ef9e` 与记录提交 `51ed65dcc` 已合入本地 main，由承载本记录的 merge commit 绑定；Task 分支已推 origin，main 开发候选按本轮指令待推 origin/dev。
- 人工功能验收：待验收；提供隔离故障恢复场景和实际版本，不使用真实用户服务测试。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本，隔离配置中的可控 MCP fixture 首次启动失败、随后恢复。
- 操作：触发正常工具发现/请求，退避期内再请求，到期后再次请求；追加一次配置变化与关闭场景。
- 预期：提示可理解的启动失败；恢复后同一会话可正常发现/使用工具，旧可用工具和在途调用保留。
- 不通过：仍需重启、频繁启动、旧调用被打断、关闭后重新拉起。反馈写回本 Task/关联 Bug，补对应回归。

## 交付记录

- 实际修改：成功签名与失败尝试/时间分离，30 秒退避由普通刷新驱动；合并同签名并发，拒绝过期候选。保留旧代租约，跟踪并关闭初始化中的候选；不增加后台重放或公开 Schema。
- 工作树：`C:/Users/xquan/Desktop/open-forge-wt/task-0406-mcp-candidate-retry`，branch `task/TASK-0406-mcp-candidate-retry`，基线 `6ebd359b5`。主工作区有其他会话修改，管理记录在主检出回填，候选保留等待依次集成。
- Red：同一恢复用例两次在 30 秒刷新处得到 false；20 个并发刷新曾额外启动 20 个候选。审查后补的 pending close 三处断言也先失败，再修复通过，见 BUG-0152。
- Green：工作树运行 `bun scripts/quality/run-vitest.mjs --run packages/runtime-mcp/test/lazy-client-handle.test.ts packages/runtime-mcp/test/server-supervisor.test.ts`（33/33）；`bun run test:impact -- packages/runtime-mcp/src/server/supervisor.ts packages/runtime-mcp/src/client/lazy-client-handle.ts`（7 文件 65 例）；跨包命令中的 runtime-mcp 全包（10 文件 84 例）；完整 `bun run check` exit 0。
- 跨包：`bun run test:changed --base 6ebd359b567da1ac46e37327c5178bc9c53fca50` 整体红。Coding Agent 1 个配置投影断言遗漏 `createExplicitMemoryRuntime`，主仓未改版本也同样失败；runtime-node 有 EPERM 文件锁与命令超时；CLI 15 个 RPC/进程用例失败。与本项最接近的失败 MCP 初始化用例在未修改 MCP 的 0407 同基线工作树重建 CLI 依赖后也以 20 秒零帧超时失败，因此不能归因于此次退避。其余广域失败尚未全部归因，仍阻断集成/推送。
- Desktop 广域部分已出现远端文件/媒体/命令及技能展示失败；整体明确为红后中止，未完成剩余 Desktop 用例，不计作全量通过。没有改断言、提高超时或修改基线来消除这些错误。
- 对照限制：主仓该 CLI 用例曾单跑通过；只读核对核心 dist 字节后未发现旧时间戳可解释差异，随后改用同基线工作树新构建对照。没有用旧产物一次通过冒充可靠基线。
- 未运行：真实 MCP/Provider、真实 Desktop 和人工验收；既有 HTTP resolveUrl/fetch 的取消能力未重构。未宣称冷启动失败已获退避恢复。
- 协作：原生只读审查 `/root/mcp_review` 先发现 pending 关闭不足；恢复后 `/root/mcp_final_review` 对新候选独立审查并复核广域对照。未参与实现的独立上下文，不冒充不同厂商评审。
- 发布说明：候选碎片 `.github/release-notes/fragments/v0.1.4/task-0406-mcp-candidate-retry.md`；当前 0.1.3 已发布，未改正文或版本，按 WAIVER-0011 待下一次 prepare 确认归属并汇编。发布未授权。

## 2026-10-28 集成指令续接

用户在上述红灯与未运行项说明后要求“提交推送，然后合并入main”，并明确同意一并提交主工作区现有共享文档。按 WAIVER-0012 执行单次开发候选集成：先推已提交 Task 分支，干净 main 按 0406 → 0407 合并，补偿验证必须通过，再普通推送 origin/dev；不发布、不推 origin/main，不将已知跨包红灯改写为通过。实际合并与新验证结果在各次集成提交回填。

- 归属：Open-Forge-only 适配；保留本仓 supervisor/generation/lease 和平台边界，不向 upstream 推送。
- 本次 main 合并无运行时代码冲突；三份共享台账保留较新的 main 内容与授权记录，0408/0409 的台账均保留。
- main 实际复验：`bun run test:impact -- packages/runtime-mcp/src/server/supervisor.ts packages/runtime-mcp/src/client/lazy-client-handle.ts` 为 7 文件 65 例；runtime-node 的 `test/mcp` 为 11 文件 68 例；Desktop supervisor/resource-manager/resource-scope 为 3 文件 12 例；完整 `bun run check` exit 0。前轮全跨包失败与 UI 未运行仍有效。
