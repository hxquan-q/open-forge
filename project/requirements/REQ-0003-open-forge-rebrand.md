---
id: REQ-0003
type: requirement
status: ready
priority: P0
owner: release/desktop
source: exprot/rebrand-plan.md
related_plan: [PLAN-0003]
related_tasks: [TASK-0009, TASK-0043, TASK-0044, TASK-0045, TASK-0046, TASK-0047, TASK-0048, TASK-0049]
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 品牌化发布

## 目标

在首次商用发布前建立与上游隔离、可持续同步的品牌层，同时避免改写内部技术协议和上游高频文件。

## 核心约束

- 品牌身份、域名、更新通道和 Marketplace 坐标必须先冻结。
- 更新通道不能默认指向上游。
- 面向用户的品牌与内部兼容身份分开管理；内部 `@vetta/*`、`VETTA_*`、`vetta:`、`.vettapkg` 等技术合同不能盲目替换。
- Desktop `APP_RUNTIME_NAME` 当前值 `vetta` 参与 `safeStorage` 密钥定位；任何变更都必须有存量凭据迁移方案并单独验证。
- appId、协议 scheme、数据目录、Windows AppId 和凭据迁移必须单独验证。

## Given / When / Then

- Given：用户安装或启动使用已冻结身份配置的 Open Forge 构建；When：应用展示品牌身份或选择默认更新来源；Then：面向用户的产品身份与更新坐标使用已批准值，更新流程不会静默回退到上游。
- Given：用户已有本地会话、凭据或使用既有 Vetta 技术标识的扩展；When：外显品牌逐步迁移；Then：内部协议和凭据定位合同保持兼容，或在变更前提供并验证独立迁移与重新授权路径。

## 验收标准

- 用户可见品牌遵循 Open Forge；未确认的域名、社区和联系地址继续使用当前有效入口，不编造新 URL。
- `@vetta/*`、`VETTA_*`、`vetta:`、`vetta.remote.v1`、`X-Vetta-*`、`.vettapkg` 等冻结的内部兼容标识不被全局替换。
- `APP_RUNTIME_NAME` 保持 `vetta`，除非存量凭据迁移方案另行设计并通过专项验证。
- 公开包 scope 只有在目标 npm 组织注册确认后迁移；不在本任务内发布 npm 包。
- 品牌、更新、数据目录、凭据、文档和社区入口按 PLAN-0003 对应 Task 独立验证。
- 2026-10-10 起，Desktop 默认构建口径切换为外部分发品牌：dev 与打包默认呈现 Allstr ai / 小爱ai（见 [REQ-0011](REQ-0011-brand-profile-default-distribution.md)）；显式 `VETTA_BRAND_PROFILE=self` 仍提供本需求的 Open Forge 品牌面。本需求其余验收标准与冻结标识合同不变。

完整发现清单和 15 项已冻结决策见 [`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) 与 [`ISSUE-0001`](../issues/ISSUE-0001-rebrand-infrastructure-decisions.md)。
