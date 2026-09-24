---
id: TASK-0111
type: task
status: done
priority: P1
owner: scripts/quality
requirement: []
plan: PLAN-0011
source: RESEARCH-0012 Avernet P1（`arch.rules.md` 三级分类 + waiver 到期日 + red-flag 清单）
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [AGENTS.md, CLAUDE.md, scripts/quality/, project/CONVENTIONS.md]
write_paths: [AGENTS.md, docs/, scripts/quality/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0110]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 规则三级分类 + waiver 到期机制 + red-flag 评审清单

## 目标

Avernet 把架构规则分三级（**Invariant** 不可破 / **Policy** 可有 waiver / **Guideline** 建议），waiver 记录规则名/理由/风险/补偿/owner/**到期日**强制复审，red-flag 清单作评审预检（`arch.rules.md:26-35,750-784`）。Open Forge 的 `AGENTS.md`/`CLAUDE.md` 规则是平铺命令式，「临时放宽」一旦写下就永久化。本任务给规则体系加分级与例外到期复审。

## 范围

### 并发评估

- 结论：条件支持——主要写 AGENTS.md 治理段与 docs/，与 TASK-0110 在「守卫语义文档」上相邻需协调措辞。
- 执行方式：可独立 Worktree。
- 可并行 Task：PLAN-0010/0012 全部、TASK-0113、TASK-0114。
- 前置依赖：无。
- 冲突文件/独占路径：`AGENTS.md`（与 TASK-0110 的包级 README 不冲突，但根 AGENTS.md 若同期被改需协调）。
- Branch：独立 task 分支。
- Worktree：按 workflow 派工。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0011 阶段 B。

### 做

- 给根 `AGENTS.md` 与包级 `AGENTS.md` 的规则打三级标记（Invariant/Policy/Guideline）：Invariant 列出真正不可破项（包边界、安全红线、破坏性操作禁令等），Policy 列出可 waiver 项，Guideline 为建议；
- 定义 waiver 记录格式与存放位置（如 `project/decisions/waivers/` 或守卫脚本内注释块）：规则名/理由/风险/补偿/owner/到期日；到期日由 `bun run check` 或专门脚本校验——过期 waiver 报红；
- red-flag 评审清单：把「看到这个模式就该停下来复核」的模式写成清单（如新增 `any`、深链 import、`as` 断言蔓延、waiver 无限续期），供 PR 评审与 agent 自检；
- 为至少一个既有「实际违规但暂不修」的项登记首个 waiver，走通到期校验闭环。

### 不做

- 不重写 AGENTS.md 全文——只加分级标记与 waiver 机制段；
- 不做 waiver 自动批准/自动撤销（到期只报红，处置仍由人决定）；
- 不把规则条目化到数据库/外部系统，纯 Markdown + 脚本校验。

## Given / When / Then

- Given：一条带到期日的 waiver 记录；
- When：到期日前跑 `bun run check`；
- Then：放行且 waiver 可见；到期日后同一检查报红并指出 waiver 已过期；清单与校验逻辑有新单测覆盖。

## 必须保持

- 三级分类只加**元信息**，不改变任何既有规则的实际语义；
- waiver 机制不得成为绕过门禁的新通道——waiver 本身要过评审且必须带到期日；
- red-flag 清单是评审辅助，不是新门禁（不自动 fail，只提示）。

## 测试与验证

- 定向测试：waiver 解析/到期判定单测（未到期放行、到期报红、格式非法拒绝）；
- 用户流程：登记一个 waiver → 调整系统日期或伪造到期日 → 验证报红；
- 质量检查：`bun run check:quick`、规则文档人工审读。

## 交付记录

- 实际修改：
  - `scripts/quality/check-waivers.mjs`（新增）：扫描 `project/decisions/waivers/`，校验必填字段、ID/文件名一致性、日期合法性与 status 枚举；`active` 且 `expires < today` 报红。支持 `--today` 注入日期供测试与人工验证。
  - `scripts/quality/check-waivers.test.mjs`（新增）：5 例——未到期放行、到期报红、resolved/revoked 到期不红、缺字段/非法 status/文件名不符、重复 ID。
  - `project/decisions/waivers/README.md`（新增）：waiver 格式、字段语义、续期规则（到期不自动撤销也不自动续期，续期须新建并给新证据）。
  - `project/decisions/waivers/WAIVER-0001-desktop-legacy-hardcoded-zh.md`（新增）：首个真实豁免——desktop 存量硬编码中文（i18n 规则的 Policy 级例外），补偿条款=新增/改到的文案必须走 i18n，expires 2026-12-31。
  - `docs/dev/review-red-flags.md`（新增）：评审/自检清单，覆盖 `any`/`as` 蔓延、深链、mock 滥用、waiver 无限续期、守卫绕过、凭据泄漏、`git add -A` 等模式；明确是辅助而非门禁。
  - `AGENTS.md` + 23 个包级/目录级 `AGENTS.md`：各自追加「规则分级」段（Invariant/Policy/Guideline 组级分类），不改任何既有规则语义；根文件新增「规则分级与豁免」节并链接 waiver 机制与 red-flag 清单。
  - `scripts/quality/check-guards.mjs`：`check-waivers` 注册进 `bun run check`。
  - `package.json`：`check-waivers.test.mjs` 加入 `test:quality`。
  - `project/decisions/README.md`：登记 waivers 子目录。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run scripts/quality/check-waivers.test.mjs` — 5/5 通过。
  - `bun run scripts/quality/check-waivers.mjs` — `all waivers valid and unexpired`。
  - 用户流程验证：`--today 2026-10-01`（到期前）放行、`--today 2027-01-01`（到期后）报红并给出处置指引，即任务要求的「登记→到期前绿→到期后红」闭环。
- 未运行及原因：`bun run check` 全量未跑（共享工作区有大量并发改动，留到树末统一验收）；`check:quick` 随提交前序执行。
- Worktree：主工作区（单 Agent 串行实现，未派工）。
- 剩余风险：
  - 分级是组级标注而非逐条编号，单条规则归属有歧义时按 Policy 处理（已在根文件写明兜底）；
  - `apps/docs-site/AGENTS.md` 的追加段在 `next dev` 重写提示块时理论上可能被波及（块外内容按约定应保留），下次 dev 启动后留意；
  - WAIVER-0001 的到期日为估算值，复审责任在 apps/desktop owner。
