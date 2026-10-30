---
id: WAIVER-0008
rule: docs/dev/agent-rules/delivery.md 的发布合同（macOS 签名/公证与发布制品准入）
status: active
owner: desktop-release
reason: 仓库与 desktop-production 环境均未配置 macOS 签名/公证凭据；用户于 2026-10-26 明确要求先发布未签名的 0.1.3
risk: macOS 产物未做 Developer ID 签名与公证，Gatekeeper 会拦截；Windows/Linux 产物未做代码签名；无法用签名证明来源与完整性
compensation: 仅发布 GitHub pre-release；发布说明明确标注未签名/未公证；仅当显式设置仓库变量 VETTA_ALLOW_UNSIGNED_RELEASE=true 时才允许，默认仍强制签名或剔除 macOS；不发布 R2/商业/稳定渠道；配置签名凭据后补发签名版本
created: 2026-10-26
expires: 2026-11-30
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.3 未签名发布的有限例外

本条只豁免发布合同中的 macOS 签名/公证要求，用于一次显式授权的 0.1.3 GitHub pre-release。发布版本仍为 `apps/desktop/package.json#version` 的 0.1.3，tag 仍由 `script/release-desktop.mjs publish` 原子创建，发布正文仍取 `.github/release-notes/v0.1.3.md`。

## 操作条件

1. 必须显式设置仓库变量 `VETTA_ALLOW_UNSIGNED_RELEASE=true`；未设置时 workflow 保持原有行为（发布构建缺签名凭据则剔除 macOS，签名步骤拒绝无凭据发布）。
2. 只允许 GitHub 目标（`VETTA_RELEASE_TARGET=github` 或默认）；不发布 R2、商业或稳定渠道。
3. 发布说明必须写明未签名/未公证及 macOS 首次打开的手动允许步骤；不得宣称已验证签名或公证。
4. 不豁免 tag 不可变、发布正文、版本一致、质量门禁、制品摘要或凭据不入库等要求。
5. 发布完成后撤销 `VETTA_ALLOW_UNSIGNED_RELEASE`，恢复默认签名要求；到期不自动续期。

## 结果

待 0.1.3 发布后回填实际 workflow 运行、制品与残余风险。
