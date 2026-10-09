---
id: TASK-0222
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/eform-craft
requirement: REQ-0011
plan: ""
source: REQ-0011
related_requirement: [REQ-0011]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ff0009011
read_paths: [packages/plugins/AGENTS.md, packages/plugins/presets/allstar-coding, packages/plugins/presets/preset-agent]
write_paths: [packages/plugins/presets/eform-craft, packages/plugins/tenants.json, .github/release-notes/v0.1.3.md, project/tasks/TASK-0222-eform-craft-preset.md, project/tasks/README.md, project/requirements/REQ-0011-eform-craft-preset.md, project/requirements/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-09
updated: 2026-10-09
---
<!-- Copyright The Open Forge contributors. -->

# eform-craft 电子表单还原预置插件（REQ-0011 一期实施）

## 目标

交付 preset 插件 `eform-craft`（目录 `packages/plugins/presets/eform-craft/`）：纯提示词资产（单 agent `eform` + 单技能 `eform-craft`，运行时代码为零），承载实体表单电子化一期的识别合同、四件套产物规范、确认门与修改循环；注册进 `packages/plugins/tenants.json` 双 profile。

## 范围

### 并发评估

- 结论：不支持（新增独立插件目录 + 两处注册点 + 台账，单一关注内聚）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无（REQ-0011 已立案）
- 冲突文件/独占路径：`packages/plugins/tenants.json`（本任务内独占；无其他活动 Task 写它）
- Branch：main（主工作区，用户授权直接修改）
- Worktree：不拆出（串行小任务，主工作区直接实施）
- 集成负责人：本 Agent
- 集成顺序：无需集成（主工作区即交付物）

### 做

- `packages/plugins/presets/eform-craft/` 全部资产：package.json / plugin.json / tsconfig.json / vite.config.ts / vitest.config.ts / src/index.tsx（空 activate）/ README.md / ability.json / icon.png（128×128 占位）/ locales/{zh,en}.json / agent/agents/eform.md / agent/skills/eform-craft/SKILL.md / test/manifest.test.ts。不建包内 .gitignore（根 `node_modules/`+`dist/` 与 `packages/plugins/.gitignore` 的 `release/` 已全覆盖，已核实）。
- `packages/plugins/tenants.json`：development 与 production 两 profile 的 common 数组末尾各追加 `"eform-craft"`。
- `.github/release-notes/v0.1.3.md`：「新增」节追加一条（v0.1.3 为迁移前手写正文、无碎片，按 TASK-0221 先例直接改正文）。
- `project/requirements/REQ-0011-eform-craft-preset.md` 立案 + `project/requirements/README.md` 索引行。
- 本 Task 台账 + `project/tasks/README.md` 焦点表索引行。

### 不做

- 运行时逻辑、fence、teams、workflows——纯提示词资产。
- 终期四项：真实电子签名、审计日志、MES 部署、MCP 真实取数（技能内只留钩子与边界告知）。
- plugin-sdk / manifest Schema / `PLUGIN_API_VERSION` / docs/plugin 手册——全部用 allstar-coding 已在用的清单字段，无对外合同变化。
- 根 package.json workspaces（已通配 `packages/plugins/presets/*`）、根/apps tsconfig（插件目录不在 TS path map 体系内）——不改。
- 真实 Desktop 端到端（@eform 会话实际跑一次识别）——需真实模型与 GUI，仓库规范不默认启动长驻 dev。

## Given / When / Then

- Given：用户上传表单原件；When：`@eform` 按技能识别生成；Then：四件套落盘且 F# 三体一致（合同测试锁锚点）。
- Given：确认门弹卡；When：用户点「批准」；Then：form-spec.md 状态「已批准」；口头同意不算过关。
- Given：自然语言指认修改；When：改 schema 后重新生成；Then：revision+1，差异可核，schema 与 preview 不分叉。

## 必须保持

- 插件权限最小集 `["agent.skills.control"]`，不多声明。
- `F_Lot Number` / `F_Product Name` / `F_Quality Inspector` 含空格 fieldName 原样保留（需求方合同）。
- SKILL.md frontmatter 合规（description 双引号包裹、无裸 `": "`、≤1024 字符）——`check-skill-frontmatter` 机械校验。
- 识别合同两张表（标记→类型、同义词→字段名）在 SKILL.md 中逐字在场——合同测试锚点锁定。

## 测试与验证

- 定向测试：`cd packages/plugins/presets/eform-craft && bun ../../../../scripts/quality/run-vitest.mjs --run test/manifest.test.ts`（manifest/skill 合同）。
- 用户流程：本期无运行时代码，用户流程合同由 SKILL.md 承载；真实 @eform 会话验收留待实机（见不做项）。
- 质量检查：`bun run check:quick -- <改动文件>` → `bun run test:impact -- packages/plugins/presets/eform-craft/plugin.json` → `cd apps/desktop && bun run build:presets`（产出 `release/eform-craft-0.1.0.vettapkg`）→ 收尾完整 `bun run check`。

## 验收分层

- 工程验证：通过（五步命令全绿：包内定向 6/6、check:quick、test:impact、build:presets 产出 vettapkg 并 staging、完整 check exit 0；见交付记录）。
- 技术评审：自审（SKILL.md 与 persona 通读，识别合同/确认门/mock 纪律/终期边界四组规则核对无歧义）。
- 集成：与 frontmatter integration_status 一致（integrated，主工作区直接修改）。
- 人工功能验收：不适用（插件启用面由 build:presets staging 验证；@eform 行为面属 REQ-0011 后续实机验收，另立任务）。
- 发布：未授权（release-notes 已按规范追加正文）。

## 功能验收包

- 入口与前置条件：Desktop 启用 eform-craft 插件（preset 默认启用），会话中 @eform 可提及。
- 操作步骤或 AI 任务输入：上传一张带标记的表单图片，说「把这个表单电子化」。
- 预期行为与最终产物：`docs/eform/<slug>/` 四件套；preview.html 双击打开可填充演示数据；确认门弹卡。
- 不通过表现与已知限制：识别质量依赖模型能力（提示词资产无机械强制）；Excel/Word 依赖会话工具可用性，缺失时按降级路径请用户转格式。
- 验收反馈及回归案例：留待实机验收（另立任务）。

## 交付记录（2026-10-09）

- 实际修改（新增插件 15 文件 + 注册/说明/台账 8 处）：
  - `packages/plugins/presets/eform-craft/`：package.json（@vetta/plugin-preset-eform-craft 0.1.0）、plugin.json（权限恰为 `["agent.skills.control"]`、skillPresentation hidden、单 agent eform/master）、tsconfig.json、vite.config.ts（remoteName `eform_craft`）、vitest.config.ts、src/index.tsx（空 activate，纯提示词资产）、README.md（含 Context Boundary 块）、ability.json（中英 feature-grid）、icon.png（Pillow 生成的 128×128 RGBA 占位，表单线条+勾选意象）、locales/{zh,en}.json（4 键全解析）、agent/agents/eform.md（persona，七条铁律）、agent/skills/eform-craft/SKILL.md（识别合同两张表+通道矩阵+四件套规范+确认门+修改循环+终期边界）、test/manifest.test.ts（6 用例）。未建包内 .gitignore（根 `node_modules/`+`dist/` 与 `packages/plugins/.gitignore` 的 `release/` 已全覆盖，`git check-ignore` 实证）。
  - `packages/plugins/tenants.json`：development 与 production 两 profile common 数组末尾各追加 `"eform-craft"`（17/18 与 16/17 个插件，两处均验证 True）。
  - `.github/release-notes/v0.1.3.md`：「新增」节首条追加 eform-craft 条目（v0.1.3 为迁移前手写正文、无 fragments/ 目录，按 TASK-0221 先例直接改正文）。
  - `bun.lock`：`bun install` 自动收录新 workspace 包条目（含 allstar-coding 0.3.1→0.3.3 的顺带校正——该包 plugin.json 早已是 0.3.3，属锁文件滞后回填，非本任务改动面）。
  - `docs/architecture/dependents.md`：`--write-dependents` 重生成（plugin-sdk/plugin-vite 依赖者清单插入 `@vetta/plugin-preset-eform-craft`，新增一行空依赖记录）——context-boundaries 门禁对新增插件 README 的机械要求。
  - `project/requirements/REQ-0011-eform-craft-preset.md` 立案 + `project/requirements/README.md` 索引行 + 本 Task 台账 + `project/tasks/README.md` 焦点表行。
- 验证命令与结果：
  - 包内定向：`bun ../../../../scripts/quality/run-vitest.mjs --run test/manifest.test.ts`——6/6 通过（单 agent+最小权限、systemPrompt 可读、技能 hidden、双 locale %key%、frontmatter+正文体量、识别合同锚点 6 fieldName+6 标记+四件套+`__EFORM_MOCK__`）。
  - `bun run check:quick -- <18 文件>`——通过（首轮 context-boundary 报 dependents.md stale，按提示 `--write-dependents` 重生成后复跑全绿；其余守卫含 skill-frontmatter 54 文件、task-worktrees 222 任务、project-indexes 一次通过）。
  - `bun run test:impact -- packages/plugins/presets/eform-craft/plugin.json`——presets/eform-craft 全包 6/6 通过（依赖 turbo 3 包全缓存命中）。
  - `cd apps/desktop && bun run build:presets`——eform-craft 构建成功，产出 `release/eform-craft-0.1.0.vettapkg`（111136 字节，17 运行时文件）并 staging 到 `.artifacts/system-plugins/eform-craft/`（plugin.json/dist/locales/agent/icon 完整；manifest/zip 校验无报错，exit 0）。
  - 完整 `bun run check`——exit 0（lint 4793 文件、类型 root/cli/desktop/docs/mobile 5 端、守卫全绿）。
  - V7 行为自查：通读 SKILL.md 与 persona——识别合同（两张表逐字与需求原文一致，`F_Lot Number` 等含空格原样）、确认门（六步协议、口头同意不算过关）、mock 纪律（虚构占位、敏感打码）、终期边界（四项明确「占位/留钩子」）四组规则表述无歧义。
- 未做及原因：
  - 真实 Desktop 端到端（@eform 会话实跑一次识别）——需真实模型与 GUI，仓库规范不默认启动长驻 dev；行为面由 manifest/skill 合同测试+frontmatter 守卫覆盖，实机验收按 REQ-0011 另立任务。
  - 包内 `.gitignore`——根与 packages/plugins 两级已全覆盖构建产物，按「不画蛇添足」省略（实施契约预判一致）。
- 已知风险：提示词资产无单测可锁行为，agent 实际识别质量依赖模型（合同锚点测试只锁规格面）；Excel/Word 通道依赖会话工具（doc_to_pdf/dataset_profile）实际可用，技能已写降级路径。
- 归属标注：Open-Forge-only（fork 专属业务插件，不回馈上游）。
