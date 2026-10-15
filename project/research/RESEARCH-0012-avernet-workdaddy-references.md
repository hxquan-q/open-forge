---
id: RESEARCH-0012
type: research
status: done
priority: P2
owner: apps/desktop/packages/coding-agent
source: user-request；inclusionAI/Avernet 源码（commit cb25cad78da4f6c2c8ab5fa83f804fedc5ef21bb，2026-09-24，许可证 Apache-2.0）；babygoton/WorkDaddy 源码（commit 06f2af4e87993a182e56a41cfb25eddefcdeb46c，2026-09-24，许可证 AGPL-3.0——仅可借鉴机制，不可搬代码）
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0011, PLAN-0012]
related_tasks: [TASK-0110, TASK-0111, TASK-0112, TASK-0113, TASK-0114, TASK-0115, TASK-0116, TASK-0117, TASK-0118, TASK-0119]
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0010]
---
<!-- Copyright The Open Forge contributors. -->

# Avernet / WorkDaddy 可借鉴机制源码取证

## 问题与范围

用户给出两个外部仓库，要求对照**一手源码**确认各自是什么、有哪些机制值得 Open Forge 借鉴，并按既有研究笔记格式产出取证结论。两仓均已 `git ls-remote` 验证存在、`git clone --depth 1` 至 `%TEMP%/of-research/` 后直接阅读源码与文档；行号锚定上述 commit，未构建未运行。

两仓与 RESEARCH-0010 的 PI-Desktop 定位完全不同：

- **Avernet**（蚂蚁集团 inclusionAI 开源，Apache-2.0）是**多 Bot 协同基础设施**：Python backend + Rust BCS（Bot Coordination Service）+ TS workbench + 引擎适配层，面向「组织级持久多智能体网络」。对 Open Forge（单机桌面 coding agent）的直接映射点不在多 Bot 网络本身，而在其**架构治理体系**（宪法 + CI 门禁 + 每模块 context boundary 声明）、**TaskGuard DAG 工作流引擎**、**Skills 内容库/激活集分离模型**、**AgentEvolve 评估-演化环**。
- **WorkDaddy**（AGPL-3.0）是 WorkBuddy 桌面端（第三方 AI 助手）的**本机增强层**：Node daemon（`127.0.0.1:47832` HTTP）+ CDP 注入 renderer，无任何构建管线。其借鉴面集中在**无人值守自动化产品化**（权限免打扰、异常中断续接、任务包生态、会话归档）——但 AGPL 决定了只能读思想、不能拷代码。

**许可证警示**：WorkDaddy 全文 AGPL-3.0-or-later，移植代码将把传染性带进本仓库；本笔记所列机制均需按 Open Forge 自有架构重写实现。Avernet 为 Apache-2.0，片段级引用需保留许可证声明，机制设计则可直接采纳。

## 事实来源

### Avernet（commit cb25cad7，Apache-2.0）

