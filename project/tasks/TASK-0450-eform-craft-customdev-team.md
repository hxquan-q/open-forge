---
id: TASK-0450
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/eform-craft
requirement: REQ-0032
plan: ""
source: user-request（2026-11-06 AIMES CustomDev 五角色 Agent Team 改造合同）
related_requirement: [REQ-0032]
related_plan: []
related_tasks: [TASK-0273]
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: 主仓主检出（串行；不创建独立 Worktree）
base_commit: efa47cf4cceca83b874aa48e2b697957c7e4acd0
read_paths:
  - AGENTS.md
  - packages/plugins/AGENTS.md
  - packages/plugins/README.md
  - packages/plugins/presets/eform-craft/
  - packages/plugins/plugin-sdk/src/manifest-schema.ts
  - packages/plugins/plugin-sdk/test/manifest-agent-roles.test.ts
  - project/requirements/REQ-0014-eform-craft-preset.md
  - project/requirements/REQ-0015-eform-team-preset.md
  - project/tasks/TASK-0272-eform-craft-preset.md
  - project/tasks/TASK-0273-eform-team-preset.md
write_paths:
  - packages/plugins/presets/eform-craft/
  - project/requirements/REQ-0032-eform-craft-aimes-customdev-team.md
  - project/requirements/README.md
  - project/tasks/TASK-0450-eform-craft-customdev-team.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.5/task-0450-eform-craft-customdev-team.md
exclusive_paths:
  - packages/plugins/presets/eform-craft/
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# eform-craft AIMES CustomDev 五角色团队改造（REQ-0032 实施）

## 目标

把三成员静态表单演示工坊改造成面向会话所属 AIMES CustomDev 二开的五角色 Agent Team，完成角色 Prompt、workflow、Skills、README/locales 和合同测试更新。保留插件 ID `eform-craft`、Team ID `eform-studio`、`@eform` 主入口及最小权限；不得改 SDK/Schema/宿主。

## 范围

改动归属：Open-Forge-only（面向 AIMES CustomDev 的业务 preset，不改公共 SDK/宿主合同）。

### 并发评估

- 结论：不支持（同一 preset、Skills 和合同测试共享写域）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：REQ-0032 已立案；Manifest Schema 合同核验通过
- 冲突文件/独占路径：`packages/plugins/presets/eform-craft/`
- Branch：当前主检出；不切换分支
- Worktree：主仓主检出串行
- 集成负责人：当前执行者
- 集成顺序：无并行集成

### 做

- Manifest 调整为五角色/五成员，保留 plugin/team ID、`eform` 主 Agent/mention 与最小权限；新增双语 locale、职责与迁移说明。
- 重写五份 Agent Prompt 与 Team workflow，表达环境预检、需求→开发→测试→校验占位跳过→dev 测试部署/验收、项目配置与 AI workspace 来源、Nacos/DBX/DB 安全边界、Git 操作授权及生产不做项。
- 将五个已审阅候选 Skill 与 `eformSkill/` 全部 14 个现有 Skill 去重整编到 plugin 级共享路径；Workshop 规则显式标注适用范围，唯一权威规则不重复定义。
- 扩展 `test/manifest.test.ts`，锁定五角色、IDs/handles、Skill 路径/触发条件、关键 CustomDev 安全与流程边界、旧 Demo 合同清除。
- 更新 preset README/ability 文案；本次保持 preset 包版本，避免未经发行准备改动版本线和根锁文件；五角色迁移影响另行明确说明。
- 记录远程 `v0.1.4` tag 已存在；不改已发布 Release Notes、不擅自 bump Desktop 版本；沿用 TASK-0449 与现有 `v0.1.5` 待发碎片批次写入本次条目，不汇编/发布。

### 不做

