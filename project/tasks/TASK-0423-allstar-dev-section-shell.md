---
id: TASK-0423
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0030
plan: PLAN-0027
source: REQ-0030
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0422, TASK-0479]
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: 主仓主检出（本地 try 分支，基于 chenxvhua）
base_commit: dee01563eab25b5e84dad5c0dcb22302bf06ea87
read_paths:
  - apps/desktop/src/main/agent-modes/
  - apps/desktop/src/main/filesystem/
  - apps/desktop/src/preload/api-types/
  - apps/desktop/src/renderer/domains/allstar-dev/
  - apps/desktop/src/shared/i18n/locales/
  - docs/adr/
write_paths:
  - apps/desktop/src/main/agent-modes/modes/coding.md
  - apps/desktop/src/main/agent-modes/modes-data.ts
  - apps/desktop/src/renderer/domains/allstar-dev/
  - apps/desktop/src/shared/i18n/locales/
  - project/requirements/REQ-0030-allstar-dev-section.md
  - project/tasks/TASK-0423-allstar-dev-section-shell.md
  - project/tasks/README.md
  - project/requirements/README.md
  - project/plans/PLAN-0027-allstar-dev-evolution.md
  - .github/release-notes/
exclusive_paths: []
depends_on: [TASK-0422]
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-11-03
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
- Branch：用户指定本地 try（基于 chenxvhua；串行实施，不拆独立 Task worktree）
- 集成顺序：独立提交批次，按 PLAN-0027 于 2026-11-06 前收口发布 0.1.5

### 做

- ADR（先行）：版块与项目/会话模型关系——复用现有项目注册表+类型标签 vs 独立注册表，
  开发会话与对话会话的隔离/互见规则；
- `/allstar` 专属路由与版块首页（近期开发会话、项目入口、快速开始）；侧边栏入口改导航
  至此，悬停预取与结构合同（agent-mode-entry-points）同步更新；
- Allstar 项目空间：新建/导入归入版块，列表卡片（环境/流水线状态占位从简）；
- 版块会话管理：开发会话列表、归档/删除沿用既有基础设施、代码档徽章；
- 各项目单独配置 v1：默认执行档、围栏默认 scope（MCP 集字段占位），versioned-config
  落盘；项目级工具面配置经用户决策不做，显式调用候选按会话模式的可见性改由 TASK-0478 实施。
- Code 项目配置信息：从项目卡片进入配置面板，编辑并保存 Git、测试环境、测试服务器、数据库及其他项目说明到项目专属 `.vetta/allstar/project-config.md`；用户可反复查看，Code 会话按需通过既有文件读取工具反复读取。内容只作为说明保存，不自动执行 Git 命令或连接环境、服务器、数据库；界面提示不得填写密码、Token 等机密。
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
- Given 一个已登记的 Allstar 项目，When 用户打开项目配置、填写 Git/测试环境/测试服务器/数据库或其他说明并保存，再次打开配置，Then 内容仍存在于该项目专属记录中；Code 会话可按需重复读取该文件。

## 必须保持

- 普通对话/研究模式行为零变化（新会话默认 work 档语义不动）；
- 已开会话的右栏跟随会话 capabilityProfile（TASK-0422 语义不回退）；
- 版块入口仍是代码模式唯一入口（结构合同随路由变化同步改写）；
- 用户可见文案全走 i18n。
- 项目配置信息只属于 Allstar 版块项目并落在该项目 `.vetta/allstar/` 命名空间；不改普通项目配置，不把信息当成可执行设置，也不把密码、Token 等机密纳入面板或模型可读文件。

## 测试与验证

- 定向测试：路由与入口行为（含 agent-mode-entry-points 重写）、项目空间常见路径（新建/
  导入→出现）、会话列表/归档、项目配置读写合同与配置面板用户操作流程；