| 主题 | 主要取证文件 |
| --- | --- |
| 定位与体量 | `README.md:5`（多 agent 组织级基础设施）、`:35`（内部 12 BG、多智能体流 90%+ 完成率，**自述口径，置信度低-中**）；`AGENTS.md` 仓库布局（`src/{backend,frontend,engine,bcs,tui,baas,proxy,gateway,evolverun}`） |
| 架构宪法 | `docs/arch/arch.rules.md`：规则三级分类 L26-35；Rule 3 Service API vs Plugin API 分向 L99-126；Rule 7 core 传输无关 L203-233；Rule 12 横切关注点 signal/slot 钩子 L355-404；Rule 13 插件隔离层声明 L406-428；Rule 16 变更传播分析 L480-503；Rule 18 冲突显式化 L544-566；Rule 19 「两个实例才抽象」+ 钩子例外 L569-601；Rule 20 单机可跑 L607-631；Rule 22 模块上下文声明 L662-684；Rule 25 每合同必须有 conformance 测试 L729-747；waiver 要素 L750-763；red-flag 清单 L766-784 |
| CI 门禁 | `docs/arch/ci.enforce.md`：7 类必查门 L14-23；core 禁传输框架/环境变量散落 L57-98；配置 schema 校验 L100-118；结构 PR 字段（合同是否变更/消费者/实现/兼容性/迁移/waiver）L140-164；waiver 执行 L167-181；grep 基线检查 L199-225；三阶段 rollout L271-290；合规判定 L293-305 |
| Context Boundary 元数据 | `docs/arch/context-boundary-format.md`：每模块 README 内嵌 `## Context Boundary` YAML（purpose/provides/consumes/internal_dependencies）L11-33；`internal_dependencies` 为**白名单**，未声明的 `agentclaw.*` import 使 arch test 失败 L46-53；`dependents` 反向视图由测试生成、禁止手写 L57-58；反模式 L60-69 |
| 协议合同测试 | `docs/arch/protocol-contract-tests.md`：每个 `agentclaw.plugins` Plugin Protocol 必须有 `tests/contracts/test_<plugin>.py`，arch test 以收缩中的 `EXEMPT_PROTOCOLS` 集合强制映射 L3-6；套件形状 L30-46（经 `world` fixture 走消费者公开 API + **断言 plugin 真被调用** L40-45）；`tests/contracts/OWNERS` 守门人审批 L8-12；明示不测 prod-vs-local 一致性（人工纪律）L87-91 |
| TaskGuard 工作流引擎 | `docs/taskguard.md`：Runner（纯函数 DAG 遍历）/Controller（状态机，TaskFlow 唯一写者）/TaskFlow（SQLite/MySQL/API 三模持久化）分层 L17-30；13 种节点执行器 L12；PlatformAdapter 多宿主（OpenClaw 插件/Claude Code 插件/Hermes SSE/TeClaw MCP stdio）L96-203；`src/evolverun/taskguard/src/runner.ts`：`{{path\|default:}}` 模板 L68-129；**单模板保类型透传**（整个参数恰好是单个 `{{token}}` 时透传原生类型，专解 MCP 入参 schema 校验）L131-173；`triggerRule`（`all_success`/`one_success`/`all_done`）+ `canTriggerStillSucceed` 死分支判定 L177-304；`findSkippableNodesFixedPoint` 不动点级联跳过 L351-372；`onResult.branches`+`branchId` 跨层祖先回溯 L187-250；`evaluateOnResult`（complete/wait/fail/branch/rerun）L434-480；`types.ts:830` TriggerRule；`src/executors/human-wait.ts`、`approval-card-{web,dingtalk}.ts`、`subagent.ts`、`llm-orchestrator.ts` 等执行器目录 |
| Skills 内容库/激活集分离 | `docs/arch/skills-management-publishing-current-state-and-upgrade-plan.md`：现状问题（active 目录同时是完整内容库，递归扫描会发现未激活 Skill）L129-148；目标布局 `skills-pool/{repo,center,local}`（只读内容库）与 `skills/`（仅逐 Skill 激活软链）物理分离 L213-256；`EngineSkillLayoutResolver` 把引擎目录布局所有权收敛到 Engine、Backend 只发逻辑激活意图 L288-341；逻辑激活请求只带 `{scheme: git/center/local, locator, version, space_key}` L384-401；三类标识解耦（`skill_uuid` 路径 / `skill_code` 跨系统 / `skill_name` 运行时软链名）L426-435；版本不可变 + `current_version_id` 单指针 L437-444；发布内容只读为架构约束 L277-279 |
| AgentEvolve 演化环 | `docs/agent-evolve.md`：诊断（只读）→ 计划/Spec/Bench 用例 → baseline → 优化轮 → bench 对比 → diff 审查 → Pack 快照（path/size/SHA-256 校验）→ apply 的完整环 L38-46、L134-179；公共实现 `src/evolverun/clawweb` + `clawweb-skills` L232-234 |
| BCS 协调协议 | `src/bcs/CLAUDE.md`：P3「BCS 只做哑路由，bot 自己决策」L24-28；P4 发起者优先应答 L30-33；P7 好友关系 + `protected` 默认可见性 L46-50；WS token 双段校验（升级前 query 拒 401 / 升级后 `bot.connect` 帧校验）L143-160；广播语义 `chat.send`=「你该应答」vs `chat.inject`=「静默旁观」、发送者不回环、bot 消息前缀 `[from:name]` L213-222；heartbeat 用单调时钟、300s 过期、**不信客户端自报 status/load**（`docs/heartbeat-status.md` 全文）；`chat.abort` 每请求重授权 + `token_scope_mismatch` 关连接（`docs/chat-abort-protocol.md:29-33`）；Bot Provider 三 token 边界（admin/downstream/runtime）+ per-bot webhook + PATCH 语义表（`docs/bot-provider-integration.md:48-95`）；27+ service crate 按 application/core/port/plugin-api 分层（`crates/` 目录） |
| 工程化 | `scripts/ci/check_secrets.py`（pre-push 只扫新增行的私钥/厂商 token/JWT/Bearer + 掩码打印）；`scripts/ci/check_pr_title.py`（`<type>(<scope>): <outcome>` 强制 scope）；`scripts/ci/task_design_guard.py`（受控模块结构守护，`PROTECTED_CONTROL_PATHS` 含自身）；`AGENTS.md` pre-push 用 merge-base 算变更集选模块门禁、源文件 1000 行硬上限；`CONTEXT-MAP.md`（多语境文档路由表）+ `CONTEXT.md`（规范词汇表，每个术语带「避免使用」反术语） |

### WorkDaddy（commit 06f2af4e，AGPL-3.0）

