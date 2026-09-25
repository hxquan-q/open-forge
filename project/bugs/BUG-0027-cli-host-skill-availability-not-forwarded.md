---
id: BUG-0027
type: bug
status: done
priority: P3
owner: apps/cli-host
source: BUG-0026 修复过程中的调用点复核
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: [BUG-0025, BUG-0026]
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# CLI 宿主工具环境未转发技能可用性，二进制读提示与事实不符

## 用户操作流程

1. 使用 CLI 宿主（`apps/cli-host`，RPC / 无头会话）在带沙箱或会话执行环境的路径中工作；
2. 让 Agent 读取项目里的 `.xlsx` / `.docx` 等二进制文档，且当前会话**确实安装了**能处理该格式的技能；
3. Agent 读取失败后按提示决定下一步。

## 实际行为与期望行为

- 实际：`read` 提示恒为「No installed skill can handle this format: convert it with a command tool first…」，即使会话里就有对应技能可用也不点名。
- 期望：与 Desktop 主工具环境、SSH 工具环境一致——技能可用时点名并让 Agent 直接加载。

## 影响

- 与 `BUG-0025` / `BUG-0026` 同类：仅**提示文案与事实不符**，模型会绕开已安装技能多做转换步骤；不放宽任何权限或读取范围，不构成安全或数据风险。
- 覆盖面：CLI 宿主的三处工具环境注册站点。

## 根因证据与置信度

- 置信度：中（由 BUG-0026 修复时的调用点复核发现，尚未逐行确认 CLI 侧上下文是否已具备技能来源）。
- `apps/cli-host/src/rpc/runtime-host/cli-tool-environment.ts` 三处站点（约 `:44` 主工具环境、`:69` 会话执行环境文件工具、`:85` 沙箱工具集）当前只传 `CODING_AGENT_READ_TOOL_OPTIONS`，未透传 `availableSkillNames`。
- 对照：`BUG-0026` 已在 `packages/coding-agent` 抽出共享 provider（`composition/available-skill-names.ts`）并给 `CodingAgentSessionExecutionEnvironmentContext` 增加可选 `availableSkillNames`；CLI 侧是否已有等价的技能来源需要先在实现前确认。

## 最小复现

1. 依 `packages/coding-agent/test/runtime-core/` 下 BUG-0026 的用例形态，构造 CLI 宿主工具环境注册；
2. 传入 `readOptions` 与非空 `availableSkillNames`；
3. 断言提示中出现技能名——当前实现不会出现。

## 回归测试

- 待补（与修复同批）：在 `apps/cli-host` 对应测试中断言技能可用性被透传到读工具，修复前必失败。
- 若 CLI 侧上下文确实没有技能来源，则先补来源（与 Desktop 装配同层的 provider），再断言。

## 修复与验证

- 修复方向：与 BUG-0026 相同的「展开 + 转发」，复用 `packages/coding-agent` 已有的共享 provider；不改提示语本身、不放宽权限。
- 未运行及原因：尚未实施（BUG-0026 修复时按范围纪律未扩到 `apps/cli-host`，用户另行立项）。

## 交付记录（2026-09-25）

- 实施与集成：`24e3d5dcc`（2 文件，+263/−3），集成 merge `71a130f0e`。
- 前置核实（避免补来源的误判）：CLI 侧三处站点的上游上下文**本就能拿到**技能来源——主工具环境由 `runtime-composition.ts:145` 的 `createAvailableSkillNamesProvider(...)` 填充并经 `runtime-tool-surface.ts:94` 传入；会话执行环境由 BUG-0026 的 `peripheral-assembly.ts:250` 填充，CLI 走同一装配。装配点用例在修复前即为绿（Red 轮 5 例中 2 例通过）即为证。
- Red：`test/cli-tool-environment-skill-availability.test.ts` → 3 failed | 2 passed，失败信息即缺陷症状（三处站点提示均未点名技能）。
- Green：同文件 5/5；集成后复跑 5/5；cli-host 契约回归（`runtime-composition-contract`、`agent-print-mode`）31/31。
- 检查：`check:quick` exit 0、根 `bunx tsgo --noEmit` exit 0、`bun run --cwd apps/cli-host typecheck` exit 0。
- 站点完整性：全仓 grep 确认 `apps/cli-host` 下读工具选项/文件工具注册**只有这三处**，且 CLI 唯一装配路径（`runtime-host.ts prepareRuntimeHost`）覆盖 rpc/print/im 三种入口；`packages/coding-agent` 的 deprecated Node SDK 装配（根本不传 `readOptions`）不在本 Bug 范围。
- 用户可见说明：并入 BUG-0025/BUG-0026 的既有发布说明条目（同一症状），未新增条目。
- 未运行及原因：未跑 cli-host 整包（较慢且会派生嵌套 Node/MCP 子进程），留待协调者的最终门禁串行执行。
