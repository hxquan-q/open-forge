# Requirements

这里记录稳定的用户目标、产品边界和可验收行为，不记录具体实现步骤。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

## 当前需求索引

| ID | 名称 | 状态 | 现有证据 |
|---|---|---|---|
| `REQ-0001` | work/coding 本地 Desktop MVP | draft | [`exprot/mvp-scope.md`](../../exprot/mvp-scope.md) |
| `REQ-0002` | Runtime 性能与可靠性基线 | ready | [`exprot/session-memory.md`](../../exprot/session-memory.md)、[`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md) |
| `REQ-0003` | Open Forge 品牌化发布 | draft | [`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) |

## 需求文件最低结构

```yaml
---
id: REQ-xxxx
type: requirement
status: draft
priority: P1
owner:
source:
related_plan: []
updated: YYYY-MM-DD
---
```

正文必须包含：问题、用户结果、范围、不做什么、Given/When/Then、必须保持的不变量、验收标准和风险。
