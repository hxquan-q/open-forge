---
id: TASK-0540
type: task
status: done
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: a7f8c4bb9
read_paths: []
write_paths:
  - apps/desktop/
  - apps/docs-site/
  - packages/theme-ui/
  - project/tasks/
  - project/issues/ISSUE-0007-*.md
  - project/research/RESEARCH-0052-*.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行，随本片提交）
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 清理桌宠代码（整功能移除）

## 合同

- 来源与目标：用户明确「桌宠代码清理掉」；该功能长期由 `DESKTOP_PET_ENABLED = false` 关闭，属已停用功能的代码残骸，本次整功能移除，不保留半成品。
- 输入 → 输出：现有桌宠特性（主进程窗口/服务/配置迁移、preload API、渲染器独立入口与 `domains/pet/`、共享类型与气泡样式资源、设置页桌宠标签、主题包视图、构建打包资源与文档）→ 上述代码与媒体全部删除，其余功能行为不变。
- 做 / 不做：只做桌宠整功能移除；不做 IM 投递、不做 ARM64、不推送。已删除的修仙主题/成就/`html_to_pdf` 保持删除状态，不借机恢复。
- Given / When / Then：
  - 现有代码中任一引用 `isDesktopPetEnabled`、`window.vetta.pet`、`registerPetIpc`、`domains/pet`、`PetSettingsView` 的位置 → 全部不存在或已摘除。
  - 应用启动、设置页、聊天通知、插件导航、构建与打包 → 与删除前一致；设置页不含桌宠标签。
  - 旧配置/持久化的设置标签值为 `"pet"` → 回退到默认标签，不报错。
- 保留：
  - 聊天会话事件 → 桌面通知的既有逻辑（`session.ts` 通知分支）保留，仅摘除其中的桌宠投影/气泡命令路径。
  - `ornamentVivi*` 等装饰项与 ISSUE-0007 已退役内容不动。
  - ADR-0031 / ADR-0057 与历史 VERIFY 记录不改写。
- 验证：`bun run --cwd apps/desktop test --` 定向测试（settings registry、i18n、desktop-brand）；`bun run test:impact --` 改动源文件；`bun run check`；`node scripts/quality/check-agent-guide.mjs`（若改 AGENTS.md）；`node scripts/quality/check-project-indexes.mjs`。
- 人工验收：不适用（功能原本关闭，无用户可见行为变化）；工程完成标准为无残留引用且全部检查通过。

## 交付

