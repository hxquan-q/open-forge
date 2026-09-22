# 内核替换评估：Pi 与 Open Forge

## 结论

当前不替换生产内核：

- 保留 `@vetta/ai`；
- 保留 Vetta Agent Engine；
- Pi 作为上游研究和能力吸收来源；
- 未来只有出现明确能力缺口时，才通过 `TurnEnginePort` Adapter 评估 Pi。

## 原因

Open Vetta 的 `packages/ai`、`packages/agent`、`packages/coding-agent` 和 `ecosystem-adapter` 已源自 Pi 并经过大量重写。当前 Vetta 增加了 RuntimeHost、TurnPipeline、Snapshot、Prompt/Tool Frame、权限、MCP、Plugin、持久化和多宿主组合。

直接使用 Pi Agent Harness 会引入第二套 Session、Storage、Compaction、Skills、Tools、Lane 和 Operation，造成重复事实源。

Pi 当前还要求较新的 Node 运行时，并且官方 README 明确其本身不提供文件、进程、网络和凭据权限系统；这不适合作为商用桌面产品的唯一安全层。

## 未来 Adapter 位置

```text
Composition Root
  → runtime-pi-adapter
       → TurnEnginePort
            → RuntimeCore TurnPipeline
```

`runtime-core` 不依赖 Pi；Adapter 只依赖稳定 Runtime 合同和 Pi。第一阶段不使用 Pi Harness 的第二套 durable Session。

## 触发信号

只有同时满足以下条件才启动 Pi Adapter：

1. Vetta Engine 存在明确、可量化的能力缺口；
2. 该能力不能用局部实现吸收；
3. 行为合同测试已存在；
4. Adapter 可独立关闭和回退；
5. Message、Tool、Policy、Checkpoint、Abort、Observation、Error 都能映射；
6. 不引入第二套 Provider/Session/Storage 事实源；
7. 性能或维护收益可量化。

## 不做的事情

- 不直接把 `pi-coding-agent` 嵌入 Desktop；
- 不把 `pi-ai` 与 `@vetta/ai` 双双作为模型事实源；
- 不用 Pi Extension 建立第二公开插件合同；
- 不为了实验修改 Runtime Core 的产品无关边界。
