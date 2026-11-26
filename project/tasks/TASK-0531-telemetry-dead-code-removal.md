---
id: TASK-0531
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
base_commit: fd61646ac
read_paths: []
write_paths:
  - apps/desktop/
  - docs/telemetry/
  - docs/desktop/build-modes.md
  - docs/desktop/build-modes.en.md
  - docs/release/desktop-release-runbook.md
  - README.md
  - README.zh-CN.md
  - CONTRIBUTING.md
  - bun.lock
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 删除遗留且从未开启过的 PostHog 与 Sentry 接入（上游 4a3dc19e0 + 21f04ae88）

## 合同

- 来源与目标：PLAN-0032 收尾后的基线外增量——手工合并上游两笔：`4a3dc19e0`「把插件日志脱敏与 HMR 诊断挪到独立模块」+ `21f04ae88`「删除遗留且从未开启过的 PostHog 与 Sentry 接入」。上游理由：两项接入只在构建时配置 key 才启用，正式发布从未配置过，代码一直闲置。本地勘察（scout_telemetry）确认同样全部为 opt-in 死代码：无 `.env`/`.env.local` 配置任何 `VETTA_SENTRY_*`/`VETTA_POSTHOG_*`，`process.env.VETTA_SENTRY_ENABLED` 在注入时恒为 `"false"`，删除无行为变化。
- 做（本任务）：
  - 先落地 `4a3dc19e0` 搬迁（上游为纯 rename + import 更新，行为不变）：`shared/sentry-privacy.ts` → `shared/text-redaction.ts`；`renderer/telemetry/vite-hmr-diagnostics.ts` + `.test.ts` → `renderer/diagnostics/`；`plugin-log-sink.ts`、`main.tsx` 引用更新。本地分叉：`plugin-runtime-log.ts` 已在上游删除前先行移除，无需处理该引用。
  - 再落地 `21f04ae88` 删除：移除 `main/telemetry/`（bootstrap/error-monitoring/index/product-events）、`renderer/telemetry/error-monitoring.ts`、`renderer/telemetry/product-analytics.ts`、`preload/telemetry.ts`、`preload/apis/telemetry.ts`、`preload/api-types/telemetry.ts`、`shared/telemetry.ts`、`sentry-vite.ts` 与 `docs/telemetry/` 整目录；摘除消费点（`main.ts`/`app-monitor.ts`/`app-monitor-parser.test.ts`/preload 系列/renderer 入口四件）。
  - 构建与依赖：`vite.config.ts`/`vite.main.config.ts`/`vite.preload.config.ts` 去 Sentry 插件与注入；`desktop-build-environment.mjs` 改为「残留变量直接报错」（`validateRemovedIntegrations`）并同步 `desktop-build-environment.test.mjs`；`build-dev-processes.mjs` 摘 sentry-vite 输入；`package.json` 删 `@sentry/electron`、`posthog-js`、`posthog-node`、`@sentry/vite-plugin`，`bun install` 更新 bun.lock；`.env.example` 摘两段。
  - 文档：根 `README.md`/`README.zh-CN.md`/`CONTRIBUTING.md` 各一行、`apps/desktop/scripts/README.md`、`docs/desktop/build-modes.{md,en.md}`、`docs/release/desktop-release-runbook.md`。
- 不做：诊断包引导弹窗（2c376e998+925ce0cdc，另案）；跨版本更新说明（分叉大，另案）。React 错误不再转 Sentry 后不做替代上报（本地从未开启上报，行为不变）。
- 品牌适配：上游 `CONTRIBUTING.md` 改动文案含「Vetta 不收集用户数据」，本地按品牌中立改写为「Open Forge 不收集用户数据」；README 行上游无品牌词直接合入。
- release fragment：本变更为内部死代码清理，正式版行为不变、用户无感——不写 fragment，与上游 commit message「用户感受不到差别」一致； fragments 目录无 chore 先例。
- Given / When / Then：
  - 构建环境变量残留 `VETTA_POSTHOG_KEY` 或 `VETTA_SENTRY_*` 任一 → `validateDesktopBuildEnvironment` 直接报错且不回显变量值。
  - 未配置任何遥测变量（现状）→ 构建、启动、渲染器行为与删除前完全一致（遥测本来就是 no-op）。
  - `redactSensitiveText`/`redactUrl` 仍可用且引用路径更新为 `text-redaction`（plugin-log-sink 消费不中断）；HMR 诊断在 dev 下行为不变。
- 验证：`bun run check`（类型最关键——大量删除）；`node --test apps/desktop/scripts/desktop-build-environment.test.mjs`；桌面对 plugin-log-sink / vite-hmr-diagnostics 定向测试；`bun run test:impact --` 改动源文件；`node scripts/quality/check-project-indexes.mjs`。
- 人工验收：无独立实机验收要求（无行为变化）。

## 交付

- 实际修改与验证（2026-11-27）：
  - `4a3dc19e0` 搬迁落地：`sentry-privacy.ts`→`shared/text-redaction.ts`、`vite-hmr-diagnostics{,.test}.ts`→`renderer/diagnostics/`（git rename 保留），`plugin-log-sink.ts`/`main.tsx` 引用更新；本地 `plugin-runtime-log.ts` 已先删，无需处理。
  - `21f04ae88` 删除落地：20 个遥测文件与 `docs/telemetry/` 整目录移除；消费点全部摘除——`main.ts`（import/initialize/shutdown）、`app-monitor.ts`+parser 测试（captureProductEvent）、preload 四件+`api.ts`+`index.test.ts`、renderer 入口四件（main/onboarding/pet/renderApp）。
  - 本地分叉适配：`useAuth.ts` 的 `setProductAnalyticsUser` import 与 effect 摘除（上游该文件随 vetta-serv 删除整体消失，本地保留 cloud/auth 故单独处理）；`vite.main.config.ts` 保留本地 `minify:true`+keepNames、`emptyOutDir:true` 与 cloud 开关；上游根 README/CONTRIBUTING 的遥测文案改动在本地无对应锚点（本地文本已不含），按合同不动。
  - 构建面：三个 vite 配置摘 Sentry 插件/define/sourcemap 三分支；`desktop-build-environment.mjs` 改 `validateRemovedIntegrations`（12 个残留键有值即报错）+ `validateHttpUrl` 去 allowCredentials 特例；`build-dev-processes.mjs` 摘 sentry-vite 输入；`.env.example` 摘两段；docs 四份同步。
  - 依赖：`@sentry/electron`/`posthog-js`/`posthog-node`/`@sentry/vite-plugin` 移除，`bun install` 更新 bun.lock；`@posthog/*` 残留为 deepeval/promptfoo 传递依赖，与本任务无关。
  - 验证：`bun run check` 全绿（第二轮 exit 0；第一轮 guards 一致性头补齐 8 文件后复绿）；`node --test desktop-build-environment.test.mjs` 13/13；定向 vitest vite-hmr-diagnostics/preload-index/app-monitor-parser 7/7、plugin-log-sink 2/2；`bun run test:impact`（5 个改动源文件）5/5；`check-project-indexes.mjs` pass。
  - verifier 独立复查 pass 无问题：删除集合与上游逐项一致、rename 均为 R100、`validateHttpUrl` 去参后调用方语义不受损、`productionUrls` 无悬空、bun.lock 的 preact 提升为传递依赖自然结果、无夹带无关改动。
  - 未运行：无独立实机验收要求（遥测恒为 no-op，删除无行为变化）。
