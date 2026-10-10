---
id: ISSUE-0033
type: issue
status: draft
priority: P1
owner: packages/coding-agent + packages/ai
related_requirement: [REQ-0001]
related_plan: [PLAN-0006]
related_tasks: [TASK-0074]
related_issues: [ISSUE-0031]
related_bugs: []
source: VERIFY-0017 模型面实测（2026-10-10，glm-5.3-flash 授权验收）
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# artifact 工具 union 顶层 schema 在 glm 网关上不可用：模型 13 次调用全部空参被拒

## 背景

VERIFY-0017 按 [ISSUE-0031](ISSUE-0031-qwen38-endpoint-incoherent-output.md) 的用户裁定改用授权模型 `glm/glm-5.3-flash`（`http://183.36.30.83:16800/v1`，`openai-responses`）补做 TASK-0074 的模型面验收。Debug Profile `04987e4e`、coding 模式、隔离工作区。提示词「请帮我生成一份这个 todo-cli 项目的架构报告，说明模块划分和依赖关系。」

## 已知事实（全部来自会话 JSONL 实录）

- **提示词与 Skill 路由成立**：模型先 `invoke_skill {"name":"report-canvas", ...}` 正确命中内置 Skill，随后 13 次尝试调用 `artifact` 工具——「要报告走 artifact」的提示词目标达成。
- **但 13 次调用 `arguments` 全部为 `{}`**，工具侧一律拒绝 `invalid artifact tool input`（`AGENT_TOOL_INPUT_INVALID`）。模型无法自纠，最终放弃并 `write` 普通文件 `architecture-report.md` 交付，自述「画布工具持续返回参数错误无法创建 Canvas」。⇒ TASK-0074 的端到端产物路径在该授权模型上**断裂**。
- 同一会话中其它工具全部正常带参：`progress`、`dir_tree`、`read`、`write`、`invoke_skill`——适配器与参数存储无普遍缺陷。
- `ArtifactToolInputSchema` 序列化后**顶层是裸 `anyOf`**（5 个 action 变体的 `Type.Union`，共 2 KB）；上述正常工具的顶层都是 `{"type":"object",...}`。
- 适配器 `parseStreamingJson`（`packages/ai/src/utils/json-parse.ts`）对空/不可解析的端点 arguments 静默回退 `{}`——即 JSONL 里的 `{}` 等价于「端点发来的 arguments 为空或不可解析」。
- 工具拒绝信息只有一句 `invalid artifact tool input`，**零 schema 提示**——模型 13 次重试形状完全不变，无自纠路径。

## 未决问题（根因三选一，需 wire 档定谳）

1. **网关不吃非 object 顶层的 function parameters**（主假设）：OpenAI 兼容网关普遍要求 parameters 为 `{"type":"object"}`；裸 `anyOf` 被拒或忽略 ⇒ 函数注册成无参 ⇒ 模型只能发 `{}`。与「13 次形状完全不变」「object 顶层工具全部正常」吻合。
2. glm-5.3-flash 本身填不了 union 形状（模型能力边界）。
3. adapter 对该工具的某类 arguments 编码存在解析边界（可能性最低：同适配器其它工具正常）。

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A：wire 档实抓（重开 Debug 实例 + `VETTA_PROVIDER_OBSERVATION_CAPTURE=wire`） | 直接看端点收到的 parameters 与返回的 arguments，定谳根因 | 需重启实例；wire 含对话正文，只在隔离 Profile 短期用 | 低 |
| B：把 artifact 输入 schema 包成 object 顶层 + `action` 判别字段（可移植 schema） | 对所有 OpenAI 兼容端点可移植，不止修 glm；改一处合同 + 回归 | 触及工具合同，需同步 `artifact-tool-contract.test.ts` 与提示词文案 | 低 |
| C：`invalid_input` 错误信息带上期望形状（action/kind/title/content 摘要） | 模型可自纠，任何根因下都值得 | 极小 | 无 |
| D：端点侧修复（网关运维） | 不改仓 | 本仓拿不到证据，不解决其它端点 | 无法控制 |

## 推荐

先 **C**（错误信息可自纠，任何根因下都是纯收益）再 **B**（schema 可移植化，把「 Union 顶层」这个对兼容性最敏感的形状收敛掉），改完用本 Issue 记录的同一探针（同提示词、同模型）作回归：预期模型一次通过 `artifact.create`。若 B+C 后仍复现，再上 **A** wire 档定谳。

## 决策触发条件

TASK-0074 及一切依赖 `artifact.create` 的模型面验收（含 TASK-0025/0026 的「Review 后产出 Artifact」条款）在该端点上无法给出通过结论，直至本 Issue 闭合或换用不受影响的端点。

## 附注

- 实测期间 Debug Profile 的 `personalization.customPrompt` 还带着上一探针的「PROJ-OK」约定，故该会话回复末行有 `PROJ-OK`——是探针残留设置，不是本 Issue 现象的一部分。
- 会话实录：`~/.openforge-ui-debug/04987e4e/agent/sessions/--C--Users-xquan-AppData-Local-Temp-vetta-0074-artifact--/YTcwYzEyYTItMWYxMC00M2IwLWIwNGQtOTZiM2Q3MTliZTA2.conversation.jsonl`。
