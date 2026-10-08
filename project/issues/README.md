# Issues

这里记录仍需决策、调查或澄清的问题，不替代 GitHub Issues。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/issue.md`](templates/issue.md)。

- 外部协作、PR 关联和公开讨论：GitHub Issues / Discussions。
- 本地工程推理、候选方案、证据和决策：`project/issues/ISSUE-xxxx.md`。
- 已确认并可复现的错误应转为 `project/bugs/BUG-xxxx.md`。

## ISSUE 与 BUG 区别

- Issue：问题存在，但答案、范围或方案尚未确定。
- Bug：实际行为偏离稳定合同，已有复现或可靠证据。

Issue 可以有多个候选方案；Bug 必须有复现、期望行为、实际行为和回归验证。

当前 Issue：

- `ISSUE-0001`：品牌化发布基建决策已冻结（done）；
- `ISSUE-0002`：Pi Adapter 暂不启动，触发条件常设（done）；
- `ISSUE-0003`：性能观测保存边界已冻结（done）；
- `ISSUE-0004`：exprot 与 project 管理边界（done）；
- `ISSUE-0005`：WorkspaceMode、AgentMode 与 capability Profile 边界（done，采用方案 C；相关 Task 阻塞已解除）；
- `ISSUE-0006`：Conversation → Task promotion 规则已裁决（done；用户显式升级/注册工作流创建，普通 Chat 不自动升级；TASK-0028 ready）；
- `ISSUE-0007`：Open Forge Desktop 首发 SemVer 基线（done：Preview 定位、首发 `0.1.0`、Win+Linux 先行、Release 标 prerelease、上游基线 SHA 记入说明末行、publish 由用户执行）；
- `ISSUE-0008`：Apache §4(b) 修改文件声明与 Open Forge 归属（done：署名 `The Open Forge contributors`、可注释文件单行声明 + 动态 merge-base 审计脚本、JSON/二进制等白名单清单兜底、第三方清单工程生成用户终审）；
- `ISSUE-0009`：workspace package release scope（done：不公发任何包；`publish:private` 接 fail-closed 守卫、无 publishConfig 包补 `private: true`；重开需独立 Task）。
- `ISSUE-0010`：Work/Coding 两套开关共用文案造成干扰（done；方案 B 落地：TASK-0077 单一开关、TASK-0083 改称任务类型、TASK-0102 页头/新会话/右栏同一流程，BUG-0037 复验通过）。
- `ISSUE-0011`：报告/架构图单一生成路径（verifying；已确认方案 B，TASK-0074）。
- `ISSUE-0012`：团队内成员能力收窄的编辑交互（draft；推荐 assignment 负向增量 `excludedAbilities`，只收窄不扩张，pinned 不可收窄）。
- `ISSUE-0013`：团队内动态增员与成员子代理边界（draft；推荐最小步——仅 leader 获得 subagent 工具，完整动态成员待反馈再评估）。
- `ISSUE-0014`：多成员共享 cwd 的并发写防护（draft；推荐先做检测与提示，同路径排队仅窄场景兜底，工作区隔离需用户确认合并心智）。
- `ISSUE-0015`：Desktop 本地控制协议门面（draft；推荐 B——在 `apps/desktop` 起 loopback MCP server，把 `app-actions` catalog 映射为 MCP tools 并复用 approval broker 与 endpoint-file + token 发现；A（维持 `action-rpc` + `action` CLI）为保守备选，属架构变更，立项需 ADR）。
- `ISSUE-0016`：插件工作台能力面扩展（draft；推荐 A——按 views → services → bus → widget 逐项独立立项，不一次性扩 manifest 贡献面）。
- `ISSUE-0017`：特权宿主下沉（draft；推荐先做 A——把 session 绑定 workspace 解析、参数面去特权根与工具准入预算固化为 capability 合同，子进程/Rust 宿主等触发信号再评估）。
- `ISSUE-0018`：对话输入区能力建议面板信息层级待优化（draft；待确认 Skills/MCP/计划/图像/插件入口优先级与运行中交互规则）。
- `ISSUE-0019`：Work/Coding 模式与模型选择范围需要明确区分（done：已裁决方案 A 并实施——回合进行中锁定模型选择并明示生效边界，merge `4f4e4880e`，用户可见变化已入发布说明）。
- `ISSUE-0022`：流式停滞换连对用户是否可见（**前提已更正**：桌面 IPC 白名单缺 `"retry"` 致事件被拒并抛异常、团队 hub 静默丢弃——属缺陷面；修复进行中，展示语义待用户拍板）。
- `ISSUE-0020`：Desktop 内存占用偏高需要建立基线并定位主导进程（draft；2026-10-03 只读采样定位到 15 个插件开发服务器及高占用 Renderer，待普通 dev / dev:lean 同条件对照，尚未确认泄漏）。
- `ISSUE-0021`：i18n 懒加载与离线策略（draft；已补首轮源码态 locale 体积 ≈543KB，打包产物占比待一次 renderer 构建审计）。
- `ISSUE-0023`：修改声明头守卫 ratchet 已落地（done）：`--baseline` 快照豁免存量 671 条、挡住新增，接入 check-guards；剩余 quiet-window 一次性 sweep 待拆 Task。
- `ISSUE-0024`：官方能力市场源 `hxquan-q/open-forge-marketplace` 未发布，能力页常驻同步失败横幅（done；按方案 A 发布仓库 gh-pages 骨架，实机验证「已同步 · 0.1.0」、横幅消除）。
- `ISSUE-0025`：团队主控以 `team_wait_tasks` 轮询挂起回合 45min、38 次等待/34 次 timeout，已有的 `triggerTurn` 完成唤醒路径未被使用（verifying；A+B 短期项已由 TASK-0122 落地——提示词引导让出回合 + timeout 载荷瘦身，量化收口待 TASK-0125 真实会话复跑）。
- `ISSUE-0026`：团队成员会话无 in-app WebView，`browser_tab` 报 `no_browser_session` 后靠自建 http server + agent-browser 降级（verifying；A 路径「工具清单剔除不可用项」已由 TASK-0123 落地，B headless 渲染工具仍为未决后续）。
- `ISSUE-0027`：团队质检深度无分级，「简单页面」任务仍走全量独立审计+修复回路占全程 ~47%（draft；短期做阶段化进度可见，中期委派合同引入质检级别；参照 HydraFusion Single/Cascade/Critique 与 multica 门禁阶梯）。
- `ISSUE-0028`：团队会话无会话级预算与可路由的阻塞/升级态，收敛全靠主控自觉（in_progress；候选 C 预算只读投影已由 TASK-0126 落地，A/B 熔断按决策触发条件待立）。
- `ISSUE-0029`：fork 的 GitHub Actions 预算耗尽，全部 workflow 秒败于 `an Actions budget is preventing further use`（draft；阻塞 TASK-0183/0184/0180/0182/0179 等的「CI 复跑绿」验收；待用户决定恢复预算或迁移 CI，本地/单元级证据可先行）。
- `ISSUE-0030`：allstar-coding 的 ac-fence 事中拦截层经 `origin/chenxvhua` 分支进入，插件权限从 `agent.skills.control` 扩到另加 `agent.hooks.register`/`agent.hookHandler.execute` 且判定 fail-open（draft；需求权限最小集合与验收级别的方向，TASK-0208 先按现状集成）。
- `ISSUE-0031`：ac-fence 写域 glob 与 agent-browser 通道的词法匹配边界——写域 `..` 逃逸（v0.4 起既有面）、shell 重定向写不受写域判定、通道引擎 URL scheme 越界均待统一裁决（draft；BUG-0080 只修了黑盒新增面，全角色统一修法与宿主侧配合待触发）。
