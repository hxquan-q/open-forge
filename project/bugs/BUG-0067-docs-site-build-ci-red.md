---
id: BUG-0067
type: bug
status: verifying
priority: P2
owner: docs-site
source: CI docs-site workflow build (37056667697)
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0184]
related_issues: [ISSUE-0029]
related_bugs: []
created: 2026-10-03
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# docs-site 构建在 CI 上 Turbopack 报错

## 事实

`docs-site` workflow 的 `check + test + build` 在 ubuntu runner 上 `bun run build` 失败：`Turbopack build failed with 91 errors`（37056667697，2026-10-02；建档时计数 71，现为 91）。Typecheck 与 Test 步骤通过，只有 Build 失败。

## 分型结果（2026-10-05）

错误清单取自 job 日志，并在本机（Windows，`bun run --cwd apps/docs-site build`）复现，同样 exit 1：

- 100 个内容 `.mdx` 中 53 个报错，错误块 91 个。
- 约 85 个为 `Error: Error evaluating Node.js code` / `RangeError: Maximum call stack size exceeded`，栈固定为 `mdast-util-to-markdown/lib/handle/strong.js` ↔ `fumadocs-core/dist/mdx-plugins/stringifier.js` 的相互递归。
- 2 个为 MDX 语法错：`6:2: Unexpected character '!' (U+0021) before name`，出现在带 `<!-- ... -->` HTML 注释的内容文件（`product/models.mdx`、`core/workspaces-and-sessions.mdx` 及对应 `en/` 版本）。MDX 不认 HTML 注释，须写 `{/* ... */}`。

## 根因（高置信度）

`fumadocs-core@16.14.1` 的 `defaultStringifier` 中，`modHandler` 包装原始 handler 后返回一个**普通函数，未复制 `attention` / `peek` 静态属性**；而 `mdast-util-to-markdown` 的 `phrasing()` 依赖 `handle.attention` 决定按 attention 内联序列化还是回落 `state.handle()`。属性丢失后 `strong` 节点回落到 `state.handle(strong)`，`strong` 又把自身包进 `{type:'root'}` 重新进入 `containerPhrasing`，形成无限自递归。

触发条件是内容里出现任意 attention 节点（`**粗体**` 或 `*斜体*`），与语言无关。最小复现（直接调用该 stringifier，纯本地、秒级）：

```text
plain      'hello world'               -> OK
bold_zh    '入口：**设置 → 消息推送**。' -> RangeError: Maximum call stack size exceeded
bold_en    'Use **full access** mode.'  -> RangeError: Maximum call stack size exceeded
italic     'a *b* c'                    -> RangeError: Maximum call stack size exceeded
inlineCode 'a `b` c'                    -> OK
```

这也解释了「同一文件 zh 版红、en 版绿」的分布：`product/webhook.mdx`（zh）用了 `**…**`，其 en 版改用 `<Checklist>` JSX，不含 attention 节点。

`fumadocs-core` 在 `apps/docs-site/package.json` 与本仓均钉 `16.14.1`，出错的内容文件（如 `product/abilities.mdx`）不在相对 `upstream/dev` 的改动集内——是继承的第三方缺陷，不是本次品牌迁移引入。

置信度：高。最小复现、代码路径（`modHandler` 未复制属性）、内容分布（含 `**` 的文件才红）三处独立证据一致。

## 影响与严重度

P2：docs 站 `next build` 无法通过，Vercel 生产部署与 CI 校验同时受阻，长期无绿基线。不改变运行时的产品行为。

## 回归测试

待补：含 `**` / `*` 的最小 mdx 经 fumadocs stringifier 不抛 `RangeError`；以及 4 处 HTML 注释改为 MDX 注释后解析通过。修复 Task 见 [TASK-0184](../tasks/TASK-0184-docs-site-build-repair.md)。

## 修复与验证

- 候选一：升级 fumadocs-core/fumadocs-mdx 到已修复该包装的版本（需先确认上游版本，再评估与 `fumadocs-ui` 的版本匹配）。
- 候选二：用 bun `patchedDependencies` 让 `modHandler` 复制 `attention`/`peek`，不改版本。
- 候选三：为 fumadocs-mdx 提供自定义 `stringify`，绕过默认包装。
- 4 处 `<!-- ... -->` 注释改为 `{/* ... */}`；若该注释承载修改声明头语义，迁移后需保持仓库声明头门禁可识别。
- 验收阻塞同 [ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)：CI 复跑绿暂不可得；本机 `bun run --cwd apps/docs-site build` 绿可作为本地证据。

## 修复与验证（2026-10-05）

- 修复一：以 bun patch 修正 `fumadocs-core@16.14.1` 的 `modHandler`，包装 handler 时保留 `attention`/`peek`（`patches/fumadocs-core@16.14.1.patch`；根 `package.json` 新增 `patchedDependencies`）。
- 修复二：4 处 `<!-- ... -->` 改为 MDX 注释 `{/* ... */}`；其中 `core/workspaces-and-sessions.mdx`（zh/en）的声明头原先在 frontmatter 之前，现移到闭合 `---` 之后（MDX 要求 frontmatter 打头）。
- 配套：`check-modified-file-notices.mjs` 为 `.mdx` 增加 `jsx` 注释样式，`--write` 不再插入非法 HTML 注释；并把 `patches/` 加入不携带声明头的路径白名单（补丁加头会破坏可应用性）。
- 回归：`apps/docs-site/test/mdx-stringifier.test.ts` 直接构造含 `strong`/`emphasis` 的最小 mdast，断言不再抛 `RangeError`。
- 验证：`bun run --cwd apps/docs-site build` 通过（113 个静态页；`RangeError` 从 85 降到 0，错误块从 91 降到 0）；`bun run --cwd apps/docs-site test` 34/34；`bun run test:quality` 487/487；通知门禁 ratchet 通过（`unclassified=0`）；完整 `bun run check` 通过。
- 未运行：CI 复跑（`ISSUE-0029`）。Vercel 生产部署随下次构建自然恢复。
