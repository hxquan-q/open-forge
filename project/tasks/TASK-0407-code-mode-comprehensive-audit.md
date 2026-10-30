---
id: TASK-0407
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0025
source: user-request（2026-10-30，阶段性收尾后全面检测并在工作区交付报告）
related_requirement: [REQ-0030]
related_plan: [PLAN-0025]
related_tasks: [TASK-0404, TASK-0405, TASK-0406, TASK-0339, TASK-0392]
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: unassigned（用户指定主检出，只读审计与隔离验证）
base_commit: 98f7de9e6
read_paths: [apps/desktop, packages/coding-agent, project, docs/adr]
write_paths:
  - project/tasks/TASK-0407-code-mode-comprehensive-audit.md
  - project/tasks/README.md
  - .github/release-notes/fragments/v0.1.4/task-0407-code-mode-audit.md
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0339, TASK-0392]
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Code 模式会话独立、初始化与 LLM 热跟踪总体检测

## 目标与范围

按用户要求，在本批工具合同/页签接线修复收尾后，对三条用户流程做总体检测：

1. Allstar 独立入口、普通列表隔离、模式归属、既有会话模式固化与切换。
2. 应用启动默认新会话；新建 code 会话左栏收起、右栏打开、四页签排序及 50% 宽度；手动选择保持与创建过渡。
3. 普通/团队会话的文件、shell、内嵌浏览器活动显示与切换；隐藏面板、跨会话、异步和失败边界。

不做：本轮检测不静默修复新增产品行为缺陷；发现项在报告中分级、给出复现、证据与建议。既有 OOM 仅核对证据与是否有验证，不凭猜测定案。不调用真实付费 Provider、不操纵用户运行实例、不触发发布或远程 Git。

## 执行与权限

- 当前检出 chenxvhua 串行；工具/页签修复与审计共享热点，不派多 Agent，不新增并行工作树。
- 所有主动文件写入仅工作区 `D:/Coding/WorkSpace/Vetta` 或主仓 `D:/Coding/vetta/open-forge`；验证进程 TEMP/TMP/TMPDIR 指向工作区证据目录。
- 报告交付：工作区 `code-mode-audit-2026-10-30.md`；可复核证据与必要探针放 `code-mode-audit-evidence/`，不保留无用临时产物。
- 输入：当前源码/合同/测试/本地 Git、用户反馈与相关日志；输出：行为矩阵、真实测试结果、已确认/待验证问题及优先级。
- 归属：Open-Forge-only（内部审计）。

## Given / When / Then

- Given 普通与 code 会话并存，When 从正常入口新建/切换，Then 归属、列表和右栏模式与对应会话一致，普通入口不意外创建 code 会话。
- Given 一个新 code 会话，When 初始化、发送首条消息、再手动切栏/拖宽，Then 初始化仅影响新建入口，后续手动选择不被异步提交或相邻会话覆盖。
- Given AI 连续执行写文件、shell、browser_tab，When 用户观察右栏，Then 对应内容与实际活动一致、切换目标是实际 workspace，失败可解释；隐藏面板不影响执行。

## 验证方式

- 运行现有相关定向/连续流程测试，检查覆盖是否真的经过生产入口；补独立诊断探针验证疑似缺陷（明确期望红灯，不混入正常门禁）。
- 源码追踪生产者、消费者、权限与生命周期；发现需达到具体输入/状态→错误结果的可核实标准，不把日志时间重合当根因证明。
- 软件合同、隔离渲染、真实 Electron/真实模型、人工观感四层分开报告。未执行的不记通过。
- 前序任务：工具域与 Desktop 定向、test:impact、test:changed、完整 bun run check 的实际结果写回 TASK-0339/0392。

## 验收与交付

- 工程检测：报告与证据已交付；不是功能全面验收通过。
- 技术评审：当前会话自审；无独立模型结论。
- 集成：pending（仅本地交付，不推送）。
- 人工验收：报告待用户阅读，不冒充功能验收。
- 发布：未授权。

## 检测记录

- 主报告：`D:/Coding/WorkSpace/Vetta/code-mode-audit-2026-10-30.md`；证据目录 `code-mode-audit-evidence/`，报告含具体表现、源码位置、复现输入/输出、问题分级、建议与未验证范围。
- 正常 code 基线 24 文件/115 例通过；模式/浏览器补验 6 文件/77 例通过；页签 impact 27 文件/113 例通过；浏览器工具域 42 例通过；最终完整 bun run check exit 0。
- test:changed 四包实跑约 2351 秒：coding-agent 3 失败、desktop 7 失败；runtime-desktop 51 例/cli-host 238 例通过。10 失败中 1 条旧 file 断言已对齐，3 条市场超时隔离复跑通过，6 条稳定复现；原批次 exit 1 不改写为绿色。
- 独立诊断探针（工作区自有配置，不进入正常 CI 发现）：12 场景，2 对照通过/10 个测试失败；包含初始化漏触发/重复触发、旧编辑目标串项目、同文件不跟回、终端混流/完成态悬留/无流式输出、开发册历史/创建候选遗漏、coding 增量行漏过滤及页签偏好不重置。F08/F09 同一测试含多条 soft 失败断言。
- V8 显式 GC 对照：3×16MiB 输入只保留 6144 字符的生产摘要，堆增约 48.01MiB；复制短字符串对照约 0.01MiB；100×50KiB（正常 shell 截断量级）保留约 4.90MiB。证明摘要可能保留母字符串，不据此断言是此前 OOM 唯一原因。
- Git 分支解析两条当前测试失败已列报告；OOM 的 HMR/live-region 既有归因证据不足，报告已明确纠正，不声称已治愈。
- 来源/边界：直接调用真实内部 hook/服务，仅在 IPC、路由和时钟等外部边界使用替身；两个最初诊断环境错误（外部文件 JSX/依赖解析与缺配置订阅桩）已排除后才记录最终反例。
- 未运行：真实 Provider、用户 Desktop、Electron 原生可见性/截图人工验收、真实长时堆快照；无相应通过声明、无远程 Git 操作。
- 阶段收尾：用户要求测试无问题再收尾，广域回归仍失败，因此未新增提交/未标全量工程完成，候选保留工作树；报告检测任务进入 verifying，等待用户阅读。
- 自审完成，无独立 Agent 审查；发现项未静默修成新一轮产品改动。
