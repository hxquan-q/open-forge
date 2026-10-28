---
id: TASK-0361
type: task
status: verifying
priority: P1
owner: apps/desktop + packages/runtime-storage
requirement: REQ-0026
plan: []
source: REQ-0026 / ISSUE-0034 方案 B+C 用户裁定（2026-10-22）；用户续接要求（2026-10-28）调研 GitHub 并优化会话历史与产物跨设备导入导出
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0349]
related_issues: [ISSUE-0034]
related_bugs: [BUG-0153, BUG-0154]
depends_on: []
conflicts_with: []
execution: serial
branch: main
base_commit: 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d
worktree: unassigned（主工作区串行执行；注意与其他会话共享工作区，staging/提交须用路径限定）
read_paths: [docs/adr/0147-project-migration-archive-v2.md, packages/runtime-storage/src/conversation/session-archive/, apps/desktop/src/main/conversations/session-archive-service.ts, apps/desktop/src/main/ipc/session-archive.ts, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/conversation/hooks/useChatViewModel.ts]
write_paths: [apps/desktop/src/main/conversations/, apps/desktop/src/shared/i18n/locales/zh/main.json, apps/desktop/src/shared/i18n/locales/en/main.json, apps/desktop/README.md, docs/adr/0147-project-migration-archive-v2.md, .github/release-notes/fragments/v0.1.4/task-0361-project-migration.md, project/tasks/TASK-0361-project-migration-archive.md, project/tasks/README.md, project/bugs/BUG-0153-archive-restore-path-boundary.md, project/bugs/BUG-0154-native-session-archive-unreadable.md, project/bugs/README.md, project/research/RESEARCH-0046-project-migration-portability.md, project/research/README.md]
exclusive_paths: []
integration_status: integrated（本地 main 串行原子提交 `46785aaac`；已核对包含于 origin/dev `2806052dd`，origin/main 未推送）
created: 2026-10-22
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 项目迁移包：OFAR v2 + cwd 重写导入 + 产物打包（REQ-0026 / ADR-0147）

## 本轮续接合同（2026-10-28）

