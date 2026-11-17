---
id: WAIVER-0011
rule: docs/dev/agent-rules/delivery.md 的当前开发版本碎片及同轮正文汇编要求
status: resolved
owner: coordinator
reason: Desktop manifest 仍为已打 tag 的 0.1.3，当前没有切入未发布开发版本；禁止修改已发布正文，本次修复不承担全仓版本准备
risk: 当前 manifest 的发布正文不含本次候选修复，后续 prepare 必须归并碎片后才能发布
compensation: TASK-0406/0407 候选文案暂存 fragments/v0.1.4 与 Task，保留 v0.1.3 原文和版本；下次版本准备时确认归属并汇编校验，未完成不得将本批标记为已发布
created: 2026-10-28
expires: 2026-11-11
---
<!-- Copyright The Open Forge contributors. -->

# 已发布版本之后的修复碎片暂存

仅覆盖 TASK-0406/0407 的发布说明 Policy，不能用于豁免行为测试、完整检查、集成授权或真实 UI 验收。0.1.4 是待确认的下一个 patch 暂存目录，不代表已修改 Desktop 版本、已汇编正文或已发布。下一次 prepare 选择其他版本时迁移这两份碎片并校验；到期不自动续期。

## 关闭记录（2026-11-17）

v0.1.4 已于 2026-10-30 发布，`.github/release-notes/v0.1.4.md` 正文已含 TASK-0406/0407 对应「改进」条目，暂存碎片 task-0406-mcp-candidate-retry.md 与 task-0407-design-canvas-stability.md 已归并入已发布正文，compensation 中的归并校验义务随发布完成。豁免使命达成，予以关闭。
