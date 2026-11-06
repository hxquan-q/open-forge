---
name: relational-form-selector
description: "表单字段需选择远程/分页关联实体时调用。CustomDev 先检查自身 LazyRemoteSelect；Workshop 的 InfiniteSelect 仅该模块参考。固定短枚举不包装成远程关联选择器。"
---
<!-- Copyright The Open Forge contributors. -->

# 关联表单选择器

字段是否是基础资料由 [字段规格](../form-field-specification-and-base-data/SKILL.md) 判断；本 Skill 负责实际选择交互/接线，不重新规定基础资料类型。固定枚举（如是/否）不是远程关系。

## 实现检查

- 搜索防抖、远程分页/滚动加载；真实参数与 total 见 [查询分页](../query-pagination-and-n-plus-one/SKILL.md)，不在前端估算。
- 编辑按 ID 解析最新显示值；允许选择后回传完整对象用于字段带出，但提交/持久化合同须另核实。
- 复杂多字段用选择对话框，支持双击行确认；传入业务实际查询函数，不误用默认 API。

## 项目组件

Workshop 复用 InfiniteSelect.vue/useInfiniteSelect.ts，属于其标准模块规范。CustomDev 当前本地观察有 `LazyRemoteSelect.vue`，支持 fetchFn(current,size,keyword,id/ids)、records/total 与编辑回显；先读其真实公共接口/调用方，不重复造控件、不把 Workshop API 或 `{code,name}` 形状套过去。

验证搜索/翻页/编辑回显、选择/清空、关联带出和错误行为；不只测试取值纯函数而漏掉组件事件接线。

来源：`eformSkill/关联表单选择器`、Workshop 关联规范与前端通用模式，以及已核对 CustomDev 本地组件观察。业务 API 仍按当前目标验证。