- 用户流程：进入版块→建项目→开会话→归档→打开项目配置→编辑 Git/数据库等信息→保存→关闭并重新打开后仍可见；代码模式提示能够按需读取项目配置文件；
- 质量检查：`check:quick` → `test:impact` → 完整 `bun run check`。

## 验收分层

- 工程验证：项目配置信息切片的定向测试、`check:quick`、Desktop typecheck、全仓 `bun run check` 与 renderer build 已通过；M1 其余配置项和收尾仍未完成。
- 技术评审：待执行（ADR 需用户当日评审）。
- 集成：pending。
- 人工功能验收：待验收（dev 实机走查）。
- 发布：未授权（目标随 0.1.5）。

## 功能验收包

- 入口与前置条件：进入 `/allstar`，项目已登记到 Allstar 项目册。
- 操作步骤：项目卡片点「项目配置」→填写 Git、测试环境、测试服务器、数据库或其他说明→保存→关闭并重新打开面板；Code 会话在相关任务中按需读取 `.vetta/allstar/project-config.md`。
- 预期行为与最终产物：信息写入该项目目录内的专属 Markdown 文件，重新打开后仍可查看；不自动执行 Git 命令或连接服务。
- 不通过表现与已知限制：保存后内容丢失、写入其他项目、Code 模式提示未指出读取路径均为失败；文件是本地项目数据，请勿放入密码/Token/私钥；真实 LLM/Electron 流程尚未实测。
- 验收反馈及回归案例：自动化测试覆盖面板操作、文件保存与重新读取；实机验收待用户。

## 交付记录

- 2026-11-02 对账（前体范围已先行交付，本 Task 由此收敛剩余范围）：
  - ADR 先行：ADR-0151 版块项目册与可见性模型已入库（`26e4b99f5`，2026-10-27）；
  - `/allstar` 专属路由与版块首页（近期开发会话、项目入口、快速开始）、入口改导航+悬停预取、agent-mode-entry-points 结构合同重写、`listSessions` 附带 agentMode——M1-2 交付（`87a72fd62`，2026-10-27）；
  - Allstar 项目空间第二册 allstarProjects、ProjectService 按册参数化、IPC openAllstar/removeAllstar、版块首页册驱动卡片与「打开已有项目」——M1-3 交付（`caea2aed4`，2026-10-28）；存量 coding 会话/项目经幂等登记在版块内可见，无破坏性搬移；
  - 版块会话列表与续开已随 M1-2 落地；归档/删除沿用既有基础设施；
  - i18n zh/en 已随 M1-2 落地；release notes 碎片持续累积于 `fragments/v0.1.5/`。
- 2026-11-03 项目配置信息切片：Allstar 已登记项目卡片增加「项目配置」面板；Git/测试环境/测试服务器/数据库/其他说明作为 Markdown 保存到项目自己的 `.vetta/allstar/project-config.md`，Code 模式提示要求在相关任务中按需读取。使用现有文件 API（支持本地与 SSH URI），不执行配置、不连接外部服务，并提示不填写机密。
  - 定向测试：4 个文件 / 33 项通过；`bun run check:quick -- <本次 19 个文件>` 通过；Desktop typecheck 与全仓 `bun run check` 通过；`bun run build:renderer` 成功（出现图标名/资源告警，未阻断构建）。
  - 未运行：`test:impact`、`test:check`（按用户要求留待用户收尾时决定）；未启动 `bun run dev` / Electron，未做真实模型读取验证。
  - 发布说明碎片写入 `.github/release-notes/fragments/v0.1.5/allstar-project-config.md`；本地 `v0.1.4` 已打标签，未改已发布说明，未汇编未来版本。
- 剩余范围：各项目单独配置 v1 的默认执行档、围栏默认 scope、MCP 集字段占位及 `versioned-config` 落盘仍待做；显式调用候选模式可见性独立见 TASK-0478。收尾验证链（`check:quick` → `test:impact` → 完整 `bun run check`，需 WAIVER-0006/0007 核销后过全量）与 0.1.5 发布收口（2026-11-06 前）。