- 来源：用户要求调研 GitHub 后优化现有项目，重点是会话历史与产物可以导出到其他设备导入。复用 REQ-0026 与本 Task，不重复建立迁移需求/计划；独立外部证据进入 RESEARCH-0046。
- 当前事实：主工作区 `main` 在 `9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d` 无既有改动；`.ua` 图谱为 2026-10-12 的 `254796d8`，相关归档模块此后已有变更，本轮以当前源码/Schema 为准。现有服务两文件基线 28/28 通过，但夹具只覆盖 legacy `type:session`，未覆盖当前 `conversation.header`。
- 目标：兼容当前与历史会话的身份/标题/cwd；在不同设备路径迁移后，可由真实历史读取接口重新打开且再次导入幂等；防止文件恢复沿目标内已有目录链接越界、默认覆盖和重复条目误写；不能以成功导出掩盖坏历史记录丢失。
- 不做：云端同步、远程 SSH 产物、账号/密钥迁移、项目记忆迁移、自动备份、新格式/新依赖、批量重写历史消息或工具路径。项目目录外的插件私有产物不假装已打包；延续既有 workspace 排除规则与大小上限。
- 比较方案：不引入 Cherry Studio 式整库替换/重启恢复，不另造 ZIP/云端通道；沿用 OFAR v1/v2，修正现有头记录适配，并将两条归档恢复路径共同需要的文件安全写入收敛到小型宿主模块。格式与 IPC 无需变更；ADR-0147 仅补记当前头格式和安全落实，不重定义历史事实。
- 执行：serial，当前 Coordinator 是本任务唯一写入者；branch/worktree 沿用上方。2026-10-28 其他会话随后开始独立 MCP/设计工作，共享索引采用小块编辑并保留其增量；不提交其文件，不在该目录并行派发代码 Worker。只读调查/最终独立评审可以原生子任务执行，禁止其写文件、改 Git 或运行真实实例。主进程归档服务与配套测试为共享合同，不能并行修改。读写路径沿用 frontmatter，并包含新建 `apps/desktop/src/main/conversations/archive-file-restore.ts` 及测试、RESEARCH-0046 与其索引、ADR-0147、Desktop README 和待发布说明碎片。
- Given 当前原生会话与 legacy 会话以及二进制/嵌套产物；When 导出 → 预览 → 换临时 agent 数据目录及目标路径导入 → 使用真实读取器重新加载 → 重导；Then 身份、标题、消息/工具/usage/取消语义保留，仅会话头 cwd 指向目标，产物字节一致且重导不增副本。
- 原生文件约束：现有 Runtime 只认按 sessionId 编码的 canonical `.conversation.jsonl`；必须使用公开 `resolveConversationFilePath`。同 ID 同内容幂等跳过；同 ID 不同内容明确拒绝、提示换目标项目，不改身份/事件以假装副本，也不静默覆盖。legacy 随机文件名副本行为保持。
- Given 目标中已有文件/目录链接或归档内重复会话/附件路径；When 导入（默认及显式覆盖）；Then 用户文件默认不覆盖、链接外内容不改变、不能因半途失败提交残缺 JSONL；失败清楚报告且已提交结果可幂等重试。
- Given 会话文件含非 JSON 行；When 导出；Then 明确失败而不是把原文替换成哈希后报告成功，源文件不动。
- 验证：先最小失败回归，再服务正常连续流程和文件安全测试；`bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts <定向文件>`；`bun run test:impact -- <本轮源码及测试>`；跨包合同实际变动时追加 `test:changed`；最终 `bun run check`。不运行 `verify:ui:*`、真实 Provider 或真实用户目录；真实双设备人工验收保持待验证。
- 发布说明：manifest 仍为 0.1.3，且已存在 `v0.1.3` tag，禁止修改已发布正文或擅自切版本。本轮候选说明放下一补丁版本碎片（待版本准备时汇编），交付记录说明此边界。
- 归属：Open-Forge-only 迁移入口与宿主策略；Compatibility 保持 OFAR v1/v2、legacy 文件名副本、当前原生 identity/事件及公开 Runtime 文件路径合同，不复制第三方实现。
- 独立只读调查已回收：原生子任务 `4ace6ae5-bb42-438` 核实 canonical 命名、标题来源和不可改 ID 的指纹边界；未写文件、未跑测试。
- 验收：工程通过后回到 `verifying`，不冒充人工接受；串行提交只纳入本轮路径，不推送包含未验收批次的 main。其他会话的共享台账仍在变更时，Coordinator 使用独立临时 Git index 与明确的路径清单，共享 README 只写入本任务行；正常提交钩子照常运行，提交后仅将本次补丁同步到常规索引，不覆盖其余未暂存/已暂存内容。

## 目标

按 ADR-0147 实现完整项目迁移：迁移包导出（会话+产物，v2 格式）、两段式导入（preview/apply，目标位置自选、cwd 重写、指纹按最终落盘形态）、迁移向导 UI。设计合同以 ADR-0147 为准，本 Task 固化实施切片与测试合同。

## 范围

### 并发评估

- 结论：serial——格式、服务、IPC、UI 纵向耦合，一个闭环交付；共享主工作区有其他会话在途，**staging 与提交必须路径限定**（`git add <paths>` + `git commit --only -- <paths>`）。
- 执行方式：serial；Branch main。

### 实施切片（每片独立可验证）

1. **格式 v2（runtime-storage）**：
   - `types.ts`：`SESSION_ARCHIVE_FORMAT_VERSION = 2`；`SESSION_ARCHIVE_FRAME.WORKSPACE_FILE = 0x04`；encode 输入加 `workspace?: { sourceCwd: string; files: readonly { relativePath: string; bytes: Uint8Array }[] }`；decode 结果加 `workspace?: { sourceCwd?: string; files: readonly { relativePath: string; bytes: Uint8Array }[] }`；metadata 加可选 `sourceCwd`/`workspaceFileCount`。
   - `frames.ts`：新增 workspace 帧编解码（复用 ATTACHMENT 帧布局；meta 无 id/mimeType）；`decodeFrames` 白名单加 0x04。
   - `decode.ts`：版本接受 {1,2}；v2 校验 `workspaceFileCount`（声明存在时）与帧数一致；v1 → workspace 为 undefined。
   - `encode.ts`：有 workspace 时写 v2（sourceCwd 进 metadata + WORKSPACE_FILE 帧）；`safePath` 校验 relativePath。
   - 桶导出（index.ts）同步类型。
