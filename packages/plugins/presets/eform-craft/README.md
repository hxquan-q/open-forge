<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-eform-craft

电子表单工坊预置插件：`@eform` 表单匠 agent 接收用户上传的图片 / PDF / Excel / Word 表单原件，
按识别合同（标记→类型、同义词→固定字段名）还原为四件套产物——结构 schema（eform-schema-v1）、
双击即开的自包含 HTML 预览（内嵌 mock 演示数据层 `window.__EFORM_MOCK__`）、独立 mock-data.json、
业务语言的字段规格文档 form-spec.md；经用户确认门定稿，支持自然语言修改循环。
一期为纯前端还原（mock 数据）；MES 菜单挂载、MCP 真实取数与电子签为终期规划，
本期仅预留钩子（fieldName 映射、mock 层隔离、按表单独立目录）。

## Context Boundary

```yaml
purpose: "预置（preset）插件——随 manifest 铺设电子表单还原 agent（persona + 技能）；运行时无代码贡献，entry 仅为满足 manifest 约定"
provides: []
consumes: []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
