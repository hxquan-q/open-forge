---
id: TASK-0043
type: task
status: verifying
priority: P0
owner: apps/desktop
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: shared-workspace（当前 forge/dev 工作树；不新建）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [AGENTS.md, project/README.md, project/CONVENTIONS.md, project/collaboration/README.md, project/tasks/README.md, project/tasks/TASK-0043-brand-externalization-layer.md, project/tasks/TASK-0044-desktop-brand-copy.md, project/tasks/TASK-0045-ecosystem-identities.md, project/plans/PLAN-0003-open-forge-rebrand.md, project/requirements/REQ-0003-open-forge-rebrand.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, exprot/development-paradigm.md, apps/desktop/AGENTS.md, apps/desktop/README.md, apps/desktop/docs/user-language-ui.md, docs/adr/0031-desktop-i18n-i18next-semantic-keys-main-owned-language.md, apps/desktop/src/shared/i18n, apps/desktop/src/shared/app-identity.ts, apps/desktop/src/main/i18n, apps/desktop/src/renderer/shared/i18n, apps/desktop/src/renderer/quickpanel/i18n.ts, apps/desktop/src/renderer/onboarding/i18n.ts, apps/desktop/scripts]
write_paths: [apps/desktop/src/shared, apps/desktop/src/main/i18n/index.ts, apps/desktop/src/renderer/shared/i18n/index.ts, apps/desktop/src/renderer/quickpanel/i18n.ts, apps/desktop/src/renderer/onboarding/i18n.ts, apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/linux-packaging-contract.mjs, project/tasks/TASK-0043-brand-externalization-layer.md, project/plans/PLAN-0003-open-forge-rebrand.md, project/tasks/README.md, .github/release-notes]
exclusive_paths: [apps/desktop/src/shared/i18n/config.ts, apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/app-identity.json, apps/desktop/src/main/i18n/index.ts, apps/desktop/src/renderer/shared/i18n/index.ts, apps/desktop/src/renderer/quickpanel/i18n.ts, apps/desktop/src/renderer/onboarding/i18n.ts, apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/linux-packaging-contract.mjs, project/tasks/TASK-0043-brand-externalization-layer.md, project/plans/PLAN-0003-open-forge-rebrand.md, project/tasks/README.md, .github/release-notes]
depends_on: []
conflicts_with: [TASK-0044, TASK-0045]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 品牌外置层与受控替换规则

## 目标

建立 Desktop 自有、可复用的品牌事实源与替换边界，为后续 UI 文案和打包消费者提供稳定入口，减少直接修改上游高频文案文件的冲突面。

## 范围

### 并发评估

- 结论：不支持并发；本任务建立后续品牌任务共同依赖的事实源。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无；`TASK-0044`、`TASK-0045` 必须等待本任务完成。
- 前置依赖：`ISSUE-0001` 品牌身份与更新坐标决策已完成；PLAN-0003 阶段 B 保持现有行为。
- 冲突文件/独占路径：`apps/desktop/src/shared/i18n/config.ts`、Desktop 品牌源、`prepare-pack.js` 与当前版本 Release Notes。
- Branch：`forge/dev`；Worktree：当前共享工作树，不新建 Worktree。
- 集成负责人：coordinator。
- 集成顺序：本任务 → TASK-0044 / TASK-0045 → 对应文档任务。

### 做

- 建立 Desktop 品牌值的单一事实源，并接入受控的运行时/构建消费者；消费者不得从其他 `apps/*` 深度导入。
- 为用户可见产品名建立显式替换表，只替换获准的品牌文本；为保留项建立负向合同测试。
- 如果既有打包脚本接入该事实源，保持阶段 B 已冻结的 appId、产物名、更新源和协议行为不变。

### 不做

- 不对全仓字符串做机械替换。
- 不改 `APP_RUNTIME_NAME`、凭据定位、`@vetta/*`、`VETTA_*`、`vetta:`、`vetta.remote.v1`、`X-Vetta-*` 或 `.vettapkg`。
- 不迁移 npm scope、社区链接、文档站内容或移动端身份。

## Given / When / Then

- Given：本地化文案中同时出现产品名和技术兼容 token；When：Desktop 使用品牌层渲染中英文文案；Then：用户可见产品名映射为 Open Forge，而技术 token 保持原样且中英文结果一致。

## 必须保持

- 品牌层不成为新的凭据、协议或持久化事实源。
- 已冻结的构建身份与更新默认值保持不变。
- 品牌替换只作用于明确的用户可见品牌语义，不误改路径、协议、包名或环境变量。

## 测试与验证

- 定向测试：替换规则覆盖命中项、边界项和所有冻结保留 token；分别验证 zh/en。
- 用户流程：打开 Desktop 可见品牌文案的正常入口，确认显示品牌与技术路径/协议文本均未误改。
- 质量检查：`bun run check:quick -- <changed files>`；`bun run test:impact -- <changed files>`；核对阶段 B 的既有品牌/更新合同测试。

## 交付记录

- 实际修改：新增 Desktop 品牌数据与受控替换处理器，接入 Main、主 Renderer、Quick Panel、Onboarding 四个 i18n 实例及打包显示元数据；将凭据运行名 `vetta` 独立为应用身份数据源并让打包端共用。更新本 Task、PLAN-0003、Task 索引及 v0.5.59 发布说明；未改 locale 文件或品牌兼容 token。
- 实际运行：Desktop `bun run typecheck` 通过；定向 `test:impact` 通过（2 个文件、7 项测试）；`bun run test:packaging` 通过（74 项）；`bun run verify:desktop:contracts`、`node scripts/release/release-notes.mjs --check` 与三个打包脚本的 `node --check` 通过。`check:quick` 的 Biome 检查通过；其 guards 因并行工作区的 coding-agent projects 导出缺少 root tsconfig 路径映射而失败。全量 `bun run check` 另有同一导出问题、其他 workspace 类型错误和当前 shell 无法识别 `bunx` 的失败。全文件 `test:impact` 运行 Desktop 751 个测试文件，17 个文件/40 项测试失败；定向品牌测试通过，完整套件失败不涉及本任务路径。
- 未运行及原因：未运行 `verify:ui:*`（用户未要求实机 UI 验收）和完整桌面打包构建（此 Task 不要求产出制品）。
- 剩余风险：本 Task 的全局 guards/check 与全 Desktop 测试仍受上述既有工作区失败阻塞，故状态保持 `verifying`；未触碰这些并行改动，需协调修复后再解除 TASK-0044 / TASK-0045 阻塞。