2. **主进程迁移服务**（新文件 `conversations/project-migration-service.ts`，薄 IPC 原则同 session-archive-service）：
   - `exportProjectMigrationArchive(input: { cwd, passphrase, includeWorkspace, defaultFileName, listSessionPaths })`：会话经 `listSessionHistory(cwd)`；`includeWorkspace` 时按排除规则（`.git`/`node_modules`/`.vetta`，目录树递归跳过同名目录）读文件（>512MB 单文件或 >4GB 总量抛错）；编码 v2 → 保存框（默认名 `项目名-migration.ofar`）；返回 `{saved, path?, sessionCount, workspaceFileCount?, reason?}`；零会话 → `no-sessions` 不弹框；`isSshProjectUri(cwd)` → 明确错误。
   - `previewProjectMigrationArchive(passphrase)`：打开框选 `.ofar` → 解码 → 返回 `{archivePath, passphrase 已持, sourceCwd?, sessionCount, sessions:[{sessionId,name}], workspaceFileCount, workspaceBytes, formatVersion}`，**不落盘**；v1 归档 → 返回 `{classic:true}` 由调用方回落现行流程。
   - `applyProjectMigrationArchive(input: { archivePath, passphrase, targetCwd, overwriteWorkspace?, listKnownFingerprints, ensureTargetDir? })`：重读+解码；targetCwd 合法性（绝对路径）；会话记录 **先重写 cwd（type:"session" 且 cwd===sourceCwd → targetCwd）再算指纹**，冲突判定与既有 `resolveSessionArchiveImportConflict` 一致；副本落 `codingAgentSessionShardPath(targetCwd)`；workspace 文件恢复到 targetCwd（默认 skip-existing，显式 overwrite；safePath；symlink/目录类型不一致跳过并计入报告）；每个写入会话 `emitConversationListChanged({cwd: resolveSessionListCwd(targetCwd), sessionPath})`；返回报告 `{sessions:[decisions], workspace:{written, skipped, overwritten, failed:[relativePath]}}`。
3. **IPC + preload**：新通道 `vetta:session-archive:export-migration` / `preview-migration` / `apply-migration`；参数校验同既有风格；preload 类型与方法同步。
4. **UI**：
   - 项目右键菜单新增「导出项目迁移包…」：口令 + 「包含项目文件（排除 .git/node_modules）」复选（默认开）；结果 Toast（会话数+文件数）/零会话/失败；复用 `useProjectsPanelMenusModel` 模式与既有确认对话框 + Toast。
   - 「导入会话归档」升级（`useChatViewModel.importArchive`）：preview 先行——`classic:true` 走现行导入；迁移包则弹**迁移向导对话框**（新组件，project 域）：预览信息 + 目标选择（现有本地项目下拉 + 「新路径」输入）+ 冲突策略（默认跳过已有文件，复选覆盖）→ 执行（禁用态+进度文案）→ 报告（会话导入结果、产物 written/skipped/failed）。
   - theme-ui 仅在需要新展示组件时扩展（迁移向导对话框壳可复用 shared 既有 Dialog 组件，不强行入 theme-ui）。
5. **i18n（zh 为准、en 同步）**：project ns 菜单项与向导文案；main ns 保存框标题；chat ns 导入分流提示。

### 不做

- 不重写消息/工具调用内路径；不做 workspace 增量/去重；不做远程项目迁移包；不做 `.ofar` 之外的容器；不改 v1 导出语义与字节。
- 不运行 `verify:ui:*`（未授权）。

## Given / When / Then（关键合同）

- Given 项目含 2 会话与若干产物文件；When 导出迁移包（含产物）→ 在另一实例（不同 agent dir / 不同项目路径）经向导选择新路径导入；Then 会话落新路径分片、记录头 cwd=新路径、侧栏目标项目下即时可见且可续跑；产物文件恢复到新路径（已存在默认跳过并计入报告）。
- Given 同一迁移包；When 重复导入同一目标；Then 全部会话 `skip-idempotent`（指纹按重写后形态两侧一致）、产物按策略跳过/覆盖，不产生重复副本。
- Given v1 会话归档；When 经「导入会话归档」；Then 走现行流程，行为与 TASK-0349 交付一致（classic 分流）。
- Given 迁移包含 >512MB 单文件或总量 >4GB；When 导出；Then 导出明确失败并提示精简，不产半包。
- Given 口令错误/包损坏/v2 包在仅支持 v1 的旧版本；When 导入；Then 明确错误（版本为 UNSUPPORTED_VERSION），不落盘。

