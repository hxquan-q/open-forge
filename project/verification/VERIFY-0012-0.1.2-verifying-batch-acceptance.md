---
id: VERIFY-0012
type: verification
status: ready
owner: coordinator
source: coordinator 盘点（verifying 堆积批量收口）
created: 2026-09-27
updated: 2026-09-27
related_requirement: [REQ-0001]
related_plan: [PLAN-0002, PLAN-0006, PLAN-0010, PLAN-0013]
related_tasks: [TASK-0025, TASK-0026, TASK-0050, TASK-0064, TASK-0072, TASK-0074, TASK-0107, TASK-0120, TASK-0122, TASK-0123]
related_issues: [ISSUE-0011, ISSUE-0025, ISSUE-0026, ISSUE-0028]
related_bugs: [BUG-0034, BUG-0035, BUG-0036, BUG-0038, BUG-0040, BUG-0041, BUG-0042]
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.2 verifying 批次：Desktop 实机验收清单

本轮把 10 个 `verifying` Task、7 个 `verifying` Bug 与 ISSUE-0011 的实机证据一次性收掉。
环境与 VERIFY-0010 同构：隔离 Debug Profile（`~/.openforge-ui-debug`），Desktop dev 构建，
agent-browser 经 CDP 附着逐项断言；验收只写隔离 Profile，不动用户真实数据目录。

## 被验证的合同

### A. 内置浏览器 WebContentsView（TASK-0072 / ADR-0134）

- Given：工作空间打开「浏览器」tab 并输入地址；When：页面加载；Then：原生 view
  渲染在占位矩形内，工具栏出现加载指示，地址栏与后退/前进按钮状态随导航更新。
- Given：页面加载完成；When：切到其它活动 tab / 面板折叠；Then：view 隐藏，切回
  时同一页面原样恢复（不重新加载、不丢登录态）。
- Given：页面打开中；When：拖动面板分栏把手、把活动 tab 拖出为浮窗、拖浮窗角柄
  缩放；Then：全程可拖（view 指针穿透），松手后 view 恢复响应且 bounds 贴合。
- Given：点选元素后；When：即时编辑卡出现；Then：卡片停靠在页面上方（非浮层），
  应用文本/样式改动实时生效，发送/放弃路径行为不变。
- Given：页面 `window.open`/target=_blank 链接；When：点击；Then：同 view 原地
  加载，不另开窗口。
- Given：Agent 会话；When：`browser_tab` snapshot/截图/点选；Then：操作的是用户
  正看的同一页面，`pageRevision`/`stale_reference` 语义不变。
- Given：切换工作空间；When：两边都开过浏览器；Then：各 workspace 的 view 独立
  复用正确页面，互不串台。

### B. Transcript 游标分页（TASK-0050）

- Given：超大会话（数百轮）；When：打开时选「加载尾部」；Then：只读尾页，
  向上滚动到顶自动补拉更早页，滚动位置不跳，无重复/缺行。
- Given：窗口化会话中发送消息；When：乐观气泡落盘确认；Then：气泡收敛不残留
  重复；`agent_end` 后尾页增量延展。
- Given：窗口化会话；When：执行 HTML 导出；Then：导出文件包含完整会话而非仅
  已加载窗口。

### C. 后台进程健康（TASK-0107）

- Given：dev 实例运行中；When：手动 kill 会话搜索 Worker / 让 renderer 短暂
  无响应；Then：perf 快照与诊断包出现对应角色的 crash/restart 计数与 PID
  归因，unresponsive 时采到 JS 栈样本；搜索 Worker 重启预算耗尽后新搜索
  返回 `search-failed` 终态。

### D. 终端（TASK-0064 / TASK-0120 / BUG-0034 / BUG-0041）

- Given：多分屏终端反复拆分/收起/切换；When：持续数分钟；Then：无
  「Too many active WebGL contexts」告警、无终端黑屏（BUG-0034 回归）。
- Given：终端页打开；When：快速切换路由离开；Then：不发生 xterm dispose
  崩溃落到错误边界（BUG-0041 回归）。

### D2. Work 本地研究（TASK-0025）

- Given：Work 模式「来源」面板切到「本地研究」，选一个含 Markdown/文本的
  本地目录并提出问题；When：Agent 完成；Then：产出 `research-evidence`
  产物，附逐条来源清单；打开产物可复查每条来源为可用/缺失/已变更；
  删除其中一个源文件后复查，该条标为「缺失」而非静默通过。会话全程
  不访问默认知识库目录、不触发联网检索。

### D3. Work 数据分析（TASK-0026）

- Given：Work 模式「数据集」面板选一个 CSV/JSON 或 .xlsx 文件并填写
  明确分析目标（如「按地区汇总销售额」）；When：发起任务；Then：Agent
  先走 `dataset_profile` 画像（列/类型/问题行可见），产出 `dataset` 或
  `analysis` 产物，产物带来源清单；打开产物复查显示输入文件为「可用」；
  将源文件改名/删除后复查，该条标为「缺失」。全程源文件未被修改、
  未发生联网上传。
- Given：选一个非数据格式或超大文件；When：Agent 调用 `dataset_profile`；
  Then：返回明确的不支持格式/超限错误，不静默换路径、不猜目录。

### E. 其余 bug 实机回归

- BUG-0035：`verify:ui:sync:debug` 播种后 Debug Profile 里凭据可解密
  （无需重录密钥）。
- BUG-0036：组队装配页填入成员/队名后点空白 → 弹「丢弃草稿？」确认；
  空草稿点空白仍直接退出。
- BUG-0038：刚装的独立 CLI 首跑 `debug run` 不因 EBUSY 误报失败。
- BUG-0040：新建智能体不开「能力」页签直接保存 → 落盘为蓝图默认能力，
  详情页计数非零。
- BUG-0042：从预设蓝图自建克隆档案后，装机调和不再改写它、智能体库
  列表可正常加载。

### F. 团队编排（TASK-0122 / TASK-0123 / ISSUE-0025/0026/0028 收口）

- Given：真实团队会话；When：主控分派后；Then：主控让出回合由完成通知
  唤醒（不再 38 次 wait 轮询），`team_wait_tasks` 超时回包为四元组瘦身
  载荷；成员工具清单不出现 `browser_tab`；预算投影面板显示成员级
  回合/工具/token/时长与会话合计。该条同时是 TASK-0125 量化对比的
  复跑载体。

## 结果

- （待填：逐条记录成立/未成立，未成立项登记 Bug 或回落到既有条目）

## 环境

- 提交 / 版本：（执行时填 `main` HEAD）
- 操作系统 / Runner：Windows 11（本机），非 CI
