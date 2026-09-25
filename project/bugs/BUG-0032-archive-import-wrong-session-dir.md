---
id: BUG-0032
type: bug
status: done
priority: P1
owner: apps/desktop
source: agent-browser 现场测试（E:\demo 项目会话归档导入后侧边栏不可见）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs:
  - BUG-0031
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 项目会话归档导入副本写入默认对话目录，侧边栏两处均不可见且幂等失效

## 用户流程

- Given：在某个项目（如 `E:\demo`）里有一条会话；
- When：对该会话「导出可迁移会话归档」，再「导入会话归档」选回该 .ofar；
- Then：导入副本应出现在该项目会话列表中；重复导入同一归档应幂等跳过。

## 实际行为

- 导入提示「已导入为新会话副本」，但侧边栏项目会话列表中看不到副本；
- 展开「对话」组也看不到——副本文件实际被写进默认对话会话目录，
  但其 JSONL 头里的 cwd 仍是 `E:\demo`，被对话组按 cwd 过滤排除；
- 由于指纹索引只扫默认目录，项目分片里的同名会话不参与去重，
  重复导入会不断产生新副本（幂等失效）。

## 期望行为

- 项目会话的导入副本落在该项目 cwd 对应的会话分片目录
  （`agent/sessions/--编码cwd--/`），导入后立即出现在项目会话列表；
- 归档指纹与已有会话一致时按 skip-idempotent 跳过，不产生新文件。

## 环境与失败证据

- 应用版本：dev main；OS：Windows。
- 实测：导入 `读取 README 前三行.ofar` 后文件落在
  `~/.openforge-dev/conversation/.vetta/sessions/*.conversation-002e337f.jsonl`
  （默认对话目录），而 demo 项目会话实际存储在
  `~/.openforge-dev/agent/sessions/--E--demo--/`；
- 「对话」组与 demo 组均不显示该副本；重启/重载后依然不可见。

## 最小复现

1. 在 `E:\demo` 项目里建会话并发一条消息；
2. 「导出可迁移会话归档」保存 .ofar；
3. 「导入会话归档」选该文件；
4. 观察侧边栏：项目列表和「对话」组均无副本；
5. 重复步骤 3：每次都会再写一份新副本文件。

## 影响

- 项目会话的归档导入看似成功实则丢进无人区，用户无法访问导入结果；
- 幂等保护对项目会话完全失效，重复导入静默堆积孤儿文件。

## 根因

`ipc/session-archive.ts` 的 `resolveImportDirectory` 只经
`resolveSessionDirForCwd` 映射 3 个特殊 cwd（默认对话/IM/知识库处理），
项目 cwd 返回 undefined 后兜底为 `DEFAULT_CONVERSATION_SESSION_DIR`——
但项目会话的真实存储是按 cwd 编码的 coding-agent 分片目录
（`codingAgentSessionShardPath`），兜底目录既不被项目列表扫描，
其内文件的 cwd 头又会被对话组过滤器排除，形成「两边都不可见」的孤儿文件。
同一函数 `listKnownFingerprints` 也只扫默认目录，分片内已有会话不参与
指纹去重，导致重复导入不走 skip-idempotent。

## 回归测试

- `resolveSessionImportDir` 单测：特殊 cwd 仍映射到各自目录、项目 cwd
  映射到 `codingAgentSessionShardPath(cwd)`、空 cwd 兜底默认目录。

## 修复与验证

- 修复：
  - `apps/desktop/src/main/conversations/session-paths.ts` 新增
    `resolveSessionImportDir`——项目 cwd 落到 `codingAgentSessionShardPath`，
    空 cwd 才兜底默认目录；
  - `apps/desktop/src/main/ipc/session-archive.ts` 的
    `listKnownFingerprints` 扩扫 `<agentDir>/sessions/` 下全部分片目录，
    恢复项目会话的幂等去重。
- 检查：`bun run check`、`useChatViewModel.archive.test.tsx` 全绿。
- 实机验证：导入 demo 归档后原会话仍在 → 提示幂等跳过；
  删除原会话后导入 → 副本落 `--E--demo--/` 并在列表中可见。
