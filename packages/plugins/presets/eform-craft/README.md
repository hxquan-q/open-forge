<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-eform-craft

面向会话所属 **AIMES CustomDev 二开**的电子表单工坊：主控、需求（原型）、开发、测试、部署五角色，保留插件 ID `eform-craft`、Team ID `eform-studio` 和 `@eform` 主入口。Workshop 是标准功能模块，只作标明范围的参考，不是二开目标。

这是纯提示词/Skill 资产 preset，`activate()` 不贡献运行时代码。下述流程是 Agent 指引而非宿主机械门禁；静态合同测试不证明真实模型遵循，也不代表已连接、开发或部署任何 CustomDev 环境。

## 五角色

| Agent / mention | roles | 职责 |
|---|---|---|
| `eform` / `@eform` | master | 环境预检、用户交互、范围判断、协调并辅助成员；不把未知项目事实当规则 |
| `requirements` / `@eform-requirements` | business | 需求文档、按需原型/前端展示稿、字段取值逻辑；原型不替代工程实现 |
| `developer` / `@eform-developer` | developer | 根据确认需求与 CustomDev 实际合同完成前后端/API/配置/SQL 和必要测试 |
| `tester` / `@eform-tester` | tester | 按风险选黑盒/白盒；computer-use 可用且获准则尽量用，缺失时说明并替代；本地与完整 dev 包验收 |
| `deployer` / `@eform-deployer` | deployer | 仅 dev 测试服务更新/重启与验收支持；资料/安全执行能力不足时交付制品和步骤，不做生产 |

SDK 的 roles 是 slug 而非固定枚举白名单，当前 Schema 支持这五角色及 team member / workflow。Team 显式绑定本插件五名成员，不依赖全局角色槽位选人；不修改 SDK、Manifest Schema、API 版本或宿主。

## 操作合同与流程

[共享操作合同](agent/operating-contract.md) 是双根/配置、授权、Nacos/测试 DB、Git 与测试部署边界的唯一操作正文，四名成员经 `instructionsPath` 自动接收；主控和单 Agent 使用时按 Prompt 读取同一文件，不复制到各 Skill。

[Team workflow](agent/workflows/studio.md)：环境预检/首次 dev 同步 → 需求确认 → 开发 → 本地测试 → 校验占位跳过 → 私有分支推送/再次 dev 同步与 PR → 合入 dev 的完整二开包 → 测试服务器更新/验收。第二次 dev 合并冲突后不插额外本地复测，冲突影响在测试服务器确认，不能据此省本地原有行为测试。

项目根和 AI workspace 根来自 Code session Runtime；project-config.md 从该 AI workspace 读取。辅助需求/展示稿/Skills/记忆默认留 AI workspace，源码/测试/SQL/构建必需文件留 CustomDev。不得拼接本机路径或继续从旧项目内配置兜底。

操作须遵守当前用户授权，默认 dev 各项操作先批准，任务级授权只在当次范围有效；不是新增不可绕过硬门禁。Nacos 永不写、失败不猜测回退、DBX 只读元数据、测试凭据不复制输出；详情统一见共享合同。

## 共享 Skills 与来源去重

`agent.skillPaths = ["agent/skills"]` 是 **plugin 级共享目录**；按各 Agent Prompt 与 Skill 的 description/正文触发条件调用，不是 per-agent Skill 隔离。主控协助、测试回查可按同一条件使用，角色分配不是权限隔离。

### 五项已审阅候选的整编

| Skill | 主要角色与触发 | 旧 preset 去重 |
|---|---|---|
| `entity-form-attachment-parsing` | 需求：仅实体表单附件作为需求来源；先解析再交需求闭环 | 吸收旧 eform/结构模板的可见结构与层级方法，去掉固定生成骨架 |
| `form-field-specification-and-base-data` | 需求闭环确定字段规格；开发/测试核对 | 取代旧字段目录，统一基本类型/classXxx/signature，不并列旧 double/object |
| `form-record-lifecycle` | 需求/开发/测试：低优先级，仅需求/证据有状态流转 | 保留状态建模问题，不默认旧 draft→saved→approved |
| `electronic-signature-field-implementation` | 开发：最终规格含 signature 且本次明确增改电子签；需求先确认 | 吸收 esign 的领域问题，移除演示身份/组件注入，不承诺合规签署 |
| `operation-audit-domain` | 需求先确认、开发/测试按范围：仅明确增改审计功能 | 吸收 eaudit 的本记录事件问题，不保留固定五事件/全量快照平台 |

候选来源是工作区 `eformSkill-extraction-draft/<同名目录>/SKILL.md` 及 comparison.md；它们是整编依据，不直接称为批准的外部开发合同。

### eformSkill 全量 14 项

