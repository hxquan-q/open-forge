---
id: TASK-0271
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/allstar-coding
source: user-report（TASK-0219 交付后人工审查发现的技能合同缺口）
related_requirement: []
related_plan: []
related_tasks: [TASK-0219]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 92337f595
read_paths: [packages/plugins/presets/allstar-coding, .github/release-notes]
write_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md, project/tasks/TASK-0271-ac-blackbox-channel-failure-degradation.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-09
updated: 2026-10-09
---
<!-- Copyright The Open Forge contributors. -->

# ac-blackbox 自测中通道失效降级路径（技能合同补漏）

## 编号说明

- 任务书成稿时按索引尾部预计 TASK-0219；2026-10-08 合并 origin/dev 后编号体系顺延（原 TASK-0217/0218 → TASK-0219/0220），实际取 TASK-0221（本次合并再顺延为 **TASK-0271**，原 0221 已被 dev 侧 renderer-flushsync 任务占用）。任务书中的 related_tasks `TASK-0217` 同批映射为 `TASK-0219`。

## 目标

黑盒自测跑到一半执行通道失效（浏览器工具连续报错 / L3 审批被拒 / 面板被关）时：黑测子停止逐条重试、未执行条目自测列留空不记 ✗、报告主控降级，剩余条目转用户手测，核验门简报首先点名缺口。不发明新状态、不改文档模板、不改围栏代码。

## 范围

### 并发评估

- 结论：不支持（单一插件包内聚改动）
- 执行方式：serial
- Branch：main（主工作区，用户授权直接修改）
- 集成顺序：无需集成

### 做

- `agent/skills/ac-blackbox/SKILL.md`：§2 降级路径汇总表补「自测中通道失效」行+表后注；§5 执行纪律第 2 条改失败分类（工具报错≠产品失败，记空不记 ✗、不进 P#）；追加第 6 条通道失效熔断（跨条目累计、任一成功清零、同工具连续 3 次报错、stale_reference 不计）；§6 核验门第 1 条补降级时简报第一句点名未自测条目区间。
- `agent/workflows/pipeline.md`：黑盒段英文概要同步降级语义。
- `package.json` / `plugin.json` / `ability.json`：0.3.2 → 0.3.3 三处联动。
- `.github/release-notes/v0.1.3.md`：「修复」节追加一条（v0.1.3 为迁移前手写正文、无碎片，按既有先例直接改正文）。
- 本 Task 台账与 `project/tasks/README.md` 索引。

### 不做

- 不改文档模板（§4）：不新增字段、不加「混合态」概念；降级事实写进既有 `探测记录`。
- 不改总表四值合同：「空=未进行」既有定义直接复用。
- 不改状态机（§4.4）：降级后照走 `待核验` → 环节 11 必经门；不新增「降级」状态。
- `执行模式` 字段值不因降级改动。
- ac-gate SKILL 零改动：G3 校验「✗ 与豁必有 P#」，工具报错记空不进 ✗/豁，天然不违例。
- 围栏代码（judge.ts / session-gate / fence.ts）与内核零改动：纯技能合同层，不涉及权限面。
- locales 零改动：无新增用户可见 UI 文案。
- 不新增任何测试：纯技能文档（LLM 合同）修改，无逻辑分支，落 AGENTS.md「纯文档…可不新增测试」条款；替代验证见下。

## Given / When / Then

- Given 自测中某工具跨条目连续 3 次报错（stale_reference 不计、任一成功清零），When 黑测子判定通道失效，Then 停止逐条重试：已执行条目保留真实结果，未执行条目自测列留空、不登记 P#，探测记录补错误原文，文档置待核验并报主控。
- Given 自测中用户在 L3 工具审批弹窗点拒绝，When 通道视同失效，Then 走同一条降级行，不二次打扰。
- Given 通道失效降级后进入环节 11，When 主控简报用户，Then 简报第一句点名未自测条目区间，请用户重点人工核验。

## 必须保持

- 环节 11 必经门语义不变；判定权始终在核验门。
- 降级不切换文档模式：中途失效的文档保持 `执行模式: 自测`。
- 流水不断：确认通道不可用后剩余条目转用户手测。

## 测试与验证

- 定向测试：通读改后 SKILL.md 与 pipeline.md 全文，核对内部引用（章节号、纪律编号、降级表行）自洽、与 ac-pipeline §0.3 权限矩阵黑盒行不冲突。
- 回归：`bun run test:pkg @vetta/plugin-preset-allstar-coding`（SKILL 变更不应影响既有测试）。
- 质量检查：`bun run check:quick -- <改动文件>`；收尾完整 `bun run check`。
- 文档核对：版本三处联动一致（0.3.3）；锚点引用的节号/字段名与改后文件实际一致。

## 验收分层

