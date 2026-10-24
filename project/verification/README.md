<!-- Copyright The Open Forge contributors. -->
# Verification

这里记录行为合同、测试矩阵、性能基线和质量门禁。新 Verification 使用 [`TEMPLATE.md`](TEMPLATE.md)，详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)。

当前完整基线见 [`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md)。

当前验证：[`VERIFY-0001-local-vetta-baseline.md`](VERIFY-0001-local-vetta-baseline.md)、[`VERIFY-0002-desktop-gpu-low-power.md`](VERIFY-0002-desktop-gpu-low-power.md)、[`VERIFY-0006-deepeval-tool-routing-sidecar.md`](VERIFY-0006-deepeval-tool-routing-sidecar.md)、[`VERIFY-0007-three-framework-tool-routing.md`](VERIFY-0007-three-framework-tool-routing.md)、[`VERIFY-0008-task-tree-consolidation.md`](VERIFY-0008-task-tree-consolidation.md)、[`VERIFY-0009-0.1.2-work-integration.md`](VERIFY-0009-0.1.2-work-integration.md)、[`VERIFY-0010-0.1.2-desktop-functional-visual-acceptance.md`](VERIFY-0010-0.1.2-desktop-functional-visual-acceptance.md)、[`VERIFY-0011-real-provider-acceptance-and-fix-batch.md`](VERIFY-0011-real-provider-acceptance-and-fix-batch.md)、[`VERIFY-0012-0.1.2-verifying-batch-acceptance.md`](VERIFY-0012-0.1.2-verifying-batch-acceptance.md)。 另有 [`VERIFY-0017-behavior-acceptance-checklist.md`](VERIFY-0017-behavior-acceptance-checklist.md)（行为面待验收清单，53 条）、[`VERIFY-0018-qwen38-real-provider-smoke.md`](VERIFY-0018-qwen38-real-provider-smoke.md)（qwen3.8 真实 Provider 冒烟：链路成立、端点输出不连贯立案 ISSUE-0031）。

## 验证记录

| [VERIFY-0023](VERIFY-0023-qwen38-team-notification-real-model.md) | qwen3.8 真实模型团队会话：端点恢复、BUG-0151 通知链路行为验证（2026-10-24） |

## 默认验证顺序

记忆批次交付后复核：[VERIFY-0022](VERIFY-0022-memory-postimplementation-review.md)（2026-10-23：临时库复现跨项目读写；策略、自动/混合接线及测试合同仍有缺口，复核未通过）。

自主研发完整软件与实际环境审计：[VERIFY-0019](VERIFY-0019-autonomous-development-audit.md)（持续验证中，真实 L4 尚未验收）。

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

SSH 专项保护与验证：[VERIFY-0014](VERIFY-0014-ssh-selective-protection.md)。
