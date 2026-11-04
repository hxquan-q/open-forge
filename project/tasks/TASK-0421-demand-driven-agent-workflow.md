---
id: TASK-0421
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
source: user-request and RESEARCH-0048
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0420]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，独立只读审查不写文件）
base_commit: 82ac41135d7f4d318d24357aec37413579a80e8b
read_paths: [AGENTS.md, CLAUDE.md, .agents/skills, docs/dev, project, scripts/quality, scripts/agents]
write_paths: [AGENTS.md, CLAUDE.md, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing/SKILL.md, docs/dev/agent-rules/engineering.md, docs/dev/agent-rules/repository.md, docs/dev/agent-rules/governance.md, project/README.md, project/CONVENTIONS.md, project/tasks/README.md, project/tasks/templates, project/tasks/TASK-0421-demand-driven-agent-workflow.md, scripts/quality/check-agent-guide.mjs, scripts/quality/check-agent-guide.test.mjs, scripts/quality/workflow-skill-links.mjs, scripts/quality/check-project-indexes.mjs, scripts/quality/project-indexes.test.mjs]
exclusive_paths: [AGENTS.md, CLAUDE.md, .agents/skills/open-forge-task-intake, project/tasks/README.md, scripts/quality/check-agent-guide.mjs]
depends_on: []
conflicts_with: []
integration_status: integrated（本地 main 串行，随本 Task 原子提交绑定；全仓门禁未通过，不推送）
created: 2026-11-04
updated: 2026-11-04
---
<!-- Copyright The Open Forge contributors. -->

# 按需开发入口、Task 查询与 Claude 共享导入

## 目标与范围

Open-Forge-only。实施 [RESEARCH-0048](../research/RESEARCH-0048-agent-guidance-and-development-paradigms.md) 的三个 P0，并将反防御纪律落实到实际开发路径。复用 REQ-0004，无需新 Plan 或 Notes 台账。

- 输入：已授权实施的研究结论、现有规则与质量脚本；输出：按需 intake、轻量 Task 范本与查询入口、Claude 原生共享导入、可执行的防御代码判断条件。
- 不做：产品 Runtime/Prompt 加载器、批量清理现有防御代码、后台控制器迁移、真实 Provider/付费评测、用户状态访问、发布或推送。
- 并发：共享规则和索引相互约束，串行在 main 修改；代码守卫变更后使用原生只读独立评审，无并行写入或新 Worktree。
- 调查：工作区起始干净；图谱停在 2026-10-12，目标路径已有 Git 增量，已回读当前源码。控制器 prepare/integrate/runner 使用 Task README 状态表，保留该路径和表合同，精简摘要并以查询替代全读。

## Given / When / Then

- Given 问答、研究或文档维护，When 进入 intake，Then 只读命中规则；需要实施时仍先建/续 Task，轻量任务无需图谱、全历史或测试技能。
- Given 既有 Task ID/主题，When 查询任务，Then 定位原文件并复用证据；协调表只保留未关闭条目的短导航，保留原 ID、状态及文件位置。
- Given Claude 入口，When 检查共享规则，Then 根 AGENTS 以原生 `@AGENTS.md` 导入一次，扩展按需；守卫拒绝仅有文字链接或缺失导入，不把静态检查称为运行时加载通过。
- Given 已校验同进程值，When 实现内部调用，Then 依契约直用；外部 JSON/IPC/持久化及取消、清理仍保留边界职责，新增兜底对应可达失败和明确结果。

## 验证与验收

- 守卫合同：现有 Node runner 定向 `check-agent-guide.test.mjs`、`project-indexes.test.mjs`、`workflow-skills.test.mjs`；导入回归先确认红灯，再修复。
- 影响与门禁：`bun run test:impact -- <本次脚本路径>`、完整 `bun run check`；文档相对链接、工作流/索引/Task 守卫、`git diff --check`。
- Claude：已读取本机 `claude --version` 为 2.1.312；无模型请求的版本与文件合同检查。真实 `/context` 加载、去重与模型行为未实测，不以静态检查代替。
- 人工验收：本次为内部规则与守卫维护，以链接/合同测试、独立审查和门禁为工程完成标准；正常开发任务中的模型改善仍待观察。