## 必须保持

- ADR-0147 全部条款；v1 归档字节与行为不变（既有 30 例回归全绿）。
- IPC 纯新增通道；既有 `export`/`import`/`export-project` 合同不动。
- i18n 全量（zh/en）；用户可见路径不使用阻塞式 `alert/prompt`。
- 产物恢复不静默覆盖；`safePath` 防逃逸；不记录文件内容到日志。

## 测试与验证

- runtime-storage：v2 编解码 round-trip（workspace 字节不变、sourceCwd/计数校验）、v1 兼容读、v1 拒绝 v2 帧非法混合、workspaceFileCount 不匹配报错、未知帧 kind 拒绝。
- 迁移服务：导出排除规则与上限、零会话、ssh 拒绝；preview 不落盘且 classic 识别；apply 重写后指纹幂等（同包同目标两次）、换目标建副本、workspace skip/overwrite/symlink、事件广播（目标列表 cwd）、错误口令。
- IPC/preload 合同三通道；菜单/向导模型与组件测试（分流、目标选择、冲突策略、报告展示、失败 Toast）。
- 质量门禁：定向 + `test:impact` → `check:quick` → 完整 `bun run check`。

## 验收分层

- 工程验证：待执行；绑定上述命令与结果。
- 技术评审：自审 + 记录。
- 集成：与 frontmatter 同步（提交路径限定，防并行会话暂存污染）。
- 人工功能验收：待验收（真实双目录/双实例迁移走查）。
- 发布：未授权；仅更新 v0.1.3 release notes。

## 功能验收包

- 入口：项目右键「导出项目迁移包…」；chat 顶栏「导入会话归档」。
- 步骤：导出（口令可空，含产物）→ 另一数据目录/路径实例导入 → 向导选新路径 → 查看报告 → 侧栏目标项目出现会话 → 打开续跑；对照 v1 会话归档导入回归。
- 预期：会话+产物完整迁移、目标位置自选、幂等、无静默覆盖。

## 交付记录

### 工程交付（2026-10-22，主工作区串行，提交均路径限定）

**切片 1：格式 v2（runtime-storage）——提交 `2ca917e2e`（随行 Biome 格式化 `f1a63434e`）**

- 改动：`session-archive/{types,frames,encode,decode,index}.ts` + `test/conversation/session-archive.test.ts`（新增 8 例）。
- 要点：`SESSION_ARCHIVE_FORMAT_VERSION = 2`，`WORKSPACE_FILE = 0x04`（复用 ATTACHMENT 帧布局，meta 无 id/mimeType）；decode 接受 {1,2}，v1 拒绝 workspace 帧非法混合、声明 workspaceFileCount 时校验帧数一致，未知帧仍拒绝；无 workspace 输入时 encode 仍写 v1（版本与 metadata 均为 1，字节不变）。
- 验证：`bun.exe ../../scripts/quality/run-vitest.mjs --run test/conversation/session-archive.test.ts` → 13 pass（5 旧 + 8 新）。

**切片 2：主进程迁移服务——提交 `2825da5fc`**

- 改动：新增 `conversations/project-migration-service.ts` + 同名测试（14 例）；`session-archive-service.ts` 仅导出 `sanitizeFileStem` 供复用。
- 要点：导出排除 `.git`/`node_modules`/`.vetta`（含嵌套）与 symlink，512MB/4GB 上限在 stat 阶段拦截（测试注入 `workspaceLimits` 缝隙，默认 ADR 常量并断言其值）；零会话/远程/超限以 reason 返回不弹框；preview 框选解码不落盘、v1 识别 classic；apply 先重写会话头 cwd（仅 `type:"session"` 且等于 sourceCwd）再算指纹，同包同目标二次导入全部 skip-idempotent，换目标建副本，产物默认 skip-existing、symlink/目录类型不一致计入 failed，每写入会话按目标列表 cwd 广播。
- 验证：`bun.exe ../../scripts/quality/run-vitest.mjs --run src/main/conversations/project-migration-service.test.ts` → 14 pass；连带旧服务回归 11 pass。

