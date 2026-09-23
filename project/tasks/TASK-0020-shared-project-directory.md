---
id: TASK-0020
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0019, TASK-0024, TASK-0025, TASK-0026, TASK-0028]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 共享项目目录约定（implementation-plan 阶段 5）

## 目标

固化可随 Git 共享的项目级约定：`.vetta/agents/`、`.vetta/skills/`、
`.vetta/task-templates/`、`.vetta/policies/`、`.vetta/artifacts/` 引用，
`.vetta-local/` 忽略规则，配置 Schema/版本与迁移器，Git 共享合同文档。

## 范围

### 并发评估

- 结论：不支持并发（Profile、Host 装配与 Task/Artifact 引用都跨越阶段 1-4 的写路径）
- 执行方式：serial
- 前置依赖：TASK-0015–0019、TASK-0024–0026、TASK-0028；它们完成后再冻结共享格式
- 集成负责人：coordinator

### 做

- `.vetta/` 子目录约定、装载顺序与具体配置 Schema；
- `.vetta-local/` 默认忽略清单与 Git 忽略引导；
- 配置 Schema version 与有明确旧版本 fixture 的迁移器；
- Git 共享合同文档（哪些目录入库、哪些本地）。

### 不做

- 远端同步/云端配置；
- 改动 `~/.openforge` 用户根的既有布局。

## Given / When / Then

- Given：团队把含 `.vetta/` v1 约定的仓库克隆到新机器；
- When：在 Open Forge 打开该项目；
- Then：agents/skills/task-templates/policies 按约定装载，`.vetta-local/` 不会被 Git 共享；已声明支持的旧 `.vetta` schema 经 fixture 验证后迁移，未知版本 fail closed 并给出恢复路径。

## 必须保持

- 项目内 `.vetta/` 与 home 根 `~/.openforge` 边界不混（ISSUE-0001 决策）；
- 目录约定有版本号，缺省行为向后兼容；
- 读取/迁移限定在当前 project root，不能越过项目根或写到其他项目/home 目录；
- `.vettapkg` 生态路径不变。

## 测试与验证

- 定向：配置 schema/version、已支持旧版本迁移、未知版本、路径逃逸拒绝与 `.vetta-local` 忽略规则测试；
- 用户流程：克隆含约定的仓库 → 打开项目 → 装载共享 Profile/Skill/Policy → 本机状态不进 Git；
- 质量检查：`bun run check:quick`、相关包测试。

## 阻塞

- 阶段 1-4 的 Profile、Artifact 引用与宿主装配合同尚未完成；不声称存在未定义的“旧版目录迁移”来源。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：

- 实际修改：
  - `coding-agent`：`src/projects/`——`.vetta/project.json` v1 清单 Schema（子目录启用开关、
    未知版本 fail closed 并给出恢复路径、未知字段拒绝）、v0 无清单兼容默认、
    `loadProjectConventions` 磁盘装载（路径限定 project root）、`.vetta-local/` 的
    `.gitignore` 标记段引导（已手写忽略不改动）；根入口导出。
  - `docs/vetta-project-conventions.md`：入库/本机目录合同、版本与迁移规则。
- 实际运行：`test/projects/shared-project-conventions.test.ts` 9 项（真实临时目录）覆盖
  v0/v1 装载、损坏 JSON、未知版本、子目录开关与忽略引导幂等；根 `tsgo` 本任务文件无错。
- 未运行及原因：克隆仓库的端到端装载流程未跑（装载器与既有 skills 发现机制同构，
  由单元层覆盖）；实机验收未授权。
- 剩余风险：`.vetta/agents|policies` 目前只有装载合同与开关，深度消费随 0028/0033 线
  接入；task-templates 引用格式的消费端在 TASK-0028。
