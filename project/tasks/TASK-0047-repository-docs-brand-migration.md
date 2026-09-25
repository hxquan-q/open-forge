---
id: TASK-0047
type: task
status: blocked
priority: P0
owner: release/docs
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: unassigned（等待 D 阶段和社区目标确认）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [project/requirements/PRODUCT.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github]
write_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github/ISSUE_TEMPLATE, .github/pull_request_template.md, .github/release-notes]
exclusive_paths: [README.md, README.zh-CN.md, QUICKSTART.md, QUICKSTART.zh-CN.md, CONTRIBUTING.md, CONTRIBUTING.zh-CN.md, SECURITY.md, docs, .github, .github/release-notes]
depends_on: [TASK-0044, TASK-0045, TASK-0049]
conflicts_with: [TASK-0048]
integration_status: pending
created: 2026-09-23
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 仓库文档与协作入口品牌迁移

## 目标

完成当前部分更新之外的仓库内公开文档品牌清查，使用户和贡献者看到一致、真实且不破坏命令/路径的 Open Forge 信息。

## 范围

### 并发评估

- 结论：不支持与 TASK-0048 并发；两项共享文档路线、社区链接审查和 Release Notes。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：Desktop/生态名称合同完成；`TASK-0049` 确认社区去向。现有工作树中已修改的 README、QUICKSTART、CONTRIBUTING 和开发指南必须作为输入保留，不覆盖或回退。
- 冲突文件/独占路径：根文档、`docs/**`、`.github` 模板与 Release Notes。
- Branch：`forge/dev`；Worktree：实施前按当前协作状态确认。
- 集成负责人：coordinator。
- 集成顺序：TASK-0044 / TASK-0045 → TASK-0049 → 本任务；与 TASK-0048 串行集成。

### 做

- 扫描 README、QUICKSTART、CONTRIBUTING、SECURITY、`docs/**` 和 GitHub 协作模板中的用户可见品牌与旧仓库入口。
- 完成未迁移的产品名称、数据目录和开发说明；核对中英文镜像、命令、路径、许可证与联系入口。
- 对已冻结目标更新到 `hxquan-q/open-forge`；对尚未批准的域名、npm scope 和社区 URL 保留当前有效值并标明不代表迁移已完成。

### 不做

- 不覆盖当前工作树已有修改，不改已发布历史 Release Notes。
- 不猜测或创建 Discord、官网、域名、邮箱等外部入口。
- 不改技术兼容 token、服务端私有仓库内容或生产代码。

## Given / When / Then

- Given：用户或贡献者从仓库首页、快速开始、贡献指南或协作模板进入项目；When：按文档设置、运行或贡献；Then：Open Forge 品牌边界、数据路径、命令和链接准确，未确认的外部目标不会被伪装成已迁移。

## 必须保持

- `docs/` 与公开文档中的操作命令必须可核实；文档变更不改变运行时行为。
- 保留 `.vettapkg`、`@vetta/*`、`VETTA_*` 和其他被冻结的技术标识。
- 用户和其他 Agent 的既有未提交内容完整保留。

## 测试与验证

- 定向检查：相对 Markdown 链接、命令、文件路径、仓库坐标和双语对应关系。
- 用户流程：从 README 的快速入口到本地开发/贡献步骤，逐项核对命令与目标路径。
- 质量检查：按文档规范核对事实、链接和路径；仅在改到受检查代码时运行相应代码门禁。

## 阻塞

- 仅剩 `TASK-0045`（已 ready：CLI 命令名 `openforge`、旧命令直接切换不保留别名、`vetta-serv` 改 `openforge-serv`，2026-09-25 决策齐）实施收口，及随之关闭的 `TASK-0049`；`TASK-0044` 已完成，社区入口已决策暂不建设（2026-09-25，保留现有外部链接）。本任务不重做当前已进行的局部文档更新。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
