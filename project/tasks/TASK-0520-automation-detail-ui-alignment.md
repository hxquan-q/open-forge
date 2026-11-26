---
id: TASK-0520
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0519, TASK-0521]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 62def6e44
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/scheduler/
  - apps/desktop/src/shared/i18n/locales/zh/automation.json
  - apps/desktop/src/shared/i18n/locales/en/automation.json
  - .github/release-notes/fragments/v0.1.5/
exclusive_paths: []
depends_on: [TASK-0519]
conflicts_with: []
integration_status: pending
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 自动化详情面板 UI 对齐上游（调度七档编辑、原因展示、打开聊天）

## 合同

- 来源与目标：TASK-0519 合同明示「渲染层 UI 改版留 TASK-0520」，但该任务从未建立；上游 d324bac37 分屏改版主体已覆盖，剩余渲染缺口遗留。上游参照：upstream/dev 的 schedule-picker（automation-schedule.ts / describe-schedule.ts / ScheduleEditorView.tsx）、useExecutionHistoryModel、useAutomationDetailModel、AutomationDetailPane。
- 缺口 1（最重，数据损毁风险）：调度编辑档位覆盖不全。本地选择器仅 once/daily/interval 三档，hourly/monthly/custom/非整小时间隔经 automationToSchedule 返回 null → 编辑器落回默认每天 9:00，编辑保存即毁损原计划（weekly 被强按 daily 档显示）。补齐七档直编判别联合：
  - 移植 upstream automation-schedule.ts 纯函数（defaultScheduleFor 切档沿用时刻、parseCronField/formatCronField/splitCron、pad2/sortMonthDays）。
  - 编辑器直接以 AutomationSchedule 为状态，删除本地 Schedule 中间层（scheduleToAutomation/automationToSchedule）与每周默认 9:00 的回退路径。
  - 保留本地紧凑弹层形态（不移植上游整表单行式布局——本地触发器/执行模式/权限分层为刻意分叉），弹层内扩成七档：单次/hourly/每天/每周/每月/间隔/自定义（cron 五段可视化 + 文本同步）。
  - 间隔改为分钟直编（对齐上游语义与上限一周），移除小时/天单位换算层。
- 缺口 2：skipped/missed 执行记录原因不展示——移植 recordPreview（history.reason.* + missedCount 合并 missedMany）；notifyError 属 webhook 面，不落。
- 缺口 3：详情面板无「打开聊天」——移植 onOpenChat（same-session 直达绑定会话；new-session 打开最近一次有会话的记录）+ canOpenChat + detail.openChat i18n。
- 缺口 4：runNow 运行中未禁用——接 runningTaskIds。
- 缺口 5：IPC 错误前缀未剥离——ipcErrorMessage 剥「Error invoking remote method …: XxxError:」。
- 缺口 6（顺手小修）：无任务+筛选非全部时空 label 改为上游口径；列表按 createdAt 倒序。
- describe 侧补齐：describeAutomationSchedule 全档位描述（hourly/monthly/custom 不再裸掉 cron 原文），schedule.* i18n 键按需新增。
- 不做：webhook/notifyClaw 通知（TASK-0519 明示）；上游列表「下次运行」副标题口径（本地「上次运行+结果」为刻意分叉）；权限分层/自动化包/保存确认/detailWidth 等本地既有形态。
- Given / When / Then：
  - 编辑 monthly/custom/非整小时间隔任务 → 弹层按原档位渲染，改动任一其他字段保存 → schedule 不被改写为每天 9:00。
  - 选择每周 → 星期 chips + 时刻编辑保存 → 写回 weekly 联合。
  - 执行历史 skipped/missed 记录 → 展示原因文案；missedCount>1 合并文案含次数与截止时间。
  - 编辑态底栏（非脏）→ 「打开聊天」可点：same-session 打开绑定会话，new-session 打开最近有会话的记录。
  - 保存被主进程拒绝 → 错误文案不含 IPC 前缀。
- 验证：cron-utils/automation-schedule 纯函数测试 + 执行历史预览测试更新 + 编辑保护既有测试（useAutomationDetailModel.edit-patch.test）保持绿；`bun run test:impact`；`bun run check`。
- 人工验收：编辑 monthly/custom 任务切换其他字段保存后计划不变；每周/每小时/每月/自定义/分钟级间隔均可编辑保存；skipped/missed 记录展示原因；详情页「打开聊天」跳转正确。

## 交付

### 工程完成（2026-11-26）

- 调度编辑器七档直编判别联合：移植上游 automation-schedule.ts 纯函数（defaultScheduleFor 切档沿用时刻、once 过期滚次日、parseCronField/formatCronField/splitCron、pad2/sortMonthDays）；编辑器状态即 AutomationSchedule，删除本地 Schedule 中间层（scheduleToAutomation/automationToSchedule/三档换算）与「null 回退每天 9:00」损毁路径；保留本地紧凑弹层形态，弹层内七档：once/interval/hourly/daily/weekly/monthly/custom（cron 五段可视化 chip + 文本双向同步）；间隔改分钟直编（上限一周，含 intervalHint）。
- 执行历史：移植 recordPreview——skipped/missed 展示 history.reason.*，missedCount>1 合并 missedMany 文案；notifyError（webhook 面）按合同不落。复查确认本地主进程本就生产 skipped/missed 记录（task-executor.ts / scheduler.ts），原因展示为真实可达路径。
- 详情面板：footer 编辑态新增「打开聊天」（same-session 直达绑定会话，new-session 打开最近一次有会话的记录，canOpenChat 门控）；runNow 接 running 禁用；ipcErrorMessage 剥 IPC 错误前缀。
- 列表：createdAt 倒序；emptyLabel 改上游口径（无任务时 undefined 由页面展示推荐模板，有任务被筛空才提示）。
- i18n zh/en automation.json 键集对齐核验一致（186 键）；新增 schedule 七档/form cron 与 hint/history reason/detail.openChat 全套键；清理死键 form.every/unitHours/unitDays/repeat。
- verifier 独立复查发现的红框退化已修：editorInputClass 改 border-transparent（原 border-none 压掉无效 cron 的 destructive 边框）；月编辑器补 monthlyShortMonthHint 展示；weekly/monthly chip 组补 role=group + aria-label（消费 form.weekdays/monthDays）。
- DESIGN D03 登记：SchedulerTaskFieldsView 净增 6 处原生 button（星期/月日/cron chip 网格与字段胶囊触发器），design-exceptions.json 登记 {D03: 6} 并在 DESIGN.md「已知例外」补说明；verifier 用审计函数实测前后 10→16 精确平账。
- 验证：scheduler 域 vitest 4 文件 33 用例全绿（含编辑保护合同 edit-patch 6/6）；test:impact 19 文件 144 用例全绿；`bun run check`（lint + types + guards）退出码 0；版权头审计 missing=0；release fragment 已汇编。
- 未运行：`verify:ui:*`（未授权）；人工验收待做——编辑 monthly/custom 任务切换其他字段保存后计划不变、七档均可编辑保存、skipped/missed 记录展示原因、「打开聊天」跳转正确。

### 人工验收

（待验收）