| 主题 | 主要取证文件 |
| --- | --- |
| 定位与架构 | `README.md:5-9`（CDP 注入 WorkBuddy 渲染进程，不改官方包）、`:226-243`（daemon `127.0.0.1:47832` + `Runtime.evaluate` 注入）；`AGENTS.md`（纯 Node.js/浏览器 JS 无构建管线；`daemon.js`/`inject.js`/`lib.js`/`theme-patches.js` 职责） |
| 异常中断自动续接 | `scripts/inject.js`：`classifySessionHealth`（blocked/error/running/stopped/settling/completed/suspected 七态 + confidence 分级 + idle 阈值 2500/8000ms，**suspected 不自动发**只提示人工）L335-354；`classifyAutoContinueReply`（仅 error/networkFailure/truncated 三因触发；completionMarker/动作区/manualStop 均否决续跑）L356-371；`isSessionMonitorInterrupted` 复用同一判定函数做绑定闸门（「允许绑定的会话」与「会被续跑的会话」永远一致）L646-662；`SESSION_MONITOR_*_STATUSES` 状态字典 L664-674；`normalizeSessionMonitorResourceRecord`（多字段取终态、pendingInputKind、队列活跃、prompt 计时）L690-729；输入框非空即放弃自动续（L1244 i18n 串佐证） |
| 权限免打扰 | `scripts/inject.js`：`ND_ALLOW_ONCE_LABELS`/`ND_ALLOW_SESSION_LABELS` 按钮文案白名单 L622-623；`ND_CREDIT_HINTS` 积分/付费上下文一票否决 L627+640；`classifyNoDisturbApprovalCandidate`（必须命中关键词**或**结构特征 `hasDeny && hasOnce && 2≤按钮数≤12`，普通「确认」永不命中）L630-644；细粒度开关组（外写文件/常用命令/批量删除/系统级工具/弹窗自动允许）+「全部开启」批量 + 风险文案 L1256-1294、L1382-1394 |
| 会话分叉 | `docs/session-fork.md`（设计文档，含完整拒绝条件表与「渲染层 ≠ 记录层」教训）；`scripts/session-fork.js`：`MAX_RECORD_BYTES=64MiB` L26；`planForkAtMessage` 双键锚定——角色串相等用下标、不等退回 `finishedAt` 精确匹配再退 ±30s 最近邻，全部校验失败即报错不猜位置 L188-234；按原始行拼接不重序列化；`wx`+`0o600` 落盘、插库失败删文件 |
| 会话迁移/同步 | `scripts/session-sync.js`：canonical JSON 指纹 + `sessionId/conversationId` 等身份键别名化为 `__session__`（跨账号同会话不因 id 不同误判冲突）、`session-meta` 剥逐账号事件字段、**文件时间只做竞态探测器不决定胜者** L1-30；`safePath` 逐组件拒绝 `..`/符号链接 L38-60；`scripts/session-transfer.js`：`WDS4\r\n\x1a\n` 魔数 + 52B 认证头 + AES-GCM(gzip(定长帧记录)) 流式归档，附件字节永不转 JS 字符串 L1-50；`scripts/secure-transfer.js`：导出格式 `aes-256-gcm+scrypt`、先 gzip 后加密（认证覆盖压缩数据）、随机 salt L6-82 |
| 自动化任务系统 | `scripts/automation.js`：`SCHEMA_VERSION=3` 兼容 v1-3、上限（200 任务/200 步/12 层嵌套/1MiB agent 文件）L10-16；`CAPABILITIES` 双语能力目录（每 op 带示例与说明，event.*/logic.*/session.*/state.*/account.*/http.*/notify.*/dom.*/vars.* 约 60 项）L30-92；弃用 op 保执行但标记 L86-89；atomic tmp+rename 0600 写 L111-117；`normalizeTask`/`validateSchedule`（interval 1-10080min、daily/weekly/monthly/once）L127-190；错过不补跑、运行中跳过 L200-226；`automation-runtime.js`：`assertAccountRequestUrl`（凭据读出前先验 URL，仅放行客户端官方 HTTPS origin 闭集）L3-15；`createTaskState`（task/account scope + TTL + 跨 run 合并写）L16-46；`createRendererGate`（FIFO 票据闸防并发渲染器操作）L55-68；`probeSessionReceipt`/`receiptComplete`（按回执绑定 user/assistant requestId 等待完成，会话不可见/他请求插入即停等）L70-114 |
| 任务包生态 | `schemas/automation-package.v1.schema.json`（包封套：id 点分/semver/`requires{minWorkDaddyVersion,taskSchemaVersion,capabilities,profiles,platforms}`/输入参数类型校验）；`scripts/automation-discovery.js`：`WorkDaddyAutomationRepository` 描述关键字发现 GitHub+Gitee 仓库 L11；手动跟重定向≤3 次且每跳重验 allowlist+`validateUrl` L95-120；下载 URL 逐 host 前缀/后缀/协议硬校验 L200-226；`readBounded` 流式上限 1MiB 任务/5MiB JSON L70-93；canonical JSON sha256 文档身份 L23-35；包按 packageId 去重取高版本、聚合多仓源+star 排序 L263-306；`pushedAt` 缓存失效 + 10min TTL + per-provider allSettled L332-364；导入只读预览+兼容检查+默认停用+不覆盖同 ID（README:277-288）；`/api/automations/safety-review` 端点（`daemon.js:8234-8244`） |
| 运维细节 | `scripts/daemon.js`：`DAEMON_VERSION`+`DAEMON_BUILD_ID` 双字段供 launcher 换掉内存中旧 daemon L423-424；`/api/sleep-mode` 三模式（allow/keep/until-done）+ 显示器开关 + macOS `caffeinate -u` 240s 续期/Windows PowerShell `SetThreadExecutionState`/Linux `systemd-inhibit` L9300-9318、L10441-10448；watchdog 用 OS 持有的 loopback 锁端口（进程退出自动释放）、pid 文件仅作提示不用于 kill（`scripts/watchdog.js:1-50`）；约百条 `127.0.0.1` 本地路由 |
| 修复 Agent 协议 | `安装失败自主解决提示词.txt`（用户授权的修复 agent 提示词：限定源码目录操作、禁读账号/凭据、`node --check`+`node --test` 验证、3500 字报告上限、`sentry-report.js --force-send --require-sent` 且只有 `sent=true` 才算上报成功——`queued` 或非零退出必须继续排查不得谎报） |
| 测试 | `test/` 目录 ~130 个 `node:test` 文件（auto-continue/automation-*/session-*/cdp-*/account-* 等，纯函数判定层被刻意抽出来做回归测试，见 `inject.js:332` 注释） |

