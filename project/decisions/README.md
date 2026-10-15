<!-- Copyright The Open Forge contributors. -->
# Decisions

架构决策正文的唯一事实源仍是 [`docs/adr/`](../../docs/adr/)。本目录只做项目管理索引，不复制 ADR 正文，也不创建第二套 ADR 模板；新 ADR 必须使用 `docs/adr/` 现有格式。

新增 ADR 时：

1. 先确认 `docs/adr/README.md` 的编号规则；
2. 说明背景、候选、决策、理由、代价和回滚/演进信号；
3. 在相关 Requirement 或 Plan 中链接 ADR；
4. 不把“计划中的架构”写成“已实现行为”。

[`waivers/`](waivers/) 存放 Policy 级规则的到期豁免登记（TASK-0111），格式与校验见 `waivers/README.md`；由 `scripts/quality/check-waivers.mjs` 机械校验。
