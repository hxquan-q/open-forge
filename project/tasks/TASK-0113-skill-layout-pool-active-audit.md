---
id: TASK-0113
type: task
status: ready
priority: P2
owner: packages/plugins
requirement: []
plan: PLAN-0011
source: RESEARCH-0012 Avernet P2 + 低置信度标注（skills-pool/active 物理分离；本仓「未激活 Skill 是否会被递归扫描」需正式核查）
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [packages/plugins/, packages/skill-presets/, packages/coding-agent/src/agent-configuration/resource-selection.ts, apps/desktop/src/main/skills/, apps/desktop/src/main/plugins/]
write_paths: [project/research/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Skill 落盘布局审计：pool/active 分离必要性核查

## 目标

`RESEARCH-0012` 标注的**低置信度项**：Open Forge 侧 `resource-selection.ts:54-57` 已确认有配置层 skill 过滤（`allowsAgentResource`），但「宿主 skill 落盘目录是否会被 agent 递归扫描到**未激活**内容」未正式核查。Avernet 的对应机制是 `skills-pool`（只读全量内容库）与 `skills/`（仅激活软链）物理分离——发现边界在文件系统层而非配置层。本任务是**审计任务**：查清本仓 skill 实际落盘布局与 agent 可发现面，产出「是否需要 pool/active 分离」的裁决建议。

## 范围

### 并发评估

- 结论：支持并行——只读审计 + 写一份核查报告，不改产品代码。
- 执行方式：可独立 Worktree 或主工作区。
- 可并行 Task：本批全部。
- 前置依赖：无。
- 冲突文件/独占路径：无（只读 + 新增报告文件）。
- Branch：独立 task 分支或主工作区。
- Worktree：按需。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0011 阶段 D，独立可先行。

### 做

- 盘点 skill 实际落盘位置：内置 skill、skill-presets、插件贡献 skill、用户自定义 skill、市场安装 skill 各自的目录与格式；
- 确认 agent 侧发现路径：模型/tools 通过什么枚举 skill（`resource-selection` 配置过滤之外，文件系统层是否还会被 `Glob`/`Grep`/目录扫描摸到有未激活 skill 的正文）；
- 核对「激活=目录软链」还是「激活=配置项」的现状事实；
- 产出裁决：若未激活 skill 可被递归扫描发现 → 建议立项 pool/active 分离（参照 Avernet `skills-pool` 方案）；若发现面已封闭 → 记录「无缺口」关账。

### 不做

- 不做 pool/active 分离的实际改造（审计通过后再立项）；
- 不改 skill 格式、不改激活协议；
- 不扩大范围到 MCP server 或其他能力的审计（只查 skill）。

## Given / When / Then

- Given：装有多来源 skill 的开发环境；
- When：模拟 agent 用文件系统工具枚举 skill 目录；
- Then：报告明确回答「未激活 skill 正文是否可被 agent 读到」，并附逐来源证据与裁决建议。

## 必须保持

- 本任务零代码变更——只产出核查报告；
- 报告结论必须区分「配置层过滤」与「文件系统发现边界」两层事实。

## 测试与验证

- 定向测试：无需新增测试（审计任务）；
- 用户流程：实际在 dev desktop 里用 agent 工具枚举 skill 目录验证结论；
- 质量检查：报告按 `project/research/` 或 `project/verification/` 规范落位。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：
- 剩余风险：
