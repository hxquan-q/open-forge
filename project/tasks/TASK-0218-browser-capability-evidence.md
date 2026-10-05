---
id: TASK-0218
type: task
status: verifying
priority: P1
owner: coding-agent
source: user-followup-2026-10-06
related_requirement: []
related_plan: []
related_tasks: [TASK-0215]
related_issues: []
related_bugs: [BUG-0079]
execution: parallel
branch: task/TASK-0218-browser-capability-evidence
worktree: ../open-forge-wt/task-0218-browser-capability-evidence
base_commit: ac2e24ef3e3a839207b8e1abbfebd192e6250912
read_paths: [packages/coding-agent, packages/runtime-mcp, packages/plugins/presets/browser, apps/desktop/src/main/browser-automation, docs/adr]
write_paths: [packages/coding-agent/src/model-context/system-prompt-policy.ts, packages/coding-agent/src/features/browser-tab/browser-tab-tool-contract.ts, packages/coding-agent/test/browser-capability-guidance.test.ts, packages/coding-agent/test/features/browser-tab/browser-tab-session-extension.test.ts, project/tasks/TASK-0218-browser-capability-evidence.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0039, TASK-0122, TASK-0123, TASK-0154, TASK-0159, TASK-0197, TASK-0200]
integration_status: pending
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# Browser 能力判断与缺失会话恢复指引

## 目标与来源

用户要求先提交推送 TASK-0215，再继续修正同类能力误判，包含 Browser。本轮已按用户明确授权把 967daaf2e fast-forward 推至 origin/dev（远端 SHA 已核对），没有推当前 main 上其他人的后续提交或未提交文件。

本任务延续 [BUG-0079](../bugs/BUG-0079-session-command-tool-unavailable.md)，修正通用能力判断与 Browser 入口/错误恢复指引。只证明软件合同，不把 Prompt 回归等同于真实模型质量评估。

## 范围、输入与输出

- 输入：现行浏览器工具合同、宿主实现、模型 Prompt 和隔离测试；输出：条件化能力指引、可恢复错误文本、回归测试。
- 做：以当前调用工具集为准，MCP 检索与 Skill 不替代工具清单；应用内 browser_tab 与独立 CLI 分清会话；no_browser_session 引导打开目标 Browser 页再重试，不能改用别的登录会话冒充。
- 不做：不扩大权限/注册工具，不修改 Browser UI/导航/会话持久化，不安装 CLI/Chrome，不访问用户浏览器、真实状态或付费模型，不修无关品牌文档。
- 分类：Upstreamable；无公共结构/权限/协议变化，错误码、details、isError、取消与 ref 语义保持。

## 并发评估

条件支持：其他任务在主工作区修改品牌文档。本任务不派子 Agent，由当前 Agent 在独立 task/TASK-0218-browser-capability-evidence Worktree 实施；与主工作区的代码读写范围不重叠。任务源自 main 已提交基线，不复制现有 bun.lock 或 docs-site 脏改动。

范围守卫对 TASK-0123 的 packages/runtime-*/src 通配前缀、TASK-0154 的 model-context、TASK-0197 的 project/tasks 广域范围报告潜在冲突，已登记 conflicts_with；发布说明与 TASK-0039/0122/0159/0200 的历史活动范围也重叠，已登记并要求集成时只追加本条、不覆盖其内容；相关代码没有未提交改动，本次仅在隔离工作树修改，集成前重新核实目标变化并串行合入。

测试/记录在工作树完成；集成负责人为当前 Agent。顺序：回归→实现→定向/impact/check→Task 提交→条件满足才集成 main。发布说明在 Task Worktree 随变更更新（0.1.3 为无 fragments 标记的迁移前手写说明，按兼容规则追加）；共享 Project 索引由主检出串行更新；不覆盖他人修改。若主检出仍有未完成修改，不强行合并或推走他人提交，保留已提交任务分支。

## Given / When / Then 与验收

1. Given：当前工具集有 browser_tab（无 shell/MCP 亦可）。When：生成真实工具集对应的提示词。Then：明确使用同一应用内会话 snapshot 与真实 refs，不误报没有浏览器、不要求先安装独立 CLI。
2. Given：只有命令工具或只有 MCP/Skill/空工具集。Then：不宣称 browser_tab 可用；MCP 空结果不能否定已暴露的内置工具，Skill 加载不授予执行权限。
3. Given：Browser 宿主函数存在但 WebView 未准备好。When：snapshot 返回 no_browser_session。Then：模型得到明确打开目标页/重试路径，不自动转移登录态；宿主恢复后可 snapshot→点击真实 ref→成功。
4. Given：stale_reference/policy_denied/cancelled。Then：保持原错误类别/拒绝/取消，不重试绕过策略，不伪造页面内容。

## 实施取舍

直接补既有 Prompt 与 Browser 工具描述/错误投影，避免新增能力注册表或让 Prompt 控制权限。不重新引入冗余全量工具清单；通用证据规则与仅在 browser_tab 可见时的具体路由分开。

## 验证计划

仓库 Node runner 定向 Prompt 与 Browser 扩展合同：先红后绿；test:impact 选择生产文件；仅编码涉及多包/公共结构变化才追加 test:changed；最终完整 bun run check（不替代测试）。Browser 宿主为外部假端口，其余扩展装配真实；UI/真实模型/网站/打包未授权不运行。

