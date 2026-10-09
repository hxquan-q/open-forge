---
id: TASK-0223
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/eform-craft
requirement: REQ-0012
plan: ""
source: REQ-0012
related_requirement: [REQ-0012]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3bf95be216
read_paths: [packages/plugins/AGENTS.md, packages/plugins/presets/allstar-coding, packages/plugins/presets/preset-agent, packages/plugins/presets/eform-craft]
write_paths: [packages/plugins/presets/eform-craft, project/tasks/TASK-0223-eform-team-preset.md, project/tasks/README.md, project/requirements/REQ-0012-eform-team-preset.md, project/requirements/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/plugins/presets/eform-craft]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# eform-craft 三版块团队化（REQ-0012 实施）

## 目标

把 eform-craft 从单 agent（四件套还原循环）升级为三成员团队（表单匠/电子签师/审计员），交付带列表页与表单页的表单应用六件套，电子签与操作审计按 schema capabilities 参数化启用。

## 范围

### 并发评估

- 结论：不支持（单一插件目录内聚改造 + 台账，无并行面）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：REQ-0012 已立案
- 冲突文件/独占路径：`packages/plugins/presets/eform-craft/`（本任务独占）
- Branch：chenxvhua（主工作区，用户授权直接修改）
- 集成：主工作区即交付物

### 做

- plugin.json：3 agents（eform/master、esign/developer、eaudit/auditor）+ team `eform-studio`（eform 队长）+ workflowPath `agent/workflows/studio.md`；locales 双语补 team/agent 键。
- 技能改写 `eform-craft`：六件套（schema.json / form.html / index.html / mock-data.json / form-spec.md / README 说明）、数据记录模型与生命周期状态机（draft→saved→approved）、schema v2 capabilities、共享契约 §6（锚点/参数键/桩函数，唯一权威源）。
- 新技能 `esign-craft`：签名组件注入（验证弹窗→canvas 手写→缩放回填→清空重签→审核锁定）、演示账号、签名数据入记录。
- 新技能 `eaudit-craft`：审计注入（auditEnabled 默认 false、五类事件埋点、追加式日志 localStorage+audit-log.jsonl、查看器抽屉、无删除入口）。
- persona：eform.md 改写（队长调度）+ esign.md / eaudit.md 新增。
- test/manifest.test.ts 扩充：团队结构、三技能 frontmatter、合同锚点（六件套、capabilities、锚点、五事件、仅查看不可删）。
- README.md / ability.json 同步；package.json 与 plugin.json 版本 0.1.0→0.2.0。
- `.github/release-notes/v0.1.3.md` 追加；REQ/README 索引与 Task 回填。

### 不做

- 运行时逻辑 / hooks / 围栏 / PLUGIN_API_VERSION / plugin-sdk 手册。
- 终期四项（MES 部署、真实鉴权、MCP 取数、静态包出仓）；Vue/Java 代码生成。
- tenants.json（eform-craft 已注册双 profile，无变化）。
- 真实 Desktop 端到端实机验收（另立任务）。

## Given / When / Then

- Given 用户上传原件；When 队长识别生成六件套并过确认门；Then 列表页/表单页可开、F# 三体一致、capabilities 与 schema 一致。
- Given capabilities.signature=true；When 派工 @esign 注入；Then 签名框支持验证→手写→回填→重签→（审核后）锁定全链路。
- Given capabilities.audit=true 且页面开启审计；When 用户执行五类操作之一；Then 追加一行含关键字段快照的日志，且界面无删除日志入口。
- Given 记录 approved；When 尝试改字段或清签名；Then 拒绝并提示锁定。
- Given 修改循环重生成页面；When 队长按 capabilities 重新派工；Then 组件按锚点重新注入，schema 与页面不分叉。

## 必须保持

- 识别合同两张表逐字不动（含空格 fieldName）；确认门协议、mock 纪律、权限最小集不变。
- 共享契约只在 eform-craft §6 定义一次；esign/eaudit 技能引用不重述。
- 「实际表单页面、不是潦草原型」定位锚点不回退。

## 测试与验证

- 包内定向：`bun ../../../../scripts/quality/run-vitest.mjs --run test/manifest.test.ts`
- `bun run check:quick -- <改动文件>` → `bun run test:impact -- packages/plugins/presets/eform-craft/plugin.json` → `cd apps/desktop && bun run build:presets` → 完整 `bun run check`。

