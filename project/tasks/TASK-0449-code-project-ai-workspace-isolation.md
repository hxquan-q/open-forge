---
id: TASK-0449
type: task
status: blocked
priority: P1
owner: desktop
requirement: REQ-0031
plan: PLAN-0029
source: D:/Coding/WorkSpace/Vetta/vetta-code-mode-ai-workspace-isolation.md
related_requirement: [REQ-0030]
related_plan: [PLAN-0029]
related_tasks: [TASK-0423, TASK-0425]
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: 主仓主检出（串行；不创建独立 Worktree）
base_commit: 7b40a1bea2a454e491907f6d0a1ff3149ee7b2ee
read_paths:
  - apps/desktop/src/main/agent-runtime/
  - apps/desktop/src/main/agent-modes/
  - apps/desktop/src/main/projects/
  - apps/desktop/src/main/conversations/
  - apps/desktop/src/main/filesystem/
  - apps/desktop/src/main/ipc/
  - apps/desktop/src/preload/
  - apps/desktop/src/renderer/domains/allstar-dev/
  - packages/coding-agent/src/
  - packages/runtime-desktop/src/
  - packages/runtime-node/src/coding/
  - packages/runtime-ssh/src/
write_paths:
  - apps/desktop/src/main/agent-runtime/
  - apps/desktop/src/main/agent-modes/
  - apps/desktop/src/main/projects/
  - apps/desktop/src/main/conversations/
  - apps/desktop/src/main/filesystem/
  - apps/desktop/src/main/ipc/
  - apps/desktop/src/preload/
  - apps/desktop/src/renderer/domains/allstar-dev/
  - apps/desktop/src/shared/i18n/locales/
  - packages/coding-agent/src/
  - packages/runtime-desktop/src/
  - packages/runtime-node/src/coding/
  - packages/runtime-ssh/src/
  - project/requirements/
  - project/plans/
  - project/tasks/
  - docs/adr/
  - .github/release-notes/fragments/v0.1.5/
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0423]
integration_status: pending
created: 2026-11-05
updated: 2026-11-05
---
<!-- Copyright The Open Forge contributors. -->

# Code 模式项目 AI 工作区隔离与 Memory/Journal 迁移

## 目标

依据已确认需求 `D:/Coding/WorkSpace/Vetta/vetta-code-mode-ai-workspace-isolation.md`，为每个 Code 项目提供位于 Vetta 用户数据目录的持久 AI 工作区；项目源码和 AI 辅助材料分离，并让单 Agent、Team 主控与成员 Agent 共享正确工作区。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无；TASK-0423 的项目配置 UI 已在当前源码中，按关联合同串行适配
- 冲突文件/独占路径：TASK-0423 仍 in_progress，二者可能触及 Allstar 配置 UI、Code Prompt 与发布说明；本 Task 在同一主检出串行执行，不并行修改
- Branch：未分配独立 Task 分支；当前主检出为 `chenxvhua`，串行实施
- Worktree：主仓主检出；共享写域且只由当前会话串行操作，不另开 Worktree
- 集成负责人：当前会话
- 集成顺序：路径身份/存储与迁移 → runtime/文件工具和 Prompt → Allstar 配置入口及项目生命周期 → 全面验证

### 做

- 为本地路径与 SSH `(host, remotePath)` 建立稳定、彼此隔离的项目工作区身份；显示名不影响身份，同 basename 不合并，路径改变不自动迁移/关联。
- 将 Allstar 项目持久化信息从 `<project>/.vetta/allstar/project-config.md` 改为项目 AI 工作区文件；配置入口覆盖 Allstar 登记项目及 Allstar 首页聚合的未登记 Code 会话项目，保存原始用户文本，不解释文本内容。
- Code Runtime 为项目根与当前 AI 工作区提供明确路径/落点约定；Agent Team 主控/成员及同项目会话复用相同映射。
- Memory / Journal 默认落在项目 AI 工作区；首次初始化按需求逐文件复制旧 `MEMORY.md` / `JOURNAL.md`，仅复制成功后删除源文件，冲突/失败不覆盖、不阻断新工作区。
- 只向当前会话文件工具授权当前项目根和当前 AI 工作区；覆盖本地、SSH、符号链接/路径越界边界，不暴露其他工作区或 Vetta 任意用户数据。
- 归档、取消登记保留工作区；硬删除项目时清理对应工作区；项目路径变化不自动复用旧工作区或迁移数据。
- 同步必要的 zh/en i18n、项目管理记录、ADR 和 v0.1.5 发布说明碎片。

