---
id: TASK-0215
type: task
status: verifying
priority: P1
owner: coding-agent
source: user-screenshot-2026-10-06
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0079]
execution: serial
branch: main
worktree: unassigned
base_commit: c2931b2e3
read_paths: [packages/coding-agent, packages/runtime-node, packages/runtime-desktop, apps/desktop/src/main/agent-runtime]
write_paths: [apps/desktop/src/main/agent-runtime/model-call-frame-contract.test.ts, packages/coding-agent, project/tasks, project/bugs, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 修正会话终端能力误判的提示词防护

## 目标与范围

来源：[BUG-0079](../bugs/BUG-0079-session-command-tool-unavailable.md)。定位截图中已加载本机能力却称不能执行命令的路径，修复可复现的软件合同缺陷；不承诺真实模型输出，不连接真实主机，不记录截图凭据。不重构无关架构、不改变权限与 work Profile 的默认收紧，不触碰既有 bun.lock 修改。分类：Upstreamable。

## 并发评估

必须串行：工具装配、配置选择和会话执行路径耦合，由当前 Agent 在 main 主工作区完成，无并行 Worker/新 Worktree。前置依赖无；独占本次相关实现与回归测试，Project 索引串行维护；集成顺序为回归→修复→完整门禁→原子提交。

## 输入、输出与 Given / When / Then

- 输入：用户截图和源码/测试；输出：修复、回归测试和验证证据。
- Given：宿主已注册平台命令工具，coding 会话允许该工具且使用完整访问。
- When：新建/恢复会话，配置允许的工具，并发起任务及后续模型调用。
- Then：实际模型请求含正确平台命令工具，执行结果回到下一轮；显式禁用、项目拒绝与审批边界仍有效。

## 实施取舍与不变量

优先沿既有配置/工具所有权接线直接修复，不新增重复工具源；只有证据证明职责冲突才重构。保持错误、取消、usage、stop、工具代际与角色语义。

## 测试与验证

先建立旧实现失败的定向回归；用真实内部装配 + 假 Provider/命令外部边界覆盖用户流程。执行仓库 Node runner、test:impact，必要时 test:changed，完成后 bun run check。禁止真实 Provider、用户状态、SSH/局域网与 verify:ui 测试。

## 验收分层与功能验收包

- 工程验证：定向、impact 与完整 check 通过；跨包批次首次 CLI 超时，失败文件完整复跑通过，详见下文。技术评审：自审；集成：integrated（本地 main，包含本记录的本次 fix(agent) 原子提交；未推送）。
- 人工功能验收：待验收；发布：未授权。
- 入口：Desktop 文档/代码会话，终端工具已启用；发送无害的本机命令任务，预期工具执行并返回输出，而不是误报工具缺失。显式禁用时仍不允许执行。
- 限制：软件合同与真实模型质量分别验证，不承诺自动 SSH 认证成功。

## 交付记录

### 事实、决策与范围收敛

- 普通 Desktop 会话 7 个 scenario 的实际 Provider 请求均包含平台命令工具，排除该路径的默认注册/装配遗漏；未访问截图会话真实配置，因此不能排除该会话显式禁用或模型个体差异。
- 现有工具指引只有文件探索/后台执行规则，没有明确区分 MCP 工具搜索、内置命令入口和 ping/ssh 可执行程序；截图恰在搜索后反复报告能力缺失。采用条件化 Prompt 防护，不修改工具加载、权限、Profile 或会话状态机。没有新增架构模式或公共合同，不需要 ADR。
- 新回归在旧 Prompt 下 3 失败/3 通过，失败点是缺少命令入口/发现边界指引，**不是复现真实模型输出**。默认工具可见性基线原本通过，不能将本次工作描述为修复注册丢失。
- 生产文件：packages/coding-agent/src/model-context/system-prompt-policy.ts；测试：packages/coding-agent/test/command-capability-guidance.test.ts、apps/desktop/src/main/agent-runtime/model-call-frame-contract.test.ts。Windows shell、POSIX bash、空工具集/仅 read/MCP、自定义 Prompt 均覆盖；Desktop 以 work 解释模式 + 默认 coding 能力跑无害命令，验证下一次 Provider 请求携带真实工具输出；显式只允许 read 时不暴露命令工具或虚假指引。
- 发布说明：当前 0.1.3 未打 tag，是迁移前手写版本且没有 fragments/ 标记。依交付规则保留手写版本的兼容路径直接追加「改进」；不迁移或覆盖既有正文。

### 实际验证

- 旧实现基线：Desktop 定向 preserves the exact，7 通过/4 被定向过滤。
- Red：command-capability-guidance.test.ts，3 失败/3 通过。
- Green：提示词、system-prompt、tool-search 三文件 38/38；Desktop model-call-frame-contract 13/13（真实内部 Runtime + 回环假 Provider + 无害本机输出，无真实模型或 SSH）。
- check:quick 首轮发现格式/info、串行 worktree 元数据和修改声明头问题，均已修正；没有弱化检查或改动基线。
- test:impact（显式指定上述 3 个实现/测试文件）：exit 0。新回归 6/6；coding-agent 相关 81 文件 565 通过/2 既有跳过；Desktop 13/13。依赖构建由标准选择器触发，不启动 Desktop 应用。
- test:changed（同一显式文件集）：执行 coding-agent、runtime-desktop、cli-host、desktop；coding-agent 1579 通过/3 既有跳过，runtime-desktop 51/51，Desktop 919 文件、4909 通过/15 既有跳过。CLI 首轮 227 通过/3 失败/14 既有跳过，整批 exit 1，不能报告单次全绿。
- CLI 3 个失败均来自 installed-artifact-runtime.test.ts 的 get_state 启动等待，20000ms、frames=0，尚未调用模型；未改任何 CLI 代码/断言/超时。按失败名称单独复跑 3/3，随后完整文件复跑 14/14（exit 0），证明是非确定性启动等待失败而非本次 Prompt 合同失败；没有据此声称定位了底层延迟根因。
- CLI 复跑命令（cwd apps/cli-host）：node ../../scripts/quality/run-vitest.mjs --run test/installed-artifact-runtime.test.ts；最初定位时附 -t 'settles an installed prompt|applies runtime Skill and MCP|migrates and continues an official Legacy'。
- 完整 bun run check：exit 0，涵盖 lint、types、guards 与 mobile lint；文档回填后再次执行同一门禁确认最终状态。
- 验证日志位于临时目录 open-forge-task-0215-{test-changed,cli-rerun,cli-file-rerun,check}.log；仅存隔离测试输出，不入库。
- 提交/推送：本地 main 原子提交本 Task 路径；保留用户已有 bun.lock 修改，因工作区非干净且存在其他人的批次，不推送 origin/dev，不执行发布。
- 技术评审：自审；新增指引只在最终已选择的命令工具存在时出现，未扩大工具准入、命令权限或网络授权；可执行程序安装/网络可达性不作预先保证，要求证据并避免凭据进入参数/日志。
- Worktree：串行主工作区，无独立 Worktree。执行中出现他人 Project 提交且提前收录了本 Task 初稿（272808ea0），保留不回退；本次仅提交自身路径差异，不夹带 bun.lock。
- 未运行：真实 GLM/其他 Provider、实际 SSH/局域网、verify:ui、打包发布，未获得授权。

### 待人工验收的模型案例

在命令工具开启的现有会话或新会话中，要求执行无害的本机网络诊断；工具可用时应尝试授权范围内的检查而非声称没有终端。MCP 查询无匹配时仍应识别内置命令入口。命令不存在、网络失败、审批拒绝时报告具体原因，不虚构连接成功。SSH 密码通过安全交互提供，验收记录不保存凭据。若仍误判，需该会话脱敏工具请求/响应证据，不能仅凭新 Prompt 声称模型问题已彻底消失。

### 2026-10-06 用户后续推送授权

- 用户明确要求提交推送后继续 Browser 相关修正。已审核 origin/dev..967daaf2e，只有上轮已检查的 Project 台账与本 Task 修正；main 后续其他任务提交不包含在推送中。
- 执行 git push origin 967daaf2e:refs/heads/dev，fast-forward 从 6cf889258 到 967daaf2e；git ls-remote 确认 dev 为 967daaf2e144bce99e45a5853ff5b14b8aa707ea。未推 origin/main、未 force、未发布，也未提交其他人的 bun.lock/文档站修改。
- Browser 后续工作见 [TASK-0218](TASK-0218-browser-capability-evidence.md)，其代码尚未集成或推送，不能将本次推送状态套用于后续分支。
