<!-- Modified by The Open Forge contributors. -->
# Open Forge · Claude Code

@AGENTS.md

共享规则由上面的原生导入加载；按任务读取目标最近一级规则及相关扩展，通用正文只在 AGENTS 及其扩展维护。

提交拆分、执行提交或报告提交前，读取 [Claude 专属补充](docs/dev/agent-rules/claude.md)。只报告本轮成功提交；修补默认追加提交，amend 需用户在当前对话明确要求；不添加作者或会话尾注。

开发技能正文在 `.agents/skills`，`.claude/skills` 是共享链接。术语查 [CONTEXT.md](CONTEXT.md)，执行状态查 [Project Context](project/context/CONTEXT.md)。
