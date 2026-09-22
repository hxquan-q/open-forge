# Verification

这里记录行为合同、测试矩阵、性能基线和质量门禁。新 Verification 使用 [`TEMPLATE.md`](TEMPLATE.md)，详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)。

当前完整基线见 [`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md)。

## 默认验证顺序

```text
相关测试文件
  → bun run test:impact -- <files>
  → bun run check:quick -- <files>
  → bun run check
```

- 不使用裸 `bun test`、`bunx vitest` 或直接 `vitest`。
- `bun run check` 不替代行为测试。
- `verify:ui:*` 只有用户明确授权时运行。
- 真实 Provider 默认不运行。
