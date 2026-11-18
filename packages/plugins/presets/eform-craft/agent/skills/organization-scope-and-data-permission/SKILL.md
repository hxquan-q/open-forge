---
name: organization-scope-and-data-permission
description: "业务表包含组织归属/共享行，或需实现、核对跨组织可见性时调用。区分 CustomDev 与 Workshop 的过滤机制，核验实际授权而不把 SQL 过滤等同用户授权。"
---
<!-- Copyright The Open Forge contributors. -->

# 组织范围与数据权限

## 共同语义

`org_id` 表达组织归属，NULL 可表示共享；共享是否允许必须按目标业务确认。字段存在不能证明权限已生效，组织归属不能相信客户端请求体。

## CustomDev 模板的本地观察

- `X-Org-ID` 进入 `OrgScopeFilter`；需隔离的表注册到 `OrgScopeTableRegistry`。
- MyBatis 数据权限拦截器按范围加 org_id 条件并保留 NULL 共享行；普通更新不能改 org_id。
- Entity 使用 `orgId`；不照抄 Workshop 的 `organizationId`。
- 模板默认 `AllowAllOrgAuthorizationAdapter` 接受请求组织，缺 X-Org-ID 进入全局范围。这是待核验的信任边界，不是已完成用户—组织授权；实施时核实可信头来源、实际适配器和部署环境。

## Workshop 参考（仅该标准模块）

旧 `CrudServiceImpl` 仅在实体有组织字段时过滤/填充；组织上下文缺失可能退化为无过滤。其概览还记载 `OrgScopeFilter`/MyBatis 白名单与传统 Service 机制并存，不假设全仓只有一种。不得将此机制直接复制到 CustomDev。

## 检查与验收

确认列类型/注释、NULL 共享政策、表注册/过滤启用、可信填充、缺组织头/无权行为；覆盖本组织、其他组织、共享行及更新不能换组织。列表和详情/编辑都要核对，不能只验查询。

来源：`eformSkill/组织范围与权限边界`；Workshop CLAUDE/项目概览和 Practice/customerdev org 实现是参考来源。实际目标实现以当次源码核实，未知处不作保证。
