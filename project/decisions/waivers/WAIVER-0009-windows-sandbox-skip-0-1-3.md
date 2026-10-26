---
id: WAIVER-0009
rule: docs/dev/agent-rules/delivery.md 的发布合同（Windows 沙盒制品受控清单）
status: active
owner: desktop-release
reason: packages/runtime-core/sandbox/bin 没有受控构建的三个 exe，清单 sourceCommit 与 SHA 均为 null；用户于 2026-10-26 明确选择本次跳过 Windows 沙盒
risk: Windows 产物不携带内置沙盒（sandbox.status=unavailable），无法隔离不可信命令
compensation: 仅本次 0.1.3 GitHub pre-release；显式仓库变量 VETTA_SKIP_WINDOWS_SANDBOX=1 才降级，默认仍阻断；Release 正文追加未带沙盒警告；后续补齐受控制品并重钉清单；不用于 R2/商业/稳定渠道
created: 2026-10-26
expires: 2026-11-30
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.3 Windows 沙盒缺失的有限例外

本条只豁免 Windows 沙盒制品的受控清单阻断，用于一次显式授权的 0.1.3 GitHub pre-release。发布版本仍为 0.1.3，tag 仍为 `v0.1.3`。

## 操作条件

1. 必须显式设置仓库变量 `VETTA_SKIP_WINDOWS_SANDBOX=1`；未设置时打包仍按受控清单阻断。
2. 只允许 GitHub pre-release；不发布 R2、商业或稳定渠道。
3. Release 正文必须追加「Windows 产物未包含内置沙盒」警告；不得宣称沙盒可用。
4. 不豁免签名/公证、tag 不可变、版本一致、质量门禁或凭据不入库等其他要求。
5. 发布完成后撤销 `VETTA_SKIP_WINDOWS_SANDBOX`；补齐受控制品并重钉清单后登记 resolved。

## 结果

待 0.1.3 发布后回填实际 workflow 运行、制品与残余风险。
