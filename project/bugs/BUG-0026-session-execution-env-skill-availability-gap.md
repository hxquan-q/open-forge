---
id: BUG-0026
type: bug
status: done
priority: P3
owner: packages/coding-agent
source: BUG-0025 修复过程中的类型检查报错与调用点复核
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: [BUG-0025]
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 会话执行环境路径未转发技能可用性，二进制提示与事实不符

## 用户操作流程

1. 在 Desktop 里连接远端（SSH）项目，或在带沙箱的会话执行环境中工作；
2. 让 Agent 读取项目里的 `.xlsx` / `.docx` 等二进制文档，且当前会话**确实安装了**能处理该格式的技能；
3. Agent 读取失败后按提示决定下一步。

## 实际行为与期望行为

- 实际：这条路径的 `read` 提示恒为
  「No installed skill can handle this format: convert it with a command tool first, or switch to a
  coding mode that has shell access.」——即使会话里就有对应技能可用，提示也不点名它。
- 期望：与其余路径一致——技能可用时点名并让 Agent 直接加载。

## 影响

- 只是**提示文案与事实不符**：模型会绕开已安装技能去做转换，多花几步；不会误导到不存在的技能，
  也不会放宽任何权限或读取范围，因此不构成安全或数据风险。
- 覆盖面：`createCodingAgentSessionExecutionEnvironment` 一族（Desktop 会话执行环境 / 沙箱文件工具）
  的 `read` 注册；主工具环境与 SSH 工具环境（`CodingAgentToolEnvironmentContext`）已正常转发。

## 根因证据与置信度

- 置信度：**高**（类型检查直接给出证据）。
- `runtime-desktop/src/coding-agent-tool-environment.ts` 的三处站点（会话执行环境的 SSH 变体、
  会话文件工具、沙箱工具集）在把 `CODING_AGENT_READ_TOOL_OPTIONS` 交给
  `createNodeFileToolRegistrations` 等入口时，无法读取 `context.availableSkillNames`：
  `tsgo` 报 `Property 'availableSkillNames' does not exist on type
  'CodingAgentSessionExecutionEnvironmentContext'`。
- 该上下文类型（`packages/coding-agent/src/composition/contracts/session-execution-environment.ts`）
  尚未声明该字段，因此这三处只能回退为不转发（已在 BUG-0025 的「已知边界」注明）。

## 最小复现

1. 用会话执行环境路径构造一次 `read` 调用（现有测试夹具：
   `packages/coding-agent/test/**` 中 `createSessionExecutionEnvironment` 相关用例，或 Desktop 的 SSH 项目会话）；
2. 传入 `readOptions` 与一个非空的 `availableSkillNames`；
3. 断言提示中应出现技能名——当前实现不会出现。

## 回归测试

- 待补（与修复同批）：在会话执行环境上下文的构造点用例中断言 `availableSkillNames` 被透传到读工具，
  即修复前必失败、修复后通过。

## 修复与验证

- 修复方向：给 `CodingAgentSessionExecutionEnvironmentContext` 增加可选
  `availableSkillNames?: () => ReadonlySet<string> | undefined`，在其构造点（与技能资源源同层）填充，
  并把 `runtime-desktop` 的三处站点改回「展开 + 转发」。
- 验证：`bun run test:impact --` 覆盖 session execution environment 与会话文件工具的既有用例；
  类型检查通过即为最小证据。
- 未运行及原因：本轮未实施（BUG-0025 已交付用户可见的主路径修复，此项为同一缺陷的边界补齐）。

## 交付记录（2026-09-25）

- 实施：`411e92d88`（技能可用性来源抽成共享模块 `composition/available-skill-names.ts`）+ `b4bc56ce0`（会话执行环境补齐透传，7 文件），集成 merge `1f2c4d2a0`。
- 红测实证：runtime-desktop 2 用例失败（提示未点名技能）、coding-agent 装配点 1 用例失败（`[]` ≠ `['xlsx']`）；修复后 runtime-desktop 50/50、coding-agent 全包通过、`check:quick` 与全仓 `tsgo` 全绿。
- 范围外遗留（已另立 `BUG-0027`）：`apps/cli-host` 三处同类站点；另 `node-session-execution-environment.ts`（deprecated Node SDK 兼容装配）根本不传 `readOptions`，其提示为「无提示」而非失真提示，需单独立项。
- 用户可见说明并入 BUG-0025 的发布说明条目（同一症状，避免重复叙述）。
