---
id: TASK-0273
type: task
status: verifying
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
base_commit: 96fbe05c1f18a3b662ab659db5162f533562fd9d
read_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/abilities/presentation, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, packages/ssh-transport/src/project-uri.ts]
write_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, apps/desktop/src/main/skills/skill-presentation-read.test.ts, project/tasks/TASK-0273-remote-skill-presentation-read.md]
exclusive_paths: [apps/desktop/src/main/agent-runtime/resource-runtime.ts, apps/desktop/src/main/skills/skill-service.ts, apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts, apps/desktop/src/main/skills/skill-presentation-read.test.ts]
depends_on: []
conflicts_with: [TASK-0197, TASK-0154]
integration_status: integrated
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

- 工程验证：通过（2026-10-16，见交付记录；新用例在改动前源码上红、改动后绿）
- 技术评审：自审（无独立评审授权；对实际 diff 的发现见交付记录「剩余风险」）
- 集成：pending（Coordinator）
- 人工功能验收：待验收（远程项目技能列表无告警、本地技能图标仍在）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例；一个已配置的 SSH 项目与一个本地项目。
- 操作步骤或 AI 任务输入：进入远程项目 → 打开技能/能力列表 → 观察日志；再切到本地项目重复。
- 预期行为与最终产物：列表正常；`dev/main/*.log` 不再出现 `[skills] skill <name> presentation ignored ... ENOENT 'C:\home\ubuntu\...'`；本地技能图标展示不变。
- 不通过表现与已知限制：告警继续出现，或本地技能图标丢失（过度跳过）。已知限制：本次不实现「远端图标走远端资源访问端口读取」，远端技能因此不展示包内声明图标（`icon` 缺省，插件贡献技能仍回落 provider 图标）；`vetta-file://` 语义未改。
- 验收反馈及回归案例：待填写。

## 交付记录

### 接缝决定（开工调查）

复核链路与 BUG-0116 一致：`createDesktopSessionResourceRuntime` 对 `ssh://` cwd 统一套
`presentRemotePathsAsSeenByTools`（`:102`），`getSkills()` 因此把 `filePath`/`baseDir` 从
URI 改写成远端绝对路径（`:118-128`）；`SkillService.list`（`skill-service.ts:193`）把这两个
字段直接交给 `loadSkillPackagePresentationIcon`，后者在 `skill-package-presentation.ts:34`
走本机 `readFileSync`。包装的立意（`:105-112`）写明是「交给模型之前」，而技能列表是宿主 UI
消费方，所以接缝按立意上移，而不是在消费方猜测路径形态。

- `createDesktopSessionResourceRuntime` 恢复成「只构造」：不再决定消费者视图。
- 包装只在模型面向的装配处套一层：`createDesktopPromptRuntimeSources`（`:159`）。
- `SkillService.list` 用 `isSshProjectUri(skill.filePath)` 显式跳过远端技能的展示解析，
  `declaredIcon` 保持 `undefined`，既有 `resolveProvidedSkillPresentationIcon` 回落照常生效。
- `:169`/`:176` 的 `isBuiltinSkillFile`、`findPluginSkillSource` 在新路径形态下逐项复核：
  URI 经 `path.resolve` 后必然落在本机 builtin 目录之外（`relative` 以 `..` 开头 ⇒ false），
  `normalizeSkillPath` 也不改写 scheme，插件根是本机绝对路径 ⇒ 都不匹配。本地项目（含
  `agents-user`、插件贡献、内置技能）路径形态未变，用例保持覆盖。

### 实际修改

- `apps/desktop/src/main/agent-runtime/resource-runtime.ts`：`:102` 去掉通用构造里的
  `presentRemotePathsAsSeenByTools` 包装；包装上移到 `createDesktopPromptRuntimeSources`；
  补充包装函数文档说明「为什么不做进通用构造」。
- `apps/desktop/src/main/skills/skill-service.ts`：新增 `@vetta/ssh-transport` 的
  `isSshProjectUri` 导入与声明头；展示解析前对远端技能显式跳过并注释理由。
- `apps/desktop/src/main/skills/skill-presentation-read.test.ts`（新增，3 例）：回环 SSH +
  真实资源访问。用例一断言技能列表运行时的 `filePath`/`baseDir` 仍是 URI；用例二走
  `SkillService.list(ssh://…)` 用户流程，断言远端技能被列出但不产出图标、无 `presentation ignored`
  告警，同一次列表里本机用户技能图标照常解析；用例三断言本地项目下同一技能包照旧解析图标。
- `project/tasks/TASK-0273-remote-skill-presentation-read.md`：本记录。

### 实际运行