### Open Forge 现场抽查（仅确认存在性与入口）

- **会话分叉已有**：`packages/runtime-core/src/contracts.ts:591-594` `forkSession(sessionId, entryId)` + fork 元数据字段 `:364-390`；renderer 侧 `MessageExtensions.flow.test.tsx` 以 `entryId` 锚定；合同测试含「streaming 中拒绝 fork」（`apps/desktop/src/main/agent-runtime/runtime-host-contract.test.ts:456`）。Open Forge 自有记录格式，entryId 锚定天然规避了 WorkDaddy 的「渲染层≠记录层」问题。
- **会话消息队列已有**：`apps/desktop/src/main/ipc/session.ts:164-170`（QUEUE_STATE/REMOVE/REORDER/SEND_NOW/RESUME/CLEAR 全通道）；另有 `ChatExportHost.tsx` 渲染导出视图（导出为**视图产物**，非可迁移归档）。
- **silent-turn 重跑已实现**（RESEARCH-0010 P0 已落地）：`packages/agent/src/agent-loop.ts:26`、`:147-219` + `silent-turn.ts`（nudge + 同 bubble 复用）；turn 内恢复预算 `run-agent-turn.ts:158-202`。**缺口在会话级**：没有跨会话监视器在回复中断（网络断/进程崩/超时）后从外部补发「继续」。
- **调度器**：`apps/desktop/src/main/scheduler/`（cron.ts/scheduler-service.ts/task-executor.ts/task-storage.ts）+ Agent 工具面 `agent-task-tools.ts` + `packages/coding-agent/src/features/scheduled-tasks/`（`executionMode: "inherit"|"sandbox"|"full-access"` 三态，contracts.ts:8）。**仅 cron 触发，无事件触发；无任务包/发现/导入导出**。
- **多智能体**：`apps/desktop/src/main/agent-teams/`（turn-coordinator/task-control/member-scheduler/recovery-monitor 等 60 文件）+ `packages/coding-agent/src/composition/subagent/` + `packages/runtime-subagents`；RESEARCH-0008 已确认 TeamWorkItem 7 态/幂等/恢复预算与外部参照对齐或超出。**无对外 bot 网络/能力发现层**（agent-teams 是应用内编排）。
- **Skills 激活**：`packages/coding-agent/src/agent-configuration/resource-selection.ts:54-57` 按 agent 配置过滤 `skills`（`allowsAgentResource`）——**配置层过滤存在**；是否有文件系统层「激活目录只含已激活入口」的硬边界需另查（低置信度假设：skill 目录布局归引擎/宿主约定，未发现 pool/active 分离机制）。
- **架构守卫**：`scripts/quality/check-package-boundaries.mjs`（集中式前缀表 LIB_PREFIXES + MANIFEST_TRUTH_PACKAGE_NAMES）、`check-coding-agent-architecture.mjs`、`check-private-keys.mjs`（已有密钥扫描）、`check-skill-frontmatter.mjs` 等 ~25 个 guard。**无**：每模块声明式 `internal_dependencies` 白名单 + 生成反向依赖视图；规则分级（Invariant/Policy/Guideline）与 waiver 记录；`.github/workflows/` 无 PR title 门禁（仅有 desktop/docs/mobile/kotlin/im-gateway/quality 等）。
- **观测/评估**：`apps/desktop/src/main/agent-observability/`（本地 observation 库 + trace 关联）；RESEARCH-0009 已评估 DeepEval/Promptfoo/MASEval 旁路。**无**「诊断→baseline→优化轮→diff→可回滚 Pack」的演化环。
- **无**：powerSaveBlocker/防休眠（grep 全仓无果）；「无人值守」细粒度授权开关组；自动化任务包 schema/远端发现；修复 agent 提示词 + `require-sent` 遥测闸。

## 当前结论

### Avernet 是什么

Avernet 是蚂蚁集团 inclusionAI 开源的**多 Bot 协同基础设施**单仓（`src/bcs` Rust 协调服务 + `src/backend` Python 业务 + `src/engine` 引擎适配 + `src/frontend` workbench + `src/evolverun` 演化/工作流），README 自述在蚂蚁内部支撑 12 个 BG（README.md:35，**自述口径，置信度低-中**；公开仓功能覆盖表明确标注多模块为 Partial/Planned，README.md:39-83）。它对 Open Forge 最大的价值不是多 Bot 网络——而是**一整套给「人类+LLM 高速开发」用的架构治理与质量门禁工程化实践**（25 条分级宪法 + CI 执行清单 + 每模块 context boundary 元数据 + 每协议合同测试映射），外加 TaskGuard 这个可独立移植的 DAG 工作流引擎与 Skills 内容库/激活集分离模型。

### Avernet 借鉴机会（按真实价值排序）

