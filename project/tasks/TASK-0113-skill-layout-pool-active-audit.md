---
id: TASK-0113
type: task
status: done
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
  - `project/research/RESEARCH-0014-skill-layout-pool-active-audit.md`（新增）：审计报告——五类来源落盘位置、两层发现机制、逐来源证据（文件+行号）、直接回答与裁决。
  - `project/research/README.md`：索引补 RESEARCH-0014 行。
  - 零产品代码变更（审计任务）。
- 实际运行：
  - 源码审计：`discovery.ts`（loadSkills 递归扫描根目录）、`skill-resource-state.ts`（manifest 禁用过滤）、`session-resource-runtime.ts`（skillPaths 组装与 updateSkills）、`resource-selection.ts`（配置层白名单）、`skill-service.ts`/`builtin-skills.ts`/`skill-market-install.ts`（落盘与启停）、`node-path-policy.ts`/`path-resolution.ts`（写侧保护与读路径解析）。
  - 结论坐实：激活=配置项+路径注入，非软链；`getSkills()` 层已封闭；文件工具层未封闭（`resolveToCwd` 绝对路径原样放行，保护只在写侧）。
- 未运行及原因：任务要求「dev desktop 里用 agent 工具枚举 skill 目录」的实机流程未跑（`verify:ui:*` 需用户明确授权，审计任务未授权启动桌面端）；该步由静态证据替代——`resolveToCwd` 与 `loadSkills` 代码路径已足以证明未激活正文可读。
- Worktree：主工作区（只读审计+新增报告）。
- 剩余风险：
  - 裁决建立在「未激活 skill 正文不算秘密数据」的威胁模型上；若未来将敏感模板放入 skill 再禁用，结论需重评；
  - 报告记录了 3 项次级观察（禁用项参与碰撞遮蔽、`.agents/skills` 等无启停语义、fingerprint 仍遍历禁用项），未立项；
  - 未实测 dev desktop 枚举，若实机行为与源码路径推断不符，以实机为准复审。
