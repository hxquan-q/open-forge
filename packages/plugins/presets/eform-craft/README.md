<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-eform-craft

电子表单工坊预置插件（三成员团队）：`@eform` 表单匠（队长）接收用户上传的图片 / PDF / Excel / Word
表单原件，按识别合同（标记→类型、同义词→固定字段名）还原为**可运行的小型表单应用**六件套——
结构 schema（eform-schema-v2，含 capabilities 能力参数与 statusFlow）、列表页 index.html（数据记录的
新增/修改/删除/筛选/分页）、表单页 form.html（字段渲染 + 保存/提交审核/打印/导出的数据生命周期
draft→saved→approved，approved 全锁定）、mock 数据层、业务语言的字段规格文档 form-spec.md。
`@esign` 电子签师按能力参数注入签名组件（验证弹窗→canvas 手写→缩放回填→清空重签→审核锁定）；
`@eaudit` 审计员注入操作审计组件（auditEnabled 默认 false，创建/保存/审核/打印/导出五类操作追加式
日志，仅查看不可删，可导出 audit-log.jsonl）。三成员以共享锚点契约（eform-craft 技能 §6）协作，
schema 是唯一结构事实源；经确认门定稿，支持自然语言修改循环。一期为纯前端实现（mock 取数、
演示账号验证、localStorage 存储）；MES 部署、真实鉴权与真实数据接入为终期规划，仅留钩子。

## Context Boundary

```yaml
purpose: "预置（preset）插件——随 manifest 铺设电子表单工坊团队（eform 队长 + esign/eaudit 专员 persona 与技能、team eform-studio 任务书），产出可运行的表单应用（列表页+表单页+数据生命周期+签名/审计按能力注入）；运行时无代码贡献，entry 仅为满足 manifest 约定"
provides: []
consumes: []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