| 优先级 | 机制 | open-forge 目标模块 | 依据 |
| --- | --- | --- | --- |
| P1 | 每模块 `## Context Boundary` YAML 声明（purpose/provides/consumes/**internal_dependencies 白名单**）+ arch test 校验未声明 import 失败 + 机器生成 `dependents.md` 反向视图 | `scripts/quality/check-package-boundaries.mjs` 演进；各包 README/AGENTS.md 承载声明 | 现守卫是集中前缀表：规则改一处、声明与模块分离，新增包改的是守卫文件而非自身声明；Avernet 把「我允许依赖谁」放回模块 README 并由测试机械校验，文档与门禁同一事实源。`context-boundary-format.md:46-58` |
| P1 | 规则三级分类（Invariant/Policy/Guideline）+ waiver 记录（规则名/理由/风险/补偿/owner/**到期日**）+ red-flag 清单作为评审预检 | `AGENTS.md` 治理层、`scripts/quality/` | Open Forge AGENTS.md 规则是平铺命令式；waiver 到期复审机制能防止「临时例外永久化」。`arch.rules.md:26-35,750-784` |
| P2 | 每 Plugin API 一份 conformance 套件 + `EXEMPT_PROTOCOLS` 收缩集 + 「断言 plugin 真被调过」（防消费者绕过契约）+ `tests/contracts/OWNERS` 守门 | `packages/plugins`、`packages/runtime-*` 的契约测试体系 | 我方有 contract test（如 `runtime-host-contract.test.ts`）但无「每协议必须映射一套」的机械检查与豁免收缩机制。`protocol-contract-tests.md:3-12,30-46` |
| P2 | TaskGuard 引擎结构：纯函数 Runner（DAG 遍历/分支/skip 不动点）与唯一写者 Controller 分离；`triggerRule` 三态；**单模板保类型透传**（`{{token}}` 独占整个参数时传原生类型，专治 MCP inputSchema 拒收字符串化 number）；`human-wait` 节点带 `inputSchema`；PlatformAdapter 一引擎多宿主（插件包/MCP stdio/SSE） | 若做 workflow/DAG 功能：`packages/coding-agent` 新 feature 或独立 `packages/runtime-workflow`；模板透传可直接用于现有模板/MCP 参数拼装处 | Open Forge 无 DAG 引擎；该三分层（遍历纯逻辑/状态机写库/持久化换实现）是可直接照抄的架构，单模板透传是已踩过坑的小而硬修复。`taskguard.md:17-30`；`runner.ts:131-173,351-372` |
| P2 | Skills 内容库/激活集物理分离：`skills-pool`（只读全量）与 active 目录（仅逐 Skill 激活软链）分开，使递归扫描只能发现已激活内容；逻辑 locator `{scheme,locator,version}` 由 Engine 侧 resolver 解物理路径；不可变版本 + `current_version_id` 单指针 | `packages/plugins`（skill 贡献面）、`packages/skill-presets`、宿主 skill 目录约定 | 我方 `resource-selection.ts` 是配置层过滤；Avernet 的约束是**文件系统发现边界**——agent 用 `find` 也摸不到未激活内容。对「插件 skill 全量铺在可扫描目录」的形态是真实加固。`skills-management…md:129-148,213-256,384-401` |
| P2 | BCS 协调协议细节（用于 agent-teams 对外化或 im-gateway 演进时参考）：`chat.send`=应答/`chat.inject`=旁观的广播语义二分；`protected` 默认可见性 + 好友关系门控入组；WS token 升级前后双段校验；`chat.abort` 每请求重授权当前会话状态；heartbeat 用单调时钟、不信客户端自报状态 | `apps/im-gateway`、未来 agent-teams 跨实例协作 | RESEARCH-0008 已覆盖应用内编排对齐；BCS 补的是**跨进程/跨实例网络侧**的协议细节（鉴权、可见性、终止语义）。`bcs/CLAUDE.md:143-222`；`chat-abort-protocol.md:29-33`；`heartbeat-status.md` |
| P3 | 结构 PR 门禁：PR title `<type>(<scope>):` 强制 scope + PR 模板必填「合同是否变更/受影响消费者与实现/兼容性/迁移计划/waiver」 | `.github/workflows/`（新增 pr-title.yml 等价物）、`.github/pull_request_template.md` | `check_pr_title.py` + `ci.enforce.md:140-164` 是现成可移植门禁；本仓 commit message 规范已有但 PR 面无机械校验 |
| P3 | pre-push 用 merge-base 求变更集再选模块门禁（防「dev 前进而分支未 rebase 时 diff 进无关路径」）；源文件 1000 行硬上限；统一 singlebox 覆盖率门（BCS E2E + 行/方法/端点覆盖率阈值合一） | `scripts/quality/`、husky hooks | 我方 `test:impact/test:changed` 按依赖图选测试，正确性等价物已存在；merge-base 细节与文件行数上限是低成本增量。`AGENTS.md` pre-push 段 |
| P3 | `CONTEXT.md` 规范词汇表（每术语带「避免使用」反义条款）+ `CONTEXT-MAP.md` 按模块路由「改 X 前先读 Y」 | `AGENTS.md` 体系或 `docs/` | 与现有包级 AGENTS.md 互补：词汇表解决的是跨文档术语漂移（对 LLM 生成代码尤为明显）。`CONTEXT.md`、`CONTEXT-MAP.md` |
| 长期 | AgentEvolve 演化环：会话诊断（只读）→ baseline → 优化轮 → Bench 复测 → diff 审查 → Pack 快照（path/size/SHA-256 校验）→ apply/回滚 | `apps/desktop/src/main/agent-observability/` 之上加评估与快照层 | RESEARCH-0009 已选旁路 eval 框架；Avernet 的增量是「把 agent 自身的 prompt/skill/workspace 当可版本化产物做 diff+回滚」。`agent-evolve.md:38-46,173-179` |

### WorkDaddy 是什么

WorkDaddy 是给 WorkBuddy 桌面端（第三方 AI 助手）做的**本机零侵入增强层**：Node daemon 绑 `127.0.0.1:47832`，用 `--remote-debugging-port` + CDP `Runtime.evaluate` 把面板注入运行中的 Electron 渲染进程，不改官方安装包（README.md:5-9,226-243）。多账号备份切换、自动化任务、免打扰、会话分叉/迁移、用量统计等功能全部围绕「宿主不为我提供 API」的约束设计。对 Open Forge 的价值集中在**无人值守自动化的产品化细节**与**会话数据的容错处理手法**；因其 AGPL-3.0 许可，只能借鉴机制设计，实现须重写。

### WorkDaddy 借鉴机会（按真实价值排序）

| 优先级 | 机制 | open-forge 目标模块 | 依据 |
| --- | --- | --- | --- |
| P1 | 会话级「异常中断自动续接」监视器：跨会话巡检，空闲阈值 + 完成标记/动作区证据反推「已中断」；仅 error/networkFailure/truncated 三因触发自动补发；`manualStop` 与「输入框非空」一票否决；绑定闸门与判定层共用同一分类函数防规则错位；`suspected` 态只提示不自动发 | `apps/desktop/src/main/agent-runtime/`（会话健康巡检）+ renderer 提示 | 我方 silent-turn 管的是**同一 turn 内**空回复重跑（agent-loop.ts:147-219）；WorkDaddy 管的是**turn 之后**的中断续跑（断网/超时/进程抖动后用户不在场），两者正交互补。判定矩阵（trigger 三因/否决五因/置信度分级）可直接借鉴重写。`inject.js:335-371,646-662` |
| P1 | 「无人值守」细粒度授权开关组的产品化形态：按能力分档开关（工作区外写/常用命令/批量删除/系统级工具/弹窗自动允许）+「全部开启」批量 + 明确风险文案 + 积分/付费语境一票否决 | `packages/coding-agent`（executionMode 细化或 plan-mode 豁免面）、`apps/desktop` scheduler 任务设置 | 我方 `executionMode` 是 inherit/sandbox/full-access 三档粗粒度；定时任务要真无人值守，缺的是「只放行低风险面、仍留人工闸」的中间档与默认值文案模板。`inject.js:622-644,1256-1294` |
| P2 | 自动化任务包生态：`automation-package.v1` 封套 schema（id/semver/`requires{minVersion,taskSchemaVersion,capabilities,profiles,platforms}`/输入参数）+ 关键字标记的公开仓发现（GitHub/Gitee）+ 逐 host 下载 URL 硬校验 + 手动重定向≤3 每跳重验 + 流式大小上界 + canonical sha256 身份去重 + `pushedAt` 缓存失效 + 导入即停用、不覆盖同 ID | `apps/desktop/src/main/scheduler/`（任务导入导出）、`packages/coding-agent/src/features/scheduled-tasks/`（任务定义扩展为步骤/触发器）、abilities marketplace 同源复用 | 我方调度任务只有 prompt+cron，无分享/发现/兼容检查链路；其「远端内容永不自动执行、导入默认停用」的安全姿态与 `safety-review` 端点思路可直接入产品规则。`automation-discovery.js:11,95-120,200-226,263-306`；`automation-package.v1.schema.json` |
| P2 | 事件触发型自动化：除定时外支持 clientLoaded/pageReady/panelOpened/accountSwitched 等事件触发 + 步骤化任务（logic.if/switch/repeat/retry/catch/forEach/waitUntil + dom.* + session.* + state.checkpoint TTL）| `apps/desktop/src/main/scheduler/`（触发器维度扩展）、`packages/coding-agent`（事件源契约） | 我方 scheduler 仅 cron；事件触发（如「会话创建后」「项目打开后」跑指定 prompt）是自动化页的自然下一步；其 capability 目录（每 op 双语+示例）是把自动化暴露给 agent 生成任务时的现成格式。`automation.js:30-92,179-226` |
| P2 | 会话归档迁移格式：魔数+定长认证头+AES-GCM(gzip(定长帧)) 流式读写、附件字节不转字符串；跨副本同会话判定用 canonical JSON 指纹 + 身份键别名化（`sessionId→__session__`），文件时间只作竞态探测 | `packages/runtime-storage`（会话导出/导入）、`apps/desktop`（迁移 UI） | 我方有会话渲染导出（`ChatExportHost`）但无可移植归档格式；其「语义指纹而非文件时间定冲突」「raw 行拼接不重序列化保未知字段」都是本会话语境可直接用的手法。`session-transfer.js:1-50`；`session-sync.js:1-60`；`session-fork.js:188-234` |
| P3 | 防休眠三模式（allow/keep/until-done + 显示器独立开关）：macOS `caffeinate -u -t 300` 每 240s 续期、Windows 常驻 PowerShell `SetThreadExecutionState`、Linux `systemd-inhibit`；任务全部结束自动恢复 allow | `apps/desktop`（Electron `powerSaveBlocker` 即可覆盖大半，其三模式语义与 until-done 联动值得抄） | 长任务/定时任务挂机场景的低成本补齐；Electron 侧实现比其外部进程方案简单。`daemon.js:9300-9318,10441-10448` |
| P3 | 修复 agent 提示词 + `require-sent` 上报闸：修复流程强制「只有 `sent=true` 才算成功，`queued`/非零退出必须继续排查不得谎报」；诊断内容脱敏截断 | `apps/desktop` 诊断/上报链路（若引入遥测） | 我方当前无远端遥测（lite 版定位）；「queued 不算 sent」是任何上报链路的通用正确性约束。`安装失败自主解决提示词.txt` 第四节 |
| P3 | watchdog 存活模型：loopback 锁端口由 OS 持有（进程死锁即消）、pid 文件仅作提示绝不作为 kill 依据 | `apps/desktop`（若有外部 helper/sidecar 进程） | Electron 单实例锁已覆盖主进程；仅在未来引入外部常驻 helper（如 ssh-helper 常驻模式）时参考。`watchdog.js:1-50` |

## 被否决的方案

- **引入 BCS 式多 Bot 网络/协调服务**：Open Forge 是单机桌面产品，agent-teams 应用内编排已对齐参照系（RESEARCH-0012 抽查 + RESEARCH-0008 结论）；跨实例 bot 注册/发现/群组路由属另一产品形态，不立项。仅保留其协议细节（send/inject、可见性、abort 重授权）作为未来参考。
- **照搬 WorkDaddy 的 CDP 注入路径**：Open Forge 自己就是宿主应用，无需 Runtime.evaluate 注入与 React fiber 逆向；其价值在判定/分类/容错逻辑，不在注入机制。
- **照搬 WorkDaddy 自动化步骤 DSL（dom.\*/session.\* 等 60 op）**：其 op 面向「驱动别人 UI」设计（xpath 点击、队列适配器）；Open Forge 自动化应面向自有 agent/session API，借鉴的是任务包格式+发现+兼容检查，不是 DOM 操作面。
- **TaskGuard 整套引入**：其 OpenClaw/DingTalk/BaaS 生态包袱、审批卡渠道与租户模型与本仓无关；若做 workflow 功能，只借鉴 Runner/Controller/TaskFlow 三分层、triggerRule 语义与单模板透传这三个核。
- **Avernet 的 Python/Rust 工程结构**：仓型不同（我方 Bun/TS monorepo + 少量 Go/Kotlin），其 import-linter/cargo 工具链不可直接移植；借鉴的是规则形状（白名单声明、分级、waiver）不是具体工具。
- **WorkDaddy 账号备份/切换体系**：Open Forge lite 版无账号概念，多账号备份/凭据迁移不适用。
- **「全部开启免打扰」默认形态**：WorkDaddy 的一键全开配风险文案是其产品选择；Open Forge 已有 ADR-0123 双闸门权限轴，借鉴时应落为「定时任务的授权范围配置」而非全局豁免开关，避免与 plan-mode 语义冲突。