**切片 3：IPC 三通道 + preload——提交 `d6dd9c874`**

- 改动：`main/ipc/session-archive.ts`（EXPORT_MIGRATION / PREVIEW_MIGRATION / APPLY_MIGRATION，既有通道不动）+ 测试新增 5 例；`preload/api-types/session-archive.ts` 与 `preload/apis/session-archive.ts` 同步 + 测试新增 1 例。
- 验证：两文件 `run-vitest --run` → 12 pass；`bun.exe x tsc --noEmit -p apps/desktop/tsconfig.json` 无错误。

**切片 4：UI——提交 `b57cb0332`（含 i18n，UI 代码依赖 key 类型无法分离提交）**

- 改动：theme-ui `ProjectContextMenuView`（新菜单项）；`useProjectContextMenuModel`（远程 ssh:// 不提供迁移入口）；`ProjectContextMenu.tsx`（补齐 0349 遗留的 onExportSessions 接线缺口）；`useProjectsPanelMenusModel.exportMigrationPackage`（口令+含文件复选默认勾选+分型 Toast）；`useChatViewModel.importArchive` preview 先行分流；新增 `useMigrationImportWizardModel` + `MigrationImportWizardDialog`（挂 RootGlobalOverlays）+ `migrationImportWizardAtom`；project 服务新增三 helper；i18n zh/en（project/main/chat ns）全量；发布说明 v0.1.3 新增段一条。
- 测试：`MigrationImportWizardDialog.test.tsx` 11 例（组件 8：预览摘要/目标必填/新路径执行与登记/浏览填充/覆盖复选/失败态/取消；模型 3：下拉过滤本地非默认项目、选现有项目执行与报告、新路径优先）——注：Radix Select 在 jsdom 嵌套 Dialog 模态下无法展开，下拉交互下沉模型层验证；`useProjectsPanelMenusModel.test.tsx` 新增 4 例；`useChatViewModel.archive.test.tsx` 新增 2 例改写 1 例；`project-context-menu-remote.test.tsx` 新增 3 例。
- 验证：8 个归档族测试文件 `run-vitest --run` → 73 pass（含既有回归）；tsc 无错误。

**切片 5：发布说明与台账——本提交**

- `.github/release-notes/v0.1.3.md` 新增段补一条（用户视角）；本交付记录回填。

### 验证汇总（Windows 主工作区，bun.exe + Node vitest runner）

- 定向：runtime-storage 13 例、desktop 主进程 25 例（11 旧 + 14 新）、IPC+preload 12 例、UI 38 例（8 文件合计 73 例全绿，含既有 30 例归档族回归）。
- `bun.exe x tsc --noEmit -p apps/desktop/tsconfig.json` 通过；仓库根 `bun.exe run check:quick` 结果见下方。

### 未运行项与风险（如实）

- 未运行：`verify:ui:*`（未授权）、完整 `bun run check` 与 `test:impact`（由协调者执行）、真实双目录/双实例人工迁移走查（待人工验收）。
- 已知取舍：workspace 收集上限判定用 stat 尺寸（稀疏文件按逻辑尺寸计）；导出为全量内存帧（4GB 上限内大项目可能内存压力大，增量留待后续）；迁移向导在 jsdom 下无法验证 Radix Select 展开，靠模型层测试兜底；旧版本应用打开 v2 包报 UNSUPPORTED_VERSION（预期）。
- 人工验收前状态保持 in_progress；工程完成/验证状态由协调者裁定。

### 协调者复核（2026-10-22，工程交付后）

