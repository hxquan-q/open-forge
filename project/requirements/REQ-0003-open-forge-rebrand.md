---
id: REQ-0003
type: requirement
status: draft
priority: P0
owner: release/desktop
source: exprot/rebrand-plan.md
related_plan: [PLAN-0003]
created: 2026-09-22
updated: 2026-09-22
---

# Open Forge 品牌化发布

## 目标

在首次商用发布前建立与上游隔离、可持续同步的品牌层，同时避免改写内部技术协议和上游高频文件。

## 核心约束

- 品牌身份、域名、更新通道和 Marketplace 坐标必须先冻结。
- 更新通道不能默认指向上游。
- 内部 `@vetta/*`、`VETTA_*`、`vetta:` 和 `.vettapkg` 等技术合同不能盲目替换。
- appId、协议 scheme、数据目录、Windows AppId 和凭据迁移必须单独验证。

完整发现清单和 15 项决策见 [`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md)。