## 代码/测试/指标锚点

| 主题 | 锚点 |
| --- | --- |
| Avernet 宪法分级/waiver | `docs/arch/arch.rules.md:26-35`（三级）、`750-763`（waiver 要素）、`766-784`（red flags） |
| Context Boundary 元数据 | `docs/arch/context-boundary-format.md:11-33`（格式）、`46-58`（白名单+反向视图生成） |
| 合同测试映射 | `docs/arch/protocol-contract-tests.md:3-12`（EXEMPT 收缩+OWNERS）、`30-46`（套件形状+断言 plugin 被调） |
| TaskGuard | `docs/taskguard.md:17-30`（分层）、`96-203`（PlatformAdapter）；`src/evolverun/taskguard/src/runner.ts:131-173`（单模板保类型）、`177-304`（triggerRule+死分支）、`351-372`（不动点 skip）、`434-480`（onResult）；`types.ts:830` |
| Skills pool/active | `docs/arch/skills-management-publishing-current-state-and-upgrade-plan.md:129-148`（问题）、`213-256`（目标布局）、`288-341`（EngineSkillLayoutResolver）、`384-401`（逻辑激活）、`426-444`（标识/版本） |
| AgentEvolve | `docs/agent-evolve.md:38-46`（流程）、`173-179`（Pack SHA-256）、`232-234`（代码位置） |
| BCS 协议 | `src/bcs/CLAUDE.md:24-50`（P3/P4/P7）、`143-160`（token 双段）、`213-222`（send/inject）；`docs/chat-abort-protocol.md:29-33`；`docs/heartbeat-status.md`；`docs/bot-provider-integration.md:48-95` |
| CI/治理脚本 | `scripts/ci/check_secrets.py`、`check_pr_title.py`、`task_design_guard.py`（PROTECTED_CONTROL_PATHS）；`AGENTS.md` pre-push 段；`.github/workflows/pr-title.yml` |
| WorkDaddy 中断续接 | `scripts/inject.js:335-354`（健康七态）、`356-371`（续接触发判定）、`646-662`（绑定闸门复用判定）、`664-729`（会话监视器归一化） |
| WorkDaddy 免打扰 | `scripts/inject.js:622-644`（文案白名单+结构特征+积分否决）、`1256-1294`（开关组+批量+风险文案） |
| WorkDaddy 会话分叉 | `docs/session-fork.md`（设计+拒绝表）；`scripts/session-fork.js:26,188-234` |
| WorkDaddy 归档/同步 | `scripts/session-transfer.js:1-50`（WDS4 帧格式）；`scripts/session-sync.js:1-60`（canonical 指纹+别名化+safePath）；`scripts/secure-transfer.js:6-82`（scrypt+AES-GCM+gzip） |
| WorkDaddy 自动化 | `scripts/automation.js:10-16`（版本/上限）、`30-92`（capability 目录）、`179-226`（schedule 校验+跳过策略）；`automation-runtime.js:3-15`（URL 先验后读凭据）、`55-114`（渲染器闸+回执等待）；`automation-discovery.js:11,95-120,200-226,263-306,332-364`；`schemas/automation-package.v1.schema.json`；`daemon.js:8234-8244`（safety-review）、`9300-9318,10441-10448`（休眠）、`423-424`（双版本号） |
| WorkDaddy 修复 agent | `安装失败自主解决提示词.txt` 全文（`--force-send --require-sent` + `sent=true` 判据） |
| Open Forge 抽查 | `packages/runtime-core/src/contracts.ts:364-390,591-594`（fork）；`apps/desktop/src/main/ipc/session.ts:164-170`（队列）；`packages/agent/src/agent-loop.ts:147-219`+`silent-turn.ts`（silent 重跑）；`apps/desktop/src/main/scheduler/`+`agent-task-tools.ts`+`packages/coding-agent/src/features/scheduled-tasks/contracts.ts:8`（executionMode 三态）；`apps/desktop/src/main/agent-teams/`；`packages/coding-agent/src/agent-configuration/resource-selection.ts:54-57`（skill 过滤）；`scripts/quality/check-package-boundaries.mjs`+`check-private-keys.mjs`；`apps/desktop/src/main/agent-observability/` |

