---
id: BUG-0143
type: bug
status: done
priority: P1
owner: apps/desktop
source: 用户现场（2026-10-22）：「导出的是页面原型展示-migration.ofar 这个 ofar 格式，但是导入只支持 zip」
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0361]
related_issues: [ISSUE-0034]
related_bugs: [BUG-0142]
depends_on: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 项目迁移包导出与导入入口不对称：导出 .ofar，但项目侧「导入项目」只接受 .zip

## 用户流程

- Given：项目右键导出「项目迁移包」得到 `页面原型展示-migration.ofar`（REQ-0026 / TASK-0361）；
- When：用户在项目侧找导入（「添加项目 → 导入项目」）；
- Then（期望）：能选中刚导出的 `.ofar` 并进入迁移向导（选目标位置、恢复会话与产物）。
- 实际：文件选择器只列 `.zip`，`.ofar` 不可选；迁移包导入只存在于**会话页顶栏**「导入会话归档」，与导出入口（项目菜单）不在同一处，用户无法完成闭环。

## 根因

- `apps/desktop/src/main/ipc/project-export.ts` 的 `vetta:project:import` 对话框 filters 仅 `["zip"]`，且 handler 只处理 zip。
- 迁移包预览 `preview-migration`（TASK-0361）自己弹出 `.ofar` 选择框，只能从 chat 顶栏触发，且不接受「已知路径」，因此无法被项目导入入口复用。

## 期望修复

1. `vetta:project:import` 的文件框同时接受 `.zip` 与 `.ofar`；选中 `.ofar` 时返回 `{ kind: "migration-archive", archivePath }`，不执行 zip 导入。
2. `preview-migration` 通道接受可选 `archivePath`（纯新增可选参数，向后兼容）：传入时不再弹文件名框，直接用该路径解码。
3. 项目侧「导入项目」接到 migration-archive 时：口令确认框 → 带路径预览 → 打开既有迁移向导（目标选择/冲突策略/报告）。v1 会话归档（classic）在此入口给出明确指引——走会话页「导入会话归档」，避免二次选同一文件。
4. 入口文案说明支持两种格式；zh/en 双语。
5. 回归：`.zip` 项目导入行为不变（BUG-0142 的会话恢复保持）；`.ofar` 经「导入项目」进入向导并完成迁移；v1 `.ofar` 给出指引而非静默失败；`preview-migration` 不传 archivePath 时仍弹框（chat 顶栏流程不变）。

## 修复与验证

