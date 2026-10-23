<!-- Modified by The Open Forge contributors. -->
# @vetta/runtime-memory

无 I/O 的 Agent 记忆协议合同包：作用域与授权、修订与双时态选择、遗忘屏障、
新旧记忆策略（`memoryPolicy` 与 legacy `memoryMode`）的类型、Schema、稳定错误
与共享 fixture。Node/Electron/产品宿主共同消费；具体 SQLite 实现位于
`@vetta/runtime-node`，产品策略位于 `@vetta/coding-agent`。

- 协议正文：`src/`（root 出口为合同面，`/fixtures` 子出口为测试夹具，不进入生产依赖图）
- 决策记录：[ADR-0149](../../docs/adr/0149-memory-policy-legacy-decoupling.md)、
  [ADR-0150](../../docs/adr/0150-runtime-memory-contract-package.md)
- 上游任务：REQ-0027 / PLAN-0021（S1，TASK-0369）

## Context Boundary

```yaml
purpose: Platform-neutral agent memory contracts (scopes, revisions, temporal selection, erasure, policy schemas)
provides:
  - "@vetta/runtime-memory"
  - "@vetta/runtime-memory/fixtures"
consumes: []
internal_dependencies: []
```