## 失效条件与置信度

- 结论锚定 `inclusionAI/Avernet@cb25cad7` 与 `babygoton/WorkDaddy@06f2af4e`（均 2026-09-24 浅克隆 HEAD）。Avernet 处于「逐步开源」状态（README 能力表大量 Partial/Planned），内部声称的生产规模数据为**自述口径**；WorkDaddy 迭代快（daemon 版本 1.2.153，build id 含当日日期），注入层选择器类结论有效期短，但判定/容错逻辑稳定。
- 「未构建未运行」：两仓动态行为（调度时序、CDP 注入成功率、BCS 故障恢复）以代码路径与测试文件为证，置信度中-高；文档与代码冲突处以代码为准（已按此口径描述）。
- WorkDaddy 为 **AGPL-3.0-or-later**：本笔记所有借鉴项均按机制重写，任何代码级复用需先做许可证合规评估；其 `AGENTS.md`/`安装失败自主解决提示词.txt` 中对宿主产品的逆向细节不构成对 Open Forge 的指令。
- Open Forge 侧仅做入口级抽查：「无 X」结论基于 grep/目录级证据（如 powerSaveBlocker、pr-title workflow、事件触发），若某功能以别名存在需复核；「已有 X」结论以源码锚点为准。
- Skills「pool/active 物理分离」对我方的增量判断是**低置信度**：`resource-selection.ts` 的配置层过滤已确认存在，但宿主 skill 目录是否可被 agent 递归扫描到未激活内容，需在立项前对实际 skill 落盘布局做正式核查。