## 验收分层与交付记录

- 工程验证：定向、impact、Desktop 宿主与完整 check 通过（命令及首次失败见下）；技术评审：自审；集成：pending（主检出有其他任务未提交修改，不满足集成前干净条件）；人工验收：待验收；发布：未授权。
- 人工入口：已打开的应用内 Browser 页，请 Agent 查看/操作指定内容，应使用同一页；关闭页时明确说明打开目标页，不能一概说没有浏览器或悄悄换另一个账号会话。
### 实际修改与取舍

- system-prompt-policy.ts：在通用工具指引中明确当前可调用工具与实际结果是能力证据，MCP 索引不能否定内置工具、Skill 不注册工具或授权；仅在实际选中 browser_tab 时说明直接入口、真实 ref、独立会话隔离与非命令/网络探测用途。
- browser-tab-tool-contract.ts：直接调用无需 shell/CLI 安装；no_browser_session 共用一份恢复文本，要求用户在应用内 Browser 打开目标页再 snapshot，不把页面错误泛化为所有浏览器不可用，不静默换登录会话。code/details/isError、操作 Schema、审批等级、取消和 stale_reference 均保持。
- 回归：新建 browser-capability-guidance.test.ts 覆盖无 shell/MCP 时可用、缺失/被禁用不宣传、只有 Skill 索引不授予能力、自定义 Prompt；扩展装配测试覆盖 no_browser_session→页面准备好→snapshot→原样回传 ref 点击成功。
- 发布说明已追加至 Task 分支的 .github/release-notes/v0.1.3.md，依无 fragments 标记的旧版兼容路径，不改已发布正文。
- 技术自审：未新增任何工具、权限或浏览器会话，没有复制 cookies/token；缺页错误使用静态安全文本不回显未知宿主错误消息。没有长期架构取舍，无需 ADR。

### 实际验证

- 创建 Worktree：bun run worktree:create --task TASK-0218 --no-setup；来自 ac2e24ef3，不复制主检出未提交内容。bun install --frozen-lockfile exit 0，未修改锁文件。worktree:status 与 worktree:check --task TASK-0218 通过；首次全局范围守卫命中的历史广域冲突已登记，不回退其他 Task。
- Red（cwd packages/coding-agent）：node ../../scripts/quality/run-vitest.mjs --run test/browser-capability-guidance.test.ts test/features/browser-tab/browser-tab-session-extension.test.ts；4 失败/6 通过，失败为缺少能力与缺页恢复指引，不宣称复现真实模型输出。
- Green（同 cwd）：上述新测试 + test/command-capability-guidance.test.ts + test/system-prompt.test.ts + test/tool-search.test.ts + test/features/browser-tab，7 文件 63/63。
- test:impact（生产两文件 + 两个测试显式文件集）：exit 0；直接 10/10，相关 85 文件 590 通过/2 既有跳过。没有新增 skip。
- Desktop 宿主验证（cwd apps/desktop）：node ../../scripts/quality/run-vitest.mjs --run src/main/browser-automation/in-app-browser-tab-host.test.ts src/main/ipc/canvas-browser-tab.test.ts src/main/agent-runtime/model-call-frame-contract.test.ts；最终 3 文件 25/25。覆盖真正宿主路由、no_browser_session、取消、URL 拒绝与模型调用合同。
- 上述 Desktop 首次尝试暴露新 Worktree 未构建 runtime-ssh；通过标准 test:impact 入口构建依赖解决。随后 Electron 安装产物缺失，包 install.js 数次 exit 0 但未生成 path.txt，未删除依赖或改断言；最终通过 Electron 官方 ELECTRON_OVERRIDE_DIST_PATH 环境变量，仅为测试命令指定主检出已安装的同版本 39.8.10 dist。未启动 Desktop、未访问用户数据/实例；该环境变量没有落盘到项目配置。
- 完整 bun run check：首轮失败为夹具多写 filePath 字段和 release-notes 范围冲突未登记；按真实 ModelVisibleSkill 类型与 Task 合同修正，第二轮 exit 0。没有降低类型或守卫；交付记录更新后再次运行确认。
- 未运行 test:changed：仅 coding-agent 包内 Prompt 与错误文本变化，无跨包结构/协议/持久化变化；包内 impact + Desktop 公共边界定向合同为最低充分范围。未运行真实模型、实际网站、verify:ui、应用打包发布，均未授权。
- 暂存提交只列本 Task 的 6 个文件；主检出品牌/文档站/bun.lock 归其他任务，保持原状；先保留独立 Task 原子提交，等待主检出具备干净集成条件。
- 日志：临时目录 open-forge-task-0218-{red,targeted,impact,check,desktop-final}.log。真实模型是否仍误判、特殊站点登录态行为需要人工验收；不将软件绿灯当作模型质量保证。

### 主检出交接

- Browser 代码提交：a326a644b（task/TASK-0218-browser-capability-evidence），工作树干净。
- 主检出仍存在其他任务的文档站/品牌源码与 bun.lock 未提交变更，不满足合并前干净条件；此处只记录交接，不表示 Browser 代码已进入 main/origin/dev。
- 后续：其他任务完成后，按开发流程核对目标文件与冲突记录，串行合入该分支，重跑受影响测试与 check；本轮不清理未集成 Worktree。
