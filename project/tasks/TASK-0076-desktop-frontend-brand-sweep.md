---
id: TASK-0076
type: task
status: done
priority: P0
owner: apps/desktop
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: shared-workspace（当前 forge/dev 工作树；不新建）
base_commit: forge/dev
read_paths: [AGENTS.md, project/README.md, project/CONVENTIONS.md, project/plans/PLAN-0003-open-forge-rebrand.md, project/requirements/REQ-0003-open-forge-rebrand.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, project/tasks/TASK-0043-brand-externalization-layer.md, project/tasks/TASK-0044-desktop-brand-copy.md, apps/desktop/AGENTS.md, apps/desktop/DESIGN.md, apps/desktop/docs/user-language-ui.md, apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/desktop-brand.test.ts]
write_paths: [apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/main/appshot/helper-resolver.ts, apps/desktop/scripts/build-appshot-helper.js, apps/desktop/src/renderer/index.html, apps/desktop/src/renderer/onboarding.html, apps/desktop/src/renderer/pet.html, apps/desktop/src/renderer/quickpanel.html, apps/desktop/src/renderer/remote-desktop-host.html, apps/desktop/src/renderer-ocr/index.html, apps/desktop/src/main/tray-manager.ts, apps/desktop/src/main/mcp/mcp-oauth-service.ts, apps/desktop/src/main/abilities/open-marketplace, apps/desktop/src/main/ipc/project-export.ts, apps/desktop/src/main/cloud-bridge.ts, apps/desktop/src/main/skills/skill-market-install.ts, apps/desktop/src/main/conversations/desktop-conversation-service.ts, apps/desktop/src/main/app-actions/approval-broker.ts, apps/desktop/src/main/logger.ts, apps/desktop/src/main/ssh/askpass-assets.ts, apps/desktop/src/main/app-debug, apps/desktop/src/main/ipc/onboarding.ts, apps/desktop/src/main/ipc/permissions.ts, apps/desktop/src/main/onboarding-window.ts, apps/desktop/src/shared/onboarding-ipc.ts, apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessage.tsx, apps/desktop/src/renderer/domains/settings/components/ImBridgeSettingsView.tsx, apps/desktop/src/renderer/domains/settings/components/ImBridgeSettingsView.test.tsx, apps/desktop/src/renderer/domains/settings/registry.ts, apps/desktop/src/renderer/domains/conversation/hooks/useChatExportHostModel.ts, apps/desktop/src/renderer/domains/conversation/services/chat-html-export.ts, apps/desktop/src/renderer/domains/conversation/components/mcp-app/mcp-app-bridge.ts, apps/desktop/src/renderer/shared/components/ModelSelect/useModelOptions.ts, apps/desktop/src/renderer/domains/settings/components/useAccountSettingsModel.ts, apps/desktop/src/main/app-actions/search.ts, apps/desktop/src/shared/i18n/locales/zh/settings.json, apps/desktop/src/shared/i18n/locales/en/settings.json, project/tasks/TASK-0076-desktop-frontend-brand-sweep.md, project/bugs/BUG-0008-appshot-helper-name-mismatch.md, project/plans/PLAN-0003-open-forge-rebrand.md]
exclusive_paths: [apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/main/appshot/helper-resolver.ts, apps/desktop/scripts/build-appshot-helper.js, project/tasks/TASK-0076-desktop-frontend-brand-sweep.md, project/bugs/BUG-0008-appshot-helper-name-mismatch.md]
depends_on: [TASK-0043, TASK-0044]
conflicts_with: [TASK-0045, TASK-0047, TASK-0048]
integration_status: integrated（forge/dev 主工作区；品牌收尾与 BUG-0008 修复随 5978460b6 落地——该提交标题为「工作区只留一处办公/编程开关」，实际混入了本任务改动，属既有混提交，不回写历史）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 前端页面品牌收尾与 appshot helper 名称修复

## 目标

在品牌外置层（TASK-0043）与 About/菜单迁移（TASK-0044）之后，清除 Desktop 前端页面与主进程中**绕过 i18n 替换层**的用户可见 `Vetta` 残留（窗口标题、托盘 tooltip、导出 HTML 产物、错误消息、OAuth/UA 身份、硬编码 h1/fallback），同时修复 rebrand 阶段 B 遗漏的 appshot helper 解析名不一致缺陷（BUG-0008）。

## 范围

### 并发评估

- 结论：不支持并发；与 TASK-0045/0047/0048 共享品牌写路径或受其决策阻塞。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：TASK-0043 品牌层已合入；TASK-0044 已完成。
- 冲突文件/独占路径：`desktop-brand.json`、品牌合同测试、helper-resolver、build-appshot-helper。
- Branch：`forge/dev`；Worktree：当前共享工作树。
- 集成负责人：Coordinator。

### 做