- 工程验证：通过（包内 133 项、check:quick、完整 check，见交付记录）。
- 技术评审：自审（逐锚点通读核对，见交付记录）。
- 集成：与 frontmatter integration_status 一致（integrated，主工作区直接修改）。
- 人工功能验收：待实机验收（技能合同面，与 TASK-0219 同口径）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：流水线进行到环节 10-11，黑盒通道探测判定可自测，进入自测执行。
- 操作步骤：模拟通道中途失效（如自测中关闭浏览器面板、连续触发工具报错、拒绝 L3 审批）。
- 预期行为与最终产物：黑测子停止重试、未执行条目留空、探测记录含首条错误原文、文档置待核验、核验简报首先点名缺口；无满页假 ✗ 与假 P#。
- 不通过表现与已知限制：技能合同是 LLM 行为合同，无机械强制（与 TASK-0219「重新探测」同面）；熔断判据阈值（3 次）为提示词层约定，宿主层熔断属范围外（另行立案）。
- 验收反馈及回归案例：待实机验收。

## 交付记录（2026-10-09）

- 实际修改（8 文件，全部落在预设插件包、发布说明与本 Task 台账）：
  - `agent/skills/ac-blackbox/SKILL.md`：§2 降级路径汇总表追加「自测中通道失效」行 + 表后注（L3 审批被拒视同失效）；§5 执行纪律第 2 条整条替换为失败分类（工具报错≠产品失败，记空、不登记 P#）；第 5 条后追加第 6 条通道失效熔断（跨条目累计、任一成功清零、同工具连续 3 次报错、stale_reference 不计、停止重试、探测记录补错误原文、报主控降级）；§6 核验门第 1 条补降级时简报第一句点名未自测条目区间。§1 探测协议确认零改动（补丁 E 为确认项）。
  - `agent/workflows/pipeline.md`：黑盒段英文概要在 `when a channel is available` 后插入 mid-run channel-death 降级语义（分号衔接，原句流不变）。
  - `package.json` / `plugin.json` / `ability.json`：版本 0.3.2 → 0.3.3 三处联动。
  - `.github/release-notes/v0.1.3.md`：「修复」节追加 v0.5.3 条目（v0.1.3 为迁移前手写正文、无碎片，按机制与先例直接改正文；`assembleReleaseNotes` 对「手写正文+碎片并存」会报错，故不建碎片）。
  - 本 Task 台账新建 + `project/tasks/README.md` 焦点表顶部追加索引行。
- 锚点漂移核对（2026-10-08 合并 origin/dev 后）：SKILL.md 与 pipeline.md 相对任务书锚点提交 `c3a55e53c` 无漂移（合并未触及），6 处补丁锚点全部按原文命中；任务编号体系顺延（原预计 TASK-0219 → 实际 TASK-0221，related TASK-0217 → TASK-0219）；三处版本号确认为 0.3.2。
- 验证命令与结果：
  - 包内全量：`bun run test:pkg presets/allstar-coding`——6 文件 133/133 通过（fence-judge/manifest/stage-archive/state-rules/session-gate/ac-audit，SKILL 变更零回归）。
  - 定向：`bun run check:quick -- <8 个改动文件>`——通过（exit 0；首轮发现本 Task `branch: chenxvhua` 不符 task-worktrees 守卫合同，按 TASK-0219 先例改为 `branch: main` 后通过）。
  - 完整 `bun run check`：exit 0（lint 4793 文件、类型 root/cli/docs/desktop/mobile 5 端、守卫含 release-notes v0.1.3 校验/project-indexes/task-worktrees/package-boundaries/coding-agent-architecture 全绿）。
  - 通读核对：改后 SKILL.md 内部引用自洽（纪律第 2 条 ↔ 第 6 条、§2 表行 ↔ §6 简报、表行触发列含 L3 审批被拒 ↔ 表后注）；与 ac-pipeline §0.3 权限矩阵黑盒行（读域/shell 白名单/通道工具放行）无冲突——本任务只加行为纪律，不动权限面；§4 文档模板、总表四值合同（空=未进行）、§4.4 状态机、`执行模式` 字段语义零改动（git diff 6 增 2 删全部为四个补丁）；版本三处 0.3.3 一致。
- 未做及原因：不新增测试——纯技能文档（LLM 合同）修改，无逻辑分支，落 AGENTS.md「纯文档…可不新增测试」条款；替代验证为包内 133 项回归 + 完整 check + 逐锚点通读核对。真实宿主端到端（实机黑测中人为关面板/拒审批观察降级）未执行——需真实模型与 GUI 环境，与 TASK-0219 同口径留待实机验收。
- 已知风险：熔断判据（连续 3 次、stale_reference 排除）是提示词层约定，宿主/内核层无机械强制（内核熔断在任务书 §7 明确范围外、另行立案）；降级后主控「重探或换备用通道」依赖主控遵守合同，与既有「重新探测」同面。
- 归属标注：Open-Forge-only（fork 专属流水线插件，不回馈上游）。
