---

type: requirement
status: ready
priority: P1
owner: packages/plugins/presets/eform-craft
source: user-request（《电子化表单(1).docx》第二/三章 + 用户口头澄清：表单生成/电子签/操作审计三版块团队化；按钮针对数据而非网页）
created: 2026-10-10
updated: 2026-10-10
related_plan: []

related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 实体表单电子化二期（eform-craft 三版块团队化）

## 用户问题

一期交付了单 agent 还原循环（四件套），但电子签只是占位框、审计在范围外。用户需要把 `@eform` 拓宽为三成员团队，覆盖三个版块：表单生成（列表页 + 表单页 + 数据生命周期）、表单电子签（身份验证 + 手写签名 + 清空重签 + 锁定）、表单操作审计（参数化开关 + 五类操作日志 + 仅查看不可删）。关键澄清：列表页/表单页的功能按钮（新增、修改、保存、提交审核、打印、导出等）针对的是**表单数据记录**的增删查改，不是表单模板本身的增删查改——产物是可独立运行的小型表单应用，不是静态模板预览。

## 用户结果

- 团队入口 `@eform` 表单匠（队长）：上传原件 → 识别还原 → 生成表单应用（列表页 index.html + 表单页 form.html + schema/mock/spec 四件套扩展为六件套）。
- 列表页：展示已有数据记录（分页、状态筛选），提供新增/修改/删除数据记录及打开表单页的入口。
- 表单页：按 schema 渲染全部字段（结构/字段类型/取值方式标注），带保存、提交审核、打印、导出等数据生命周期按钮。
- 电子签（@esign 电子签师产出）：签名框字段点击 → 弹窗身份验证（演示账号）→ canvas 手写录入 → 笔迹缩放回填签名栏 → 未生效可清空重签 → 审核通过后锁定。
- 操作审计（@eaudit 审计员产出）：表单参数「启用审计日志跟踪」（布尔，默认 false）开启后，创建/保存/审核/打印/导出五类数据操作写完整日志；日志仅可查看，无任何删除入口；落盘 audit-log.jsonl。
- 三个版块由队长按 schema `capabilities` 参数统一调度，修改循环重生成后按能力开关重新派工注入，schema 是唯一结构事实源。

## 范围

- 团队形态：plugin.json 声明 3 agents（eform/master、esign/developer、eaudit/auditor）+ 1 team（eform-studio，eform 为队长兼对话入口）+ workflowPath 任务书。
- 板块1（eform-craft 技能改写）：产物从四件套扩为六件套（+ index.html 列表页 + form.html 表单页；preview.html 由 form.html 取代）；数据记录模型（localStorage 持久化，键按 slug 隔离）；数据生命周期状态机（draft→saved→approved，approved 后全字段与签名锁定）；schema v2（form.capabilities: {signature, audit} + form.statusFlow）。
- 板块2（esign-craft 技能新增）：签名组件注入规范（锚点 `<!-- ESIGN-ANCHOR -->`）；交互全流程（验证弹窗→canvas 手写→缩放回填→清空重签→锁定）；签名数据模型（dataURL + signer + signedAt + 状态）；演示账号本地比对（页面明示演示验证）；与审核锁定联动。
- 板块3（eaudit-craft 技能新增）：审计组件注入规范（锚点 `<!-- AUDIT-ANCHOR -->`）；auditEnabled 参数开关默认 false；五类操作埋点（create/save/approve/print/export）；日志行结构（事件/操作人/时间/记录键值快照/签名信息）；仅查看不删除（localStorage 追加 + audit-log.jsonl 落盘导出）；查看器抽屉。
- 契约分工：技能间共享的锚点、参数键、桩函数合同写在 eform-craft §6（唯一权威源），esign/eaudit 技能引用不重述。
- 合同测试扩充：三技能 frontmatter、团队清单结构、锚点与合同要素在 SKILL.md 中在场。

## 不做什么

- 终期项不做：MES 部署与菜单挂载、真实鉴权（签名验证是演示级，终期换 MES 鉴权）、真实数据接入（MCP）、静态资源打包出仓、Vue/Java 代码生成。
- 不引入运行时代码：仍是纯提示词资产 preset（空 activate），不注册 hooks、不做围栏。
- 不改 plugin-sdk / manifest Schema / PLUGIN_API_VERSION / docs/plugin 手册（teams/workflowPath 均为 allstar-coding 已在用字段）。
- 不做跨表单/跨用户共享数据（localStorage 单机演示级，终期换后端存储）。
- docx 审计表硬编码质检单字段不照搬：日志行采用通用「关键字段值快照」（自动收集该表单命中国定命名映射的字段值），质检单场景下自然覆盖 docx 字段要求。

## Given / When / Then

- Given：用户上传表单原件；When：@eform 队长识别生成并确认门批准；Then：六件套落盘，列表页可开、表单页可填，F# 三体一致。
- Given：schema capabilities.signature=true；When：队长派工 @esign；Then：表单页签名字段具备验证→手写→回填→重签→锁定全流程。
- Given：schema capabilities.audit=true 且用户在表单参数开启动用审计；When：用户执行创建/保存/审核/打印/导出；Then：每次操作追加一行日志（含关键字段值快照），无删除入口。
- Given：记录已审核（approved）；When：尝试编辑字段或清空签名；Then：页面拒绝并提示已锁定。
- Given：自然语言修改指认；When：改 schema 后重新生成；Then：revision+1，表单页/列表页重生成后按 capabilities 重新注入签名与审计组件，schema 与页面不分叉。

## 必须保持

- 一期识别合同不可协商（两张表逐字保留，含空格 fieldName 原样）。
- 确认门协议不变（先落盘→对话区输出全文→ask_user_question 极简卡）。
- mock 纪律不变（虚构占位、敏感打码）；审计日志中的字段值同样遵守（演示数据）。
- 插件权限最小集 `["agent.skills.control"]` 不扩大。
- schema 唯一事实源：一切结构变更先落 schema 再重生成页面；技能间共享合同只在 eform-craft 技能定义一次。

## 验收标准

- `bun run build:presets` 产出合法 vettapkg；manifest 合同测试（3 agents + team 结构 + 双 locale %key% + 三技能 frontmatter）通过。
- 三技能合同锚点测试：识别合同表、六件套名、capabilities 键、ESIGN/AUDIT 锚点、五类操作事件、审计「仅查看不可删」表述均在场。
- 五步验证链全绿（包内定向 → check:quick → test:impact → build:presets → 完整 check）。
- release notes 追加；project/ REQ+TASK 立案回填。

## 风险与失效条件

- 提示词资产无单测锁行为：交互质量依赖模型，用合同锚点测试锁规格面；实机验收另立任务。
- localStorage 为演示级持久化：清浏览器数据即失数据，属预期边界（终期换后端），需在页面与文档明示。
- 三技能由三个成员分别执行，锚点合同若有漂移会导致注入失败：靠「共享合同唯一权威源 + 合同锚点测试」双保险。
