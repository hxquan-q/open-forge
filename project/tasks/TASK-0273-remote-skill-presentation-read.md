---
id: TASK-0273
type: task
status: ready
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0116
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0116]
execution: parallel
branch: task/TASK-0273-remote-skill-presentation-read
worktree: ../open-forge-wt/task-0273-remote-skill-presentation-read
base_commit: 3c0662f32
read_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/abilities/presentation, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, packages/ssh-transport/src/project-uri.ts]
write_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, apps/desktop/src/main/skills/skill-presentation-read.test.ts, project/tasks/TASK-0273-remote-skill-presentation-read.md]
exclusive_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, apps/desktop/src/main/skills/skill-presentation-read.test.ts]
depends_on: []
conflicts_with: [TASK-0197, TASK-0154]
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 技能展示读取不再把远端绝对路径当本机路径

## 目标

让技能列表消费方不再对远端项目的技能做本机文件读取：技能列表改用「非工具视图」的技能路径，并显式跳过远端技能的展示图标解析；同时保证给模型/工具看的远端绝对路径契约不变。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel
- 可并行 Task：TASK-0271 / TASK-0272 / TASK-0274
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；与其它三个 Task 无文件交集；与 TASK-0197（`project/tasks` 目录级声明）及 TASK-0154（`apps/desktop/src/main/agent-runtime` 目录级声明，已集成处于验证态）重叠，按合同登记 `conflicts_with`
- Branch：`task/TASK-0273-remote-skill-presentation-read`
- Worktree：`../open-forge-wt/task-0273-remote-skill-presentation-read`
- 集成负责人：Coordinator
- 集成顺序：任意（文件不相交）

### 做

- `apps/desktop/src/main/agent-runtime/resource-runtime.ts:102`：把「远端路径工具视图」包装从通用构造里拆出来，只应用于工具/模型面向的构造（`createDesktopPromptRuntimeSources`），技能列表构造（`createDesktopSkillResourceRuntime`，`:168-185`）不再被包装——它的唯一消费者是 `SkillService.list`（全仓 grep 已确认），而该消费者需要的是可变现为本机读取或明确跳过的路径身份。
- `apps/desktop/src/main/skills/skill-service.ts:191-202`：调用 `loadSkillPackagePresentationIcon` 前用 `isSshProjectUri(skill.filePath)`（`@vetta/ssh-transport`）跳过远端技能；跳过时保持 `declaredIcon` 为 `undefined`，让既有 `resolveProvidedSkillPresentationIcon` 回落逻辑照常生效。
- 复核 `:169`/`:176` 的 `isBuiltinSkillFile`、`findPluginSkillSource` 在新路径形态下的行为：本地项目（含本地用户技能目录 `agents-user`）必须与改动前一致；内置与插件贡献技能仍走本机读取。
- 回归测试：优先用回环 SSH 夹具（`createLoopbackSshConnection`，参考 `resource-runtime.remote.test.ts`）断言「远端项目技能列表不产生展示读取告警」，并保持既有「远端路径对模型可见」契约断言为绿；再加一条 Windows 可跑的用例覆盖跳过判定与本地技能仍能解析图标。
- 若为了让「跳过判定 + 本地仍解析」在 Windows 上可测而需要最小内部接缝调整，允许作为本 Task 内的结构调整，但不得为测试引入仅测试使用的公开 API；若最终无法在 Windows 上覆盖端到端，必须在本 Task 交付记录里写明「端到端仅 POSIX CI 覆盖」并给出替代证据。

### 不做

- 不实现「远端图标走远端资源访问端口读取」——那是新增能力，另案处理；本 Task 只消除错误读取与告警噪音。
- 不改 `skill-package-presentation.ts` 的本机读取实现与 `vetta-file://` 资源 URL 语义。
- 不改 `presentRemotePathsAsSeenByTools` 对 `getAgentsFiles()` 的行为。
- 不改技能执行、加载与调用语义（`SkillService.list` 只产出展示字段）。

## Given / When / Then

- Given：用户在 SSH 远程项目下打开技能/能力列表。
- When：宿主构建技能列表并解析展示图标。
- Then：列表正常返回；远端技能不再触发本机读取失败告警；本地技能（含本地用户技能与插件贡献技能）的图标解析行为不变；`getSkills()` 交给模型的远端绝对路径仍未被改变。

## 必须保持

- `resource-runtime.remote.test.ts` 既有断言：「模型把 `baseDir`/`filePath` 直接交给远端 bash，必须是那台机器上的绝对路径，不是 URI」。
- `getAgentsFiles()` 的远端路径视图不变。
- 展示解析失败仍走捕获降级，不升级为技能列表整体失败。
- 技能列表对本地项目的输出与改动前逐字段一致（`name`/`alias`/`description`/`source`/`provenance`/`presentation`/`icon`）。

## 测试与验证

- 定向测试：`bun run test:pkg desktop`（该面若出现根 runner 导入假红，改用 `apps/desktop` 包内 `bun run test`），并附 `bun scripts/quality/run-vitest.mjs --run <本 Task 新增/修改的测试文件>`。
- 用户流程：远程项目会话下打开技能列表；本地项目下打开技能列表。
- 质量检查：`bun run test:impact -- apps/desktop/src/main/agent-runtime/resource-runtime.ts apps/desktop/src/main/skills/skill-service.ts`；完整 `check` 由集成后统一跑。
- 已知环境约束：`resource-runtime.remote.test.ts` 在 win32 上整块 skipped（见该文件顶部说明），因此 Windows 上不能只依赖它。

## 验收分层

- 工程验证：待执行
- 技术评审：待执行
- 集成：pending
- 人工功能验收：待验收（远程项目技能列表无告警、本地技能图标仍在）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例；一个已配置的 SSH 项目与一个本地项目。
- 操作步骤或 AI 任务输入：进入远程项目 → 打开技能/能力列表 → 观察日志；再切到本地项目重复。
- 预期行为与最终产物：列表正常；`dev/main/*.log` 不再出现 `[skills] skill <name> presentation ignored ... ENOENT 'C:\home\ubuntu\...'`；本地技能图标展示不变。
- 不通过表现与已知限制：告警继续出现，或本地技能图标丢失（过度跳过）。
- 验收反馈及回归案例：待填写。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：创建/初始化/检查/清理结果
- 剩余风险：
