---
id: TASK-0251
type: task
status: verifying
priority: P1
owner: 系统插件 / 设计画布
requirement: REQ-0013
plan:
source: REQ-0013；证据见本文件「当前事实」
related_requirement: [REQ-0013]
related_plan: []
related_tasks: [TASK-0249, TASK-0250, TASK-0252]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 2d17d66af
read_paths: [packages/plugins/presets/vetta-ui-design/src/canvas/NotesLayer.tsx, packages/plugins/presets/vetta-ui-design/src/canvas/NotesDrawer.tsx, packages/plugins/presets/vetta-ui-design/src/canvas/SelectionAskBadge.tsx, packages/plugins/presets/vetta-ui-design/src/canvas/DesignCanvas.tsx, packages/plugins/presets/vetta-ui-design/src/mockup/render.ts, packages/plugins/presets/vetta-ui-design/src/mockup/brand-logo.ts, packages/plugins/presets/vetta-actions/src/action-usage.ts, packages/plugins/presets/plugin-workbench/src, packages/plugins/presets/content-creation/src, packages/plugins/plugin-sdk/src/ui.ts]
write_paths: [packages/plugins/presets/vetta-ui-design/src, packages/plugins/presets/vetta-actions/src, packages/plugins/presets/plugin-workbench/src, packages/plugins/presets/content-creation/src, project/tasks/TASK-0251-system-plugin-brand-copy.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 系统插件文案与导出产物使用宿主品牌

## 目标

随 Desktop 发布的系统插件在界面与产物里用宿主当前品牌名，而不是写死的 Vetta。

## 当前事实（证据）

- `vetta-ui-design`：备注面板写死品牌名——`src/canvas/NotesLayer.tsx:372`（`{isAgent ? "Vetta" : t("notes.author.user")}`）、`src/canvas/NotesDrawer.tsx:281`（`<span>Vetta</span>`）；导出 mockup 水印 `src/mockup/render.ts:5-6`（`BRAND_NAME = "Vetta"`、`BRAND_TAGLINE = "Designed By Vetta"`）与 `brand-logo.ts`；另有 `SelectionAskBadge.tsx`、`DesignCanvas.tsx`、`DesignSystemDialog.tsx` 的「让 Vetta 处理」类文案。
- `vetta-actions/src/action-usage.ts` 有 36 处品牌词（App Action 的用法说明，模型可见）。
- `plugin-workbench`、`content-creation`、`plugin-sdk/src/ui.ts` 的提示文本同样出现品牌词。
- 宿主注入品牌已有先例：`packages/theme-ui/src/sidebar/SidebarTopBar.tsx` 的品牌名由宿主经 labels 注入，插件侧不硬编码。

## 范围

### 并发评估

- 结论：条件支持并发（按插件分包，可与 TASK-0249/0250 并行），本轮按串行执行
- 执行方式：serial
- 可并行 Task：TASK-0249、TASK-0250（写路径不相交）
- 前置依赖：无；品牌注入接口若需宿主侧配合，随本任务一并落地
- 冲突文件/独占路径：`packages/plugins/presets/*`（本任务独占）
- Branch：main（沿用当前主检出）
- Worktree：不拆出（main 串行）
- 集成负责人：本轮 Agent
- 集成顺序：排在 TASK-0250 之后

### 做

- 插件文案中的产品身份词改为宿主注入的品牌名（沿用 labels 注入先例），无宿主上下文时回退到可复现默认。
- 导出 mockup 的水印与署名随品牌档位；导出产物断言相应更新。
- `action-usage.ts` 的能力用法说明按当前品牌名渲染，保持路由语义文本不变。

### 不做

- 不改插件 id、skill 名、命令名、权限声明与 `.vettapkg` 相关合同。
- 不改插件 i18n key 结构与已有翻译组织方式。
- 不改历史注释里的品牌词。
- 按用户决策不新增插件 SDK 公开接口：导出产物（mockup 水印与署名）与不经过插件 i18n 的静态标签暂不换，登记为已知遗留（见剩余风险）。

## Given / When / Then

- Given 默认档中文界面，When 用户打开设计画布的备注面板与「让 Vetta 处理」入口，Then 文案使用小爱ai，不出现 Vetta。
- Given 任一档位，When 用户导出 mockup，Then 水印与署名使用当前档位品牌名。
- Given 任一档位，When agent 读取 App Action 用法说明，Then 文本不含遗留品牌名且路由语义不变。

## 必须保持

- 插件的稳定标识、权限声明与调用路由不变。
- 导出产物的可复现性：同一档位与输入产出相同字节。
- 无宿主上下文时插件仍可构建与测试通过。

## 测试与验证

- 定向测试：对应插件包测试（`bun run test:pkg <包名>` 或 `bun scripts/quality/run-vitest.mjs --run <文件>`）
- 用户流程：设计画布备注面板文案断言 + 导出 mockup 水印断言
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter `integration_status` 一致
- 人工功能验收：待验收
- 发布：未授权

## 功能验收包

- 入口与前置条件：dev 启动 Desktop，打开设计画布并添加一条备注。
- 操作步骤或 AI 任务输入：查看备注面板与「让 Vetta 处理」入口；导出一次 mockup。
- 预期行为与最终产物：界面与产物使用当前品牌名。
- 不通过表现与已知限制：仍显示 Vetta；导出 mockup 的水印与署名仍写旧品牌名（已知遗留）。
- 验收反馈及回归案例：待回填

## 交付记录

- 实际修改（按用户决策「只做界面文案」）：
  - `apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-apis.ts`：`createI18nApi().t()` 与 `resolvePluginDisplayText()` 出口套用 `replaceDesktopBrandText`——插件不必知道品牌档位，凡经插件 i18n 的文案（含 manifest `%key%` 展示名）与宿主界面同口径。
  - `vetta-ui-design`：备注面板两处硬编码作者名改走插件 i18n key（`NotesLayer.tsx`、`NotesDrawer.tsx` → `notes.author.agent`，`locales/{zh,en}.json` 新增该 key，值仍按既有约定写遗留品牌名由宿主归一）。
  - `vetta-actions/src/action-usage.ts`：37 处 App Action 用法说明（模型可见）改为中性表述「桌面应用」，并修掉替换后产生的多余空格；`action-usage.test.ts` 断言同步改为「含『桌面应用』且不含遗留品牌名」。
  - `content-creation` 的媒体 provider 展示名 `Vetta Image` → `Desktop Image`；`plugin-workbench` 的保存对话框过滤器名 `Vetta Plugin Package` → `Plugin Package`（扩展名 `vettapkg` 不动）、工具描述 `reloads the whole Vetta app` → `the whole app`。
  - 6 个改动文件补 `Modified by The Open Forge contributors.` 声明头。
  - 新增回归用例 `apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-apis.brand.test.ts`：插件 catalog 值经 `ctx.i18n.t()` 与 manifest `%key%` 渲染后等于当前品牌名（旧实现返回原始 `Vetta`，必然失败）。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run src/renderer/domains/plugins/runtime/plugin-host-apis.brand.test.ts src/shared/desktop-brand.test.ts` → 2 文件 / 20 例通过。
  - `bun run test:pkg presets/vetta-actions` → 8/8 通过（含用法说明用例）。
  - `bun run test:pkg presets/vetta-ui-design` → 106 文件 / 688 例通过。
  - `bun run test:pkg presets/content-creation` → 通过。
  - `presets/plugin-workbench` 无 `test` 脚本，未运行包级测试（改动为两处文案字面量）。
- 未运行及原因：未启动 dev 实例做设计画布人工验收（需授权）；plugin-workbench 无包级测试入口。
- Worktree：不拆出（main 串行）
- 剩余风险（本任务明确遗留，未纳入本次改动）：
  - 导出 mockup 的水印与署名（`vetta-ui-design/src/mockup/render.ts` 的 `BRAND_NAME` / `BRAND_TAGLINE`、`brand-logo.ts`）仍写旧品牌名——产物内品牌需要宿主品牌值，按用户决策不新增 SDK 接口。
  - 不经过插件 i18n 的静态标签：分享包保存对话框过滤器名（`export/export-design.ts` 的 `Vetta Design`）、生成 DESIGN.md 的出处行（`gallery/start-from-system.ts`）。
  - plugin-cli 开发者文案与生成模板（`Vetta plugin manager`、`install:vetta` 等）按范围约定不动。