- 修复（主进程）：`apps/desktop/src/main/ipc/project-export.ts` 的 `handleImport` 文件框改为单个过滤器同时列 `.zip` 与 `.ofar`（分成两个过滤器时默认只显示 zip，`.ofar` 依旧看不见），选中 `.ofar`（大小写不敏感）时直接返回 `{ kind: "migration-archive", archivePath }`，不落盘、不登记项目、不广播；zip 分支逐行未改。返回类型新增 `MigrationArchiveImportResult`，`ImportProjectResult`（无 `kind` 字段）保持原合同，preload `api-types/project.ts` 同步为 `ProjectImportResult` 联合。
- 修复（preview 通道）：`project-migration-service.ts` 拆出 `previewProjectMigrationFromFile(archivePath, passphrase)`——只 `readFile`+`decodeSessionArchive` 并返回既有 preview 结构（v1 仍报 `classic`），非绝对路径直接拒绝；`previewProjectMigrationArchive(passphrase)` 弹框后转调它。IPC `preview-migration` 新增可选 `archivePath`：未传/空串仍走弹框（chat 顶栏行为不变），传了则校验「绝对路径 + `.ofar` 后缀」后直接解码。
- 修复（渲染端）：`useAddProjectMenuModel.handleImport` 收到 `migration-archive` 时打开口令确认框（`confirmDialogAtom` + password 输入），确认后 `previewProjectMigrationArchive(passphrase, { archivePath })`；迁移包写入 `migrationImportWizardAtom`（preview 摘要 + passphrase）复用既有向导（目标选择/冲突策略/报告，新路径目标由向导登记项目）；`classic` 只弹确认框指引「去会话页顶栏『导入会话归档』」，不动 v1 通道语义；解码失败按本文件既有风格用 danger 确认框。
- i18n：`project` ns 新增 `importDialog.migrationTitle/migrationMessage/migrationPassphraseLabel/migrationConfirm/classicTitle/classicMessage`（zh/en）；`main` ns 新增 `projectImport.dialogTitle/filterName`（zh/en，品牌名走 `DESKTOP_BRAND.displayName` 插值），顺带把项目导入框里硬编码的中文标题改为 `mainT`。无 `window.prompt`/`alert`。
- 测试（先红后绿，Windows + 仓库 Node runner）：
  - `src/main/ipc/project-export.test.ts`（5 例）：新增「导入框同时列出 zip 与 ofar」与「选中 .ofar 只回传 archivePath，不落盘/不登记/不广播」；先红（旧实现返回 `unsupported-zip` 错封套、filters 无 `ofar`），修复后绿。
  - `src/main/ipc/session-archive.test.ts`（12 例）：新增「传 archivePath 直接解码、不弹框」「相对路径/非 .ofar 拒绝」「不传时仍走弹框且不触达文件分支」；先红（旧 handler 忽略 archivePath 且不校验），修复后绿。
  - `src/main/conversations/project-migration-service.test.ts`（17 例）：新增「给定 archivePath 时 `showOpenDialog` 零调用且能解码既有 v2 迁移包 fixture」「v1 文件仍报 classic」「非绝对路径拒绝」；先红（函数不存在），修复后绿。
  - `src/renderer/.../add-project/useAddProjectMenuModel.test.tsx`（新文件 5 例）：迁移包 → 口令框 → 带 archivePath 预览 → 设置 wizard atom；classic → 指引且不设向导；预览失败 → danger 确认框；zip 正常路径回归（刷新列表 + 完成框）；用户取消文件框无副作用；先红 3 例（未处理 `kind` 分支），修复后绿。
  - 既有相关测试回归：`useChatViewModel.archive.test.tsx`（chat 顶栏 preview 分流）、`MigrationImportWizardDialog.test.tsx`、`useProjectsPanelMenusModel.test.tsx` 共 3 文件 29 例绿。
- 验证结果：4 个定向文件 39 例全绿（5 + 12 + 17 + 5）；`bun run test:impact -- <改动源文件…>` 20 文件 128 例全绿；`bun x tsc --noEmit -p apps/desktop/tsconfig.json` 0 错；根 `bun run check:quick` 本次改动全部通过——唯一剩余失败是并行 Worker 在途的 `packages/theme-ui/src/activity/ActivityPanel.tsx` 缺 Apache 声明头（他人未提交文件，未改动），已按规范改为给 `apps/desktop/src/preload/api-types/project.ts` 补 `Modified by The Open Forge contributors.`。
- 提交：`fix(desktop): 项目导入支持 .ofar 迁移包并打开迁移向导（BUG-0143）` → `d9dfa7e8f`（15 文件，未推送）。
- 未运行/未验证：未跑完整 `bun run check`、未跑 `verify:ui:*`（未获授权），因此没有真实 Desktop 里从「添加项目 → 导入项目」选 `.ofar` 的人工验收记录；向导内目标选择/冲突策略与 apply 落盘行为沿用 TASK-0361 已验收路径，本次未重跑真实双目录迁移。
- 风险：`.ofar` 大小写不敏感匹配（`toLowerCase`）在大小写敏感文件系统上的同名异名文件属可忽略边界；口令框取消即中止，文件不会被读；迁移向导的「现有项目」下拉依赖进入入口时已加载的 `projectsAtom`，与 chat 顶栏入口同款前提。
