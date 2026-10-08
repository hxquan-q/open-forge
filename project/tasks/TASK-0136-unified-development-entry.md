---
id: TASK-0136
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 2a9e5f21d98623db9cce9f18d17866f82cee44e2
read_paths: [AGENTS.md, project, .agents/skills, .claude/skills, .devin/skills, scripts/quality, .github/workflows, docs/dev]
write_paths: [AGENTS.md, project, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing, .claude/skills/open-forge-task-intake, .claude/skills/open-forge-testing, .devin/skills/open-forge-task-intake, scripts/quality, package.json, docs/dev/quality-gates.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [AGENTS.md, package.json, scripts/quality/check-guards.mjs]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行；98cfb4b00）
created: 2026-10-01
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 统一开发入口与工程验收闭环

## 目标

归属：Open-Forge-only。以 open-forge-task-intake 统一组织开发工作，用户负责目标与功能验收，AI 自主承担工程分析、实现、测试、CI/CD 配置分析、集成与交付；不扩大运行授权。

## 范围

- 串行：共享入口、模板、门禁和镜像有依赖，不拆并行 Worker，不创建 Worktree；本地 main 保留既有用户改动。
- 做：精简入口，按需路由实现、诊断、TDD、测试、CI/CD、模型评估、研究和交付；完善 Task 验收；增加镜像和引用自动检查及回归测试。
- 不做：更换 Bun/Vitest/CI 平台、修改产品功能、改动全局技能库、真实模型调用、启动 Desktop、发布或推送、回填历史 Task 状态。

## Given / When / Then

- Given 一句话开发需求，When intake 读取事实，Then 选择最小必要流程，不让用户选框架或填写技术合同。
- Given CI 失败或性能问题，When 进入入口，Then 分别进入配置/失败诊断或先基线后优化，而非一律生成业务代码。
- Given AI 输出问题，When 自动化软件测试通过，Then 不冒称模型质量通过，不未经授权调用 Provider。
- Given 用户尚未验收，When 工程验证完成，Then 交付功能验收包，保持 verifying，不自行宣布用户接受。
- Given 镜像漂移或相对引用缺失，When 运行门禁，Then 明确失败；同步镜像后恢复通过。

## 不变量与方案

保留包边界、安全授权、发布流程、测试覆盖和历史状态。直接增加入口正文会复制现有测试/分支规范，故先把专项方法拆到按需 references，测试正文继续唯一归 open-forge-testing。Claude 既有共享符号链接保持不变；Devin 镜像由脚本机械同步，不再手工维护并行正文。

## 测试与验证

- 回归：镜像缺失/漂移、多文件参考、断链、额外镜像、无副作用检查、修复同步闭环。
- 集成：真实仓库检查入口与 CI 复用既有 check/test:quality；路由场景人工逐项对照，不能宣称执行过真实模型路由评测。
- 门禁：定向 Vitest、test:impact、check:quick、完整 check，文档链接与发布说明。

## 验收分层

- 工程验证：定向 9 例通过；test:impact 选择 test:quality，34 文件 / 449 例通过；完整 bun run check 复验退出码 0。首轮发现本次 testing Skill 缺少声明头，已补齐。
- 集成：已集成本地 main，提交 `98cfb4b00`；人工功能验收与推送资格分别记录，不再用 pending 混淆。
- 人工功能验收：pending；用户确认前保持 verifying。

## 交付记录

- 实际修改：统一 intake 与三份按需参考；testing 补齐 TDD/模型质量/CI 合同；根规则、REQ/PLAN、Task 模板及协作流程接线；镜像/链接检查接入既有 check 与 test:quality。
- Red：首轮新模块缺失导致测试收集失败，仅说明新入口尚不存在，不当作行为回归证明；随后安全用例在旧同步实现上真实断言失败（8 过 / 1 失败），补充目录边界预检后 9 例通过。
- 文档路由场景：逐项对照 16 个场景，属于作者自审，不是独立评审或真实模型试跑。
- 已发现并修复：Devin sibling 相对链接断裂；Claude 实际是共享符号链接，避免重复写源；拒绝镜像重定向到工作区外。
- 实际命令：`bun run test:impact -- scripts/quality/workflow-skills.mjs scripts/quality/workflow-skills.test.mjs`（34 文件 / 449 例）；额外 Project/Task/quality-gates 定向测试（3 文件 / 99 例）；`bun run check`（退出码 0）；两个 Skill 的 quick_validate.py；workflow-skills 检查；47 个文档相对文件链接与 diff 空白检查。
- 检查日志既有提示：本机 upstream/dev ref 缺失，版权守卫回退到固定 d217984c72ef 基线且 new=0；已有用户文件输出 CRLF 提示，另提示 2 条基线可收缩。本次未修改远端、其他人的文件或豁免基线，不将这些信息隐瞒为无日志提示。
- check:quick 未重复运行：最终直接执行完整 check，覆盖其 lint/guards。
- 未运行：真实 Provider、Desktop UI、远端 CI、真实模型路由评测和发布；没有相应授权且本任务不需要产品实例。
- Worktree：主工作区串行，保留既有用户修改；不创建、清理或推送其他工作区。
- 剩余风险：真实新会话的路由与自主交付效果待用户试用，静态门禁不证明自然语言执行质量。

## 功能验收包

- 新会话只描述任务，例如“给某功能加过滤”“修复某次 CI 失败”“AI 声称生成文件但文件不存在”。
- 预期：Agent 先查仓库事实，自动选择实现/诊断/CI/模型评估路线；不让用户选框架或填测试合同，不在仅分析请求中擅自实施。
- 工程交付应给出真实验证与简短功能验收步骤；未获用户接受不声明功能验收通过，不因自动化任务扩大 Provider/发布权限。
- 若路由或交付不符合预期，描述现象即可；按原 Task 反馈→复现→修复→复验，不把工程排错转交用户。
- 已知限制：静态脚本验证文件/引用/镜像，不保证任意模型在新会话中的指令遵循。用户实际试用前保持 verifying。

## 后续审核记录

用户提供的审核结论为“有条件通过”，不是无条件功能验收。#1/#7 守卫问题由 TASK-0138（73a365f0c）修复；#2/#3/#4/#5 与文案问题由 TASK-0139 跟进。本 Task 保持 verifying，未推送。

原提交 98cfb4b00 混合了 Skill 重构、机械守卫和验收政策三个可单独回滚的关注点。承认原拆分不理想；未获历史改写授权，不 reset/rebase，后续守卫与文档修正已分开提交。

### 人工验收实测（2026-10-08，VERIFY-0017 组五；保持 verifying 待裁定）

本条的清单条目是「在新会话里丢一句话需求，看 intake 是否按预期路由（**规范类，只有真用过才算验收**）」，因此本轮分三路取证：**真用过**、**镜像现状**、**回归套件**。

| 取证路径 | 本次读数 |
|---|---|
| **真用过**：本轮会话本身就是一次 intake 路由 | 本轮由用户以 `/open-forge-task-intake` 进入，随后依 [项目入口 AGENTS.md](../../AGENTS.md) 与 [Claude 专属补充](../../docs/dev/agent-rules/claude.md) 读取规则、按「最小必要流程」直接进入**验收**路线（未换框架、未要求用户填技术合同、未生成业务代码），与合同第 1、2 条 Given 一致 |
| **真用过**：验收分层约束 | 合同第 4 条 Given「用户尚未验收 → 交付功能验收包，保持 verifying，**不自行宣布用户接受**」在本轮被实际执行：12+12+5 条全部写成「保持 verifying 待裁定」，未代判 |
| 镜像与引用 | `bun run scripts/quality/workflow-skills.mjs` → 「canonical sources, shared entry and relative file links passed」。现状：`.agents/skills/` 在位、`.claude/skills` 为**符号链接**指向 `../.agents/skills`（未退化成文本文件）。**`.devin/skills` 已不存在**——由后续提交 `5a2d55049 refactor(skills): 移除 Devin 镜像与同步路径` **正式取消**（本任务交付记录里写的「Devin sibling 相对链接断裂」及其镜像已随之作废）⇒ 这是**被后续决定取代**，不是缺口 |
| 回归套件 | `scripts/quality/workflow-skills.test.mjs` **1 文件 / 17 例通过** |

- **未覆盖**：本任务交付记录里的完整读数（`test:impact` 34 文件 449 例、Project/Task/quality-gates 3 文件 99 例、完整 `bun run check` exit 0）本轮**未复跑**，只跑了 workflow-skills 自身套件 + 检查脚本。
- **既有用户裁定**：本任务「后续审核记录」一节已记载用户给过「**有条件通过**」（不是无条件功能验收），并列明 #1/#7 守卫问题由 TASK-0138 修复、#2~#5 与文案问题由 TASK-0139 跟进。本轮**未复核** TASK-0138/0139 的闭合状态，故不改变该结论。
- **关闭建议**：合同第 1/2/4 条 Given 在本轮被**实际使用**且表现符合预期；第 3 条（自动化软件测试通过不冒称模型质量通过）与第 5 条（镜像漂移明确失败）由回归套件与检查脚本覆盖。是否据此把「有条件通过」升级为验收闭合、以及 TASK-0138/0139 是否已清，请用户裁定。
