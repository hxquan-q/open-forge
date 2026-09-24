---
id: PLAN-0011
type: plan
status: done
priority: P1
requirement: []
owner: scripts/quality + 各包 README
source: RESEARCH-0012（inclusionAI/Avernet 源码取证，commit cb25cad78da4f6c2c8ab5fa83f804fedc5ef21bb，Apache-2.0）
created: 2026-09-24
updated: 2026-09-24
depends_on: [RESEARCH-0012]
---
<!-- Copyright The Open Forge contributors. -->

# 仓库架构治理升级（Avernet 借鉴）

## 背景与目标

`RESEARCH-0012` 对 Avernet 取证后发现：其对 Open Forge 最大的价值不在多 Bot 网络（形态不符，已否决），而是**一整套给「人类+LLM 高速开发」用的架构治理工程**——规则三级分类、带到期日的 waiver、每模块声明式依赖白名单、每协议强制合同测试、结构 PR 门禁。本仓库在多 Agent 并行二开模式下正缺少这类「声明与校验同处一地」的机制。

目标：让架构约束从「集中式门禁脚本里的前缀表」演进为「模块自己声明、测试机械校验」的形态，同时给规则体系加分级与例外到期复审。

## 当前事实

- 现状守卫：`scripts/quality/check-package-boundaries.mjs` 集中式 `LIB_PREFIXES` 前缀表 + `check-coding-agent-architecture.mjs` 等 ~25 个 guard；规则改一处即动守卫文件，声明与模块分离。
- Avernet 参照（证据见 `RESEARCH-0012` 事实来源表）：每模块 README 内嵌 `## Context Boundary` YAML（purpose/provides/consumes/`internal_dependencies` 白名单），arch test 校验未声明 import 即失败，`dependents` 反向视图由测试生成禁止手写；规则分 Invariant/Policy/Guideline 三级，waiver 带规则名/理由/风险/owner/**到期日**；每个 Plugin Protocol 必须有 conformance 套件，`EXEMPT_PROTOCOLS` 是只缩不增的豁免集；PR title 强制 `<type>(<scope>):` 且结构变更 PR 必填合同/消费者/迁移字段。
- 许可证：Avernet Apache-2.0，机制设计可直接采纳，片段级引用保留声明。

## 候选方案与取舍

- **声明式边界（采纳）**：`internal_dependencies` 白名单写在各包 README，arch test 统一校验；新增包改的是自己的声明而非中心守卫表。
- **保留集中前缀表（否决）**：继续靠 `check-package-boundaries.mjs` 单点维护，包一多即成为协调热点，且无法表达「本包允许依赖谁」的反向声明。
- **waiver 只记不带到期（否决）**：临时例外永久化是治理熵增的主因，到期日强制复审是低成本约束。
- **TaskGuard 引擎移植（否决入本计划）**：DAG 工作流是产品功能面，本仓无对应 Requirement；其 Runner/Controller/TaskFlow 三分层与单模板保类型透传记入 `RESEARCH-0012` 触发信号，等 workflow 需求立项时再启。

## 阶段

- 阶段 A（声明与校验）：`TASK-0110` Context Boundary 声明 + arch test + `dependents.md` 生成。
- 阶段 B（规则治理）：`TASK-0111` 规则三级分类 + waiver 机制 + red-flag 评审清单。
- 阶段 C（合同与门禁）：`TASK-0112` 协议 conformance 套件映射、`TASK-0114` PR 结构门禁。
- 阶段 D（审计，结论待定）：`TASK-0113` skill 落盘布局审计——核查未激活 Skill 是否会被递归扫描发现，再决定是否需要 pool/active 物理分离。

## 不做什么

- 不引入 BCS 多 Bot 网络/协调服务（`RESEARCH-0012` 已否决，形态不符）；
- 不移植 Avernet 的 Python/Rust 工具链本身（import-linter/cargo），只借鉴规则形状；
- 不做 `CONTEXT.md` 全仓术语表（P3，现阶段包级 AGENTS.md 已覆盖，先观察术语漂移是否成问题）；
- 不把既有 `check-package-boundaries.mjs` 立刻废弃——阶段 A 落地后与新声明并行运行一个校验周期，确认等价覆盖再收编。

## 验证与回滚

- 阶段 A 的完成标准是**差分一致**：新声明机制报出的违规集与既有前缀表守卫结果对比，只允许新增真实违规，不允许漏报。
- 所有治理改动均为仓库内文件 + CI 脚本，回滚即删文件/还原门禁；无用户可见行为变化。
- waiver 机制的验收样例：为一个既有违规登记 waiver（带到期日），到期前 arch test 放行、到期后报红。

## 升级信号

- 包数量持续增长或新包边界违规复发 → `TASK-0110` 提前为 P0；
- 「临时放宽」类注释/waiver 在守卫脚本中累积 → `TASK-0111` 提前；
- workflow/DAG 编排需求立项 → 回查 `RESEARCH-0012` TaskGuard 段并单独立项。

## 需要的 ADR

`TASK-0110` 落地即改变包边界规则的声明形态（集中表 → 每模块声明），属于跨模块的架构行为变更——实施时补一篇 ADR 记录决策与迁移路径；其余任务不需要。
