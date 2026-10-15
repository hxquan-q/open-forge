---

type: requirement
status: ready
priority: P1
owner: packages/plugins/presets/eform-craft
source: user-request（《电子化表单(1).docx》需求文档 + 用户口头范围裁剪：一期只做前端还原+mock）
created: 2026-10-09
updated: 2026-10-09
related_plan: []

---
<!-- Copyright The Open Forge contributors. -->

# 实体表单电子化一期（eform-craft 预置插件）

## 用户问题

用户方需要把纸质/电子的各类表单（图片拍照件、Excel、Word 等）转为可部署的电子表单，终期挂载到 MES 产品菜单、数据经 MCP 查询获取、配套电子签名与审计日志。但一步到位不可行：先要让用户在上传原件后**立即看到并核对**还原结果，字段类型、取值方式、布局逐项确认后才有定稿基础。一期聚焦这个还原-核对-修改循环。

## 用户结果

- 在会话中上传图片 / PDF / Excel / Word 表单原件，`@eform` 表单匠按识别合同还原为四件套：结构 schema（eform-schema-v1）、双击即开的自包含 HTML 预览（内嵌 mock 演示数据层）、独立 mock-data.json、业务语言的字段规格文档 form-spec.md。
- F# 字段编号在 schema / 预览页 / 规格文档三体一致，用户可逐字段指认核对。
- 确认门定稿：对话区输出规格全文 + 弹卡「批准 / 需要修改（F# 指认）」；自然语言指认修改后重新生成再过门。
- 预览页可一键填充演示数据（下拉候选、计算联动、单号序列），数据层独立——终期可整体替换为真实取数而结构层不动。

## 范围

- 识别合同（机械可核对）：类型标记 → 字段类型（▇是□否 / [文本] / [日期] / [长日期] / [整数] / [小数,N] / [组织] / [部门] / [品名] / [工序] / [人员] / [电子签]）；同义词 → 固定字段名（F_Process / F_Lot Number / F_Product Name / F_Operator / F_Reviewer / F_Quality Inspector，含空格原样保留）；无标记文本 = 固定标题；标题后空白 = 活动区域。
- 产物规范：四件套落 `<项目>/docs/eform/<slug>/`；preview.html 单文件自包含、mock 层单一全局变量 `window.__EFORM_MOCK__`；schema 是唯一结构事实源，修改循环只改 schema 再重新生成。
- 识别通道矩阵：按原件格式分流（图片 vision / PDF 文本层 / Word 转 PDF / Excel 画像 / csv 直读），工具不可用时按降级路径请用户转格式，不猜。
- 交付形态：preset 插件 `eform-craft`（单 agent + 单技能，纯提示词资产，运行时代码为零），注册进 tenants.json 双 profile。

## 不做什么

- 终期四项全部不做：真实电子签名、审计跟踪日志、MES 部署与菜单挂载、真实数据接入（MCP）。只在产物里留钩子（fieldName 映射、mock 层隔离、按表单独立目录），技能明确告知用户「终期能力，本期占位/留钩子」。
- 静态资源打包出仓（终期）；自然语言修改在本期以「修改 → 重新生成 → 再确认」的会话内循环实现，不出静态包。
- 不组团队、不做围栏、不做状态机文件（与 allstar-coding 的重型流水线区分）。
- 不改 plugin-sdk / manifest Schema / PLUGIN_API_VERSION / docs/plugin 手册（全部用 allstar-coding 已在用的清单字段）。

## Given / When / Then

- Given：用户上传表单类原件并提出电子化需求；When：`@eform` 按技能识别生成；Then：四件套落盘且 F# 三体一致（schema `fields[].id` ↔ preview `data-fid` ↔ form-spec 字段清单行）。
- Given：四件套落盘；When：确认门弹卡，用户点「批准」；Then：form-spec.md 状态改「已批准」，汇报产物清单收尾；口头同意不算过关。
- Given：用户以 F# 指认自然语言修改；When：agent 定位 schema 对应 field 修改；Then：revision+1，重新生成三件（preview/mock/spec），差异摘要后重新过门；schema 与 preview 永不分叉。
- Given：原件标记命中识别合同；When：生成字段；Then：类型与固定字段名严格按合同表执行（`F_Lot Number` 等含空格原样保留），不自作主张规范化。

## 必须保持

- 识别合同不可协商：类型标记→字段类型、同义词→固定字段名两张表是需求方原样约定，任何「规范化」都会破坏与终期 Java 侧的对接。
- 插件权限最小集：仅 `agent.skills.control`（挂载技能目录所需且仅此一项）。
- 纯提示词资产：运行时代码为零，不引入 fence / hooks / 团队。
- mock 纪律：演示数据一律虚构通用占位，绝不使用可能真实的组织名/人名/编号，敏感字段打码。

## 验收标准

- 目录结构与实施契约一致；`bun run build:presets` 产出合法 vettapkg。
- manifest 合同测试通过：单 agent、权限恰为 `["agent.skills.control"]`、双 locale %key% 全解析、技能 frontmatter 合规。
- SKILL.md 含识别合同全部锚点（6 个 fieldName、类型标记枚举、四件套名、`__EFORM_MOCK__`）——由合同测试机械锁定。
- tenants.json 双 profile 均含 `eform-craft`，JSON 合法。
- 五步验证链全绿（包内定向测试 → check:quick → test:impact → build:presets → 完整 check）。
- release-notes 已追加；project/ REQ+TASK 已立案并回填。

## 风险与失效条件

- 提示词资产无单测可锁行为：agent 实际识别质量依赖模型，用「合同锚点测试 + frontmatter 守卫」锁规格面；真实效果需后续在 Desktop 实测（另立任务）。
- Excel/Word 通道依赖会话工具可用性（`doc_to_pdf` / `dataset_profile`）；技能已写降级路径（请用户转格式），不硬编码不存在的假设。
- `F_Lot Number` 等含空格 fieldName 是需求方原样约定，SKILL.md 与测试都显式钉死，防止后续「好心」改掉破坏对接合同。
