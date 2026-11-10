---
name: frontend-buttons-and-forms
description: "仅在需要参考 Workshop 的 Element Plus 按钮、抽屉与 mes-form 风格时调用。规范明确只适用于 Workshop；CustomDev 应先核实自身组件/风格，不自动继承这些硬约定。"
---
<!-- Copyright The Open Forge contributors. -->

# 前端按钮与表单（Workshop 范围）

保留原 eformSkill 非重复风格内容，但不是 CustomDev 强制 UI 合同。CustomDev 同用 Vue/Element Plus 不代表已有等价按钮/表单规范；实际实现应遵循其规则、相似页面和用户确认，不强行复制 Workshop 布局。

## Workshop 按钮约定

- 使用 el-button：主操作 primary、业务推进 success、危险动作 danger、取消/关闭中性。
- 行/卡片操作为 size="small" 矩形按钮，不用 text/link。
- 同区尺寸、间距、图标语义一致；抽屉/弹窗底部操作放 #footer。

## Workshop mes-form

- 编辑抽屉主表单加 class="mes-form"，字段标签置顶。
- 普通字段通常每行两列；备注/textarea 独占行。
- CSS 限定 .mes-form，不污染全局 Element Plus。

若用户决定把某项参考用在 CustomDev，先确认受影响页面、组件与验收，不通过引入一套全局样式覆盖既有页面。字段类型不由本 Skill 决定，见 [字段规格](../form-field-specification-and-base-data/SKILL.md)；原型不自动成为实现规范。

来源：`eformSkill/前端按钮与表单`；Workshop CLAUDE、按钮风格说明、mes-form CSS。保留适用范围，不复制其源文件/样式为第二事实源。
