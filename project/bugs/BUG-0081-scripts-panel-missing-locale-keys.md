---
id: BUG-0081
type: bug
status: verifying
priority: P3
owner: plugins/presets/scripts
source: VERIFY-0017 组二（TASK-0158 人工验收实测中发现）
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0158, TASK-0444]
related_issues: []
created: 2026-10-08
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 脚本面板 7 个 i18n key 缺条，界面直接显示原始 key 与未替换的 `{{count}}`

## 用户流程

- Given：任一含 `package.json` scripts 的项目（实测夹具 `scripts-panel-fixture`），会话底部面板打开「脚本」。
- When：看面板顶部计数与项目分组卡片。
- Then（实际）：计数位置显示字面量 **`共 {{count}} 个`**，目录徽标显示 **`card.root`**，分组标题被 CSS 大写后显示 **`CARD.SCRIPTS`**。

## 实际行为

真实 UI 中共有 3 处原始 key / 未替换占位符可见（截图 `0158-scripts-panel-2.png`）：

| 位置 | 渲染结果 | 期望 |
|---|---|---|
| 面板工具条右侧计数 | `共 {{count}} 个` | `共 6 个`（2 个 package script + 4 个 Make 目标计数口径见下） |
| 项目卡片路径徽标 | `card.root` | 根目录 / Root |
| package.json 分组标题 | `CARD.SCRIPTS`（原文小写 `card.scripts`，被 CSS `text-transform` 大写） | 脚本 / Scripts |

## 期望行为

`locales/zh.json` 与 `locales/en.json` 覆盖组件引用的全部 key，且插值参数名与调用点一致；界面不出现任何 `card.*`、`search.clear`、`action.dismiss`、`state.error.title` 原始 key，计数正常展开。

## 环境与失败证据

- 应用版本 0.1.3，提交 `0b93cf42e`（main），Windows 11 Pro 26200；隔离 Debug profile `04987e4e`，渲染进程源 `http://127.0.0.1:7910`。
- 夹具：`C:\Users\xquan\.openforge-ui-debug\04987e4e\fixtures\git-literal-paths`（临时加入 `package.json`(`hello`/`second`) 与 `Makefile`(`build`/`deploy`)），插件由 `packages/plugins/tenants.json` 的 development 租户加载。
- **证据 1（静态，决定性）**：组件引用 16 个 key，`locales/zh.json` 只有 13 条。缺失 7 条：
  - `ScriptsPanel.tsx:133` `t("search.clear")`、`:170` `t("action.dismiss")`、`:192` `t("state.error.title")`；
  - `ProjectCard.tsx:118` `t("card.root")`、`:133` `t("card.scripts")`、`:144` `t("card.showMore")` / `t("card.showLess")`。
  `locales/en.json` 为同一集合，同样缺这 7 条。
- **证据 2（参数名不匹配）**：`ScriptsPanel.tsx:143` 传 `{ projects: projects.length, scripts: countScripts(projects) }`，而 `locales/*.json` 的 `summary` 写的是 `"共 {{count}} 个"` / `"Total: {{count}}"`——参数名 `count` 从未被传入，占位符必然原样输出。这一条与「缺条」是两种不同的成因，只有 `summary` 属于前者。
- **证据 3（同族插件横向对照）**：对 `packages/plugins/presets/*` 全量比对「组件引用的 `t("…")` key」与「locales 并集」，**只有 `scripts` 一份存在 MISSING**，其余 15 个插件 MISSING 均为空。即这是本插件单独漏配，不是插件 i18n 机制的普遍缺陷。
- **既有同类先例**：`BUG-0029`「插件工作区视图 description 未过 i18n 解析，侧边栏 tooltip 显示原始占位符」（done），同类问题的处理口径可复用。

## 最小复现

1. 在 Debug Profile 里注册一个含 `package.json` scripts 或 `Makefile` 的项目（本仓无既有夹具，需临时添加）。
2. 打开该会话 → 顶部「打开底部面板」→ 选「脚本」页签。
3. 观察工具条右侧计数与项目卡片徽标：出现 `共 {{count}} 个`、`card.root`、`CARD.SCRIPTS`。

## 影响

纯文案层缺陷，不影响脚本发现与执行（本轮实测发现/执行链路正常）。用户可见面已足够显眼：面板首屏就有三处机器文字。**不阻塞 TASK-0158 的功能验收**，但应作为该任务交付质量的已知欠账记录在案。

## 根因证据

- 不是「插件 i18n 机制坏了」：同仓其余 15 个插件 key 完整，`panel.label`（经 `plugin.json` 的 `%…%`）在本面板正常显示为「脚本」，说明宿主侧解析路径通。
- 是两处独立成因叠加：① `card.*`/`search.clear`/`action.dismiss`/`state.error.title` 从未写进 `locales/*.json`；② `summary` 的插值参数名与调用点不一致。
- 为什么既有测试没拦住：`test/ScriptsPanel.test.tsx:14-19` 用 `vi.mock` 把 `useTranslation` 换成 `t: (key, params) => params ? \`${key}:${JSON.stringify(params)}\` : key`——**回显 key 本身**，从不读 `locales/`。于是测试断言的是 `getByText("state.noMatch")` 这类 key 字面量，缺条与参数名不匹配都不可能让它变红（脚本插件 15/15 全绿即为证）。
- 为什么门禁没拦住：`scripts/quality/` 下没有插件 locale 完整性检查（`grep -rln "locale" scripts/quality/` 仅命中 `test-impact.mjs` 的无关用法）。

## 回归测试

- 新增 `test/locale-contract.test.ts`：从 `ScriptsPanel` / `ProjectCard` 源码收集字面量 `t("…")` key，并断言 en/zh locale 全覆盖；同时比较 `summary` 调用点对象参数名与中英文占位符集合。
- 旧 locale 下两个合同测试均红：缺 7 个 key，`count` 与 `{ projects, scripts }` 不匹配；修复后两个测试全绿。

## 修复与验证

- 修复：在中英文 locale 补齐 `search.clear`、`action.dismiss`、`state.error.title` 与四个 `card.*` key；summary 改用 `projects` / `scripts` 两个实际传入的插值。
- 测试：旧实现两个 locale 合同测试均失败；修复后合同测试 2/2，Scripts preset 全包 17/17。
- 检查：`test:impact`（Scripts preset 全包 17/17）与 `bun run check` 通过。
- 未运行及原因：未启动真实 Desktop；修复限于 locale 与静态插值合同，具体视觉措辞仍可在实机验收时反馈。
