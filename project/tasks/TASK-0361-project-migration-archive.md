---
id: TASK-0361
type: task
status: in_progress
priority: P1
owner: apps/desktop + packages/runtime-storage
requirement: REQ-0026
plan: []
source: REQ-0026 / ISSUE-0034 方案 B+C 用户裁定（2026-10-22）
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0349]
related_issues: [ISSUE-0034]
related_bugs: []
depends_on: []
conflicts_with: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行；注意与其他会话共享工作区，staging/提交须用路径限定）
read_paths: [docs/adr/0147-project-migration-archive-v2.md, packages/runtime-storage/src/conversation/session-archive/, apps/desktop/src/main/conversations/session-archive-service.ts, apps/desktop/src/main/ipc/session-archive.ts, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/conversation/hooks/useChatViewModel.ts]
write_paths: [packages/runtime-storage/src/conversation/session-archive/, apps/desktop/src/main/conversations/, apps/desktop/src/main/ipc/, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/shared/i18n/locales/, .github/release-notes/v0.1.3.md, project/tasks/]
exclusive_paths: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 项目迁移包：OFAR v2 + cwd 重写导入 + 产物打包（REQ-0026 / ADR-0147）

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
