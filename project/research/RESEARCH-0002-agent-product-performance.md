---
id: RESEARCH-0002
type: research
status: adopted
priority: P1
owner: runtime-core/desktop/ai
source: official Zed, Claude Code, Codex, Grok, Pi, Cline, OpenHands, Cursor and Aider materials; exprot/session-memory.md
created: 2026-09-22
updated: 2026-09-22
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
---

# Agent 产品性能与可靠性实践

## 当前结论

外部 Agent 产品反复采用以下模式：

- 自动压缩和保留 response reserve；
- Tool/Context-aware budget；
- 稳定 Prompt cache key 和静态/动态 Prompt 分层；
- 子 Agent 独立上下文并返回摘要；
- Sandbox 与 Approval 分轴控制；
- App Server/JSON-RPC 或事件驱动边界；
- 可中断单步执行和安全 stop point；
- Repo Map、ignore 文件和懒加载上下文；
- GPU/动画可暂停、降级或静态 fallback；
- 用户可见的 token、资源和诊断指标。

## 对 Open Forge 的适配

优先进入 `PLAN-0002`：Provider/Tool/Compaction deadline、single-flight、性能快照、Context budget、Subagent 隔离、GPU 低功耗和故障恢复。

不引入第二套 Session、Harness、Storage 或 Agent Runtime；Pi 只允许通过 `TurnEnginePort` Adapter 评估。

## 来源

- [Zed Agent Settings](https://zed.dev/docs/ai/agent-settings)
- [Claude Code Prompt Caching](https://code.claude.com/docs/en/prompt-caching.md)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference.md)
- [Grok Developer Docs](https://docs.x.ai/developers/grok-4-6)
- [Cline Auto Compact](https://docs.cline.bot/features/auto-compact)
- [OpenHands Agent Architecture](https://docs.openhands.dev/sdk/arch/agent)
- [Cursor Ignore Files](https://cursor.com/docs/reference/ignore-file)
- [Aider Repo Map](https://aider.chat/docs/repomap.html)
