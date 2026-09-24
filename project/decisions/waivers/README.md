<!-- Copyright The Open Forge contributors. -->
# Waivers（规则豁免登记）

本目录登记对 **Policy 级** 规则的临时豁免。Invariant 级规则不接受 waiver；Guideline 级无需豁免。

一份豁免一个文件：`WAIVER-<四位编号>-<kebab-slug>.md`，编号不复用、不重排。

## Frontmatter

```yaml
---
id: WAIVER-0001
rule: <被豁免的规则，指向 AGENTS.md 节名或守卫名>
status: active
owner: <包、领域或责任人>
reason: <为什么现在不修>
risk: <不修的代价>
compensation: <期间必须遵守的约束>
created: 2026-09-24
expires: 2026-12-31
---
```

- `status`：`active`（生效中）、`resolved`（违规已修复）、`revoked`（提前撤销）。
- `expires`：必填 ISO `YYYY-MM-DD`。到期日前 `check-waivers` 放行；到期后同一检查报红。
  到期**不自动撤销也不自动续期**——续期必须新建 waiver 并说明为什么这次不同。

## 校验

`bun run check` 中的 `scripts/quality/check-waivers.mjs` 校验字段完整性、日期合法性与到期状态。
