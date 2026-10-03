---
id: WAIVER-0003
rule: project/CONVENTIONS.md 命名规范（已使用编号不重排）
status: resolved
owner: coordinator/TASK-0187
reason: 两个未发布的并行执行流登记了同一个 BUG-0073
risk: 旧隔离提交使用的文件链接需按历史 SHA 查看
compensation: 仅更正本批为 BUG-0076并同步本批引用，保留旧提交映射，不改动另一 Owner 的队列记录
created: 2026-10-03
expires: 2026-10-04
---
<!-- Copyright The Open Forge contributors. -->

# 未发布 Bug 编号冲突的发布前纠正

本批 BUG-0073-dev-cache-missing-workspaces 已在隔离分支提交，但尚未进入 dev/main。
主检出另有另一执行流的 BUG-0073-queue-fix-anchor-regressions；不能覆写或改名他人记录。
因此仅将本批改为 BUG-0076，并同步 TASK-0192；4423aef2e 等历史提交不重写。
操作前后校验另一 Owner 文件摘要不变；ID 未复用为其他含义，不涉及 Invariant 豁免。
