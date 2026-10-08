---
id: TASK-0217
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/allstar-coding
source: user-request（AC 黑盒自测迭代-需求清单.md，工作区自包含需求文档）
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0208]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 899f4fce5492dfd79ae7ad67bfee8bae54abdcc2
read_paths: [packages/plugins/presets/allstar-coding]
write_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md, project/tasks/TASK-0217-blackbox-selftest-iteration.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# allstar-coding 黑盒环节升级：能力探测 → 三态分流 → 自测（可选）→ 用户核验

## 目标

把 AC 流水线环节 10-11 从「黑测子只出文档、用户手动执行全部用例」升级为「通道探测 → 三态分流 → 出文档 →（可选）自测 → 用户核验」：宿主能力允许时由黑测子自动执行黑盒用例并留痕，用户从全量执行者变为核验者。

## 范围

### 并发评估

- 结论：不支持（单一插件包内聚改动）
- 执行方式：serial
- Branch：main（工作区，用户授权直接修改）
- 集成顺序：无需集成

### 做

- `src/fence/judge.ts`：仅 `role === "blackbox"` 的子会话分支新增读域过滤（read 仅放行 `docs/ac/` 前缀；grep/glob/ls/dir_tree/find 一律拦；path 缺失 fail-safe）与 shell 白名单（仅 `agent-browser` 前缀命令，其余含 git 只读全拦）。
- `scripts/ac-audit.mjs`：BASELINE_MATRIX.blackbox 增加可选 `read` 字段（单一事实源标记；judge.ts 矩阵同步）。
- `agent/skills/ac-blackbox/SKILL.md`：主改——五步流程、通道探测协议（browser_tab/agent-browser 有序清单）、文档 v2 模板（结果总表两列+接口卡+P# 清单）、自测执行纪律、核验协议、修复循环衔接。
- `agent/skills/ac-pipeline/SKILL.md`：环节表 10/11 语义、§2 产物规范、§4 生命周期表（黑测子按阶段重生）、§0.3 矩阵备注。
- `agent/agents/helper.md`：增补运行环境探测（接口卡合同）+ 被测服务起停委派类型。
- `agent/agents/allstar.md`、`agent/workflows/pipeline.md`：流水描述同步。
- `agent/skills/ac-gate/SKILL.md`：黑盒项措辞改为结果总表两列覆盖校验。
- `test/fence-judge.test.ts`：新增 blackbox 读域/shell 白名单/非 blackbox 不受影响合同测试。
- `test/stage-archive.test.ts`：stage 11 标签断言按需同步。
- `locales/zh.json`、`en.json`、`ability.json`：流水描述提及黑盒可选自测。
- `.github/release-notes/v0.1.3.md`：发布说明。

### 不做

- 不改内核（coding-agent/runtime-core/browser-automation）：工具链、审批、WebView 生命周期全部复用现状。
- 不给 Agent 加「打开活动面板」的宿主工具。
- 不做通用读路径过滤框架（只对 blackbox 角色窄过滤）。
- 不动 agent-teams 成员会话的 browser_tab 收窄（另一条链路）。
- 不实现桌面窗口/OS 级通道（清单留扩展位）。

## Given / When / Then

- Given 白盒通过进入环节 10，When 主控 spawn 黑测子探测通道，Then 按有序清单报告三态结论（可自测/能力在未激活/无能力）。
- Given 情况一（通道可用），When 出文档后，Then 黑测子逐条自测、回填总表自测列，全部完成后置「待核验」，用户只做终审（环节 11 必经门语义不变）。
- Given 情况二用户拒绝引导或情况三，When 分流降级，Then 出手测版文档（自测列预勾 ✓、无自测记录行），流水不断。
- Given blackbox 契约子会话，When 它调用 read/grep/glob/ls/dir_tree/find/shell，Then 围栏按读域与白名单判定：read 仅 docs/ac/ 前缀放行、目录发现类一律拦、shell 仅 agent-browser 前缀放行，其余 block（reason 带 ac-fence: 前缀与 help_protocol 指引）；其他角色行为不变。

## 验收标准