- 不改 `plugin-sdk`、Manifest Schema、`PLUGIN_API_VERSION`、宿主或其他插件；不变更插件/team ID、`@eform`。
- 不连接 Codeup、Nacos、DBX、CustomDev、本地/远程测试服务器或生产环境；不执行 CustomDev Git/build/deploy。
- 不 fetch/pull/push/部署；初始授权不包含提交，用户在交付后补充授权本次本地原子提交；远端仅执行过用户单独授权的 `origin` tag 只读查询。
- 不复制测试数据库连接字段/凭据，不改 Vetta per-project workspace 或 CustomDev 项目。
- 不修改已发布的 `.github/release-notes/v0.1.4.md`；不新增版本正文，仅沿用现有 v0.1.5 待发碎片批次。

## Given / When / Then

- Given Manifest Schema 支持五角色；When preset 声明五名 Agent 与 team members；Then 当前 SDK 合同可接受，不增加对 SDK/宿主的依赖。
- Given 一般二开、电子化实体表单附件、生命周期、电子签、审计等不同需求；When 对应角色工作；Then 仅按各 Skill 的已确认触发条件调用，且附件解析结果传入需求闭环。
- Given 目标项目或环境事实未核实；When Agent 读取项目配置、Nacos 或 DB；Then 使用会话 Runtime 根，不拼本机路径；Nacos 先只读、失败即停，不写 Nacos、不访问生产 DB、不泄露测试连接信息。
- Given 用户流程涉及测试与部署；When 五角色 Team 执行；Then 测试按风险选择方法，computer-use 可用则尽量采用；部署只限已核实的 dev 测试服务，生产边界与校验占位清晰。

## 必须保持

- `eform-craft`、`eform-studio`、`@eform` 和 `agent.skills.control` 权限不变。
- `@esign` / `@eaudit` 不再作为 Agent；README 提供自建 Team 改绑迁移说明，Skills 承载领域能力。
- `skillPaths` 保持 plugin 级共享；不得宣称 per-agent Skill 隔离。
- 需求附件 F# 只作非展示关联；字段规格只输出统一基本类型、已核实 `classXxx` 或 `signature`；CustomDev fieldName 按真实标准列名确认。
- CustomDev creator/modifier、秒级逻辑删除、基础资料映射以当前工作区核实材料为证据；Workshop 规则只作有范围标注参考。
- 不把旧 HTML/mock、localStorage、演示账号、静态生命周期、HTML 锚点/桩函数/组件注入协议说成 CustomDev 合同。

## 测试与验证

- 定向合同：`cd packages/plugins/presets/eform-craft && bun run test`；覆盖 Manifest、locale、Agent Prompt、workflow、Skills 和迁移边界。
- 包检查：`cd packages/plugins/presets/eform-craft && bun run check`。
- 构建：`cd packages/plugins/presets/eform-craft && bun run build`，核对产物中的 manifest 与 Skills 资源；不运行 Desktop 全量 preset 构建或全仓检查，除非定向验证要求。
- 仅改文档/Prompt 资产，不启动 Desktop、不做真实模型行为验收、不访问 CustomDev 或外部系统。

## 验收分层

- 工程验证：通过；最终包内合同 14/14、tsc、定向 Biome、Skill/Task 守卫与 preset build/包资源合同通过，详见交付记录。
- 技术评审：自审五个 Prompt、workflow、Skill 适用范围、去重与实际清单/产物；修正通用 @developer 与既有 Agent 短名重合，四个新成员改用 @eform-* 前缀；无独立审查或真实模型评估。
- 集成：串行主检出 chenxvhua，integration_status=pending（尚未集成 main）；用户在本地验证交付后补充授权本次原子提交，不推送。
- 人工功能验收：本任务不启动真实 Desktop/模型；需后续在获准环境验收真实 Agent 行为。
- 发布：未执行；v0.1.4 已发布，本次只写 v0.1.5 待发碎片，不汇编、不改 Desktop 版本。

## 交付记录

