<!-- Modified by The Open Forge contributors. -->
# Open Forge · Claude Code

先完整读取 [AGENTS.md](AGENTS.md)，按任务路由加载最近一级规则和相关扩展；通用约束只在该入口及其扩展维护。

提交拆分、执行提交或报告提交前，读取 [Claude 专属补充](docs/dev/agent-rules/claude.md)。只报告本轮成功提交；修补默认追加提交，amend 需用户在当前对话明确要求；不添加作者或会话尾注。

开发技能正文在 `.agents/skills`，`.claude/skills` 是共享链接。术语查 [CONTEXT.md](CONTEXT.md)，执行状态查 [Project Context](project/context/CONTEXT.md)。
