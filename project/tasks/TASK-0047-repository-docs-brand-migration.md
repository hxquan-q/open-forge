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
updated: 2026-10-06
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

- 阻塞已解除（2026-10-06，TASK-0217 复核）：`TASK-0045` 与 `TASK-0049` 的 frontmatter 均为 done，原阻塞条件（等 0045 收口、随 0049 关闭）已满足。但**本任务尚未实施**——交付记录的四条（实际修改、实际运行、未运行及原因、剩余风险）全为空。状态转 ready，等待实施。原有约束保持不变：冻结技术标识（`.vettapkg`、`@vetta/*`、`VETTA_*`）不改；社区继续使用已冻结的现有入口。

## 交付记录（第一片，2026-10-06）

- 实际修改：README.md 与 README.zh-CN.md 各把散文里的产品称呼改为 Open Forge（英文 5 处、中文 3 处），`Vetta Serv` 改为 `Open Forge Serv`（依据 PLAN-0003 已定的 `openforge-serv` 代号）。冻结标识一律不动：`@vetta-org/plugin-cli`、`npx vetta-plugin-cli`、`npm run install:vetta` 已逐条核实为真实存在的包名与命令（`packages/plugins/plugin-cli` 的 bin 与 init 模板）。
- 刻意未改（待用户定，不是遗漏）：
  - README「Run from source」段的 `git clone https://github.com/openvetta/open-vetta.git` 与 `cd open-vetta`——改成 fork 坐标还是保留上游，取决于这份 README 面向谁；本仓为私有仓库，指向 fork 与指向上游都说得通，属仓库坐标决策。
  - CodeRabbit 徽章的 `github.com/openvetta/open-vetta` 仓库坐标，同上。
- 验证：`grep` 复核两份 README 后，除上述两处坐标外只剩冻结标识与上游署名（「Open Forge is an independently maintained derivative of Open Vetta」）。
- 未运行及原因：未跑运行时测试（纯文档改动，不改变任何命令与路径）。
- 剩余风险：本任务覆盖 84 个文件、334 行上界，本条只做了 README 中英对；QUICKSTART、CONTRIBUTING、SECURITY 与 `docs/` 待后续切片。

- 新增阻塞（2026-10-06，TASK-0048 记录同源）：`docs/` 树的清查不能按模式替换——里面同时混着产品称呼、术语名（被双链与根 CONTEXT 索引引用）、插件名（Vetta UI Design）与商业订阅品牌（Vetta Go / Vetta Zen），还有大量上游沿革记录（ADR、greenfield 实施日志、适配研究）。按模式替换当场打破术语索引，已整体撤回。需要先有一份「术语与品牌对照表」并决定沿革记录是否改名，才能继续。README、QUICKSTART、SECURITY 三份已按散文称呼改名并交付。