- 实际修改：五角色 Manifest、五份 Prompt（四份新增）、共享 operating-contract 与 workflow；整编五份候选和现有 eformSkill 全部 14 项为 19 Skills，README 逐项映射并说明 ID/Skill 迁移；双语 locales/ability；扩展合同测试并提供八类待授权真实会话验收案例；v0.1.5 待发 Release Notes 碎片。工作区外部候选仅读取，未修改。
- 实际运行与最终结果（2026-11-06）：
  - 包内 Manifest 红基线：3 失败 / 1 通过，准确锁定旧三成员和 Prompt；改造后先 4/4 通过。扩展测试清理前为 12/14，清理旧七文件并完成新 handle 后最终 `bun run test` 为 **14/14 通过**。
  - `bun run check`（preset tsc --noEmit）：exit 0，覆盖 src/test；后续只改 workflow/台账/README，不影响已通过的类型候选。
  - `bun run build`：exit 0；最终 `release/eform-craft-0.2.0.vettapkg` 有 41 个运行时文件。经 unzip CRC 与 SDK manifest/resource 检查，包内 manifest 与源码一致，含五角色、四个 @eform-* 新 handle、19 Skills、共享操作合同、workflow 与双语能力文案，排除旧五 Skill/两专员。只构建 preset，不 staging/启动 Desktop。
  - 仓库 `findSkillFrontmatterProblems` 定向检查最终 **19/19** 通过。
  - Biome 首次定向 CLI 因根 includes 未覆盖嵌套 preset 而 exit 1、未处理文件；随后用 stdin 和仓库已覆盖的虚拟同类型路径应用同一根配置，五个改动 JSON/TS 文件 check/format 全部通过，未改根 Biome 配置或新增临时文件。
  - `node scripts/quality/check-project-indexes.mjs`：通过；`check-task-worktrees.mjs` 首轮发现 read_paths 不允许绝对工作区路径，修正后通过（442 Task，0 warning）。
  - 本地 `git diff --check`：通过；当前主仓 HEAD 为 efa47cf4cceca83b874aa48e2b697957c7e4acd0，改动范围仅 preset、REQ/TASK/索引与本次 Release Notes 碎片。
  - 用仓库 `parseFragmentSections` 核验新增待发碎片：改进小节、2 条合法条目。
- 曾遇阻塞及处理：权限层两次拒绝删除旧七文件，随后向用户列明路径；用户明确批准后删除成功，未修改其他资产。清理前不构建混合规则包，清理后重新测试/构建/核包；该阻塞已解除。
- 未运行及原因：完整全仓 check、test:impact/test:changed、其他插件/宿主构建按用户限定范围不运行；Codeup、Nacos、DBX、CustomDev、测试服务器和生产操作均未执行；真实 Desktop/模型/computer-use 行为验收未授权。远端仅执行用户后来明确允许的 `origin` v0.1.4 tag 查询，确认该版本已存在（5b8347d653ab3cc1323c53dbeddd4c009b330d96），未 fetch/pull/push。
- 发布说明：沿用仓库已有 v0.1.5 待发碎片批次（与 TASK-0449 同口径），已写 `.github/release-notes/fragments/v0.1.5/task-0450-eform-craft-customdev-team.md`；保留已发布 v0.1.4，不改 Desktop 版本、不汇编/发布。preset 版本保持 0.2.0，发行准备时需考虑 Agent/Skill 迁移的不兼容性。
- Worktree：未拆出；单一 preset 写域串行。补充授权后的本地提交与本记录一同落在 chenxvhua，不单独追加 Hash 回执提交；未集成 main、未推送。
- 剩余风险：文本合同测试不证明任意真实模型遵循；`@esign`/`@eaudit` 与旧 Skill 使用者需迁移自建配置，旧会话不自动转换。具体新字段 API/DTO/列映射、实际 qiankun 注册、组织授权、电子签/审计接口、Codeup/服务器操作资料仍需后续授权核实；没有自行将 Workshop/Practice 或 Demo 行为升级成已确认 CustomDev 能力。