- 复核关键合同点：`project-migration-service.ts` apply 侧「先重写 cwd 再算指纹」（源码 380-384 行确认）；`ProjectContextMenu.tsx` `onExportSessions` 已透传至模型（见下勘误）。
- `test:impact`（7 个变更生产文件）：desktop 17 文件/102 例 + runtime-storage 3 文件/17 例全过。
- 完整 `bun run check` exit 0（lint+types+guards，含 desktop tsc 与 v0.1.3 发布说明存在性）。
- Worker 报告的偏离与取舍（workspaceLimits 测试接缝、classic 分流二次选文件、Radix Select jsdom 限制下沉模型测试、pre-commit biome 与全量规范差异）已审阅接受，风险如实保留。
- 提交序列：`2ca917e2e`→`f1a63434e`→`2825da5fc`→`d6dd9c874`→`b57cb0332`→`f41a4a858`（本地 main，未推送）。
- 状态：工程验证通过 → `verifying`；待真实双目录/双实例人工迁移走查。

### TASK-0349 勘误（顺带发现）

TASK-0349 的项目会话导出菜单项存在接线缺口：`ProjectContextMenu.tsx` 接收了 `onExportSessions` 但未传入 `useProjectContextMenuModel`，菜单项实际不可达（模型/视图测试各自通过，连接层未覆盖）。已由本任务切片 4（`b57cb0332`）修复并补连接层断言；TASK-0349 的工程验证结论据此修正——「真实入口可用」以修复后为准。

## 2026-10-28 续接交付证据

### 实际改动

- `session-archive-service.ts` 支持当前 `conversation.header` 的 sessionId/cwd、seed/import seed 及 name operation 标题；原生落盘使用公开 canonical 路径，保留 journal、消息、工具、usage/stop 等字段，legacy 副本不变。坏 JSON 记录明确报错，不再替换成哈希后导出成功。
- `project-migration-service.ts` 同时重写 legacy/native 头 cwd；先验证目标根，再恢复会话；原生同 ID 不同历史拒绝覆盖并给出换项目目录指引。
- 共用 `archive-file-restore.ts`：逐层检查目录链接及文件类型，拒绝 Windows 不兼容路径/ADS，临时完整写入后提交，默认 no-clobber，显式覆盖通过 rename（保留已有普通权限，不沿硬链接截断其他文件）。无硬链接文件系统 fallback `COPYFILE_EXCL`；保存 OFAR 也经临时文件提交。
- 幂等会话仍安全补齐/核对附件，包内重复记录不再制造重复会话，也不丢第二条的独有附件。附件冲突失败不提交该条新 JSONL；同字节附件可重试。
- Desktop README 补真实迁移入口、操作步骤、产物范围、敏感项目文件注意事项与限制；ADR-0147 补当前格式与落盘实现。四条错误文案均有 zh/en。
- 发布说明候选：`.github/release-notes/fragments/v0.1.4/task-0361-project-migration.md`。0.1.3 已打 tag，未修改其正文、manifest 或 tag；未来准备 0.1.4 时汇编，未发布。

### 失败基线与修复验证

- 原有服务基线：2 文件 28/28。
- 首轮红：目录链接默认/覆盖及无效目标提前拒绝 3/3 失败；原生 metadata/canonical/身份冲突/坏 JSON 4/4 失败，均为真实临时文件服务回归而非环境错误。修复后已绿。
- 独立审查 `9f3fc6c8-de13-4dd` 提出两个 P2：overwrite 丢普通权限、包内去重遗漏附件。新增回归实际 5 红（权限 OS 边界 1、两个服务新增/冲突附件 4），修复后复审确认两项关闭、无新增 P1/P2；审查未代跑测试，不冒称异模型家族。
- 最终定向：`bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts` + archive-file-restore / session-archive-portability / project-migration-service / session-archive-service / ipc/session-archive / preload/apis/session-archive 六文件，**75/75**。包括 fallback 成功及 EEXIST、真实 native catalog/reader/repository 重开与迁移后持久化续写、二进制产物、幂等与两服务附件三组合。
- Renderer 既有流程：chat 归档 / 项目菜单 / MigrationImportWizardDialog 三文件 **29/29**；实际 `components/sidebar/add-project/useAddProjectMenuModel.test.tsx` 单文件 **5/5**。首次四路径命令有一个路径未匹配（实际仅收集三文件），已用真实路径补跑，不把未收集文件计为通过。
- `bun run test:impact -- <本轮三生产文件和三测试>`：最终 direct **3 文件 50/50**，related **6 文件 78/78**，exit 0；两组有重复覆盖，不将其相加为唯一测试数。前一轮 300 秒进程超时发生在 related 调度阶段，确认没有残留本任务进程后以 600 秒预算重跑成功；未改超时/断言/门禁。
- 完整 `bun run check`：最终 **exit 0**，lint、root/CLI/Desktop/docs/mobile 类型、mobile lint、全部 guards 均通过。首轮唯一失败为其他会话 TASK-0154/TASK-0406 的未登记并行范围；Owner 随后补齐 conflicts_with，本任务未修改其合同；复跑通过。
- 中间 Biome 仅对本任务源码运行安全格式化；无 any、新依赖、协议版本或生成事实源改动。

