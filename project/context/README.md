<!-- Copyright The Open Forge contributors. -->
# Context

这里保存后续 Agent 必须先读的短上下文，不复制完整研究报告。新增 Context 使用 [`TEMPLATE.md`](TEMPLATE.md)，详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)。

当前长期上下文：[`CONTEXT.md`](CONTEXT.md)，详细历史记忆见 [`exprot/session-memory.md`](../../exprot/session-memory.md)。

维护规则：

- 只写稳定决策、术语和当前工作边界；
- 不写临时调试输出、完整 Prompt、密钥或用户隐私；
- 实现细节放 `requirements/`、`plans/` 或 `research/`；
- 领域术语冲突时从根 `CONTEXT.md` 索引定位 `docs/glossary/` 分册；完整词条只维护在分册，本目录不复制第二份术语正文。
