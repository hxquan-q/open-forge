---
id: BUG-0150
type: bug
status: fixed
priority: P1
owner: packages/coding-agent / scripts/evals
source: VERIFY-0022 R6（2026-10-23 复核）
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0027]
related_tasks: [TASK-0390]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 恒真隔离断言与评测非目标命中计分

## 现象

memory-user-flow.test.ts:147 的 predicate 含 `|| true` 永远通过，掩盖词法层跨项目泄露；评测 runner 多处只按 entries.length>0 计命中，未核对 queries[].expectedMemoryIndex，返回错误记忆也得分。

## 修复合同

- 删除恒真断言，补真正能失败的跨项目否定检查（按目标 memoryId 否定）。
- 命中判定核对目标 memoryId 及必要 revision/content；更正场景核对当前修订内容。
- 新增测试经正常 Session 装配验证下一模型请求，不全部绕过入口直调 store。
- 旧数据/旧上下文/派生索引的遗忘行为有明确验证结果。

## 处置记录

- 2026-10-23：TASK-0390 修复完成——删除 || true 恒真断言并补跨项目否定检查；评测按 expectedMemoryId+当前内容计分（更正场景核对更正值）。
