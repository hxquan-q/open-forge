<!-- Copyright The Open Forge contributors. -->
# Bugs

这里记录已确认的缺陷、性能回退和可靠性问题。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/bug.md`](templates/bug.md)。每个 Bug 必须能回答：

```text
用户做了什么？
实际发生什么？
应该发生什么？
如何稳定复现？
根因证据是什么？
哪一个测试会在旧实现失败？
```

## 当前 Bug

| ID | 标题 | 状态 | 优先级 | 关联计划 |
|---|---|---|---|---|
| `BUG-0001` | Session 长任务取消/压缩后的终态与性能问题 | done | P0 | `PLAN-0002` |
| `BUG-0002` | DeepSeek Responses 流事件关联错误 | done | P1 | `PLAN-0002` |
| `BUG-0003` | App Monitor 漏记 Compaction | done | P1 | `PLAN-0002` |