| 命令 | 结果 |
|---|---|
| `bun run test src/main/skills/skill-presentation-read.test.ts`（cwd `apps/desktop`） | 绿：1 文件 / 3 通过（16.2s） |
| 同上，先把两处源码还原到 HEAD 再跑 | 红：2 失败——`expected false to be true`（`isSshProjectUri(skill.filePath)`）与告警 `skill remote-icon-probe presentation ignored`；即两条新断言都落在本次修复的行为上，不是恒真断言 |
| `bun run test:impact -- <两个源文件 + 新用例>`（仓库根） | 红：桌面用例经根 runner 导入即失败（`Electron failed to install correctly`、`process.resourcesPath` undefined），属既有「根 runner 跑桌面测试假红」，与本次改动无关；按 Task 约定改用包内 `bun run test` |
| `bun run test`（cwd `apps/desktop`，全量） | 文件 `47 failed \| 886 passed \| 4 skipped`（937），测试 `4768 passed \| 15 skipped`（4783）。**已收集用例 0 失败**；47 个文件全部是导入期环境失败（同一报错 `Electron failed to install correctly` / `process.resourcesPath` undefined），根因是本工作树 `node_modules/electron` 无二进制（既无 `dist/`、也无 `path.txt`），与本次 diff 无关；新增用例不在失败清单内。 |
| `bun scripts/quality/run-vitest.mjs --run src/main/agent-runtime/resource-runtime.remote.test.ts --testTimeout 900000`（临时去掉 win32 门控） | 红：用例确实执行（209s）后失败在 `:37` 的 `agentsFiles.every(file.path.startsWith(remoteRoot) \|\| file.path.startsWith(agentDir))`。该断言用的是本机 Windows 形态的 `remoteRoot`，而回环远端的绝对路径是 MSYS 形态（`/c/…`），两者永不相等；POSIX 上 `toLoopbackRemotePath` 是恒等映射，故同一断言为绿。**已把该文件逐字节还原**（`git status` 无该文件），门控与 POSIX 口径不变。 |
| `bun run check` | 首轮仅 `check:lint` 红（Biome `assist/source/organizeImports`：`@vetta/ssh-transport` 应排在 `@vetta-org/plugin-sdk` 之前，已按建议修正）；其余 lint/types/guards/mobile-lint 全绿，含 `modified-file-notices` ratchet `new=0`、`version-lines` 68 manifest 通过与 `check-task-worktrees`（268 task，0 warning）。修正后复跑全绿：lint/guards/types/mobile-lint 四项 exit 0。 |
| `bun run test src/main/skills/skill-presentation-read.test.ts`（import 排序修正后复跑） | 绿：1 文件 / 3 通过（16.9s） |

### 未运行及原因

- `resource-runtime.remote.test.ts` 的**绿**口径本机无法取得：该文件 `describe.skipIf(process.platform === "win32")`，而它的断言依赖远端路径就是本机 POSIX 路径形态（回环在 win32 上只能给 MSYS 形态）。本次以「不修改该文件 + 单独实测门控原因」代替，未伪造它的 Windows 绿。
- 真实 SSH 主机、Desktop 实机验收：按任务边界不做（不连真实主机、未获验证授权）。

### 剩余风险

- 「模型面对的远端绝对路径」这条契约（本 Task 唯一高风险面）在 win32 上**没有本机可执行的原样证据**：既有断言只在 POSIX 形态下成立，本次未改该文件，也未在被测代码路径上放宽任何断言。替代证据是静态等价——`presentRemotePathsAsSeenByTools`/`toToolFacingPath` 逐字未改，只把「套包装的位置」从通用构造移到 `createDesktopPromptRuntimeSources`，而该函数是唯一仍拿到包装的调用点（全仓 grep：`createDesktopSessionResourceRuntime` 只有两个调用点）。
- 端到端（真实 `SkillService.list` 走完整 `reload()` 装配）在 win32 上没有原样口径：本用例在
  win32 下把装配换成等价的技能刷新（真实远端资源访问与展示策略不变，跳过的
  package/extension/prompt 装配与本行为无关）。POSIX 侧保持原样。
- `reload()` 在 win32 回环远端 cwd 上实测**不是挂起而是极慢**：本 Task 一次实测中该调用随用例
  一起跑完，整个用例 197.5s，其中可单独驱动的两步（上下文资源 1.3s、技能发现+指纹 3.9s）只占
  ~5s，其余 ~190s 落在 `reload()` 内。这修正了 TASK-0168 记录的「Windows 挂起」措辞，但同一份
  记录也写明根因未定位——本次未定位，不猜测，留给 TASK-0168 的未决项。
- 远端技能的展示图标本次不解析（明确跳过），用户可见后果是远程项目下技能列表不再显示技能包内
  声明的图标；「远端图标走远端资源访问端口」属另案。
- 未新增/修改发布说明：本次交付未获该路径授权（Task `write_paths` 不含 `.github/release-notes/`），
  四个并行 Task 的写法一致，留待集成时统一补 `.github/release-notes/v0.1.3.md`。
- 未覆盖：远端项目的内置技能 / 插件贡献技能在 URI 形态下的展示路径（`:169`/`:176` 的判定只做了
  逐项源码复核，未做用例）；这需要自建插件夹具，超出本 Task 边界。
- Worktree：由 Task 合同预建，本次未创建/清理。

