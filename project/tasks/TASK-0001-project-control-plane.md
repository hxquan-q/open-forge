---
id: TASK-0001
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
execution: coordination-only
created: 2026-09-22
updated: 2026-09-22
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 建立 Project 控制面

## 目标

从会话历史、`session-memory.md` 和 `exprot/` 提取当前需求、计划、Bug、研究和验证条目，建立主动开发管理层。

## 结果

- 创建 `project/` 目录和模块规范；
- 创建 REQ/PLAN/BUG 初始条目和模板；
- 新增 `project/CONVENTIONS.md`；
- 将 `exprot/` 标记为历史研究归档；
- 更新根 `AGENTS.md` 和 Release Notes。

## 验证

- `git diff --check` 通过；
- Project 内部路径和模板索引已核对；
- 目录结构和条目可被后续 Agent 按三跳协议读取。