### 集成与剩余边界

- 初始代码基线 `9f4b87ee8`；验证期间其他会话的文档提交使 main 前进到 `6ebd359b5`，已核对其非本任务生产变更。当前原子提交只包含本轮明确路径和共享台账自身行，不夹带 MCP/设计变更；承载本记录的提交绑定本轮集成事实，不另建哈希回执提交。其他并行任务随后由各自 Coordinator 集成到本地 main 并推送 `origin/dev`，本任务未代为推送或修改其验收状态。
- 推送回执（不另建提交）：用户确认的 `6ebd359b5` 与 `46785aaac` 已包含在 `origin/dev`；远端现为 `2806052dd`，经 `merge-base --is-ancestor` 核实本任务提交在其历史中，`origin/dev..main` 为空，普通 fast-forward 推送返回 up-to-date。`origin/main` 仍为 `9f4b87ee8`，未推送稳定分支。
- 推送前失败分流（不把环境失败写成代码通过）：共享工作区 `test:changed` 首次失败来自 Windows `PATH` 优先命中 WSL `bash.exe`，以及 Git Bash 的 `/bin/gzip` 在本机不可执行；把 Git Bash `/usr/bin` 置于测试进程 PATH 后远程文件/命令/技能套件与归档套件通过。共享 checkout 在验证期间被并行任务合入并前进，故改用固定提交 `46785aaac` 的临时 detached Worktree，按冻结锁文件安装，避免后续提交混入本批次验证。
- 隔离验证最终 `test:changed --base origin/dev`：完整跑完 1113 个文件，**6245 通过 / 2 失败 / 18 跳过**；两项失败均为完整套件并发压力下的 5 秒测试超时（dialog 序号上限、DatePicker Escape 焦点），单独复跑 14/14 全绿，未改超时、断言或测试筛选。隔离副本完整 `bun run check` **exit 0**。临时 Worktree 验证时状态干净；删除目录后，Git 注册元数据由 `git worktree prune` 清理，未改动其他工作树目录。
- 工程与独立审查通过；Task 保持 `verifying`，人工功能接受、发布均未完成。未启动真实 Desktop、`verify:ui:*`、长驻 dev、Provider 或真实用户状态；Repository 续写不等于真实模型续跑。
- 已验证平台是 Windows；POSIX 执行位、macOS/Linux 及物理双设备仍待 CI/人工验收。无硬链接 fallback 保持不覆盖，但无跨文件/崩溃事务保证；恶意并发目录替换不是普通文件 API 的安全承诺。
- 仍沿用 512 MiB/4 GiB 及全量内存编码；未宣称内存优化。项目外插件私有文件/全局账号配置/记忆/远程 SSH 产物不在包内；历史消息内旧绝对路径保留为事实。包含项目文件时 `.env` 等项目内敏感内容不会自动脱敏，转移前应检查并设置口令。

### 本轮人工验收包

1. 本地项目至少有一条当前会话和嵌套/二进制产物；右键「导出项目迁移包」，保留包含项目文件并设置口令。
2. 在另一设备的「添加项目 → 导入项目」选择 `.ofar`，输入口令，选一个新本地目录，先不要勾覆盖。
3. 核对报告的会话/产物数量，打开迁移会话看标题与完整历史，从目标 Files 面板打开产物，并继续一轮对话。
4. 重导同包应跳过相同历史、保留已有文件；已有同 ID 不同历史应提示换目标项目，附件冲突不得覆盖原字节。
5. 任一无提示丢历史/产物、工作目录仍指向源路径、默认覆盖用户文件或目录链接外部被改写，均为不通过反馈，续接本 Task。
