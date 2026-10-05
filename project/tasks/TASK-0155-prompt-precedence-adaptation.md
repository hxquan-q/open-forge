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
updated: 2026-10-03
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