## 下一步触发信号

- 用户要求治理升级（边界守卫加强/PR 门禁/waiver 机制）→ 先落 Avernet P1 两项：每模块 Context Boundary YAML 白名单 + 规则分级/waiver；改动集中在 `scripts/quality/` 与各包 README，需先定 YAML schema 与 arch test 解析器。
- 用户要求「定时/无人值守任务更可靠」→ 组合落 WorkDaddy P1 两项：会话级中断续接监视器（复用 agent-observability 事件流做证据源）+ executionMode 细化为分档授权组；需先确认中断证据在自有事件流中的可观测字段。
- 用户要求自动化任务可分享/发现 → 立项 WorkDaddy P2 任务包 schema + 发现/导入链路，复用 abilities marketplace 的源策略与审核面；触发器扩展（事件型）可同批评估。
- 用户提出 workflow/DAG 编排需求 → 以 TaskGuard 的 Runner/Controller/TaskFlow 三分层为蓝本立项，先把 triggerRule 三态 + 不动点 skip + 单模板透传写成合同测试，再谈执行器与 human-wait。
- 用户要求会话导出/跨设备迁移 → 参考 WDS4 帧格式与 canonical 指纹冲突判定，落 `runtime-storage` 归档 port + desktop 导出 UI。
- 涉及跨实例 agent 协作或 im-gateway 演进 → 回查 BCS 的 token 双段校验、send/inject 语义、abort 重授权与 heartbeat 单调时钟设计。