- fence-judge.test.ts 新增用例全绿且既有用例零回归（`bun run test:pkg` 或 run-vitest 定向）。
- BASELINE_MATRIX 与 ac-audit 权威源一致性测试仍绿（judge.ts 与 ac-audit.mjs 矩阵同构）。
- 技能/agent/workflow 文本与 stage-archive.test.ts、manifest.test.ts 断言一致。
- `bun run check:quick` → `bun run test:impact` → 完整 `bun run check` 全绿。
- 发布说明已写入 v0.1.3.md。

## 交付记录（2026-10-05）

- 实际修改（16 文件，均落在预设插件包、发布说明与本 Task 台账）：
  - 围栏行为（唯一行为代码改动）：`src/fence/judge.ts`——BASELINE_MATRIX 类型加可选 `read` 字段（blackbox 声明 `docs/ac/`）；blackbox 角色子会话新增读域过滤（read 前缀判定 + file_path 兼容回退 + 缺 path fail-safe；grep/glob/ls/dir_tree/find 一律拦）与 shell 白名单（首 token 大小写不敏感 === `agent-browser` 放行，其余含 git 只读全拦）；其他角色路径零改动。
  - 审计脚本：`scripts/ac-audit.mjs`——矩阵 blackbox 加同款 `read` 字段（与 judge.ts 同构，一致性测试锁住）；renderMatrix 输出加「基线读域」列与黑测子白名单说明。
  - 技能/提示词：`agent/skills/ac-blackbox/SKILL.md` 全文重写（五步流程、通道探测协议有序清单、三态分流、helper 接口卡委派、文档 v2 模板含示例、手测模式三处差异、状态机、自测执行纪律、核验卡、修复循环、state.md 映射）；`ac-pipeline/SKILL.md`（环节表 10/11、产物规范 v2 头字段、生命周期表「按阶段重生」、§0.3 矩阵黑盒行备注、§0.8 围栏约定、§5.3 黑盒复测语义）；`ac-gate/SKILL.md`（G3 黑盒项改「结果总表两列覆盖 + P# 对应」）；`agent/agents/helper.md`（第 6 条：运行环境探测接口卡合同 + 服务起停）；`agent/agents/allstar.md`（流水全貌、铁律 1/6 同步）；`agent/workflows/pipeline.md`（英文侧同源信息）。
  - 测试：`test/fence-judge.test.ts` 新增三组 describe（读域过滤 6 用例 / shell 白名单 3 用例 / 非 blackbox 回归 2 用例 + read 字段事实源断言），共 12 项。
  - 文案与版本：`locales/zh.json`、`en.json`、`ability.json` 黑盒措辞改「黑盒（可选自测+核验）」；插件版本 0.3.1 → 0.3.2（plugin.json/package.json/ability.json 三处联动）；`.github/release-notes/v0.1.3.md` 追加 v0.5.2 条目。
- 验证命令与结果：
  - 定向：`run-vitest.mjs --run test/fence-judge.test.ts` 74/74 通过（含既有 62 项零回归）。
  - 包内全量：`run-vitest.mjs --run`（ac-audit/manifest/state-rules/stage-archive/session-gate）53/53 通过。
  - `bun run check:quick -- <3 个改动文件>`：通过（release-notes 校验含 v0.1.3）。
  - `bun run test:impact -- <judge.ts/ac-audit.mjs/SKILL.md/zh.json>`：6 文件 127 项通过。
  - 完整 `bun run check`：exit 0（lint 4793 文件、类型 5 端、全部守卫含 project-indexes/package-boundaries/coding-agent-architecture 通过）。
- 未做及原因：真实宿主端到端（实机起 Desktop、开活动面板跑 browser_tab 自测）未执行——需要真实模型与 GUI 环境，且仓库规范不默认启动长驻 dev；行为层由判定器纯函数合同测试覆盖（生产装配为同一 judge 入口）。`test/stage-archive.test.ts` 无需改动：新 SKILL.md 保留 `stage 11/黑盒测试` 标签前缀（摘要改为「用户核验通过」），既有断言天然兼容（已核对）。
- 已知风险：ac-blackbox 技能重写为 prompt 合同，无单测可锁；靠 manifest/stage-archive 既有断言（frontmatter、技能引用集、stage 标记、轻量 git 子代理 + V4 措辞）与本次评审保证。情况二引导后的「重新探测」依赖主控遵守 spawn 纪律，围栏侧无机械强制（属提示词合同面）。
- 归属标注：Open-Forge-only（fork 专属流水线插件，不回馈上游）。
