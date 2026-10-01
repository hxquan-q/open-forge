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
integration_status: pending
created: 2026-10-01
updated: 2026-10-01
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
- 集成：pending；不推送未验收批次。
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
