---
id: TASK-0171
type: task
status: in_progress
priority: P1
owner: coordinator
source: user-request-2026-10-02
related_requirement: [REQ-0004]
related_plan: [PLAN-0014]
related_tasks: [TASK-0147, TASK-0148, TASK-0149, TASK-0150, TASK-0153, TASK-0162, TASK-0163, TASK-0164, TASK-0165, TASK-0170]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主检出串行集成）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [project, apps, packages, scripts/quality]
write_paths: [project/tasks, project/bugs, project/requirements, project/plans, project/verification, project/CONVENTIONS.md, project/README.md, .agents/skills, .github/release-notes/v0.1.3.md, apps/desktop, apps/cli-host, packages/ai, packages/toolkit, packages/ssh-transport, packages/coding-agent, packages/theme-ui, scripts/quality, docs/dev/quality-gates.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0147, TASK-0148, TASK-0149, TASK-0150, TASK-0153, TASK-0162, TASK-0163, TASK-0164, TASK-0165, TASK-0170, TASK-0122, TASK-0123]
integration_status: reviewing
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 已有 Task 改动核验、原子提交与开发分支集成

## 目标与边界

Open-Forge-only。响应本轮用户“全部 task 修改提交推送 dev，然后合并主项目”：审查现有主检出 WIP 与七个 Task Worktree，按合同串行集成到本地 main，验证后 fast-forward 推送 origin/dev。主项目按仓库约定解释为本地主检出；远端 origin/main 当前另有 316 个提交差距，不将含糊描述扩展为稳定晋升授权，不推 upstream、不发布。

只收口已经实现的改动及已有规划记录；draft Task 不因此实施或标记完成。保留其他作者所有内容，不 stash/reset/覆盖，不批量弱化测试。主树中隔离前候选与已验证分支可能不同，必须逐文件比较并保留有效增量。遇到不可归属变更、必需检查失败或非快进时停止推送并记录证据。

## 并发、输入输出与顺序

- 必须串行；共享主树、索引和发布说明，不启动其他 Agent。
- 输入：main 的 1cbe27c53、现有未提交文件、TASK-0148/0149/0150/0153/0162/0163/0170 的干净 Worktree 与交付证据。
- 输出：按 concern 提交、main 合并记录、集成后测试证据、origin/dev 推送事实及保留项清单。
- 顺序：核对归属与已有记录 → 验证/原子提交主树独立 WIP → 干净主树按 0148 → 0149 → 0150 → 0153 → 0170 → 0162 → 0163 合入 → 审核待推批次 → test:changed 与完整 check → main:dev。
- 不自动删除可能仍在使用的 Worktree，不操作用户运行中 Desktop/Agent 或真实状态，不调用真实 SSH/Provider。

## Given / When / Then

- Given 已有七个 Task 分支与主树 WIP；When 逐项比对、测试和集成；Then 每份实现均可追溯至来源 Task，主树改动不丢失，未实施规划仍保留原状态。
- Given 测试、质量门禁或 Git 归属失败；When 进入推送闸门；Then 不推未验收批次，不 force，不声明完成。
- Given main 干净、完整待推批次已核验且 origin/dev 为祖先；When 执行标准 push；Then 远端 dev 与 main 同一提交，origin/main/upstream 不变。

## 验证与验收

复用各 Task 的 red/green 证据并自审实际 diff；定向测试、各集成片 test:impact、完整 bun run check；推送前 git fetch origin、git log origin/dev..main、bun run test:changed --base origin/dev、bun run check、git diff --check。只用仓库 Node runner。文档运行 workflow-skills、Project/Worktree/链接检查。失败先归因，不为集成而修改产品语义或放宽基线。

内部集成任务人工产品验收不适用，以 Git 与可执行检查为准；各功能 Task 仍保留原人工验收状态。真实 UI/Provider/远端主机未授权，不运行 verify:ui，不把自动化通过等同人工接受。

## 交付记录

- 已只读确认：七个 Worktree 均干净；main 比 origin/dev 多一个研究文档提交，远端未分叉。主树存在多个独立 Task 的已实现 WIP 和 draft 规划记录。
- 工程验证：待执行；技术评审：自审进行中；集成：reviewing；推送：origin/dev 已授权未执行，稳定版未执行。

## 候选对照与集成准备

主树候选与隔离提交逐文件对照：0148 仅缺懒边界冷编译测试修正；0150 源码一致但少两例失败预算回归；0162 主树旧候选将回调必填，采用隔离分支已审查的可选兼容合同及对应测试/README。0170 的三个测试入口文件用于解除已记录 CLI 调度阻断。只复制这些明确拥有的路径，不覆盖共享 Task/索引/发布说明，不移动或删除原 Worktree。完成组合验证后按原 Task 分别提交，再用标准 merge 记录分支祖先关系。

初始完整 bun run check 退出 0；守卫对 upstream/dev 的提示沿用固定基线并通过，不更改基线。

## 第一轮组合验证阻断

2026-10-02：bun run test:changed --base origin/dev 的质量脚本 483 项通过；CLI 标准入口已为 --maxWorkers=1，仍在 installed-artifact-runtime.test.ts 两例出现 RPC frame 的既有 20 秒等待超时（224 passed / 2 failed / 14 skipped）。失败分别是 host_response 等待时关闭与动态 Skill/MCP 变更。未增加超时、未删断言，先保留完整批次日志并等待其他包结束；随后只缩小到失败文件，必要时与 TASK-0170 干净分支比较。该结果阻止批次推送，不将此前隔离树通过写成当前组合通过。

已提交管理记录 fd402d68d 与开发入口文档 a739e62b2；代码仍未提交，原分支均保留。

## 主树候选验证与提交

首轮 test:changed 共 41 包：40 通过，CLI 失败，完整退出 1，日志保留。Desktop 为 880 文件/4642 项通过（6 文件/29 既有跳过）；AI 488、Coding Agent 1534、theme-ui 169、Toolkit 24 通过。当前快照单独运行 installed-artifact-runtime.test.ts 13/13 通过；随后先完整 check、SSH 认证 32/32，再在没有其他本轮测试运行时单独完整 CLI，50 文件/226 项通过（14 既有跳过）。未改变断言、超时或运行时代码，无法由这组证据证明底层时序问题已消失；最终标准整批闸门仍必须再跑。

按 concern 原子提交主树候选：
- 925868a08 fix(ssh): 保留首次连接交互预算并复用同轮口令
- 1269945cb feat(desktop): 在远程项目流程内新增主机并保留别名
- dbeb5bb0c fix(knowledge): 收口宿主提示词来源装配
- 4801256f4 test(cli): 收口进程测试调度隔离
- d418ce82e fix(toolkit): 收口文件占用重试与失败预算回归
- e1e1ef35c fix(ai): 收口网关初始思考签名兼容
- 97fc9f680 test(quality): 收口 Windows 验证资源与懒边界合同
