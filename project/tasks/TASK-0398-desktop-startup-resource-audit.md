---
id: TASK-0398
type: task
status: done
priority: P1
owner: desktop/coordinator
requirement: REQ-0002
plan: null
source: user-request; 桌面端启动性能与资源占用调查
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0355, TASK-0105]
related_issues: []
related_bugs: []
execution: coordination-only
branch: main
worktree: .
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop, packages, project, docs, .ua]
write_paths: [project/tasks/TASK-0398-desktop-startup-resource-audit.md, project/tasks/README.md, project/research/RESEARCH-0044-desktop-startup-resource-audit.md, project/research/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 启动性能与资源占用调查

## 目标与范围

回答当前桌面端是否还有值得实施的启动与占用优化；结合当前源码、已有记录、近期运行日志和第一方文档，交付有证据分级的建议。来源复用 REQ-0002，独立研究进入 [RESEARCH-0044](../research/RESEARCH-0044-desktop-startup-resource-audit.md)。本轮是分析请求，不自动实施优化。

- 输入：当前源码与旧图谱、2026-10-21 至 10-23 已保留 main/render 日志、现有构建产物的静态体积、Electron/Node/Vite 官方资料。
- 输出：启动阶段样本、候选优化/既有优化对照、资源测量限制和下一轮验证合同。
- 不做：生产代码/测试修改、启动或操作真实 Desktop、读取凭据/会话正文、真实 Provider/SSH、构建/压测/部署/推送。
- 不变量：用户数据与其他工作区修改不变；不以关闭沙箱、取消功能、提高超时或缩小堆上限代替优化；不将开发日志、超时、构建字节数冒充发行版耗时/RAM基线。

## 并发评估

- 条件支持只读分域调查；Coordinator 串行落盘管理文档，不创建代码 Worktree。
- `/root/startup_audit`：主进程启动与同步任务；`/root/renderer_resources_audit`：Renderer 依赖、恢复与常驻资源；两者只读，不写文件/Git或运行实例。
- 本轮实际顺序：上述只读调查已在本 Task 落盘之前派发；此前未修改交付文件。这里如实记录，不倒填为记录后派发。后续管理文档统一由 Coordinator 维护。
- main / 当前主检出；索引与 REQ-0002 有其他会话未提交变更，只追加本任务导航，不提交或覆盖他人内容。
- 归属：Open-Forge-only 调研记录；无生产实现和代码集成依赖。

## Given / When / Then

- Given：有可追溯的源码提交、近期日志、过期图谱和既有性能优化。
- When：按 profile 与启动阶段分组，剔除热重载/后续路由事件；只输出必要性能数字与脱敏证据。
- Then：建议可追到代码/日志行，已知事实与假设分开，说明最低验证、风险及失效条件，不能声称本轮已提速或降低占用。

## 测试与验证

- 无运行时行为修改，不新增或执行业务测试；不运行 verify:ui、真实应用、完整构建或完整代码 check。
- 核对日志 SHA-256/读取字节边界、样本分组和异常样本；检查新记录相对链接、Project 索引与 Task 合同、发布说明格式及 diff 空白。
- 验收：研究结论与证据完整即可完成本调查；产品优化与人工体验验收尚未进入实施。

## 验收分层与交付记录

- 已交付 RESEARCH-0044，含八次分组启动样本、日志指纹、三项 P1 与次级候选、现有优化对照、第一方来源与后续基线合同；同步 Task/Research 导航和当前未发布 v0.1.3 的内部发布说明。产品行为未改变。
- 技术评审：两项原生只读分域调查；`/root/audit_report_review` 独立复核研究与当前源码，无结论性阻断。已按其发现保留技能列表现有 inflight 去重、补充先 tail 预览后 full 的恢复细节、修正源码行号。不宣称异模型评审或性能实验。
- 实际检查通过：`node scripts/quality/check-project-indexes.mjs`；`node scripts/quality/check-task-worktrees.mjs`（389 项、0 warning）；`node scripts/release/release-notes.mjs --check`；新 Task/Research 相对链接与必要字段检查；本次路径 `git diff --check`。
- 未执行：业务测试、完整 check、构建、UI/真实实例性能测量；本轮无运行时改动，文档检查不证明优化收益。人工功能验收不适用，研究完整性按本 Task 合同完成。
- 集成：调研记录与后续Task计划由承载本记录的本地main提交绑定；未推送，发布未授权。共享导航提交边界见WAIVER-0007，工作区索引保持同步。
- 剩余限制：日志缺少完整启动外部计时、CPU/内存稳态序列、运行制品 commit；现有 dist 非当前 HEAD 的受控构建。
