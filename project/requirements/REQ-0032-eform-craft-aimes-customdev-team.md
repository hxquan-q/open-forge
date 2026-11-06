---
id: REQ-0032
type: requirement
status: ready
priority: P1
owner: packages/plugins/presets/eform-craft
source: user-request（2026-11-06 AIMES CustomDev 五角色 Agent Team 改造合同）
created: 2026-11-06
updated: 2026-11-06
related_plan: []
related_tasks: [TASK-0450]
---
<!-- Copyright The Open Forge contributors. -->

# eform-craft AIMES CustomDev 二开团队

## 用户问题

现有 `eform-craft` 面向静态 HTML/mock 演示，三名成员与技能包含旧演示实现合同，不能作为 AIMES CustomDev 实际二开流程的可靠入口。表单原件识别、统一字段规格、真实工程开发、测试和测试环境部署需要明确分工，并以会话项目上下文及可验证项目合同为依据。

## 用户结果

保留 `eform-craft` 插件、`eform-studio` Team 与 `@eform` 主入口，改为主控、需求/原型、开发、测试、部署五角色。原件识别及电子签、审计、生命周期等领域知识按触发条件组织为共享 Skills；需求和原型只形成规格材料，正式实现由开发角色依据 AIMES CustomDev 实际合同完成。

本需求替代 [REQ-0014](REQ-0014-eform-craft-preset.md) / [REQ-0015](REQ-0015-eform-team-preset.md) 中面向当前 preset 的静态生成/三成员实施合同；旧记录保留为历史来源，不倒填其人工验收，也不自动迁移旧演示产物。

## 范围

- 主控负责环境预检、用户交互、范围判断、调度和协助；未知项目事实不得写成已确认规则。
- 需求/原型负责需求文档、按需的原型/前端展示稿及字段取值逻辑；原型不得替代工程实现。
- 开发负责依据实际项目合同完成前后端、API、配置和数据库工作。
- 测试按风险组合黑盒/白盒测试；computer-use 可用时尽量使用，不可用时说明并采用其他验证。
- 部署当前限于 dev 测试服务器的二开模块更新、目标服务重启和验收支持；不含生产部署。
- 项目根、per-project AI workspace 根和 `project-config.md` 均从当前 Code session Runtime 上下文取得，不拼接本机路径；源码与测试留 CustomDev，需求/Skills/记忆等辅助材料留 per-project workspace。
- Nacos 与测试 DB 遵守只读、Nacos 优先、失败不回退猜测、任何情况下不写 Nacos、不连生产库；DBX 仅用于获准的只读 Schema/元数据核验。
- 保留最小权限与现有 plugin/team ID、`@eform` 入口；Manifest 不支持的能力不得通过修改 SDK、Schema、API 版本或宿主补齐。

## 不做什么

- 不把 `D:\Coding\WorkSpace\CustomDev\workshop` 当作二开目标；Workshop 只可作清晰标注范围的参考。
- 不迁移旧 `draft→saved→approved`、localStorage、静态 HTML/mock 六件套、锚点/JS 桩函数、演示账号或组件注入协议为 CustomDev 合同。
- 不默认将原型或展示稿写入 CustomDev 项目；不把 AI 辅助材料放入 CustomDev 根目录。
- 当前不实施生产 `main` PR、生产打包、发布或部署；本 Task 也不操作 Codeup、Nacos、DBX、CustomDev 服务器或远程分支。

## Given / When / Then

- Given 用户提出 AIMES CustomDev 表单二开请求；When Team 开始工作；Then 主控从当前会话上下文识别项目根和 AI workspace 根，先检查现场与项目配置来源，不硬编码本机路径或把未知事实当规则。
- Given 用户提供实体表单附件；When 需求角色开始规格工作；Then 先解析可见结构和原始字段，再把结果与用户需求交给需求闭环继续澄清；无附件的一般二开不调用附件解析 Skill。
- Given 字段规格需确认；When 需求闭环处理字段；Then 只输出统一基本类型、经目标表关系核实的 `classXxx` 或独立追加的 `signature`，不并行输出旧 `double`/`object`；F# 仅作非展示关联标识，CustomDev `fieldName` 按实际标准列名核实。
- Given 生命周期、电子签或操作审计未被需求/项目事实支持；When Agent 规划实现；Then 不默认套用旧演示状态或能力，且仅按各自已确认触发条件调用领域 Skill。
- Given 用户需求进入实施与验收；When 开发、测试、部署角色执行；Then 以当前 CustomDev 项目合同为事实，严格遵守测试环境、安全、Git 与生产边界，如实记录验证和未执行项。

## 必须保持

- Manifest Schema 已支持五个 Agent、角色 `roles`、team members 与 workflow；不改 `plugin-sdk`、Manifest Schema、`PLUGIN_API_VERSION` 或宿主。
- `skillPaths` 是 plugin 级共享路径；用职责说明与触发条件控制 Skill 调用，不宣称 per-agent 隔离。
- CustomDev 新二开表用 `creator_id`/`modifier_id`（BIGINT → `t_sys_user.id`），Service 从可信 `UserContextHolder` 取值且忽略 DTO 提交；逻辑删除使用秒级 `UNIX_TIMESTAMP()`；以 2026-11-06 工作区核实材料为证据，不从 Workshop 推断。
- 不复制或输出测试数据库凭据；测试 DB 配置仅从 Runtime 所属 AI workspace 获取，且只限测试。
- 旧 `@esign` 与 `@eaudit` 不再作为成员，其领域内容按触发条件保留为 Skills；迁移提示说明自建 Team/配置须改绑至新角色。

## 验收标准

- Manifest 恰有五个职责可区分的 Agent，Team 恰有五名成员且 `eform` 为首席/唯一入口；原插件 ID、Team ID、权限和 `@eform` 保持。
- 中英文 locale、五份 Prompt、Team workflow 与 Skill 映射合同测试通过；Skill 全部可从 plugin 级路径发现，触发条件与共享边界明确。
- 现有 `eformSkill/` 全部 14 项经核对后，适用内容按角色整合、去重；Workshop 专属内容保留显式范围；事实型合同只维护一份权威来源。
- 五项候选 Skills 按本 Requirement 的触发边界落地；旧演示实施协议不再描述为 CustomDev 能力。
- 包内合同测试、适用本地检查和 preset 构建通过；无 SDK/Schema/宿主/API 版本改动。

## 风险与失效条件

- 删除 `@esign`、`@eaudit` Agent 标识会影响引用旧成员的用户自建 Team；需在 preset README/Task 说明将其改绑到新职责 Agent，不能静默复用旧标识承载新身份。
- Skills 对模型调用时机的约束由静态合同测试验证，不能据此宣称真实模型行为或 CustomDev 工程能力已实机验收。
- 远程 tag 查询确认 `v0.1.4` 已存在；已发布说明不可修改。本次条目加入仓库已有 `v0.1.5` 待发碎片批次（与 TASK-0449 同口径），不擅自改 Desktop 版本、不汇编或发布。
