---
id: TASK-0155
type: task
status: verifying
priority: P2
owner: coding-agent + desktop modes
source: user-request; upstream fcde2f517
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0154]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/coding-agent/src/model-context, packages/coding-agent/src/profiles, packages/coding-agent/src/resources/skills, apps/desktop/src/main/agent-modes]
write_paths: [packages/coding-agent/src/model-context, packages/coding-agent/src/profiles, packages/coding-agent/src/resources/skills, apps/desktop/src/main/agent-modes, project/tasks/TASK-0155-prompt-precedence-adaptation.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/coding-agent/src/model-context]
depends_on: [TASK-0154]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 模式、人设、项目说明提示词适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：fcde2f517。

消除沟通/确认策略矛盾、统一交付物格式、工具可用性与技能找不到的提示；保留 Open Forge 执行许可、安全和产品专属指令。生成 modes/personas 只改事实源并再生成。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

交互人设+Coding、项目指令隔离、仅可用工具、用户语言、工具事件身份；软件文本合同与真实模型效果分开报告。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0154。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次吸收泳道 B 后实施）

- 实际修改：
  - coding-agent 侧整块应用上游 fcde2f517（本仓该域为上游前驱态，git apply 干净）：system-prompt-policy.ts 新增指令优先级规则并前置、交付物清单唯一定义（粗体标题/尖括号链接/同名消歧/正文允许链接）、文件名保真与探索工具指引只点名真实可用工具、CLI 指引加标题、非安全规则降强调词；system-prompt-sources.ts、personas-data.ts（再生成）、20-interactive.md（不再声明独立身份、明确让位规则）、skills/prompt.ts（@skill 未命中处理）；新增 personalization-prompt.test.ts 与 system-prompt/agent-modes 测试扩充；ADR-0071 修订与架构文档同步。
  - desktop modes 手工适配（本仓已分叉）：coding/work 两模式与 narration/code-discipline/deliverables-placement partial 的可用性前提、人设让位、项目指令例外、「Personality→Communication」；删除 partials/deliverables-list.md（清单归核心），modes-data.ts 再生成；agent-modes.test.ts 增加不重复定义/可用性前提/优先级衔接三组断言。
  - 生成器配套：build-agent-modes.mjs 与 generate-personas.mjs 剥离提示词源 md 的开发声明头并在产物文件头回写声明（声明不进入产品提示词、再生成不丢声明）。
- 实际运行：
  - agent-modes 17/17；coding-agent 提示词族 56/56（含新增 personalization 7 例）。
  - test:impact→test:changed（公共提示词入口）除 1 例负载假红（McpAppSurface 单跑通过归因）；完整 bun run check 通过（含声明头 ratchet、人格/模式生成物一致性守卫）。
- 未运行及原因：真实模型的人设/模式行为效果评估——软件文本合同已由测试锁定，模型效果属 AI 质量评估层，未获真实 Provider 授权。
- 剩余风险：优先级规则对不同模型遵从度未实测；「交互」人设与 Coding 自主默认的让位语义靠文本合同，长会话漂移需后续评估案例观察。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：本 Task 的验证合同自己写着「**软件文本合同与真实模型效果分开报告**」，故按两层分别处理：文本合同层在主检出逐条复跑并逐条对上用例；真实模型效果层**本轮未执行**，并说明其阻塞原因（见下）。

**第一层：软件文本合同（本轮实跑，全绿）**

| 子句 | 覆盖用例与本次读数 |
|---|---|
| 交互人设 + Coding | `apps/desktop` `agent-modes.test.ts` **17 例全绿**，其中「coding 模式的自主执行默认值让位于要求先确认的人设」「写代码底线允许项目指令要求的重构」；`packages/coding-agent` `personalization-prompt.test.ts`「interactive persona states that it replaces the mode's autonomy default」。 |
| 项目指令隔离 | `personalization-prompt.test.ts`「places persona first and **fences custom instructions under their own heading**」「emits only the custom instructions when the default persona is selected」「emits nothing when neither persona nor custom instructions are set」——人设与项目指令在文本上被分栏围栏，不互相冒充。 |
| 仅可用工具 | `packages/coding-agent` `system-prompt.test.ts`「**names only the exploration tools that are actually available**」；同文件另有交付物链接形态断言（`[filename.ext](<… with spaces …>)` 必须带尖括号、不得退化成裸路径）与「文件名保真」相关的正反例。 |
| 用户语言 | `agent-modes.test.ts`「观察小节只在渲染了成品时出现，**且标题跟随用户语言**」。 |
| 工具事件身份 | `packages/coding-agent` `extension-tool-event-contracts.test.ts`「match the Node built-in tool data exposed through the extension boundary」**通过**。 |
| @skill 未命中 | `personalization-prompt.test.ts`「tells the model how to handle an `@skill` reference that matches no listed skill」。 |

复跑命令与读数：`bun run --cwd apps/desktop test src/main/agent-modes/agent-modes.test.ts` → **1 文件 / 17 例**；`bun run --cwd packages/coding-agent test test/personalization-prompt.test.ts test/prompt-templates.test.ts test/system-prompt.test.ts test/system-prompt-document.test.ts test/plugin-prompt-context.test.ts test/prompt-template-discovery-port.test.ts test/summary-prompt-boundary.test.ts` → **7 文件 / 129 例**；另 `extension-tool-event-contracts.test.ts` → 1 例。全部通过。交付记录写的「agent-modes 17/17、提示词族 56/56」在本轮被更大的文件集（129 例）覆盖且同样全绿。

**第二层：真实模型效果（本轮未执行）**

- 交付记录原文：模型效果属 AI 质量评估层，未获真实 Provider 授权；剩余风险亦记「优先级规则对不同模型遵从度未实测」。
- **本轮多了一条阻塞理由**：用户为测试授权的模型 `qwen3.8/qwen3.8-27b`，其端点在 [VERIFY-0018](../../verification/VERIFY-0018-qwen38-real-provider-smoke.md) 实测中被判定为输出不连贯（任何 prompt 都拿不到可用回复），已立案 [ISSUE-0031](../../issues/ISSUE-0031-qwen38-endpoint-incoherent-output.md)，且该 Issue 的决策触发条件明写「**qwen3.8 被要求作为可用测试/使用模型时必须先闭合本 Issue；此前该 modelKey 不应用于任何真实流程验证**」。也就是说，即便忽略「未授权」这一层，本任务也**没有可用的授权模型**来做「人设/模式遵从度」这类需要判读模型正文的评估。
- 同批 VERIFY-0018 里存在一个已证实可用的对照模型 `glm/glm-5.3-flash`，但用户本轮只点名授权了 `qwen3.8`；用未经点名的模型做行为判读不在授权内，故不擅自执行。
- 结论：这一层留给用户的裁定是——① 先闭合 ISSUE-0031（或换定一个可用且授权的模型）后补做模型效果评估；② 或接受「文本合同层已锁定、模型效果层作为独立 AI 质量议题另行跟踪」，据此闭合本 Task。

- 未复跑（不宣称通过）：交付记录的影响面与完整 `bun run check` 未重跑；人格/模式生成物的再生成一致性守卫（`build-agent-modes.mjs` / `generate-personas.mjs`）随根 `check`，本轮未单独跑。
- 关闭建议：文本合同六条**测试级全部成立**且可逐条指认用例；模型效果层因授权模型不可用而客观阻塞 ⇒ 倾向按上述 ② 闭合。按 VERIFY-0017 约定等用户裁定。
