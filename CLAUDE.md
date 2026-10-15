<!-- Modified by The Open Forge contributors. -->
# Open Forge · Claude Code

本文件仅为 Claude Code 的发现入口。开始任务先完整读取 [AGENTS.md](AGENTS.md)，并按其中路由读取最近一级规则与匹配的扩展；这里不复制架构、测试、版本或发布政策，也不改变其权限边界。

## 按需读取

- 开发任务进入 [open-forge-task-intake](.agents/skills/open-forge-task-intake/SKILL.md)。
- 拆分提交、执行提交或生成提交报告之前，必须读取 [Claude 专属补充](docs/dev/agent-rules/claude.md)。其中保留原有的拆分要求、提交前动作顺序和七位 Hash 报告格式。
- 术语从 [CONTEXT.md](CONTEXT.md) 检索，项目执行状态从 [Project Context](project/context/CONTEXT.md) 读取，二者不是同一个文档职责。
- 启动或验证 Desktop 必须先获得当前任务授权并读 [开发验证流程](docs/dev/README.md)，不从本入口提供默认启动真实用户环境的命令。

## 即时边界

- 不携带 `Co-Authored-By`、`Claude-Session` 等提交尾注。
- 不使用 `git commit --amend`，除非用户在当前对话明确要求 amend；修补默认追加新提交。
- 只报告本轮实际成功执行的提交，不编造 Hash；具体格式按专属补充。

## 维护

本入口 UTF-8 上限 4 KiB。通用规则回写 AGENTS 的对应扩展，Claude 独有约束写入专属补充，命令以可执行脚本与质量门禁文档为准。源码默认 lite 构建等架构背景参阅 [仓库 README](README.md)，不在此缓存第二份事实。
