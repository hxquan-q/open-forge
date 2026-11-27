---
id: TASK-0535
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0533]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 045a987ab
read_paths: []
write_paths:
  - apps/desktop/scripts/
  - apps/desktop/src/
  - packages/theme-ui/src/overlays/
  - apps/desktop/src/shared/i18n/locales/
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 发布说明进入更新 feed，更新弹窗渲染 Markdown（上游 e4af417d9 批次适配）

## 合同

- 来源与目标：PLAN-0032 基线外增量——勘察上游「跨多个版本更新时列出每一版发布说明」批次（e4af417d9、cc5167f01、6b2f3d075、82dd6fa3f、3d734aa54）时发现 Open Forge 的适配前提不成立：fork 用 generic/R2 发布渠道，electron-updater 的 `fullChangelog` 数组式多版本说明只由 GitHub provider 提供，上游批次的管道主体在本 fork 上是死代码；同时发现本地既有的更大问题——`.github/release-notes/README.md` 规定发布说明自 0.5.58 起写入 `.github/release-notes/v<版本>.md`，而打包脚本 `prepare-pack.js` 仍从已冻结的 `apps/desktop/CHANGELOG.md` 提取 `## [版本]` 段落，该段落后不再有新版本，即**更新 feed 从未携带过 Open Forge 各版本的发布说明**，更新弹窗与设置页的说明区始终为空。本任务按 fork 实际交付批次的核心价值。
- 做（本任务）：
  - `apps/desktop/scripts/resolve-release-info.mjs`：改为从 `.github/release-notes/v<版本>.md` 提取发布说明——去掉标题行与「发布日期 / Upstream baseline」等元信息（首个 `##` 小节之前的内容全部去掉），剩余正文写入 `releaseInfo`；`prepare-pack.js` 相应改为指向该文件。配套更新 `resolve-release-info.node-test.mjs`。
  - `apps/desktop/src/shared/release-note-header.ts`：新增 `stripReleaseNoteHeader`（去掉正文开头的 `# …` 标题行与 HTML 注释行），renderer 开发预览与打包提取共用。
  - `packages/theme-ui/src/overlays/ReleaseNoteMarkdown.tsx`：移植上游 82dd6fa3f——ReactMarkdown 自排版，http/https/mailto 外链 `target="_blank"`（由 TASK-0533 的 window-open handler 转交系统浏览器），相对路径等非网页链接只渲染文字。配套 `ReleaseNoteMarkdown.test.tsx`。
  - `packages/theme-ui/src/overlays/UpdateRestartDialogView.tsx`：`releaseNote` 由纯文本改为 `ReleaseNoteMarkdown` 渲染。
  - `apps/desktop/src/renderer/shared/hooks/useUpdaterInit.ts`：移植上游开发期预览 `__previewUpdate()`（仅开发构建）——读取 `.github/release-notes/v<当前版本>.md`，模拟「更新就绪」状态，便于实机查看排版。fork 不做多版本参数（无多版本管道）。
  - release fragment 一份。
- 不做：上游批次的 `fullChangelog`/`earlierReleaseNotes` 多版本管道、release-note-language 双语选段、release-notes-markdown HTML 还原（均为 GitHub provider 专属，fork 的 generic/R2 渠道为单版纯 markdown 字符串）；上游版本介绍弹窗整体改版（banner、pill 按钮、双模态）与 banner 图（品牌向且 fork 弹窗为简化设计）；「查看全部更新记录」外链（fork 无 releases 页面，查看入口为设置页既有「查看完整内容」预览）。
- Given / When / Then：
  - 打包 v0.1.5 时 → `latest.yml` 的 `releaseNotes` 含 v0.1.5.md 正文的 `## 新增` 等小节、不含标题与元信息行。
  - 更新就绪弹窗展示发布说明 → Markdown 排版（标题/列表/加粗）而非原始文本。
  - 说明中的网页链接 → 在系统浏览器打开；相对路径链接 → 显示为纯文字不触发导航。
  - 开发环境控制台执行 `__previewUpdate()` → 弹窗以当前版本发布说明演示排版；`__previewUpdate(false)` 还原。
- 验证：node:test `resolve-release-info.node-test.mjs`；定向 vitest `release-note-header.test.ts` 与 `ReleaseNoteMarkdown.test.tsx`；`bun run test:impact --` 改动源文件（覆盖 useUpdaterInit/useUpdateCheckerModel 等既有关联测试）；`bun run check`。
- 人工验收：无独立实机验收要求（打包链路以脚本测试验证，渲染以单测+开发预览验证）。

## 交付

- 状态：2026-11-27 完成实施与工程验证，转 verifying 待用户验收。
- 工程验证（全部实际执行）：
  - node:test `resolve-release-info.node-test.mjs` 5/5 通过（含 fence 内注释字面量保留、独占注释行剔除、CRLF 归一、缺文件/空正文告警路径）。
  - 定向 vitest：`release-note-header.test.ts` 5/5、`ReleaseNoteMarkdown.test.tsx` 2/2 通过。
  - `bun run test:impact --` 改动源文件：desktop 13 个测试文件 83 用例、theme-ui 2 用例全部通过。
  - `bun run check` exit 0（lint/types/guards/mobile 全绿；仅存量 release-notes 风格 warning，非本次新增）。
  - 两轮独立 verifier 复查：第一轮 pass-with-notes 指出全局注释误删、ENOENT 之外误吞、test:packaging 未收录、实现重复四项，全部修复（fence 状态跟踪剔除、只吞 ENOENT、清单收录、平行实现互相指向并保持同步）；第二轮核实功能零缺陷——两处平行实现提取真实 v0.1.5.md 输出逐字节一致、链接策略实测无绕过（https/mailto 走 target=_blank，相对路径/锚点/javascript:/ftp: 均降纯文字）、prepare-pack 到 latest.yml 链路正确。
- 未运行项：Desktop 实机/dev 预览未启动（`__previewUpdate` 的 glob 路径与 DEV 限定经代码核查与构建期解析验证，弹窗与设置页的实际视觉效果未经实机确认）；真实打包（`prepare-pack` 全量）未执行，提取链路以脚本单测覆盖。
- 范围决策与说明：
  - 上游 `fullChangelog`/`earlierReleaseNotes` 多版本管道、双语选段、HTML→MD 还原不做：fork 的 generic/R2 渠道 feed 为单版 markdown 字符串，该管道在本 fork 不可达，属死代码；若日后切换 GitHub provider 再评估。
  - 脚本与 renderer 为两处平行提取实现：打包脚本须兼容 Node 20（`package.json` engines `node >=20`，无类型擦除）不能 import `.ts`，两处注释互相指向、各有测试锚点，后续修改须同步。
  - `UpdateCheckerView`（设置页）换用 `ReleaseNoteMarkdown` 属合同外扩张，已决策保留：渲染器替换无布局结构变化，且修复相对链接在 dev 下可把主窗口导航走的隐患；原合同「设置页预览维持原样」的措辞以此为准。
  - 合同的验证项文字「useUpdaterInit 相关既有测试」已更正——仓库无该文件的专属测试，实际覆盖走 test:impact 的关联测试集。
  - `ReleaseNoteMarkdown` 的 `code` 渲染不区分行内/块级（与上游实现一致），fenced 代码块会套行内样式；当前 v0.1.5 正文无 fence，无可见影响，后续说明引入代码块时再评估。
  - 同步修正 `apps/desktop/scripts/README.md` 中「从 CHANGELOG.md 提取」的过时描述。