## 验收分层

- 工程验证：五步命令全绿（见交付记录）。
- 技术评审：三技能 + persona + workflow 通读自查（合同一致性）。
- 人工功能验收：留待实机（另立任务）。

## 交付记录（2026-10-10）

- 实际修改：
  - `packages/plugins/presets/eform-craft/plugin.json`：3 agents + team eform-studio（eform 队长）+ workflowPath agent/workflows/studio.md；version 0.2.0。
  - `locales/{zh,en}.json`：补 esign/eaudit agent 键与 team.studio 键（双 locale 全解析）。
  - `agent/skills/eform-craft/SKILL.md`：改写为板块1主手册——六件套（preview.html→form.html+index.html）、数据生命周期状态机、schema v2（capabilities/statusFlow/dataKey）、共享契约 §6（锚点 ESIGN-ANCHOR/AUDIT-ANCHOR、桩函数、参数键、派工判定）。
  - `agent/skills/esign-craft/SKILL.md`（新增）：签名组件注入手册（演示账号 admin/admin123、canvas 手写、dataURL 回填、pending→signed、approved 锁定、与审核埋点联动）。
  - `agent/skills/eaudit-craft/SKILL.md`（新增）：审计组件注入手册（auditEnabled 默认 false、五类事件、追加式 localStorage+audit-log.jsonl、查看抽屉、无删除入口、记录级与表单级日志）。
  - `agent/agents/eform.md`：改写为队长 persona（调度+确认门+派工判定）。
  - `agent/agents/esign.md` / `agent/agents/eaudit.md`（新增）：成员 persona。
  - `agent/workflows/studio.md`（新增）：团队任务书（team_delegate_task 派工协议、修改循环重派工、验收要点）。
  - `test/manifest.test.ts`：扩充团队结构断言 + 三技能 frontmatter/合同锚点断言。
  - `README.md` / `ability.json`：团队与三版块描述同步；`package.json` version 0.2.0。
  - `.github/release-notes/v0.1.3.md`：「新增」节追加二期条目。
  - `project/requirements/REQ-0012` 立案 + 索引；本 Task 回填；`project/tasks/README.md` 焦点表行。
- 验证命令与结果：
  - 包内定向：`bun ../../../../scripts/quality/run-vitest.mjs --run test/manifest.test.ts`——13/13 通过（三成员+最小权限+角色断言、eform-studio 团队结构+workflow 任务书、三 persona 可读、技能 hidden、双 locale %key% 全解析（含 team 键）、eform-craft 六件套/生命周期/共享契约锚点、esign 全流程要素、eaudit 五事件+仅查看红线）。
  - `bun run check:quick -- <18 文件>`——通过（首轮 task-worktrees 报 branch "chenxvhua" 不符合同，按守卫 contract.mjs 的 INTEGRATION_BRANCH 集合改为 `branch: main`（与 TASK-0222 先例一致，串行任务主工作区交付）后复跑全绿；skill-frontmatter 56 文件、project-indexes、context-boundary 等守卫一次通过）。
  - `bun run test:impact -- packages/plugins/presets/eform-craft/plugin.json`——presets/eform-craft 13/13 通过（turbo 3 包缓存命中）。
  - `cd apps/desktop && bun run build:presets`——eform-craft 0.2.0 构建成功，产出 `release/eform-craft-0.2.0.vettapkg`（22 运行时文件）并 staging 到 `.artifacts/system-plugins/eform-craft/`（manifest/zip 校验无报错；staging 实查：3 persona + 3 技能 + workflows/studio.md + locales 完整在包）。
  - 完整 `bun run check`——exit 0（lint、5 端类型、全部守卫绿）。
  - 行为自查：通读三技能+三 persona+workflow——识别合同两张表逐字在场（含空格 fieldName）、共享契约 §6 锚点/键/桩函数/五事件与两专员技能引用一致（不重述）、派工判定表与 workflow 措辞对齐、确认门/mock 纪律/终期边界表述无歧义。
- 未做及原因：实机端到端（需真实模型与 GUI）；tenants.json（已注册无变化）。
- 已知风险：提示词资产行为面依赖模型；localStorage 演示级持久化（页面已明示）。
- 归属标注：Open-Forge-only。
