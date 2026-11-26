---
id: TASK-0521
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: 上游 865d97823 / f940900be / b67141f40（PLAN-0032 P9a 后续，承接 TASK-0519 v2 数据模型）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0519, TASK-0489, TASK-0513]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 77bc68358
read_paths:
  - apps/desktop/src/renderer/domains/project/hooks/
  - apps/desktop/src/renderer/domains/project/services/
  - apps/desktop/src/renderer/domains/project/components/sidebar/
write_paths:
  - apps/desktop/src/main/ipc/scheduler.ts
  - apps/desktop/src/main/scheduler/scheduler-service.ts
  - apps/desktop/src/preload/api-types/scheduler.ts
  - apps/desktop/src/preload/apis/scheduler.ts
  - apps/desktop/src/renderer/shared/store/scheduler-atoms.ts
  - apps/desktop/src/renderer/domains/project/
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - project/tasks/TASK-0521-automation-sidebar-groups.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0519]
conflicts_with: []
integration_status: integrated
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0521 自动化侧栏会话组 + 右键创建入口 + 绑定会话删除提示

## 合同

- 来源与目标：上游三提交参照适配（不整段搬移，保留本地 ADR-0132 权限分层与 v2 runTarget 语义）：
  - 865d97823 侧栏把「每次新建会话」自动化的历次运行折叠成会话组：最近一条占位排序、点开组头展开全部运行、打开组内会话自动展开、钉住的会话不折叠、单条运行不成组。
  - f940900be 会话右键菜单「基于此会话创建自动化」：带预填打开自动化新建分屏（cwd=会话项目、prompt 预填会话主题/首条消息）。
  - b67141f40 删除被 same-session 绑定的会话前，确认框提示「该自动化将暂停」。
- 输入 → 输出：task-storage 已有 `loadAutomationSessionLinks`（TASK-0519 已写，含记录驱动 new-session 归属 + same-session 当前绑定）；输出到 renderer 侧栏投影。
- 做：
  1. main 侧：scheduler-service 暴露 getAutomationSessionLinks；IPC + preload 接线。
  2. renderer：scheduler-atoms 增加 links atom 与加载/刷新；删除会话后 links 同步失效（复用 tasks.changed 或显式刷新）。
  3. services/automation-session-groups.ts：折叠与展开投影纯函数（参照上游，钉住不折叠、组头 active/running 聚合）+ 单测。
  4. 侧栏接线：useDefaultSessionListModel / ProjectGroup / DefaultSessionList 把组投进行视图；展开状态本地内存（atom），打开组内会话自动展开；theme-ui 行视图加组头计数/展开指示/组员缩进。
  5. useSessionContextMenuModel 加「基于此会话创建自动化」项：仅普通会话（非 claw/team/batch 行），写 automationCreateRequestAtom + 导航自动化页。
  6. useProjectsPanelMenusModel 删除确认：会话被 same-session 绑定时提示将暂停（查 links atom），文案 i18n。
- 不做：自动化页列表+详情改版（TASK-0520）、组内会话单独删除语义变化、跨册（Allstar/团队）折叠。
- Given / When / Then：
  - 同一任务 3 次运行会话在项目会话列表 → 只显示 1 行组头（计数 3），其余隐藏；点开组头 → 3 行缩进列出，最新在前。
  - 组内任一运行被钉住 → 该会话不折叠，其余仍成组。
  - 打开组内隐藏会话（如从自动化历史跳转）→ 组自动展开并定位。
  - 右键普通会话 → 菜单含创建自动化项；点击 → 自动化页新建分屏，cwd/prompt 已预填。
  - 删除 same-session 绑定会话 → 确认文案含暂停提示；删除 new-session 运行会话 → 无该提示。
- 验证：投影纯函数单测 + 右键菜单与确认文案定向测试 + test:impact + bun run check。
- 人工验收：实机跑两次同一间隔任务后侧栏折叠形态、右键创建预填、删除绑定会话提示。

## 交付

工程完成（待人工验收）。

### 实现摘要

- main/preload 链路：scheduler-service 暴露 `listSessionLinks`（复用 TASK-0519 已落地的
  `loadAutomationSessionLinks`），新增 IPC 通道 `vetta:scheduler:get-session-links` 与 preload 接线。
- renderer：`automationSessionLinksAtom`（sessionPath 为键）为唯一事实源，`scheduledSessionPathsAtom`
  改为派生只读；root-layout 启动全量拉取，tasks.changed/record.updated 整体重拉，task.started 乐观插入。
- 折叠投影：`services/automation-session-groups.ts` 三纯函数（折叠/归属查找/展开投影），上游 865d97823
  参照移植；钉住豁免、成员 <2 不成组、组头聚合 active/running、组头 key/path 带 `automation-group:` 前缀。
- 侧栏接线：useProjectGroupModel / useDefaultSessionListModel 折叠后排序、打开组内会话自动展开、
  toggleGroup 内存态；theme-ui 行视图加组头计数/chevron/嵌套缩进/禁右键与 more。本地 claw/team/batch/
  归档/标签投影全部保留，团队会话 kind 不参与折叠（本地特有防护）。
- 右键菜单：普通会话（排除团队/批量/只读/禁止续写）新增「基于此会话创建自动化」，写
  automationCreateRequestAtom（same-session 绑定、prompt 预填首条消息、cwd 归一 bucket）并导航自动化页；
  自动化页既有 createRequest 消费链打开新建分屏，useAutomationDetailModel 新建态组装 same-session runTarget。
- 删除提示：useProjectsPanelMenusModel 删除 same-session 绑定会话时确认文案追加暂停提示
  （i18n：zh/en `sidebar.dialogs.deleteBoundSessionHint`、`contextMenu.createAutomation`）。

### 验证（实跑）

- 投影纯函数 4/4；右键菜单+menus 定向测试 20/20；受影响既有测试 36/36。
- `bun run test:impact`（9 个受影响文件）：271 个测试文件 / 1419 用例全绿（含构建 26/26）。
- `bun run check` 全绿（lint/types/guards/mobile-lint）；版权头审计 missing=0；断言深度门禁通过。
- release fragment `automation-sidebar-groups.md` 已组装进 v0.1.5.md；`--check` 退出 0
  （5 条风格警告均为预存在条目，非本任务新增）。
- 独立复查（verifier）：pass，十项复查点逐一取证无阻断；低风险观察记录在案——
  挂载期 links 重拉无 generation guard（下一次事件自愈）、`getScheduledSessionPaths` preload 兼容残留、
  `!teamDataFileMissing` 在创建自动化门控中冗余。均非本任务引入的行为缺陷。
- 未运行：`verify:ui:*` 与实机 Desktop（未获授权）。

### 人工验收点

1. 同一间隔任务连跑两次以上：侧栏该项目/对话列表只剩一行组头（显示运行次数），点开缩进列出历次运行。
2. 打开组内较早的一次运行（如从自动化历史跳入）：组自动展开并定位到该行；钉住的运行不折叠。
3. 右键普通会话 → 「基于此会话创建自动化」→ 自动化页新建分屏：名称/项目/prompt 预填，保存后执行历史
   在该会话内续写。
4. 删除被绑定的会话：确认框提示「该自动化将暂停」；删除仅参与「每次新建会话」的运行会话则无此提示。

### 不做项（合同内）

自动化页列表+详情改版（TASK-0520）、组内会话单独删除语义变化、跨册折叠、`getScheduledSessionPaths`
兼容通道清理。

