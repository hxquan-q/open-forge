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
- `ISSUE-0010`：Work/Coding 两套开关共用文案造成干扰（verifying；已确认方案 B，TASK-0077）。
- `ISSUE-0011`：报告/架构图单一生成路径（verifying；已确认方案 B，TASK-0074）。
- `ISSUE-0012`：团队内成员能力收窄的编辑交互（draft；推荐 assignment 负向增量 `excludedAbilities`，只收窄不扩张，pinned 不可收窄）。
- `ISSUE-0013`：团队内动态增员与成员子代理边界（draft；推荐最小步——仅 leader 获得 subagent 工具，完整动态成员待反馈再评估）。
- `ISSUE-0014`：多成员共享 cwd 的并发写防护（draft；推荐先做检测与提示，同路径排队仅窄场景兜底，工作区隔离需用户确认合并心智）。
