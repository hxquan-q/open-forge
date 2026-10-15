---
id: TASK-0149
type: task
status: done
priority: P1
owner: ai
source: user-request; upstream 6a325e8b4
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: [BUG-0053]
execution: parallel
branch: task/TASK-0149-anthropic-gateway-thinking-compat
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ai/src/providers/anthropic/response-schema.ts, packages/ai/test/provider-conformance.test.ts]
write_paths: [packages/ai/src/providers/anthropic/response-schema.ts, packages/ai/test/provider-conformance.test.ts, project/tasks/TASK-0149-anthropic-gateway-thinking-compat.md]
exclusive_paths: [packages/ai/src/providers/anthropic/response-schema.ts]
depends_on: [TASK-0148]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# Anthropic 兼容网关思考块校验

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：6a325e8b4。

只允许 thinking 块开始事件省略 signature；保留后续 signature_delta、usage、stop、取消和错误。不得覆盖本仓共享重试预算、工具 schema 清理或错误分类。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

fixture SSE 正常/缺签名/错误签名类型、工具、usage、终止、取消与已有 Provider 合同。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：无。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 本轮独立工作区合同

只迁移本 Task 两个 AI 文件与自身 Task 记录，基线仍由仓库 CLI 从已提交 main 取得，不携带主树 UI 或其他 Agent 修改。共享导航索引和 release notes 由 Coordinator 在主检出按行追加，本 Worker 不写共享发布文件；集成时仍须确认本 Task 的发布文案已包含。候选文案：兼容省略初始思考签名的 Anthropic 网关，仍拒绝错误类型并保留后续签名与流式终态。

已有主树候选在 3 文件 82 个定向、AI 相关 17 文件 243 个测试中通过；独立复制前重新检查实际 diff，隔离验证和完整 check 后才交付，不沿用主树快照作为最终证明。

## 已验证依赖装配

Worktree 创建基线为 main@1cbe27c53；在任何本 Task 实现写入前，快进装配已完成的 TASK-0148（1020b7c59）作为验证依赖。此操作只影响本 Task 独立分支，不改 main，不引入主树 WIP。后续提交只包含本 Task 的 AI 文件与记录，依赖提交单独保留，集成顺序为 0148 → 0149。

## 隔离交付证据

- 只改 thinking start 的 signature 为可选，其他字段仍按 TypeBox 校验；错误类型 null/number 仍拒绝，无签名终态不捏造签名。现有 unsigned thinking 回放转换仍由 messages.ts 处理，未覆盖重试预算或消息转换。
- `bun run --cwd packages/ai test`：62 文件、488 测试通过；默认配置排除 integration/live，不使用真实 Provider。
- `bun run test:impact -- packages/ai/src/providers/anthropic/response-schema.ts packages/ai/test/provider-conformance.test.ts`：直接 18 测试、相关 17 文件 243 测试通过。
- `bun run check`：lint、types、guards、mobile-lint 全部通过。随后仅回写记录。
- 技术评审为源码自审；正常文本、thinking、工具、错误、取消和 usage/stop 由现有 provider conformance/回归覆盖。
- Coordinator 已将候选文案追加到主检出 0.1.3 的修复节，不覆写既有条目；本 Worker 不提交主检出发布文件。集成时核对该条保留。
- 工程验证通过，人工网关验收尚未执行；保持 verifying，集成 pending、未推送、未发布。

## 已提交隔离结果

提交 7a2a5ce509f9f567de2eb73cc7fd39d3344bdb6a，位于 task/TASK-0149-anthropic-gateway-thinking-compat，父依赖为已验证的 1020b7c59。AI 全包 62 文件/488 测试、test:impact 的直接 18/相关 243 测试、完整 check 通过。发布文案已由 Coordinator 追加主检出修复节；未合入 main、未推送。用户网关实测未授权，保持 verifying。


## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0149-anthropic-gateway-thinking-compat；来源提交：7a2a5ce509f9f567de2eb73cc7fd39d3344bdb6a。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0149。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。

### 用户裁定闭合（2026-10-10，VERIFY-0017 分档口径；用户授权托管批量裁定）

按「按未覆盖成因分档」口径裁定（用户已授权托管批量闭合）。

- **合同测试层成立**：验证合同本身是 fixture SSE 七类（正常/缺签名/错误签名类型、工具、usage、终止、取消），交付记录 `provider-conformance` 直接 18 例 + 相关 243 例、AI 全包 488 例通过。
- **「经兼容网关」行的验收对象在当前环境不存在**：本仓当前配置与授权的网关端点（qwen `:18081`、glm `:16800`）均走 `openai-responses` 协议，**没有 Anthropic 协议端点**可发起该行要求的真实调用——与 TASK-0168「Windows CI 缺 bash 前置需 CI 环境」同类客观限制。旁证：本轮 glm 会话中思考块（含签名 JSON）经适配器流入、校验与渲染全程健康（0074/0025 会话实录），说明思考块校验链路在真实 Provider 上工作正常，只是协议不同。
- 若用户日后提供 Anthropic 协议网关端点，可按本记录冒烟一次；该冒烟不属本任务闭合前置。
