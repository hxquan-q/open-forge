---
id: TASK-0057
type: task
status: done
priority: P0
owner: project/agent-workflow
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0007
execution: serial
branch: forge/dev
worktree: shared-workspace（文档串行更新；保留并行工作区已有内容）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [AGENTS.md, CLAUDE.md, project/README.md, project/CONVENTIONS.md, project/plans/README.md, project/requirements/README.md, project/issues/README.md, project/tasks/README.md, .github/release-notes/README.md, exprot/development-paradigm.md]
write_paths: [AGENTS.md, CLAUDE.md, NOTICE, README.md, README.zh-CN.md, project/CONVENTIONS.md, project/plans/README.md, project/requirements/README.md, project/issues/README.md, project/tasks/README.md, .github/release-notes/README.md, project/requirements/REQ-0005-openforge-independent-release-and-compliance.md, project/plans/PLAN-0005-independent-release-and-fork-governance.md, project/issues/ISSUE-0007-independent-desktop-version-baseline.md, project/issues/ISSUE-0008-apache-modified-file-notice.md, project/issues/ISSUE-0009-workspace-package-release-scope.md]
exclusive_paths: [AGENTS.md, CLAUDE.md, NOTICE, README.md, README.zh-CN.md, project/CONVENTIONS.md, project/plans/README.md, project/requirements/README.md, project/issues/README.md, project/tasks/README.md, .github/release-notes/README.md]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 固化 Open Forge 活跃二开与发布规则

## 目标

把独立版本线、上游来源、发行物许可与兼容身份规则落到 `project/` 和现行 Agent 入口；将 `exprot/` 保持为历史材料，避免开发者把上游 Vetta Release Notes 当作 Open Forge 的当前发布正文。

## 范围

### 并发评估

- 结论：不支持并发；会更新多个事实索引和 Agent 入口，必须由单一集成者串行完成。
- 执行方式：serial / coordination-only。
- 可并行 Task：无。
- 前置依赖：用户已经确认 Desktop 独立 SemVer；具体首发号与法律文件声明方式分别保持 ISSUE-0007/0008。
- 冲突文件/独占路径：根 Agent 规则、Release Notes 指南、Project 索引和新 Requirement/Plan/Issue。
- Branch：`forge/dev`；Worktree：当前工作区。
- 集成负责人：Coordinator。
- 集成顺序：创建 REQ/PLAN/ISSUE/Task → 更新索引 → 对齐 Agent 规则 → 按 TASK-0052/0055/0056 实施。

### 做

- 在 `project/` 建立 REQ-0005、PLAN-0005 和三个未决 Issue；明确已确认、待决和阻断发布的事项。
- 将当前上游同步和改动归属原则整理为 `Upstreamable / Open-Forge-only / Compatibility` 三类，并要求同步后跑行为合同测试。
- 更新 Release Notes 规则：Open Forge 只写自己的版本线；首发版本确认前把候选 release copy 留在 Task/Plan 交付记录，发布保持阻断；不得把 fork-only 改动加入上游已发布说明。
- 更新 Project 索引；保留已有未提交条目和已存在 TASK-0053/0054，不重编号、不覆盖其他计划。

### 不做

- 不编辑 `exprot/` 历史范式或已有发布版本正文。
- 不替用户决定首发号、版权主体、外部域名或 package release cohort。
- 不提交、不 push、不创建 tag。

## Given / When / Then

- Given：开发者在仍继承上游 `0.5.59` 的 fork 中添加 Open Forge 改动；When：检查发布说明规则并完成 Task；Then：不会把 Open Forge 内容写进上游 Vetta 说明；版本决策未关闭时发布状态保持阻断，待首发线确认后迁入自己的 Release Notes。

## 必须保持

- `project/` 是活动 Requirement/Plan/Task/Issue 的事实源；`exprot/` 只作为历史来源。
- 与 Apache-2.0 有关的 MUST、推荐实践和未决解释明确区分。
- 外显品牌迁移不能重命名有凭据、协议、持久化或消费者合同影响的技术身份。

## 测试与验证

- 定向检查：Project 编号/状态/相对链接一致；Release Notes 指南、AGENTS 和 CLAUDE 对版本切换例外的表述一致。
- 用户流程：新增 Open Forge 改动时，开发者能找到独立版本要求、上游归属分类和发行物许可证检查项。
- 质量检查：文档链接、frontmatter、Task 依赖和索引逐项核对；文档修改不要求运行全量 TypeScript 测试。

## 交付记录

- 实际修改：建立 `REQ-0005`、`PLAN-0005`、`ISSUE-0007`/`0008`/`0009`、`TASK-0052`/`0055`/`0056`/`0057`/`0058`；`AGENTS.md`/`CLAUDE.md` 加入 Open Forge 版本切换期 Release Notes 门禁；`.github/release-notes/README.md` 同步；`NOTICE` 追加 Open Forge 为下游修改产品、不暗示 Vetta 背书的声明；`README.md`/`README.zh-CN.md` 许可段落标明独立维护的 Open Vetta derivative；`project/` 各索引同步。核实 upstream 已发布 `v0.5.59` tag 而 origin 无同名 tag 后，将 `.github/release-notes/v0.5.59.md` 恢复为上游已发布原文，误入的 fork 条目暂存 ISSUE-0007「首发候选说明」待迁入。
- 实际运行：`git ls-remote`/`git show upstream/dev:...` 核实 v0.5.59 发布状态与上游原文；Project 编号、状态、相对链接逐项核对。
- 未运行及原因：代码测试（文档与记录改动）；`exprot/` 按约定保持不编辑。
- 剩余风险：ISSUE-0007/0008/0009 未关闭前，不得真实发布。