- 状态：2026-11-27 完成实施与工程验证；功能原本长期关闭，无用户可见行为变化。
- 实际修改：
  - 主进程：删除 `src/main/pet/**`（含测试）、`pet-window.ts`、`pet-config-store.ts`、`src/main/config/pet/**`、`src/main/ipc/pet.ts`；`main.ts` 摘除 `isDesktopPetEnabled` 与窗口/空闲守卫启动；`ipc/index.ts` 摘除 `registerPetIpc` 与 `teardownPet`。
  - `ipc/session.ts` 删除桌宠投影链路（`createPetBubbleCommand`、`mapSessionEventToPetPresentation`、`sendPetCommandToWindow`、`lastPetActionId`、`hasFinalPetBody` 及整段映射），聊天会话事件 → 桌面通知分支原样保留。
  - `shared/feature-flags.ts` 删除 `DESKTOP_PET_ENABLED` / `isDesktopPetEnabled()`；`ipc/app-monitor.ts`、`preload/api-types/app-monitor.ts` 移除 `"pet"` tab。
  - preload：删除 `pet.ts`、`api-types/pet.ts`、`apis/pet.ts`，`api.ts`、`index.ts` 摘除对应导出。
  - 渲染器：删除 `pet.html`、`pet-entry.tsx`、`pet-shell.css`、`domains/pet/**`、`shared/components/pet/**`、`PetBubbleStylePreview.tsx`、`PetSettings.tsx`、`PetSettingsView.tsx`、`usePetSettingsModel.ts`；`registry.ts`、`SettingsPage.tsx`、`settings-tab-loaders.ts`、`ui-atoms.ts`、`ai-assist/catalog.ts`、`userMessageProjection.ts`、`plugin-official-navigation.ts` 摘除桌宠标签、路由与可见性分支。
  - 主题包：删除 5 个 `pet-*.ts`、`pet-bubble-styles/*.json`、`settings/PetSettingsView.tsx`、`PetBubbleStylePreviewView.tsx` 及其导出。
  - 构建与资源：`git rm -r apps/desktop/build/pet`（26 个媒体文件）；`build-resource-filters.mjs` 置空过滤集合并同步其 node-test；`runtime-canary-runner.ts`、`scripts/README.md`、`vite.config.ts`、`vite.preload.config.ts`、`package.json#build:preload`、`rebuild-deferrals.mjs`、`eligible-inventory.mjs`、`test-assertion-baseline.json`、`desktop-brand.test.ts` 去除桌宠入口与基线行。
  - i18n：删除 `locales/{zh,en}/pet.json` 与 6 处命名空间接线（含 `MAIN_NAMESPACES`）；按 JSON 解析从 settings/chat/main 语言包删除桌宠键（含 `section_pet-*` 5 项与 18 个扁平孤儿键、`aiAssist.*.pet`、`guideBadgeSwiper.petFeatureText`、`userMessage.settingsAssist.pet`、main 顶层 `pet`），`ornamentVivi*` 保留。
  - 文档：删除 `docs/en/product/desktop-pet.mdx` 与中文对应页、两处 meta、settings/getting-started 引用及 `docs-coverage.json` 条目。
  - 管理记录：更新 ISSUE-0007、ISSUE-0016、RESEARCH-0003、RESEARCH-0052 中「保留接口/已下线」表述为代码已移除；ADR 与历史 VERIFY 不改写。
- 工程验证（全部实际执行）：
  - `bun run check` exit 0（lint / types / guards / mobile-lint 全绿；release-notes 存量 warning 非本次新增）。
  - `bun run --cwd apps/desktop test -- src/renderer/domains/settings/registry.test.ts src/shared/desktop-brand.test.ts src/renderer/shared/i18n/index.test.ts src/main/i18n/index.test.ts`：4 文件 28 用例通过。
  - `bun run --cwd apps/desktop test -- src/renderer/domains/settings src/main/ipc src/preload src/renderer/domains/plugins src/renderer/domains/conversation/components/message-list src/renderer/shared/i18n src/main/i18n src/shared`：189 文件 894 用例通过。
  - `node --test apps/desktop/scripts/build-resource-filters.node-test.mjs`：2 用例通过。
  - `bun run test:impact -- <54 个改动文件>`：desktop/docs-site/theme-ui 选中并通过；quality 脚本套件 879/884 通过，5 个失败均为 `scripts/quality/desktop-release-workflow.test.mjs` 在本机调用 `bash` 的环境错误（`/bin/bash: -c: line 3: syntax error`、checkpoint 临时目录 `EPERM`），与本次改动无接触。
  - `node scripts/quality/check-agent-guide.mjs`、`node scripts/quality/check-project-indexes.mjs` 已由 `bun run check` 的 guards 覆盖并通过。
- 评审与集成：`rg` 复核 `isDesktopPetEnabled`、`window.vetta.pet`、`registerPetIpc`、`domains/pet`、`PetSettingsView`、`pet.html`、`pet-entry` 在源码/资源/构建配置中无残留，仅历史任务记录（TASK-0076/0224 的 write_paths）保留文字；主工作区串行提交到 `main`。
- 未运行与风险：未跑 Desktop 全量 `test` 单一进程——首次尝试在 `src/main/skills/skill-presentation-read.test.ts` 报 5s 超时后以 exit 255 退出，该文件单独重跑通过，判定为本机并行负载抖动；改用受影响目录 894 用例覆盖。`test:impact` 的 5 个 quality 失败同上属 Windows bash 环境限制。不推送（等待 TASK-0536 完成后按计划推送）。
- 发布：不写 release fragment（内部死代码清理，用户无感）。
