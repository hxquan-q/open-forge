<!-- Modified by The Open Forge contributors. -->
# 应用内可见会话复测（2026-07-18）

## 问题纠正

上一轮 `conversation.create` 的 `cwd` 指向：

```text
docs/adapter/claude/fixtures/hook-smoke
```

该路径不在 `desktop-config.projects` 中，侧边栏不会出现对应项目，因此用户在应用里“看不到会话”。

会话仍落在 `~/.vetta/agent/sessions/<encoded-cwd>/`，但这是**所有** Desktop/Agent 会话的统一存储，不是旁路存储。

## 本次正确做法

| 项 | 值 |
| --- | --- |
| 项目 cwd | `C:\develop\yiyun\vetta-mono`（已在侧边栏 projects） |
| Hook 配置 | `C:\develop\yiyun\vetta-mono\.vetta\claude-hooks.json` |
| 脚本 | `.vetta/claude-hooks/*.cjs` |
| sessionPath | `~\.vetta\agent\sessions\--C--develop-yiyun-vetta-mono--\2026-07-18T06-46-25-367Z_7948ddee-....jsonl` |
| 自动标题 | `ClaudeHook UI可` |

## 结果

### Debug / 日志

1. **SessionStart**：`claude handlers loaded` total=3；dispatch SessionStart Completed  
2. **UserPromptSubmit `/cdt`**：`DEBUG_CONVERSATION_FAILED`，文案含 `CDT requires Agent Teams (UI-visible project fixture)`  
3. **PreToolUse Write**：助手引用 `Write blocked by Claude PreToolUse (UI-visible project fixture)`；`claude-hook-ui-write-test.txt` 不存在  
4. **conversation.list** 对 `cwd=vetta-mono` 首条即为本会话  

### 应用 UI（Playwright）

进入 `#/project/.../vetta-mono` 后侧栏可见：

```text
vetta-mono
ClaudeHook UI可
2 分钟
Playwright闭环验收
...
```

`hasClaude: true`。此前停在 `#/new-session/...` 时，侧栏默认展开的是「对话」分区会话，容易误以为 vetta-mono 下没有新会话；点开 **vetta-mono 项目** 后即可看到。

## 本地查看方式

1. 打开 Vetta Desktop  
2. 侧边栏点 **vetta-mono**  
3. 点会话 **ClaudeHook UI可**  
4. 应看到首轮 `session hooks ok` 与后续 Write 拒绝说明  

## 清理说明

- 验收用的 `.vetta/claude-hooks.json` 与 `.vetta/claude-hooks/*.cjs` 目前在 monorepo 根目录，**未 gitignore**，会显示为 untracked  
- 历史环境曾为验收创建这些文件；**不要直接删除整个 `.vetta/` 目录或照搬旧机器路径**。若需清理，应先确认当前检出和目标文件确由本次验收创建、检查是否含用户数据，并取得对应授权后仅处理明确的文件。
- 文档向 fixture 仍在 `docs/adapter/claude/fixtures/hook-smoke/`（可提交）  
