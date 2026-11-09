<!-- Copyright The Open Forge contributors. -->
# @vetta/host-protocol

传输无关的 Host 请求合同：方法定义（TypeBox Schema 为事实源）、请求/响应信封、稳定错误码、
owner 插槽注册表、增量 + 快照事件归约，以及按领域划分的方法表（当前：设置）。

- root 出口：合同、`HostDispatcher`（Host 侧分发与校验）、直接 transport。
- `/client` 出口：信封解包与错误还原，运行时不加载 typebox，供 preload / 远端客户端使用。
- 本包不持有 Runtime 状态；`RuntimeHost` 仍是唯一生命周期根（ADR-0084）。边界与安全一方化见
  [ADR-0152](../../docs/adr/0152-host-protocol-boundary-and-first-party-security.md)。
- 来源：PLAN-0029 Phase 2，TASK-0453。

## Context Boundary

```yaml
purpose: Transport-neutral Host request contracts (method schemas, envelopes, stable errors, owner slots, snapshot/delta streams)
provides:
  - "@vetta/host-protocol"
  - "@vetta/host-protocol/client"
consumes: []
internal_dependencies: []
```
