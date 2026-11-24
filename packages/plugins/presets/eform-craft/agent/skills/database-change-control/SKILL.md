---
name: database-change-control
description: "新增/修改表、列、索引、约束或数据迁移时调用。SQL 与代码留项目并版本化；CustomDev 秒级逻辑删除与 Workshop 微秒规范分开，明确脚本写出、执行、Schema 回查的区别。"
---
<!-- Copyright The Open Forge contributors. -->

# 数据库变更留档

## 脚本与执行

- SQL 先形成脚本并与代码版本管理，不只在控制台手改；SQL 是项目交付，不是 AI 辅助材料。
- Workshop 归档为 `sql/MMDD/Vyyyy.MM.dd__描述.sql`，更新其 `数据库更改.md` 记录日期、影响、执行状态、路径和回滚；这是 Workshop 约定。CustomDev 的脚本/台账路径按实际目标规则确认，不强行照搬，也不默认在源码中生成需求/讨论材料。
- CREATE 考虑可重复执行，ALTER/回填先查现状、同名表/列/索引/约束与存量数据；评估锁表、唯一冲突、回填边界和回滚副作用。
- DDL/数据写入需单独确认权限与测试目标；只读连接只能检查。DBX 的限制与 Nacos/测试配置顺序以 Agent 共享操作合同为准，不借只读核验扩大写权限。脚本/日志/文档不含秘密。

## 逻辑删除（唯一单位规则）

- 普通逻辑删除表使用 `deleted BIGINT`，0 表示未删；业务唯一键结合 deleted 设计，具体索引依据业务/存量数据验证。已确认的特殊无 deleted 日志表不能机械加墓碑。
- AIMES CustomDev 使用秒级 `UNIX_TIMESTAMP()`，不是 Workshop 的微秒规范；新二开表跟随秒级。Workshop 当前微秒，旧 CLAUDE 中的 0/1 通用描述过期，仅属该项目历史。
- 2026-11-06 工作区《CustomDev测试环境核实》已证明当时通用 Nacos 无 mybatis-plus 覆盖且服务级配置不存在，实际 deleted 样本为秒级；不能照抄仍写“微秒”的过时列注释。
- 该证据不保证未来配置不变；部署前只读检查适用通用/服务级配置，不修改 Nacos。新冲突报告用户，不为跨项目统一而改单位。

## 对照与报告

对比脚本、Entity/Mapper 和 Schema，核对组织隔离、字段映射、逻辑删除和回滚；用户归属列的权威规则见 [用户元数据](../user-metadata-and-audit-boundary/SKILL.md)。分别报告“脚本已写”“脚本已执行”“Schema 已回查”，不能混为已完成迁移。

来源：`eformSkill/数据库变更留档`、Workshop/Practice 数据库规范及用户 2026-11-05/06 CustomDev 决定和测试核实记录。不将参考路径当作本项目写域。