- `desktop-brand.json` 增加 `appshotHelperName` / `appshotHelperBundleId`，构建脚本与运行时 resolver 共用同一事实源；合同测试钉死两端一致。
- 修复 BUG-0008：`helper-resolver.ts` 解析名与 `build-appshot-helper.js` 产物名不一致导致打包态 appshot 不可用。
- 6 个 renderer HTML `<title>`、托盘 tooltip、`AssistantMessage` fallback、`ImBridgeSettingsView` 页头（改走 i18n）、`useChatExportHostModel` 导出文件名（复用 `chat:chatExport.defaultSessionName`）、导出 HTML 分享栏品牌、`settings/registry.ts` pet 标签、`mcp-app-bridge` hostInfo、`mcp-oauth-service` client_name、marketplace `User-Agent`、`project-export` 保存对话框 filter、cloud/market 不可用错误消息、conversation-service 会话头错误、`approval-broker` 授权消息、`logger` appName、`askpass` 生成文件注释、`useModelOptions`/`useAccountSettingsModel` 的 `Vetta Go` 兜底、`search.ts` 设置搜索关键词，统一改为 Open Forge 品牌（优先从 `DESKTOP_BRAND` 派生，文案类走 i18n/postprocessor）。
- 更新 `Vetta Computer Use` 相关注释为当前名（新 bundle：`Open Forge Computer Use`）。
- `desktop-brand.test.ts` 增加负向合同测试：以上文件不得再出现硬编码旧品牌字面量；HTML title 必须含 Open Forge。

### 不做

- 不替换内部技术 token：`@vetta/*`、`VETTA_*`、`vetta:` IPC、`vetta.remote.v1`、`X-Vetta-*`、`.vettapkg`、`window.vetta`、`APP_RUNTIME_NAME=vetta`（`app-identity.json`）。
- 不改 locale 源文件中由 postprocessor 覆盖的存量文案；不改 CSS 类名（`vetta-share-nav` 等内部标识）。
- 不改 `LEGACY_TEAM_NAMES`（上游历史数据映射）、`LEGACY_ID_MAPPINGS`、session 文件格式、凭据定位。
- 不动 `apps/docs-site`（TASK-0048）、npm scope（TASK-0046）、CLI/生态身份（TASK-0045）、`apps/mobile|kotlin|cli-host`。
- 不运行 `verify:ui:*`（用户未要求实机验收）。

## Given / When / Then

- Given：用户使用 Open Forge 构建的 Desktop；When：查看窗口标题、托盘、导出文件、保存对话框、授权与错误提示；Then：全部呈现 Open Forge，不再出现 Vetta 外显文本，兼容 token 保持原样。
- Given：macOS 打包构建；When：触发 appshot/Computer Use 授权流程；Then：resolver 定位到随包携带的 `Open Forge Computer Use.app`，不再报二进制缺失。

## 必须保持

- 品牌层仍是唯一替换事实源；新引用一律从 `DESKTOP_BRAND` 或 i18n 取，不新增散落品牌字面量。
- 已冻结构建身份、更新坐标、协议与凭据定位不变。
- 所有新用户可见文案走 i18n（`settings:imBridgeTitle` 进中英文 catalog）。

## 测试与验证

- 定向测试：`desktop-brand.test.ts` 合同断言（helper 双端同名、HTML title、负向字面量清单）；`ImBridgeSettingsView.test.tsx` 断言页头走 i18n；既有 `app-about-panel.test.ts`。
- 用户流程：打开设置 → Claw 页头显示 Open Forge 品牌；导出会话 HTML → 文件名与分享栏为 Open Forge；macOS 打包态 appshot 可解析 helper。
- 质量检查：`bun run check:quick -- <changed files>`；`bun scripts/quality/run-vitest.mjs --run <test files>`；Desktop typecheck。

## 发布说明

- 首发版本仍由 ISSUE-0007 决策；候选条目记录在本 Task 交付记录，不写继承的 Vetta Release Notes。

## 交付记录

2026-09-24 完成实施（ID 由 TASK-0071 顺延为 TASK-0076——登记后发现 TASK-0071 已被 PLAN-0008 的成员改名任务占用，同号冲突的还有 TASK-0073）。

**品牌事实源扩展**

- `desktop-brand.json` 新增 `appshotHelperName`（`Open Forge Computer Use`）与 `appshotHelperBundleId`（`io.github.hxquanq.openforge.computer-use`），`desktop-brand.ts` 经 `DESKTOP_BRAND` 导出。
- `helper-resolver.ts` 的 bundle/executable 解析名改由 `DESKTOP_BRAND` 派生；`build-appshot-helper.js` 经 `createRequire` 读取同一 JSON（含 Info.plist 的 `NSScreenCaptureUsageDescription`），修复 BUG-0008 双端漂移。

**用户可见品牌收尾（全部走 `DESKTOP_BRAND` 派生或 i18n，无新增散落字面量）**

