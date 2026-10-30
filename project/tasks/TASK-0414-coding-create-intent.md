---
id: TASK-0414
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: BUG-0158（TASK-0407 报告 F01/F02/F02b）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0407, TASK-0410]
related_issues: []
related_bugs: [BUG-0158]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 1e8fe6d5a
read_paths:
  - apps/desktop/src/renderer/root-layout
  - apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts
  - apps/desktop/src/renderer/domains/allstar-dev
write_paths:
  - apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.ts
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.test.ts
  - apps/desktop/src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.ts
  - apps/desktop/src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx
  - project/tasks/TASK-0414-coding-create-intent.md
  - project/tasks/README.md
  - project/bugs/BUG-0158-coding-create-intent.md
  - project/bugs/README.md
  - project/plans/PLAN-0026-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0158-coding-create-intent.md
exclusive_paths:
  - apps/desktop/src/renderer/root-layout/useCodingSessionLayout.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 新建 code 会话意图驱动布局初始化（BUG-0158）

## 目标

初始化绑定「新建意图」而非 active 布尔边沿：创建入口经 `beginCodingSessionCreation(cwd)`（写 coding 档 + 登记一次性意图）；布局 hook 按意图 nonce 消费一次，贯穿新会话页→会话提交。团队路由与开发档新会话页的边沿初始化保留现状；打开既有 coding 会话不再初始化。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0026 第 7 片（F10 依赖本片），主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：`useCodingSessionLayout.ts` 独占；atoms 与 Allstar model 为本片必要触点。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0026 第 7 片。

### 做

1. `workspace-mode-atoms.ts`：`codingSessionCreateIntentAtom`（cwd+nonce）与 `beginCodingSessionCreation(cwd)`；Allstar `onStartNewSession` 改走该入口。
2. `useCodingSessionLayout`：判定改返回语境（session/team/new-session/null）；意图驱动初始化（nonce 消费一次）；边沿初始化收窄到 team 与 new-session 语境。
3. 测试：意图红 3（F01/F02/F02b）+ 现状保留断言更新（coding 会话直入不再初始化的用例改写为「打开既有会话不初始化」）。

### 不做

- 不做团队创建意图（团队保留边沿初始化，现状语义）；
- 不改 codingLayoutActiveAtom 语义与宽度联动消费方；
- 不引入 cwd 精确匹配消费（nonce 已足够，残留意图风险见交付记录）。

## Given / When / Then

- Given code 会话 A 中手动布局后经创建入口再新建，When 新意图登记，Then 重新初始化（F01）。
- Given 新会话页初始化后手动改宽/开合，When 发首条消息经过渡到会话提交，Then 手动选择保留（F02）。
- Given work 会话，When 打开既有 code 会话，Then 不初始化（F02b）。
- Given 团队路由或开发档新会话页进入，When false→true 边沿，Then 照旧初始化。

## 必须保持

- `codingLayoutActiveAtom` 写入语义（旁路消费方依赖）；
- 离开 code 语境不回写；
- `enterWorkspaceSection` 其余调用方行为不变（work 回落不产生意图）。

## 测试与验证

- 定向：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/root-layout/useCodingSessionLayout.test.ts src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx`（apps/desktop 内）。
- 相邻：agent-mode-entry-points、useSidebarModel.workspace-view、AllstarDevHomePageView。
- `check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户实机（连续新建/首条消息/打开既有三条流程）。发布：未授权。

## 交付记录

- 实际修改：`workspace-mode-atoms.ts`（意图原子 + beginCodingSessionCreation 统一创建入口）；`useCodingSessionLayout.ts`（语境化判定 + 意图/边沿双路初始化，doc 注释同步）；`useAllstarDevHomePageModel.ts`（onStartNewSession 改走新入口）；两测试文件按新语义改写/补断言；BUG-0158/本 Task/索引与 v0.1.4 fragment。
- 实际运行：布局套件红 7→绿 7/7；Allstar 模型 8/8；相邻 39/39；`check:quick` 通过（ratchet new=0）。
- 未运行及原因：完整 check 与 impact 留批次收尾；实机三条流程待用户人工验收。
- Worktree：未拆出（主检出串行）。
- 剩余风险：残留意图（登记后未进入 code 语境又打开既有 coding 会话）会被消费掉并初始化一次——概率低且影响仅为一次布局初始化，未做 cwd 匹配（见任务不做项）；团队创建入口将来若要意图化，另立切片。
