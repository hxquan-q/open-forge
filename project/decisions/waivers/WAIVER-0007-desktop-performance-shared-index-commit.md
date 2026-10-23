---
id: WAIVER-0007
rule: docs/dev/agent-rules/collaboration.md 的串行Task交付索引同提交策略
status: active
owner: desktop/coordinator
reason: Task和Research导航README包含其他会话未提交行，现有precommit按整文件重暂存，无法只提交本批导航行而保留他人归属
risk: 单独检出本批提交时共享README可能暂未列出新记录，记录正文和相对链接仍存在
compensation: 独立Task与研究正文正常提交，工作区索引保持状态同步并跑check-project-indexes，提交明确路径排除共享README，不改hook不夹带他人内容；其他导航修改归属确认后合并本批行并resolved
created: 2026-10-24
expires: 2026-10-31
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 性能批次共享导航提交例外

适用 TASK-0398–0401 的 `project/tasks/README.md` 和 `project/research/README.md` 导航行。根规则要求保护其他会话修改，不能把已有 TASK-0394–0397、RESEARCH-0040/0041/0043 等导航行顺带提交。当前 `scripts/quality/precommit.mjs` 会重新 `git add` 所有已暂存路径，因此暂存局部hunk不足以避免夹带。

仅豁免共享导航与正文必须在同一原子提交的 Policy；不豁免建立Task、工作区索引同步、测试、完整检查、原子源码提交及发布说明。其他路径明确逐项暂存和审核；不改Git hook、不覆盖或临时清除用户内容、不推送脏工作区。

当前导航行已经在工作区，与frontmatter同步。每个Task正文记录实际交付和状态，RESEARCH-0044包含证据；共享导航归属协调完成后应由Coordinator合入对应行并将本例外置为resolved。到期不自动续期。