### 不做

- 不迁移旧 `.vetta/allstar/project-config.md` 或其他 `.vetta/**` 项目资源；不迁移源码、会话 transcript 或 Desktop 日志。
- 不解析/验证项目配置文本，不增加 Nacos、数据库或外部服务连接逻辑。
- 不改变 Agent-Team 并发写入语义；不修改普通 work 会话行为。
- 不启动真实 Desktop/模型/SSH 主机，不执行任何远程 Git 操作、发布、tag、构建分发或部署。

## Given / When / Then

- Given 同项目的普通册/Allstar 册登记、不同 Code 会话或 Team 成员，When 首次初始化或重启后解析工作区，Then 它们按规范化项目位置复用同一路径；同名不同路径或不同 SSH 主机/远端路径互相隔离。
- Given Code Agent 正在处理项目，When 写源码/测试与需求笔记/Skills/记忆，Then 前者落项目根，辅助材料落当前 AI 工作区，文件工具不能访问其他项目 AI 工作区或 Vetta 任意用户数据。
- Given 旧 cwd 有 MEMORY.md 和/或 JOURNAL.md，When 新 AI 工作区首次启用，Then 分别执行成功复制后删除；复制失败保留源文件且不阻断会话；目标冲突不覆盖且保留源文件。
- Given 某项目已归档或仅取消登记，When 下次 Code 会话使用它，Then 原工作区保留；硬删除项目时同项目工作区删除。
- Given 用户保存任意项目持久化文本，When 关闭并重开配置入口或 Code 会话按需读取，Then 内容不变且不因编辑入口要求项目必须在 Allstar 项目册。

## 必须保持

- 会话 transcript、运行日志、源码构建输入与现有项目生命周期语义保持原合同。
- 旧 project-config Markdown 不自动迁移；目标同名文件永不静默覆盖。
- Prompt 中的项目资料始终是不可信上下文，不可覆盖系统安全规则或扩大宿主权限。
- SSH 项目继续经 SSH 文件/命令通道访问项目根，本机 AI 工作区不得误解析成远端 URI；本机与远端路径大小写语义各自保留。
- 行为变更以实际生产装配测试证明；不能只靠纯函数测试或静态 Prompt 字符串断言。

## 测试与验证

- 定向测试：项目身份与路径隔离；Memory/Journal 复制、删除、冲突与失败；本机/SSH 文件工具读写授权及越界/符号链接拒绝；项目登记/归档/移除/硬删除生命周期；配置 UI 正常用户流程和原文往返；Code Prompt 落点规则；Team 共用映射。
- 用户流程：Allstar 项目/未登记历史 Code 项目进入配置 → 保存并重开；新建或恢复 Code 会话及 Team 成员创建 → 文件落点/隔离 → 重启后复用；旧 Memory/Journal 首次迁移及逐文件失败恢复。
- 质量检查：按受影响包执行定向 Vitest + `bun run test:impact -- <files...>`；多个包/安全公共合同执行 `bun run test:changed -- <files...>`；完成前执行 `bun run check`。不跑裸 `bun test`、不默认运行 UI/E2E。

## 验收分层

- 工程验证：待执行；按已确认需求第 8 节逐项映射测试并记录实测结果。
- 技术评审：待自审；安全路径边界与本地/SSH 双通道为重点。
- 集成：pending；未提交/未推送状态分别记录。
- 人工功能验收：待用户；真实 Desktop/SSH 不在本任务默认授权内。
- 发布：未授权；只写 0.1.5 发布说明碎片，不汇编/发布。

