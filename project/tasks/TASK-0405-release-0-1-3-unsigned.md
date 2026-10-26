---
id: TASK-0405
type: task
status: in_progress
priority: P0
owner: desktop-release
requirement:
plan:
source: 用户请求（2026-10-26）/ 签名凭据缺失 / WAIVER-0008
related_requirement: []
related_plan: []
related_tasks: [TASK-0404]
related_issues: [ISSUE-0029]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 8be3c69ce1f3fd10a93fda3678d8cceb5b1c4f64
read_paths: [.github/workflows, .github/release-notes, scripts/release, scripts/quality, project/decisions/waivers, project/tasks]
write_paths: [.github/workflows/desktop-release.yml, .github/release-notes, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, scripts/quality/desktop-release-workflow.test.mjs, project/decisions/waivers, project/tasks]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# 发布未签名的 Open Forge 0.1.3

## 目标

在仓库与 `desktop-production` 环境没有 macOS 签名/公证凭据的前提下，按用户 2026-10-26 的明确授权，把当前 0.1.3 以**未签名**制品发布为 GitHub pre-release；默认的签名发布门禁不得被削弱，必须由显式仓库变量开启，并在发布说明中标注未签名/未公证。

## 范围

### 并发评估

- 结论：支持（串行执行）。
- 执行方式：serial。
- 前置依赖：`main` 已包含 TASK-0404 交付与 Actions 同步；工作区干净。
- 冲突文件/独占路径：`.github/workflows/desktop-release.yml`、`scripts/quality/desktop-release-workflow.test.mjs`、`.github/release-notes`、`project/decisions/waivers`。
- Branch：`main`；Worktree：`C:/Users/xquan/Desktop/open-forge`。
- 集成负责人：当前会话 Coordinator。
- 集成顺序：先落显式开关、测试、豁免与说明，再运行 `publish 0.1.3`。

### 做

- 在 `desktop-release` workflow 增加显式开关 `VETTA_ALLOW_UNSIGNED_RELEASE`：仅当其为 `true` 且发布构建缺签名凭据时，才把 macOS leg 纳入矩阵并产出未签名制品。
- 保留默认行为：变量未设置时继续剔除 macOS 或拒绝无凭据发布。
- 增加 workflow 合同测试，登记 `WAIVER-0008`，并在 0.1.3 发布说明中明示未签名/未公证。
- 用 `node scripts/release-desktop.mjs publish 0.1.3 --confirm-publish` 原子提交发布说明日期、打 tag 并推送，随后验收真实 workflow 与 GitHub pre-release 制品。

### 不做

- 不修改产品代码、版本号或已发布版本说明。
- 不发布 R2/商业/稳定渠道；不宣称签名或公证通过。
- 不移动、复用或强推已存在的 tag；不绕过 tag 不可变与质量门禁。
- 不在仓库、脚本、日志或回执中写入任何签名/公证凭据。

## Given / When / Then

- Given 无签名凭据、`VETTA_ALLOW_UNSIGNED_RELEASE=true`；When 发布 0.1.3；Then workflow 纳入 macOS leg、产出未签名制品、发布说明标注未签名，并发布 GitHub pre-release。
- Given 无签名凭据、变量未设置；When 发布构建；Then 默认行为保持不变（剔除 macOS 或拒绝无凭据发布）。
- Given 发布失败；When 检查；Then 不宣称发布成功，保留失败证据与 tag 现状，按实际结果处理。

## 必须保持

- 默认签名发布门禁不被静默削弱；未签名必须是显式、可审计、可撤销的例外。
- tag 与版本事实源一致；发布正文即 Release 正文；已发布版本说明只读。
- 不同时发布 R2/商业渠道；凭据不入 Git、命令参数、日志或回执。

## 测试与验证

- 定向测试：`desktop-release-workflow.test.mjs`、`bun run check`、`node scripts/release/release-notes.mjs --check`、`check-waivers`。
- 用户流程：`publish 0.1.3 --confirm-publish` → tag 触发 `desktop-release` → GitHub pre-release 可下载。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审（显式开关与默认路径分离）。
- 集成：pending；发布提交与 tag 由脚本原子完成。
- 人工功能验收：待验收；以真实 workflow 与 Release 回执为准。
- 发布：用户已授权（2026-10-26），执行结果待回填。

## 功能验收包

- 入口与前置条件：`main` 干净、`VETTA_ALLOW_UNSIGNED_RELEASE=true`、无签名 secrets。
- 操作步骤：`node scripts/release-desktop.mjs publish 0.1.3 --confirm-publish`。
- 预期行为与最终产物：`v0.1.3` tag、GitHub pre-release、Windows/Linux/macOS 未签名制品、发布说明含未签名警告。
- 限制：macOS 未签名/未公证；默认签名门禁保持不变；R2 不发布。

## 交付记录

- 已完成 intake 与用户授权；显式未签名开关、发布断言边界、WAIVER-0008 与发布说明警告已落盘。
- 2026-10-26 发布尝试：tag `v0.1.3` 与 release 提交 d859f3a7a 已推送；tag run 40279526764 在 `build windows` 失败——受控沙盒 exe 缺失、清单 SHA 为 null，打包按设计阻断。用户选择本次跳过 Windows 沙盒（WAIVER-0009）。
- 恢复路径：从 `main` 以 stable dispatch 重新构建并发布到既有 `v0.1.3`；显式 `VETTA_SKIP_WINDOWS_SANDBOX=1`，Release 正文追加未带沙盒警告。资产构建自 main（tag 之后仅发布/豁免文档变更，产品代码不变），如实记录 tag/资产提交差异。
- dispatch run 40282832623：四个平台构建全部成功（Windows 已跳过沙盒检查）；四个 verify 失败——Linux/macOS 的 updater 元数据引用连字符产物名而磁盘文件保留品牌空格，Windows 的 checkpoint 还原用带盘符 `-C` 失败。已修：构建后统一把 release 顶层产物文件空格改连字符（含回归测试），Windows 改为 `cd` 后解压；重跑待执行。
