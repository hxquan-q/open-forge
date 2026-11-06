---
name: user-metadata-and-audit-boundary
description: "设计记录归属、创建/修改人或评估其与操作审计区别时调用。CustomDev 新二开表由可信 UserContextHolder 在 Service 填 creator/modifier，不接受 DTO 身份。"
---
<!-- Copyright The Open Forge contributors. -->

# 用户元数据与审计边界

## CustomDev 新二开表（唯一赋值规则）

- 必须包含 `creator_id`、`modifier_id`，类型 BIGINT，关联 `t_sys_user.id`；创建时 Service 从可信 `UserContextHolder` 设置 creatorId，修改时设置 modifierId。
- 不接受 DTO 提交：即使用户 JSON 携带这两字段也忽略，不落库。可信来源与网关身份边界需核实，不能把客户端自报用户当可信上下文。
- 当前模板 UserContextHolder 可解析 userId/username，MybatisPlusMetaObjectHandler 的本地观察是填 createTime/orgId，不会自动填这两个人员字段，Service 需明确赋值。
- 展示人名通常不持久化，由 Service 按当前项目能力批量填充，不能循环逐条查。modifier_id 是最后修改人，不是每次修改历史。
- 保持旧平台已有列合同，不将上述新表决定用于批量改名旧核心表。旧 create_by/update_by 有不同历史语义/类型，不能按列数量统计推翻用户决定。

## Workshop 参考与功能边界

Workshop 用户 ID 同样指 t_sys_user.id，常见 creatorId/modifierId，审批需求下才考虑 submitterId/auditorId；其人名展示与可信 X-User-Auth 来源也是参考，CustomDev 的审批归属仍依需求。

归属元数据不等于操作流水或完整审计追踪，不声称保存每次前后值，也不因创建人/修改人或纸面签字栏就触发审计。仅用户明确要求新增/修改表单操作审计时进入 [操作审计](../operation-audit-domain/SKILL.md)；专用业务日志不是所有 CRUD 的默认需求。

测试覆盖创建/修改取当前用户、伪造 DTO 被忽略、读取显示与无权限行为；身份上下文缺失的处理遵循目标合同，不凭空默认用户。

来源：`eformSkill/用户元数据`、Workshop/Practice 书面规范及 2026-11-06 用户裁决/测试核实记录。此处是新表规范，不宣称模板已有所有业务 Service 实现。