## 功能验收包

- 入口与前置条件：Allstar 开发版块中选择一个已登记项目，另选一个仅有历史 Code 会话的项目；测试使用本地临时目录与 SSH 回环 Fake。
- 操作步骤：打开项目配置→填写任意文本→保存/重开；创建或恢复 Code 单 Agent 和 Team 会话→分别写源码与辅助材料→重启/重新装配；为旧 cwd 准备 MEMORY.md/JOURNAL.md 后首次启用；尝试访问另一个测试项目工作区。
- 预期行为与最终产物：配置与 Memory/Journal 位于当前项目 AI 工作区，源码仍位于项目根；同项目共享、跨项目拒绝；迁移逐文件满足 copy-then-delete/冲突和失败合同；归档/移除保留、硬删除清理。
- 不通过表现与已知限制：写入错误项目根、跨项目/全局用户数据可读写、迁移覆盖/丢源、同名项目共用工作区、SSH 路径误路由均失败。
- 验收反馈及回归案例：工程合同自动化先覆盖；实机功能验收由用户另行执行。

## 交付记录

- 实际修改：新增按规范化项目位置计算的持久 AI 工作区（本机路径及 SSH host/path）；项目配置改由专用主进程 API 原文读写；Code Prompt 明示项目根/AI 工作区根及材料落点；Code Memory/Journal 默认进入 AI 工作区，旧文件按单文件原子 no-clobber copy-then-delete；Code 模式本地 read/edit/write/ls/glob/grep/find/tree 文件工具限制到当前项目 cwd 与 AI 工作区，SSH 项目使用远端项目根及独立本机 workspace URI；Allstar 首页未登记历史 Code 项目也显示配置入口。
- 实际运行：`coding-agent`、`runtime-node`、`runtime-ssh`、`runtime-desktop` 定向 build 均通过；定向测试：runtime-desktop 30/30、SSH 45 通过 / 2 skip、runtime-node read 29/29、Desktop 集成 67/67、Allstar Renderer 12/12。`bun run check:quick` 与 `bun run check` 的 Biome/lint/type 和非 waiver guards 通过，guards 仅被既有过期 WAIVER-0014/0015 阻断。v0.1.5 发布说明碎片已写入；未汇编或发布。
- 影响面：`bun run test:impact` 首轮广域套件报 grep/glob/coding-agent 共 8 例 `spawn rg ENOENT`。复跑归因：本机无系统 rg（Git Bash 的 `rg` 是包装 `claude.exe` 的 shell 函数，Node PATH 无实体二进制）；把 Vetta 受管 `~/.openforge-dev/agent/bin/rg.exe` 前置 PATH 后三份套件 15+15+15 全绿——环境存量（同 TASK-0307 记录），非本任务回归。其余跨包行为由上述定向合同测试覆盖。
- 附带影响：修改声明审计在本任务新增文件上触发后，`--write` 仅支持全量写入，顺带补齐基线内 648 个存量缺失声明头（独立 chore 提交），ISSUE-0023 存量清零；后续可在安静窗口收缩基线快照。
- 未运行及原因：未运行真实 Desktop、真实模型或真实 SSH 主机；不执行 UI 实机验证、发布、tag、部署或远程 Git 操作。
- Worktree：未创建；主仓串行执行，当前检出 `chenxvhua`，无独立 Worktree。
- 提交：notices 清扫 / runtime / desktop 三个原子提交已本地落盘（未 push，详见 git log）。
- 阻塞 / 剩余风险：运行环境安全门控拒绝将 AI 工作区永久清理接入项目硬删除流程；因此该验收项尚未实现，任务保持 blocked。两个旧 Renderer `.vetta/allstar/project-config.md` 路径 helper/test 也因本地文件删除操作被门控拒绝而保留，但当前生产 UI/Prompt 已不再引用它们。旧 project-config 文档按需求不自动迁移。等待用户授权硬删除清理行为后续接并完成最终验证与状态收口。
