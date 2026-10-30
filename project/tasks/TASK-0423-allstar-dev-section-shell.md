---
id: TASK-0423
type: task
status: ready
priority: P1
owner: desktop
requirement: REQ-0030
plan: PLAN-0027
source: REQ-0030
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0422]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit:
read_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/
  - apps/desktop/src/renderer/router.tsx
  - docs/adr/
write_paths:
  - apps/desktop/src/renderer/domains/project/
  - apps/desktop/src/renderer/router.tsx
  - apps/desktop/src/shared/i18n/locales/
  - docs/adr/
exclusive_paths: []
depends_on: [TASK-0422]
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# M1 版块壳：/allstar 专属路由、项目空间、会话管理与配置 v1

## 目标

把版块入口（TASK-0422）升级为专属路由的功能版块雏形：点击入口落版块首页而非新会话页，
版块内可管理 Allstar 项目、开发会话与项目级配置。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 前置依赖：TASK-0422（已 done）
- 冲突文件/独占路径：无在途任务冲突；主工作区串行
- Branch：chenxvhua
- 集成顺序：独立提交批次，按 PLAN-0027 于 2026-11-06 前收口发布 0.1.5

### 做

- ADR（先行）：版块与项目/会话模型关系——复用现有项目注册表+类型标签 vs 独立注册表，
  开发会话与对话会话的隔离/互见规则；
- `/allstar` 专属路由与版块首页（近期开发会话、项目入口、快速开始）；侧边栏入口改导航
  至此，悬停预取与结构合同（agent-mode-entry-points）同步更新；
- Allstar 项目空间：新建/导入归入版块，列表卡片（环境/流水线状态占位从简）；
- 版块会话管理：开发会话列表、归档/删除沿用既有基础设施、代码档徽章；
- 各项目单独配置 v1：默认执行档、工具面、围栏默认 scope（MCP 集字段占位），versioned-config
  落盘；
- 存量迁移：现有 coding 会话/项目在版块内可见，不做破坏性搬移；
- i18n zh/en、release notes 碎片、收尾验证链。

### 不做

- 不动流水线本体与 preset（M2）；
- 不做环境探测/安装与任何内置 MCP（M3/M4'）；
- 不做驾驶舱（M2）与确认门入版块（M4'）。

## Given / When / Then

- Given 用户在任意页面，When 点击侧边栏「Allstar自主开发」，Then 落 `/allstar` 版块首页
  （近期开发会话与项目入口可见），入口高亮；
- Given 版块首页，When 新建/导入项目，Then 项目归入版块并出现在列表；
- Given 存在 coding 档会话的项目，When 打开版块，Then 这些会话在版块内成列表、可归档/删除，
  对话侧列表语义不变；
- Given 任一 Allstar 项目，When 修改项目级配置，Then 落盘持久且重启后生效。

## 必须保持

- 普通对话/研究模式行为零变化（新会话默认 work 档语义不动）；
- 已开会话的右栏跟随会话 capabilityProfile（TASK-0422 语义不回退）；
- 版块入口仍是代码模式唯一入口（结构合同随路由变化同步改写）；
- 用户可见文案全走 i18n。

## 测试与验证

- 定向测试：路由与入口行为（含 agent-mode-entry-points 重写）、项目空间常见路径（新建/
  导入→出现）、会话列表/归档、配置读写合同；
- 用户流程：进入版块→建项目→开会话→归档→改配置重启生效；
- 质量检查：`check:quick` → `test:impact` → 完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：待执行（ADR 需用户当日评审）。
- 集成：pending。
- 人工功能验收：待验收（dev 实机走查）。
- 发布：未授权（目标随 0.1.5）。

## 功能验收包

- 入口与前置条件：M0 已交付的入口；存在或可创建项目。
- 操作步骤：点入口→版块首页→新建项目→发开发会话→归档→改配置重启。
- 预期行为与最终产物：见 GWT。
- 不通过表现与已知限制：待实施后回填。
- 验收反馈及回归案例：待回填。

## 交付记录

- 待交付后回填。