## 交付记录

- 实际修改：intake 分析/轻量/行为路线及四步入口，图谱与协作流程按需；Task README 从 79,993 字节缩至约 20.2 KB，移出 157 条终态摘要、保留全部 122 条既有非终态导航，历史由原 Task 与 Git 查询；新增 48 行轻量范本（公共元数据保留、正文约 20 行）。CLAUDE 改为单次原生导入；共享 Markdown 解析复用已有代码，守卫检查导入唯一性；Task 守卫接受空精选表，Plan 完整性要求不变。
- 反防御纪律：同进程已校验数据直接使用；新增校验、fallback、重试、兼容与抽象须对应真实调用/数据和明确职责。外部 JSON/IPC/队列/持久化、权限、取消和清理继续保护；无变化的验证证据复用。未批量清理产品代码。
- 独立只读审查：原生子任务 `/root/review_task0421` 核对实际 diff 与消费者，发现 UI 误路由 Expo、移出已完成任务后空表被守卫拒绝两项 P2，未发现 P0/P1；修复复核无新增发现。审查未运行测试，不把审查当测试证据。
- 定向测试：导入合同先红（11 项中 5 项失败），修复后 guide/index/workflow 三套 32 项通过；空 Task 表新用例先红，修复后 index 5 项通过。
- 首次影响测试：显式选择三个 quality 脚本，64 文件、724 通过/5 失败（729 项）；失败均在未改动的 desktop-release-workflow 套件，WSL Bash 参数/路径与临时目录错误。该测试及 workflow 与基线无差异。
- 环境对照：默认 `bash` 为 `C:\WINDOWS\system32\bash.exe`；仅测试进程将 `C:\Users\xquan\scoop\apps\git\current\bin` 前置 PATH 后，用最终五个脚本重跑影响测试。发布 workflow 套件通过；总计 725 通过/5 失败（730 项），剩余为未改动 Git/runner/release 夹具的 5 秒超时及一处 EPERM。完整检查结束后，维持 Git Bash、用 `bun scripts/quality/run-vitest.mjs --run --maxWorkers=1 scripts/agents/git.test.mjs scripts/agents/runner.test.mjs scripts/agents/release.test.mjs scripts/release/verify-desktop-release-identity.test.mjs` 复验，4 套件/75 项全部通过；未放宽超时、删断言或跳过用例。未把分次结果合称一次完整影响测试通过，负载对超时的因果仍属推断。
- 文档与静态检查：四项 agent-guide/workflow/project-index/task-worktrees 守卫通过（413 Task、0 warning），本次所有 Markdown 相对链接有效，diff-check 通过。完整 check 发现本次一处格式问题，已修复且完整 lint 复跑通过（5,184 文件）；所有类型检查与 mobile lint 通过。剩余失败是历史 [WAIVER-0006](../decisions/waivers/WAIVER-0006-kernel-research-worktree-admission.md)/[WAIVER-0007](../decisions/waivers/WAIVER-0007-desktop-performance-shared-index-commit.md) 分别于 2026-10-30/31 过期，保持原文与到期日，不续期、不降低门禁；全仓 check 未通过，不为已知到期项反复运行完整检查。
- 验收与发布：实施、定向验证与独立审查完成，本地原子提交承载记录；全仓门禁仍有既有阻断，Task 保持 verifying，未宣称工程全绿。未启动 Claude 模型会话、UI 或后台控制器，真实 `/context` 去重和模型反防御效果未实测。未推送或发布。
- 当前 Desktop 0.1.4 已存在 `v0.1.4` tag，发布正文只读；候选条目留此，下一开发版本切入后归入碎片：其他：按任务分流开发入口，精简 Task 查询并统一共享规则导入，减少无依据的防御代码与重复验证。