| 原主题（工作区 eformSkill） | preset Skill | 主要角色/保留范围 |
|---|---|---|
| 组织范围与权限边界 | organization-scope-and-data-permission | 开发/测试；CustomDev 与 Workshop 过滤/授权差异 |
| 查询与分页 | query-pagination-and-n-plus-one | 开发/测试；批量关联、数据库分页、真实 total |
| 新增写操作幂等 | idempotent-insert-operations | 开发/测试；非幂等写操作，实际设施需核实 |
| 数据库变更留档 | database-change-control | 开发/测试/部署；SQL 留项目、执行边界、逻辑删除单位唯一来源 |
| 后端CRUD与API契约 | backend-crud-and-api-contract | 开发/测试；CustomDev 自身模块/API，不套 Workshop 基类 |
| 用户元数据 | user-metadata-and-audit-boundary | 开发/需求/测试；新表用户归属可信赋值唯一来源，与审计区分 |
| 前端按钮与表单 | frontend-buttons-and-forms | 开发按需参考；明确只属于 Workshop 风格，不能自动套用 |
| 关联表单选择器 | relational-form-selector | 开发/测试；CustomDev LazyRemoteSelect 与 Workshop InfiniteSelect 分开 |
| qiankun子应用接入 | qiankun-subapp-integration | 开发/测试/部署；注册/资源/路由方法，参数不重复定义 |
| 需求到实现闭环 | requirements-design-to-delivery | 需求主用，开发/测试衔接；接收附件/字段结果，唯一需求工程方法 |
| 联调与故障定位 | integration-debugging | 开发/测试/部署；真实运行分层定位，错误/日志脱敏 |
| 构建发布与回滚 | build-release-and-rollback | 部署/测试；仅 dev 测试制品/验收/回滚，生产排除 |
| IDEA与Lombok处理器诊断 | lombok-annotation-processor-diagnosis | 开发/测试；只在对应症状触发，历史缺陷不当当前事实 |
| 项目结构与运行环境 | project-architecture-and-runtime-map | 主控预检，各角色按需；集中非敏感项目/基础资料证据 |

无为了数量删减非重复约定。Workshop 专属 UI/SQL 路径/CRUD/幂等与运行参数保留范围标签；Practice 示例不升级成会话 CustomDev 已实现事实。重复运行参数集中在项目事实 Skill，类型/用户元数据/逻辑删除/构建各有单一权威，不保留旧新两套同名规则。

基础资料映射与测试配置证据取自工作区 `eform/CustomDev测试环境核实-2026-11-06.md` 的非敏感结论，当前改造没有重连 Nacos/DBX。历史配置不是未来授权；具体新字段映射、实际 qiankun 注册、Codeup/服务器/签名/审计合同仍待验证。

## 从旧三成员 preset 迁移

- `eform-craft`、`eform-studio`、Agent `eform` 和 `@eform` 不变，但 eform 从“表单匠”变为主控。
- 旧 `@esign` / `@eaudit` Agent 不再提供；没有用 legacyIds 把旧专员静默折算成新职责，也不声称已迁移用户自建 Team/存量会话。引用 `eform-craft/esign` 或 `eform-craft/eaudit` 的自建 Team/配置需用户改绑至开发/需求角色；新任务建议选用更新后的五成员 eform-studio。历史会话保持历史内容，不改写旧产物。
- 旧五份 Skills（eform-craft、eform-fields-catalog、eform-structure-templates、esign-craft、eaudit-craft）由上述领域 Skills 取代，不作为兼容别名继续激活；旧显式 Skill 引用需改为对应新 Skill。
- 旧静态六件套、项目 docs/eform 写域、localStorage、演示账号、HTML 锚点、JS 桩函数和组件注入协议全部不再是当前实现合同。演示行为不是 CustomDev 生产能力，既有演示文件不由升级自动转换或删除。
- 本次保持包版本与依赖不变；实际发行前应按不兼容 Agent/Skill 标识变化准备版本与迁移说明，不能据未变版本误认为身份兼容。

## 验证

在 preset 目录运行 `bun run test`、`bun run check`、`bun run build`。测试从真实 SDK manifest 公共入口解析清单，检查共享合同、角色/locale、Skill 路由与资源链接；构建后还须核对 .vettapkg 中资源。它们不执行 CustomDev/远端操作，也不是 LLM 行为验收。

代表性真实会话验收案例见 [acceptance-cases.md](test/acceptance-cases.md)，仅获授权后运行；当前不访问真实模型/Codeup/Nacos/DBX/服务器。已发布 v0.1.4 说明不修改，本次条目加入仓库已有 v0.1.5 待发碎片批次，不汇编/发布，见 TASK-0480。

## Context Boundary

```yaml
purpose: "面向 AIMES CustomDev 二开的五角色 preset：提供主控/需求原型/开发/测试/测试部署 Prompt、Team workflow 与按需共享 Skills；纯提示词资产，无运行时贡献"
provides: []
consumes: []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
