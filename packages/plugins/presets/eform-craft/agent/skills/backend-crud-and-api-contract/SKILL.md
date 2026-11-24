---
name: backend-crud-and-api-contract
description: "实现后端 Entity/Mapper/Service/Controller、DTO 或 API 合同时调用。CustomDev 使用自身模块、分页与 API 前缀，Workshop CRUD 基类仅作该标准模块参考。"
---
<!-- Copyright The Open Forge contributors. -->

# 后端 CRUD 与 API

## CustomDev

- Maven 模块 api/common/server，业务 Entity/Mapper/Service/Controller 放 server；common 提供 PageParam、PageResult、Result 等模型。
- Mapper 可继承 BaseMapper，不强制套 Workshop 的 CrudService；服务接口前缀 `/api/custom-dev/**`，由网关识别，实际路由/前端调用仍需核对目标项目。
- 列表使用 CustomDev 的分页参数/响应与 [查询分页](../query-pagination-and-n-plus-one/SKILL.md) 规则。

## Workshop（仅参考）

Entity 映射 t_ 表；Mapper 继承 BaseMapper，Service/实现继承 CrudService/CrudServiceImpl 并实现关键字 wrapper，Controller 返回 Result。自有 API `/api/workshop/...` 与基础代理 `/api/...` 分开；分页 Result<PageResult<T>> 与真实数据库 total。不要把该标准功能模块当 CustomDev 修改对象。

## 共同开发约定

DTO 使用 Bean Validation；组织归属与可信创建/修改人不接受客户端赋值，后者权威规则见 [用户元数据](../user-metadata-and-audit-boundary/SKILL.md)。详情/编辑按 ID 重读后端最新数据；需允许清空的字段必须显式更新为 NULL，不让 ORM NOT_NULL 策略静默跳过。

字段 `fieldName` 与统一需求类型的规格来源见 [字段规格](../form-field-specification-and-base-data/SKILL.md)；实现阶段逐项核实真实列/Entity/DTO/API 映射，不把数据库标准列名机械等同 Java 属性或 JSON 参数。检查所有生产者/消费者及服务端校验，按改动补正常、空值、拒绝与保存/读取流程测试。

来源：`eformSkill/后端CRUD与API契约`；Workshop CLAUDE/API 策略与 Practice README/clearance 示例是历史参考；具体目标合同以当前 CustomDev 为准。