- 6 个 renderer HTML `<title>`、托盘 tooltip、OAuth `client_name`、marketplace GitHub `User-Agent`（×3 文件）、`project-export` 保存/导入 filter 与默认文件名（`.openforge.zip`）、cloud/market 不可用错误、会话头校验错误、`approval-broker` 4 条授权消息、`logger` appName、`askpass` 生成文件注释、`debug` 命名空间 5 条 summary、`im-host` sidecar 缺失错误、`vetta-image-provider` 不支持操作错误。
- Renderer：`AssistantMessage` 作者兜底、`ImBridgeSettingsView` 页头改走新增 `settings:imBridgeTitle`（中英均为 `Open Forge Claw`）、`useChatExportHostModel` 导出文件名改用 `chat:chatExport.defaultSessionName`、导出 HTML 分享栏品牌与 alt 走 `common:appName`、`registry.ts` pet 标签、`mcp-app-bridge` hostInfo.name、`useModelOptions`/`plugin-official-models`/`useAccountSettingsModel` 的 `Vetta Go` 兜底、quickpanel 独立 i18n 占位符、`search.ts` 设置搜索关键词。
- 注释中过期的产品引用（`Vetta.app`、`Vetta Computer Use`、`Vetta 内置/原生/云服务` 等）同步更新；`.vettapkg` 格式名与 `Vetta Serv` 上游专名保留。

**合同测试**：`desktop-brand.test.ts` 新增 3 条断言——helper 双端同源且无 `\bVetta\b`、6 个 HTML title 含 Open Forge、25 个用户可见源文件负向字面量清单。`ImBridgeSettingsView.test.tsx` 断言页头渲染 i18n key。

**验证结果**

- `desktop-brand.test.ts` 8/8 通过；`search.test.ts`、`skill-market-install.test.ts`、`app-identity.test.ts` 全绿。
- Desktop `tsc --noEmit`：本任务文件 0 错误；存量失败 3 组（`webview-agent-guest.ts`、`PluginPermissionVisual.tsx`、`date-picker.test.tsx`，均为并行工作区既有漂移）。
- `check:quick` Biome：本任务文件已通过 organizeImports/format 修复；其余诊断属并行工作区。
- 全量 `bun run test`：3554/3912 通过、98 个文件失败，全部归因于既有环境问题——React 19.3.0/19.2.8 双版本漂移（`@openai/codex-security` 拉入，凡经 radix-ui 渲染的组件测试均 `useState` dispatcher 为 null）、Windows 平台远端 SSH/文件协议套件、及其他并行改动（mock 缺导出、spy 断言）。本任务文件 0 新增失败；`agent-team-storage-layout.test.ts` 单跑 3/3 通过（全量中为临时目录并发 flake）。
- `ImBridgeSettingsView.test.tsx` 受同一 React 漂移阻塞（`react@19.3.0` vs `react-dom@19.2.8`），相同断言已由合同测试覆盖，依赖收敛后即可跑通。
- 2026-09-24 复跑：`da40543a9` 收敛 override 至 react/react-dom 19.2.8 后，`bun run test:impact -- apps/desktop/src/renderer/domains/settings/components/ImBridgeSettingsView.test.tsx` 结果 6/6 通过，原阻塞项解除（见 VERIFY-0008）。
- macOS appshot 打包/TCC 链路未实机验证（本机 Windows），见 BUG-0008 剩余风险。

**code-review 反馈与处置（双轴 Standards/Spec）**

- `LEGACY_TEAM_NAMES["builtin:team:vetta"]` 一度改为派生值——评审指出该名进入迁移目录 slug（`vetta-team--<digest>`），属「不做」清单排除项，已回退为 `"Vetta Team"`（历史数据映射，非新文案）。
- `search.ts` 关键词改由 `${DESKTOP_BRAND.displayName}` 派生（不再散落新品牌字面量）。
- 合同负向清单补入 `binary-resolver.ts`、`vetta-image-provider.ts`，封住同类逃逸路径。
- 评审认可：helper 双端同源修复、6 个 HTML title、OAuth/UA/hostInfo/approval-broker/logger/错误消息改动正确；冻结 token 全部完好。

**发布说明候选**（ISSUE-0007 门禁：待 Open Forge 首发版本确定后转入对应 Release Notes，不写继承的 Vetta 说明）

- 修复：macOS 打包版应用快照/Computer Use 授权因 helper 名称不一致完全不可用，现已按统一品牌源解析。
- 改进：窗口标题、托盘提示、会话导出文件与分享页、设置页标题、错误提示、OAuth 与市场请求身份全部呈现 Open Forge，不再外显 Vetta。
- 其他：用户可见品牌统一从 `desktop-brand.json` 单一事实源派生，新增 i18n key `settings:imBridgeTitle`。

