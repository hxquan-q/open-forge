---
id: BUG-0025
type: bug
status: done
priority: P1
owner: packages/coding-agent
source: 现场会话诊断（读 .xlsx 后模型空转）+ 代码复核
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: [BUG-0026]
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 二进制读提示会点名当前会话不存在的技能，把模型引向死路

## 用户操作流程

1. 在 Desktop 里打开一个含电子表格/演示文稿的项目；
2. 让 Agent 读取其中的 `.xlsx`（或 `.docx`/`.pptx` 等二进制文档）；
3. Agent 按 `read` 返回的提示去加载技能，再继续处理该文件。

## 实际行为与期望行为

- 实际：`read` 的二进制提示**无条件**点名技能——命中内置表时点名 `docx`/`xlsx`/`pptx`，
  未命中时直接用扩展名拼一个技能名（`.xlsx` → `Load the "xlsx" skill`）。当会话里没有该技能
  （内置技能未打包、用户关了它、或当前模式不可用）时，提示把模型引向一个不存在的技能：
  模型反复尝试加载、长时间空转，用户看到的是「卡住」而不是「这条路不通」。
- 期望：提示只在**当前会话确实可以调用**该技能时才点名；否则明确说明没有可用技能，
  并给出替代路径（用命令工具转换，或切到有 shell 的模式）。

## 最小复现

```powershell
bun -e "const m = await import('./packages/coding-agent/src/tool-policy/read-tool-policy.ts'); console.log(m.codingAgentBinaryContentHint('.xlsx'))"
# 修复前：Load the "xlsx" skill for instructions on how to handle this file.
```

## 根因

`BINARY_EXTENSION_SKILLS[extension] ?? extension.slice(1)` 把「候选技能名」和「已可用技能」混为一谈：
候选名来自静态表或扩展名，从未与当前会话的技能集核对；`ReadToolOptions.binaryContentHint`
也没有承载可用性信息的入参，调用方即使知道也传不进去。

## 修复

- `packages/coding-agent/src/tool-policy/read-tool-policy.ts`：
  - 新增 `CodingAgentBinaryHintContext`；`codingAgentBinaryContentHint(extension, context?)` 只有在
    `context.availableSkillNames` 里确实存在候选技能时才点名；
  - 候选技能存在但不可用时返回「No installed skill…」并给出替代路径；
  - 删除「按扩展名编造技能名」的回退分支，未知扩展名统一走「没有匹配技能，先用命令工具转换」；
  - 候选表补上 `.docx`/`.xlsx`/`.pptx`，让现代格式也能被正确判定（旧行为是编造名字蒙对的）。
- `packages/runtime-node/src/coding/tools/read/read-tool.ts`：`ReadToolOptions` 新增
  `availableSkillNames?: () => ReadonlySet<string> | undefined`，在调用提示时按调用时刻求值并作为
  `ReadBinaryContentHintContext` 传入；宿主不提供即视为「未知」。
- 可用性来源与 `invoke_skill` 共用同一份资源源：
  `CodingAgentRuntimeToolSurfaceOptions.availableSkillNames` ←
  `createAvailableSkillNamesProvider(promptResourceSource)`（`composition/runtime-composition.ts`），
  经 `CodingAgentToolEnvironmentContext.availableSkillNames` 流入 read 工具选项。
- 三个 Node 工具环境（host / sandbox / node）的 `readOptions` 白名单同步放开该字段。

## 保持的不变量

- `read` 的截断、行号锚点、图片分支、`preserveFullText`（SKILL.md）行为不变；
- `invoke_skill` 未命中技能时的报错文案不变（那是「用户明确调用了不存在的技能」的另一条路径）；
- 技能可见集合与顺序不随工作模式变化（ADR-0071）不变。

## 已知边界

- ~~`CodingAgentSessionExecutionEnvironmentContext`（会话执行环境/沙箱文件工具）尚未携带该字段~~
  **已于 2026-09-25 补齐**：`BUG-0026` 给该上下文加入可选 `availableSkillNames` 并在装配点填充、
  runtime-desktop 三处站点恢复转发（`411e92d88` + `b4bc56ce0`，集成 `1f2c4d2a0`），本条说明随之失效。
- 仍存在的同类面：`apps/cli-host` 三处工具环境站点未转发（见 `BUG-0027`）；deprecated 的
  `node-session-execution-environment.ts` 装配根本不传 `readOptions`，其提示为「无提示」而非失真提示。

## 验证

- 单元：`packages/coding-agent/test/tool-policy/read-tool-policy.test.ts`（可用/不可用/未知/未知扩展名矩阵，
  旧实现下必失败）。
- 契约：`packages/runtime-node/test/coding-suite/read/read-behavior-contract.ts` 新增两条用例，
  断言可用性集合确实传到了注入提示（有 / 无宿主提供两种情况）。
- 回归：`bun run test:impact -- packages/coding-agent/src/tool-policy/read-tool-policy.ts
  packages/runtime-node/src/coding/tools/read/read-tool.ts packages/coding-agent/src/composition/runtime-composition.ts`
- 提交：`f65ba352c`（修复）与 `0f3197e4b`（记录）；已推送 `origin/dev`（2026-09-25，随 18 提交批次 `f1ce23711`）。
