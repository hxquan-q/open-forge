---
id: PLAN-0025
type: plan
status: in_progress
priority: P1
owner: desktop
source: REQ-0030
related_requirement: [REQ-0030]
related_tasks: [TASK-0404, TASK-0405]
related_issues: []
related_bugs: []
depends_on: []
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# Allstar 自主开发功能版块演进（月内收官）

## 目标 Requirement

[REQ-0030](../requirements/REQ-0030-allstar-dev-section.md)。

## 当前事实与约束

- M0 已交付（TASK-0404，commit `c5700985d`）：代码模式独立为侧边栏版块入口，新会话默认
  文档与研究档；档位沿用 `workspaceModeByProjectAtom`（localStorage `vetta-workspace-mode`）。
- allstar-coding 现为 `packages/plugins/presets/allstar-coding` 预置插件（主控 + 13 环节
  流水线 + ac-fence 围栏 + 环节级存档，包版本 0.3.5/0.5.x）。
- 用户已定方向（2026-10-26）：流水线**整体并入宿主版块、预置插件退役**；内置 git 面向
  实施等非开发用户（自带便携运行时）；数据库 MCP 与环境安装移至 12 月。
- 时间约束：项目经理要求 M1–M3-core 在 2026-11-26 内收官（2026-10-26 周一起 ~23 个工作日）。
- 桌面侧可复用基建：Node/Python runtime 安装器、MinGit 引导、doctor、managed-tools、
  MCP 分层持有（app 级/工作区级）、受控制品校验（Windows 沙盒先例）。

## 候选方案与取舍

- 流水线融合形态：保留 preset + 合同绑定（被否决——用户定稿并入宿主，此后只有功能版块一个
  入口）；**并入宿主**（采纳，ADR 只记怎么迁）。
- 内置 git：依赖系统 git + 引导安装（被否决——实施用户机器大概率没有 git）；**随应用分发
  便携 git**（采纳，制品走受控校验）。
- 勘探环节位置：插流水线首位 / 需求后 / 独立于流水线——**待定**（并非每次流水线启动都对应
  项目），M2-2 并入完成后重议。

## 阶段与依赖（对用户排班表 v3 的台账镜像）

| 阶段 | 区间 | 发布 | 内容 | 状态 |
|---|---|---|---|---|
| M0 入口 | 10-26 | 0.1.3 | TASK-0404（已交付） | done |
| M1 版块壳 | 10-26 ~ 11-06 | 0.1.4 | TASK-0405：/allstar 路由+首页、项目空间、会话列表、配置 v1、存量迁移 | ready |
| M2 流水线并入 | 11-09 ~ 11-19 | 0.2.0 | ADR 并入路径 → 能力合入+插件退役 → 驾驶舱读面 → 围栏/角色可视化+精简写面（Task 实施前再建） | 排期 |
| M3-core 内置 git | 11-20 ~ 11-26 | 0.2.1 | ADR 权限模型 → 便携 git 运行时 → git MCP（背景轨：制品选型 11-02 起） | 排期 |
| M4' 补齐 | 12-01 起 | 0.2.x | 数据库 MCP、环境声明+缺项安装、配置 v2、深度写面、backlog 池 | 池 |

依赖链严格串行 M0→M1→M2→M3-core；背景轨（便携 git 制品选型/许可/校验链）与 M1 无代码
耦合，11-02 起并行去风险。压缩前提：用户评审不过夜；每里程碑缓冲 0.5 天；11-27 全局缓冲日。
底线方案：若 git MCP 挤不下，11 月保底交付 M1 + M2 全量 + git 运行时。

## 不做

- 不改既有对话/研究模式的会话语义与已开会话的工具面；
- 不在本计划内做远程（SSH）项目全链（backlog 池）；
- 不做发布自动化（push/tag 恒需用户授权）。

## 验证、回滚与升级信号

- 每批次收尾：`check:quick` → 定向 vitest（包内 runner）→ `test:impact` → 完整
  `bun run check`；用户可感知变化写 release notes 碎片并汇编。
- 回滚：M0/M1 为纯 renderer+路由改动可按提交回退；M2 插件退役前保留一个可回退提交点
  （能力合入与退役分提交），升级用户如遇 state.md 不兼容按版本号拒绝并回退。
- 升级信号：`vetta-workspace-mode` 出现非 work 记录即开发版块被使用过；preset 卸载数据
  （已装登记）在 M2 迁移时须幂等清理。

## 需要写 ADR 的不可逆决策

1. M1-1：版块与项目/会话模型关系（复用注册表+类型标签 vs 独立注册表）；
2. M2-1：流水线并入宿主的代码落点、ac-fence 由插件 hooks 转宿主特性、存量 preset 升级
   退役路径；
3. M3-1：内置 MCP 权限模型（app 级、最小权限、写审批、与用户自配 MCP 的优先级）。

## 待定决策池

- D-1 环境勘探环节位置（触发：M2-2 完成后重议）；
- D-2 内置 MCP 扩充清单（触发：M3-core 验收后）。
