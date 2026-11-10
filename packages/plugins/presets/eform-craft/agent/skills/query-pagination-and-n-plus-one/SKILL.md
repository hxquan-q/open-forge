---
name: query-pagination-and-n-plus-one
description: "实现或检查列表 API、关联填充、远程分页选择器时调用。使用目标分页模型、数据库真实 total 与批量关联查询，不使用前端估算或内存假分页。"
---
<!-- Copyright The Open Forge contributors. -->

# 查询、关联填充与分页

## 查询纪律

- 收集关联 ID 后批量 `selectBatchIds` / `selectList(in)`，再内存组装，避免循环逐条查库的 N+1；详情/列表的展示填充不依赖逐行请求。
- 数据库完成过滤、排序与分页并返回真实 total；不用 selectList 全量后 subList 假分页，不用前端猜总数。

## 项目适用范围

以上是原 eformSkill 保留的查询约定，其中 Workshop 将 N+1 和假分页明确列为硬规范。CustomDev 使用自身 `PageParam`、`PageResult<T>`、MyBatis Plus 分页拦截器和 selectPage，具体参数/COUNT 语义按实际目标核实，不移植 Workshop 基类。

关联选项传 current/size/keyword，搜索和编辑态 ID 回显与真实后端分页协同；选择器控件复用见 [关联选择器](../relational-form-selector/SKILL.md)。

## 验收

组合过滤/排序在 SQL 层；空结果、超页、日期边界与 COUNT total 对应实际记录；关联填充查询数不随行数线性增长。确认数据权限后的 total，而非泄露其他组织记录数。

来源：`eformSkill/查询与分页`；Workshop CLAUDE/前端通用模式与 Practice 设计材料。旧静态列表分页不构成真实后端合同。
