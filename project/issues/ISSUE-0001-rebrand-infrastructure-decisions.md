---
id: ISSUE-0001
type: issue
status: blocked
priority: P0
owner: release/product
related_requirement: [REQ-0003]
related_plan: [PLAN-0003]
source: exprot/rebrand-plan.md
created: 2026-09-22
updated: 2026-09-22
---

# 品牌化发布基建决策未冻结

## 未决项

- 新域名体系；
- 更新源是 GitHub 还是 generic CDN；
- Marketplace 仓库；
- 协议 scheme；
- appId、数据目录、npm scope。

## 为什么阻塞

这些值一旦进入构建身份、更新链路或用户数据迁移，后续修改会产生重新授权、安装共存、凭据迁移或更新兼容成本。

## 推荐

先冻结前 3 项基础设施决策，再执行品牌外置和打包身份改造。
