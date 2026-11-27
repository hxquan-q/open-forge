---
id: TASK-0532
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: a08abebdd
read_paths: []
write_paths:
  - apps/desktop/
  - packages/theme-ui/
  - .github/release-notes/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 导出诊断包改为引导弹窗并让用户选择保存位置（上游 2c376e998 + 925ce0cdc）

## 合同

- 来源与目标：PLAN-0032 基线外增量——手工合并上游两笔：`2c376e998`「导出诊断包改为引导弹窗，并让用户选择保存位置」+ `925ce0cdc`「弹窗说明不收集数据，反馈不限 GitHub」。现状问题：点「导出诊断包」直接把 zip 写进系统临时目录再打开文件夹，用户不知道包里有什么、该拿它做什么，也没法选放在哪。改后：设置 › 通用 › 导出诊断包先打开说明弹窗（列出包内容、讲明不收集数据不自动上传、三步引导怎么把诊断包发给开发者），点导出弹系统保存对话框（默认下载目录），保存后可一键在文件夹中显示，也能打开 GitHub Bug 反馈页。
- 做（本任务）：
  - main 侧：按本地 `main/ipc/AGENTS.md` 薄层边界适配（上游把编排与测试放 ipc 层，本地拆出）——`exportDiagnosticsWithSaveDialog` 编排（依赖注入 chooseSavePath/buildBundle/copyFile/removeFile/defaultPath）落 `main/diagnostics-export.ts` + `main/diagnostics-export.test.ts`；`main/ipc/diagnostics.ts` 只做 parseExportOptions 校验、组装 Electron deps、调编排；`main/diagnostics-bundle.ts` 抽 `diagnosticsBundleFileName()`（保留本地 perf-snapshot/managed-tools 分叉）。
  - preload：`api-types/diagnostics.ts` 改 canceled 判别联合 + options；`apis/system.ts` 透传 options。
  - renderer：新增 `shared/store/diagnostics-export-atoms.ts`、`shared/components/useDiagnosticsExportDialogModel.ts`（+`.test.tsx`）、`shared/components/DiagnosticsExportDialog.tsx`（壳）；按本地 theme 槽位惯例（对齐 UpdateRestartDialog）壳内 `useThemeComponent("root.diagnosticsExportDialogView", …)`，`shared/theme/registry.ts` 补类型，`shared/components/DiagnosticsExportDialogView.tsx` 薄 re-export；`RootGlobalOverlays.tsx` 挂载。
  - 设置页改造：`useGeneralSettingsModel.ts` 删 exportingDiagnostics 状态与失败 confirm 弹窗，exportDiagnostics 改开弹窗 atom；renderer 与 theme-ui 两份 `GeneralSettingsView` 同步去 exporting 接线。
  - theme-ui：新增 `overlays/DiagnosticsExportDialogView.tsx`（合并 925ce0cdc 终态：noCollection 块、stepDescribe、消息图标横幅），`overlays/index.ts` 导出。
  - i18n：en/zh common.json 加 `diagnosticsExport` 组（925ce0cdc 终态文案），en/zh settings.json 删失去消费方的 `exporting`/`exportDiagnosticsFailed`。
  - release fragment（用户可见 feat）：`.github/release-notes/fragments/v0.1.5/diagnostics-export-dialog.md` + `--assemble` 汇编正文。
- 品牌适配：
  - `DIAGNOSTICS_ISSUE_URL` 上游指 `github.com/openvetta/open-vetta/issues/new?template=bug-report.yml`——本仓 fork 为 `hxquan-q/open-forge` 且自带同名 `bug-report.yml` 模板，改指 `https://github.com/hxquan-q/open-forge/issues/new?template=bug-report.yml`，测试同步断言。
  - 文案「Vetta 不会收集你的任何数据」「Vetta 版本」保留上游 "Vetta" 字样：本地 i18n 品牌后处理器（initDesktopI18n）会把 legacyProductNames 归一到当前品牌（self=Open Forge，distribution=Allstr ai/小爱ai），与既有 common.json 文案同一机制。
  - 诊断包文件名沿用 `vetta-diagnostics-*.zip`（非用户界面品牌面，跨版本一致性优先）。
  - 主题组件注释中上游「Magpie 接入弹窗」的引用改写为通用描述，不引入 Magpie 字样。
- 不做：跨版本更新说明（另案）；弹窗视觉重做（沿用上游设计）；诊断包内容本身调整（perf-snapshot/managed-tools 为本地既有分叉，不增删）。
- Given / When / Then：
  - 设置 › 通用点「导出」→ 打开说明弹窗而非直接写临时目录；点导出 → 系统保存对话框（默认下载目录、标题按当前语言）。
  - 保存对话框取消 → 回到弹窗初始态，不打包、不写任何文件、不算失败。
  - 选好位置 → zip 落在所选位置（无 .zip 扩展名自动补上），临时文件清除；之后可「在文件夹中显示」定位该文件。
  - 打包或写盘失败 → 弹窗内展示原因，可原地重试；导出中重复点击不重复弹保存对话框。
  - 关掉弹窗重新打开 → 回到初始态。
- 验证：桌面定向 vitest（`main/diagnostics-export.test.ts`、model test）、`bun run check`、`bun run test:impact --` 改动源文件、`node scripts/quality/check-project-indexes.mjs`。
- 人工验收：实机走查——设置 › 通用 › 导出诊断包 → 弹窗三阶段（说明/导出中/已保存），取消与失败路径；交付后状态转 verifying 待用户验收。

## 交付

- 状态：2026-11-27 完成实施与工程验证，转 verifying 待用户实机验收。
- 工程验证（全部实际执行）：
  - `bun run check` exit 0（types/lint/guards 全绿；release-notes 仅既有风格警告不阻塞）。
  - 桌面定向 vitest：`main/diagnostics-export.test.ts` 4/4、`useDiagnosticsExportDialogModel.test.tsx` 6/6 通过。
  - `bun run test:impact --` 改动源文件：桌面 23 个测试文件 140 用例、theme-ui 2 用例全部通过。
  - `node scripts/quality/check-project-indexes.mjs` 通过；release-notes `--assemble` 汇编后无碎片不一致。
  - 独立 verifier 复查 verdict pass：需求合同 1-5 逐条落实、无残留旧路径/死代码、断言纪律与一致性头合规、取消/成功/失败三路径端到端串接完整。
- 未运行项：`verify:ui:*` 与实机走查未执行（需授权的人工验收环节）；已知环境性 loopback SSH 失败圈与本任务改动无关，test:impact 未命中该圈。
- 风险与说明：
  - 反馈入口指向 `hxquan-q/open-forge` 的 bug-report 模板（上游为 openvetta 仓库，属品牌适配决策）。
  - 视图 `text-[19px]` 归并为 `text-[20px]` 以满足 D07 字号阶梯；D02/D03/D05/D06 冲突 token 按平账制登记 design-exceptions.json 并在 DESIGN.md 记录例外依据。
  - `buildBundle` 自身抛错时半成品 zip 残留在系统临时目录（上游同构、旧实现同，风险低）；`docs/theme/overlay-theming.md` 覆盖点列表未收录新槽位，列为后续文档补齐项。
