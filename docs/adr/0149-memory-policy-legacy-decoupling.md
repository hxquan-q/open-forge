<!-- Modified by The Open Forge contributors. -->
# ADR-0149：新记忆策略 memoryPolicy 与 legacy memoryMode 解耦

## 状态

已接受（2026-10-22，REQ-0027 / PLAN-0021 S1，TASK-0369）。

## 背景

现有记忆能力（ADR-0009）是面向 IM 单 owner 的 `memoryMode` 线路：MEMORY.md/JOURNAL.md
文件快照 + 压缩前 flush + rollover continuation。VERIFY-0020（TASK-0367）固化的基线事实：

- Desktop 正常入口不设置 `memoryMode`，配置投影无该字段；
- `memoryMode` 同时改变压缩阈值（minFreePercent ≥30、reserveTokens ≥30%）与压缩收尾
  （memory-rollover continuation 替代 finalizeAutomatic）；
- `memory` 工具 `scopeUse=["im-claw"]`，仅 IM 场景可见；
- IM `/new` 的 flush 是 best-effort 旁路，失败不阻塞。

REQ-0027 需要的是跨会话/项目/宿主的结构化记忆（作用域、来源、修订、遗忘）。若把新能力
塞进 `memoryMode`（例如给 Desktop 打开旧开关再叠加新语义），会把 IM 的 rollover/压缩耦合
一并带给所有宿主，且旧字段含义被迫漂移。

## 决策

1. **新增正交配置 `memoryPolicy`（产品 Session 配置）**：`off / explicit / automatic`，
   含宿主已解析的 `allowedScopes` 与可选模型预算；类型与边界校验位于
   `@vetta/runtime-memory`（ADR-0150）。
2. **旧 `memoryMode`/`memoryFile`/`memoryCharLimit` 语义冻结**：继续只表达 legacy
   rollover 线路；两侧字段互不解释——`memoryPolicy.mode="off"` 不读、不覆盖、不删除
   legacy 字段；legacy 开启也不隐含新策略任何模式。
3. **解析唯一入口 `resolveMemoryRuntimePolicy`**：输入两侧字段，输出
   `legacyRolloverEnabled` 与 `memoryPolicy` 两个独立结果；roundtrip 稳定。
4. **会话边界校验**：`parseCodingAgentRuntimeSessionConfiguration` 接受可选
   `memoryPolicy` 并在首次进入边界时做结构校验（稳定错误码，非法组合拒绝，
   如 automatic 缺预算、off 携带采集预算）。
5. **默认值**：新功能未启用时（未提供 memoryPolicy）一切行为与现状逐字节一致；
   首版 Desktop 缺省 `off`（兼容缺省），`explicit` 在用户开启后生效，`automatic`
   需显式选择 Provider/预算（扩大默认启用须先过 TASK-0388 质量门槛）。

## 取舍

- 不迁移旧字段、不做兼容别名：两条线路并存，各自宿主各自声明；避免一次高危重命名。
- 不在 Kernel/Runtime Core 增加记忆概念：策略是产品 Session 配置，由 coding-agent
  合同与宿主组合解析，Runtime Core 只透传 payload。

## 后果

- coding-agent 会话合同新增可选字段 `memoryPolicy`（向后兼容：缺省即旧行为）。
- 后续切片（0371 存储、0374 工具、0375 接线）消费同一份策略类型；IM legacy 线路
  的回归测试继续以旧字段为准。
- 若未来废弃 legacy 线路，需要独立 ADR 与迁移计划，不得借新策略静默收编。

## 回滚

移除会话合同中的 `memoryPolicy` 字段与解析即可回到旧行为；`@vetta/runtime-memory`
包无运行时副作用，可随特性整体回退而不触碰用户数据。
