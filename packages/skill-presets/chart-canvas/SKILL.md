---
name: chart-canvas
description: Render a trend or comparison chart as a Canvas artifact using the declarative chart contract. Use when the user asks for a chart, 趋势图, 折线图, 柱状图, 饼图, 占比, or a visual comparison of numbers — not for prose reports (report-canvas) or module diagrams (architecture-canvas).
---

# Canvas chart

Write one conversation-owned artifact with `contentType: application/vnd.vetta.chart+json`.

## When to use

Use this Skill when numbers need a shape the user can scan: trends over time, comparisons between
categories, or a share-of-total split. Do not use it for a single number (say it in chat), for prose
analysis (`report-canvas`), or for architecture diagrams (`architecture-canvas`).

## Contract

```json
{
  "type": "line",
  "title": "可选标题",
  "labels": ["1月", "2月", "3月"],
  "series": [
    { "name": "收入", "values": [12, 18, 21] },
    { "name": "成本", "values": [8, 9, 11] }
  ]
}
```

- `type` 只能是 `line`、`bar`、`pie`、`area`。
- `labels` 与每条 series 的 `values` 按位置对齐；序列比 labels 短时按 0 补齐。
- `pie` 只使用第一条 series，切片名来自 `labels`。
- **不要写颜色**：渲染层固定消费桌面端 CSS token，深浅主题切换自动适配。
- 数值必须是真实数字，不要写 `"12万元"` 这类带单位的字符串。

## Workflow

1. 只画手上真实的数据。缺数据就先问用户要，不要编造趋势。
2. 调用 `artifact` `create`，`kind: "analysis"`，`contentType: application/vnd.vetta.chart+json`，
   `title` 写清这是什么图，`content` 是上面的 JSON。
3. 用户改需求（换图型、加一条序列）走 `artifact` `update` + `baseVersion`，不要新建第二份图表 artifact。
4. 聊天里只说结论与图放在画布上了，不要把 JSON 再贴一遍。

## Failure modes

- 结构不符合契约时画布会降级成代码视图并提示用户；这时按契约重新 `update`，而不是换 contentType 绕开。
- 图太挤说明选的图型不对：时间序列用 `line`，类别对比用 `bar`，占比用 `pie`。
