---
id: ISSUE-0004
type: issue
status: done
priority: P2
owner: project/agent-workflow
source: user-request and exprot/README.md
created: 2026-09-22
updated: 2026-09-22
---

# exprot 与 project 的管理边界

## 决策

采用 `project/` 主动管理、`exprot/` 历史研究归档的双层结构。新 Requirement、Plan、Task、Issue、Bug、Research、Verification 和 Context 必须写入 `project/`。

## 原因

避免复制长文档形成第二事实源，同时保留原始源码分析和证据链。
