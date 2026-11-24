---
name: requirements-design-to-delivery
description: "接受一般二开需求或附件解析结果，推进需求澄清、规格/方案、任务拆分、实现与验证的闭环时调用。辅助材料不默认进源码；字段、状态、签名、审计规则引用各自 Skill，不重建平行规范。"
---
<!-- Copyright The Open Forge contributors. -->

# 需求到实现闭环

领域交付方法，不定义 Agent 人格、工具操作或 Team 调度。角色交接和运行授权按 Agent Prompt/Team workflow 执行。

## 从来源形成需求

1. 读目标项目规则、相似模块与来源，检查重复实现；分开显性需求、推断与未知事实。Workshop 的 specs/plans、Practice 的 docs/ac 仅是产物形式参考，不是 CustomDev 默认落点或既有能力。
2. 有实体表单附件先消费 [附件解析](../entity-form-attachment-parsing/SKILL.md) 的结构/原始字段/歧义，不重复解析、不把字迹推断当事实；无附件直接澄清。覆盖表头、明细、查询、枚举、固定文本、示例值与签核意图。
3. 明确用户目标、范围/不做项、现有流程、规则、失败/恢复和可验证结果；按需产出需求文档、技术设计、文件级任务/验收，不强制每次生成固定件套。
4. 确定字段时调用 [字段规格与基础资料](../form-field-specification-and-base-data/SKILL.md)，确认取值来源、默认/枚举/公式、精度、空值和联动；不在本 Skill 另建类型表。
5. 仅当存在状态流转需求/核实行为时使用 [生命周期](../form-record-lifecycle/SKILL.md)。电子签与审计按 [签名](../electronic-signature-field-implementation/SKILL.md)/[审计](../operation-audit-domain/SKILL.md) 的条件确认，纸面签字不自动等于这些能力。

## 从确认规格进入实现

规格、字段合同与验收先确认，再按数据库脚本→后端→前端→集成的依赖推进；每层落实已核实映射，避免双方各自猜字段。原型/展示稿是需求表达，标出模拟/未接入，不代替正式工程代码。

需求/设计/讨论等辅助材料按 Agent 共享合同放 AI workspace，正式代码/测试/SQL 留项目；不因参考材料位于 docs 就默认在 CustomDev 根下生成辅助文件。

## 验证与交付

新增/改变业务规则对应本地行为测试；按风险运行后端测试/编译、前端类型/构建、获准测试环境的 API/DB 联调和关键用户流程。缺环境/能力时记录未执行与风险，不伪造通过；校验占位不是省测试的理由。

交付关联需求/代码/构建版本、实际测试环境与步骤、验收与回滚，明确“源码完成”“构建成功”“已部署”“已验收”的区别。具体测试构建和部署方法见 [构建回滚](../build-release-and-rollback/SKILL.md)，当前生产范围仍排除。

来源：`eformSkill/需求到实现闭环`，与附件解析/字段规格各自互补，作为本 preset 的需求工程方法；不是外部项目批准合同的替代。
