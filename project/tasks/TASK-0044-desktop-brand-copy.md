---
id: TASK-0044
type: task
status: done
priority: P0
owner: apps/desktop
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: shared-workspace（Coordinator 串行执行；保留现存用户改动）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [apps/desktop/AGENTS.md, apps/desktop/docs/user-language-ui.md, apps/desktop/docs/ui-review.md, apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/i18n, apps/desktop/src/renderer, apps/desktop/src/main]
write_paths: [apps/desktop/src/shared/i18n/locales/en/main.json, apps/desktop/src/shared/i18n/locales/zh/main.json, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/main/main.ts, apps/desktop/src/main/app-about-panel.ts, apps/desktop/src/main/app-about-panel.test.ts]
exclusive_paths: [apps/desktop/src/shared/i18n/locales/en/main.json, apps/desktop/src/shared/i18n/locales/zh/main.json, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/main/main.ts, apps/desktop/src/main/app-about-panel.ts, apps/desktop/src/main/app-about-panel.test.ts]
depends_on: []
conflicts_with: [TASK-0043, TASK-0045, TASK-0055]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 用户可见品牌文案迁移

## 目标

在品牌外置层就绪后，将 Desktop 内可见产品称呼统一为 Open Forge，同时保留技术标识和用户既有操作语义。

## 范围

### 并发评估

- 结论：不支持与 TASK-0043、TASK-0045、TASK-0055 并发；它们共享 Desktop 品牌或打包写路径。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：品牌层已集成，定向替换测试通过；`TASK-0043` 的其他全 workspace 检查仍单独 verifying。
- 冲突文件/独占路径：Desktop main i18n catalog、`main.ts` About panel、brand tests；首发 Release Notes 由 ISSUE-0007 门禁控制。
- Branch：`forge/dev`；Worktree：当前共享工作区。
- 集成负责人：Coordinator。
- 集成顺序：品牌定向验证 → 本任务 → TASK-0055 packaging 验证；TASK-0045 仍等生态身份决策。

### 做

- 按已批准的品牌映射迁移 Desktop 原生菜单与 About panel 的用户可见产品名；About credits 说明随应用附带的 LICENSE/NOTICE 在何处提供。
- 所有新增或改动的用户可见文案进入中英文 main catalog，并保持语义一致。
- About panel 使用 Desktop 品牌单一事实源；对无法由品牌层安全处理的硬编码文案逐项核对，不新增散落品牌字面量。

### 不做

- 不改内部协议、配置键、路径、包名、凭据定位或已冻结的兼容标识。
- 不运行 `verify:ui:*`；该任务的计划验收由 i18n、组件/合同测试和静态检查完成，实机 UI 验收需另行授权。
- 不改 `apps/docs-site`、根 README 或社区链接。

## Given / When / Then

- Given：用户在 Desktop 的中英文界面打开会话、项目、设置或产物入口；When：查看标题、按钮、菜单、通知和导出显示名；Then：用户看到 Open Forge 品牌，文案语义与当前操作一致，兼容 token 与路径未被替换。

## 必须保持

- 所有新增或调整的用户可见文案走 i18n。
- UI 行为、快捷键、授权、会话恢复和既有产品能力不因改名变化。
- 内部 `APP_RUNTIME_NAME` 继续为 `vetta`，除非另有经过验证的迁移方案。

## 测试与验证

- 定向测试：品牌替换与中英文资源覆盖；受影响组件/菜单/通知的可观察文案合同。
- 用户流程：从 macOS 原生应用菜单打开 About，确认名称为 Open Forge、credits 提示 LICENSE/NOTICE 路径；语言切换后菜单和 credits 文案正确；已有会话和技术标识不变。
- 定向测试：`desktop-brand.test.ts` 覆盖中英文 About/menu 文案；`app-about-panel.test.ts` 覆盖开发态和打包态选项。
- 质量检查：`bun run check:quick -- <changed files>`；`bun run test:impact -- <changed files>`。不运行 `verify:ui:*`。

## 发布说明

- 首发版本仍由 `ISSUE-0007` 决策；候选说明暂记在本 Task，不改继承的 Vetta Release Notes。
## 交付记录

- 实际修改：新增 `app-about-panel.ts`（About 选项统一取 `DESKTOP_BRAND.displayName`，开发态附版本号、打包态保持既有版本行为）与 `app-about-panel.test.ts`；`main.ts` 移除开发态 `applicationName: "Vetta"` 直写，改为 `createAboutPanelOptions(getAppVersion(), mainT("menu.app.credits"), app.isPackaged)`；中英文 `main.json` 新增 `menu.app.credits`，指引用户查看随包 `LICENSE`/`NOTICE`。原生菜单其余品牌称呼继续由 TASK-0043 的品牌替换层呈现。
- 实际运行：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/app-about-panel.test.ts apps/desktop/src/shared/desktop-brand.test.ts` → 2 文件 7 测试通过；`check:quick` 对本批文件 Biome 干净；`bun x tsc --noEmit -p apps/desktop/tsconfig.json` → 本批文件零错误（全仓 4 个错误均在并行改动的 `useProjectsPanelModel.ts` / `file-conversation-session-services.ts`）。
- 未运行及原因：`verify:ui:*` 实机 About/菜单核验（需用户明确授权）；真实打包态 About 面板外观。
- 剩余风险：品牌 postprocessor 对全部存量文案的覆盖面由 TASK-0043 继续验证；`menu.app.*` 中的 Vetta 字面量依赖替换层生效，若该层回归则原生菜单会回显旧名。
