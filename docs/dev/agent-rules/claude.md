<!-- Modified by The Open Forge contributors. -->
# Claude Code 专属补充

只对 Claude Code 生效；通用规则归 [AGENTS](../../../AGENTS.md) 及其扩展，冲突时按根规则与最近一级 AGENTS 裁决。这里保留原 CLAUDE.md 独有的执行约束，不将它们推广成其他 Agent 的新增规则。

## 提交拆分

**执行拆分边界**：
- **重构与新功能**：绝对拆开。先提交重构（确保行为与原有测试一致），再提交新功能。
- **Bug 修复与杂项（Chore/Typo）**：绝对拆开。即便只是改动 1 个错别字，也必须单独立项提交。
- **功能代码与测试用例**：可同属一个提交，但禁止“只提交功能实现、缺失配套测试”。
- **判断标尺**：若该改动在生产环境可能需要被单独撤销（Revert），它就必须是一个独立的 Commit。

## 提交前检查顺序

在执行任何 `git commit` 命令前，必须按顺序执行以下审查，严禁凭推测提交：
1. **检查暂存区**：执行 `git status` 确认待提交变动范围。
2. **逐行校验 Diff**：执行 `git diff --staged`，逐一排查是否存在无关文件、临时调试代码或意料外的格式化。
3. **同步历史风格**：执行 `git log -5 --oneline`，观察仓库最近的提交前缀与消息风格，严格对齐。

## 限制与公共规则

- **严禁 `git commit --amend`**：除非用户在当前对话中明确要求“amend”。修补上一提交必须追加独立的 fix/refactor commit。
- 提交不携带 `Co-Authored-By` 或 `Claude-Session` 信息。
- 授权、破坏性 Git 禁令、Worktree、中文提交格式与动机正文遵循 [协作规则](collaboration.md) 和 [开发流程](../../../project/collaboration/development-workflow.md)，本补充不新增推送权限。
- 发布说明与当前版本规则遵循 [交付规则](delivery.md)，不是独立维护一份版本基线。

## Commit 报告格式

1. **触发条件**：
   - 仅当在**当前对话中实际执行了 `git commit` 并成功生成提交**时，才必须在最终回复的最底部输出提交记录。
   - 若本轮对话未执行提交（如仅提供排查建议、代码走查或尚未生成提交），**严禁**输出任何 Hash 或编造提交记录。

2. **输出格式**：
   - 无论产生单个还是多个提交，统一在回复的最底部使用 Markdown 无序列表列出。
   - 格式强制规范为：`- \`<short_hash>\`: <commit summary>`（短 Hash 统一固定为 7 位）。
   - 内容须严格提取自实际执行的 Git Commit 第一行标题，严禁自由发散与虚构。

**输出示例**：
- `a1b2c3d`: feat: add user authentication middleware
- `e4f5a6b`: test: add unit tests for token validation
