---
id: TASK-0187
type: task
status: in_progress
priority: P1
owner: coordinator
source: user-request; RESEARCH-0022
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0151, TASK-0188, TASK-0189, TASK-0190, TASK-0191, TASK-0192, TASK-0193]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0187-upstream-stability-batch
worktree: ../open-forge-wt/task-0187-upstream-stability-batch
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [project/research/RESEARCH-0022-upstream-nonmobile-gap-audit.md, apps/desktop, packages/runtime-core, packages/plugins/presets/git]
write_paths: [project/tasks, project/plans/PLAN-0014-selective-upstream-nonmobile.md, project/research/RESEARCH-0022-upstream-nonmobile-gap-audit.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0181, TASK-0122, TASK-0123]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 非手机上游稳定性首批隔离集成

## 目标与范围

依据 REQ-0008 / PLAN-0014 / RESEARCH-0022，将现有功能的高优先级缺口拆成可独立回滚的修复，在用户指定的一个专用工作树内串行实现、验证和原子提交。本 Task 只拥有批次协调与验证记录，各代码 concern 在子 Task 中定义。

首批包含流式 usage 引用、toolUse 回复终态、恢复成功的回合终态、主动滚动记忆、配置事务、dev bundle 缓存输入、Git 特殊路径与重命名。目标模式、富内容/批注、MCP 跨工作区 scope、feed/attach 公共合同迁移和沙盒制品来源选择保留原 Task；不混入本次稳定性补丁，不宣称已经交付。

## 并发评估与集成顺序

- 条件支持隔离：`execution: parallel` 仅声明可独立工作树；实际单 Agent、单工作树，内部所有子 Task 串行，不派实现 Worker。
- 专用分支/路径由 worktree:create 回填；该树作为本批次集成检出，子 Task 不创建第二工作树。
- 与 TASK-0181/0186 的发布说明、Task 索引有共享写入风险，保持主工作区不动产品代码；集成时逐项合并记录，不覆盖他人修改。
- 用户本次明确授权 Coordinator 完成验证后先 fast-forward 推送本批次候选至 origin/dev，再合入本地 main。该授权不涵盖 origin/main、上游、force、tag、Release 或发布制品。
- 推送前 fetch 并审核 origin/dev..候选的所有提交；若远端/本地主树前进，先在隔离树整合并复验，不强推。不满足主树安全集成条件时保留工作树并报告。

## Given / When / Then

- Given 本仓已有窗口化、队列顺序、错误/取消/usage、原子写和隔离能力；When 逐项适配上游修复；Then 原合同不退化，每片有旧行为失败的回归和正常入口流程证据。
- Given 主树有其他 Owner 的未提交修改；When 创建、提交、推送和集成；Then 不复制、提交、覆盖或删除他人内容，只有已验收批次可到 dev。

## 必须保持

不移植手机远程；不整仓合并上游；不撤销历史分页、缓冲限额、MCP 回收；不降低测试/完整 check；不启动真实 Desktop/Provider/SSH，不访问真实状态；不新增依赖升级或未经决策的制品源。

## 测试与验证

- 子 Task：可失败红测 → 最小实现 → 定向/正常流程测试；回填实际证据。
- 批次：按实际文件 test:impact；跨包运行 test:changed；完整 bun run check；必要脚本合同、配置并发与 Git 临时仓库测试。
- 提交：中文多行、显式 pathspec，逐项核对 staged；每个 concern 独立提交。
- 最终：审核候选提交、推送 dev 后记录远端 SHA；主树集成后核对 SHA 和工作区归属，集成变更则重新验证。

## 验收分层与功能验收包

- 工程验证/技术自审：待执行；集成 pending；用户功能验收待验收；仅开发分支推送获授权，稳定发布未授权。
- 用户流程：长会话流式回复并调用工具、切换会话与浏览历史、并发更新设置、修改 workspace 后重建 dev、查看特殊路径/重命名提交。
- 预期：不无效刷新整屏、不提前结束或错误终态、不错误恢复滚动、设置不相互覆盖、缓存不运行旧代码、Git 路径和 diff 正确。

## 交付记录

任务先落盘，随后由专用工作树完成子任务合同、实现和验证；实际命令、提交、剩余风险与人工验收状态持续回填。

隔离基线未包含其他执行流的 TASK-0186 记录，因此 frontmatter 不引用尚不存在的 ID；与其发布说明/索引冲突在正文登记，集成时按主树最新台账补齐。

基线检查：HEAD 的 Task 索引包含 TASK-0186，但文件只存在主树未提交区/其专用分支；隔离树先移除悬空索引行以准确表达当前快照，不复制或提交其记录/代码。主树原索引和文件保留，集成时以其 Owner 的最新实际状态恢复导航。
