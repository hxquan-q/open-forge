# 发布说明（Release Notes）

每个 Open Forge 桌面端版本一个文件，命名为 `v<major>.<minor>.<patch>.md`，例如 `v1.2.3.md`。
`desktop-release` 工作流发布 Open Forge GitHub Release 时，直接把对应文件作为 Release 正文，
所以这里写的就是用户在 Release 页面读到的内容；不要把上游 Vetta 发布说明复制或改写为 Open Forge 说明。

## 什么时候写

新增功能、修复缺陷、合并 PR、关闭 issue 之后，写一份碎片：`.github/release-notes/fragments/v<版本>/<任务或主题>.md`，
小节只用 `## 新增`、`## 改进`、`## 修复`、`## 其他`，每份至少一条。版本号以 `apps/desktop/package.json` 的 `version` 为准。
碎片汇编成 `v<版本>.md`，后者仍是 Release 正文；发布流水线校验正文存在，缺失即发版失败。

首发 Open Forge 版本尚未由 `ISSUE-0007` 决定并切入 Desktop manifest 时，不得将 fork-only 内容写入继承的 Vetta Release Notes；候选文案暂记在关联 Task 中，首发版本确定后归入自己的 Release Notes。

## 怎么写

- 标题用 `# Open Forge <版本号>`，下一行写发布日期：发布前停在占位「待定」，只有 `release:desktop:publish` 会把它写成当天日期；没有 `v<版本>` tag 的版本写成具体日期会被 `bun run check` 判为非法。
- 分 `## 新增` / `## 改进` / `## 修复` / `## 其他` 四节，没有内容的小节直接省略。
- 面向用户描述影响：说清楚用户会看到什么变化，而不是改了哪个函数。行为有取舍时把代价一并写出来。
- 关联 PR 或 issue 时统一用 `owner/repo#123` 格式，例如 `openvetta/open-vetta#8`。
- 碎片写完后运行 `node scripts/release/release-notes.mjs --assemble` 汇编正文；`bun run check` 校验碎片小节合法、每节有条目，以及正文与碎片一致。不要直接改 `v<版本>.md`。
- 已发布版本（存在 `v<版本>` tag）的发布说明不得再修改；发现写错另起一条修订说明。`release-notes.mjs --check` 会与 tag 处内容逐字比对，`bun run check` 亦校验文件名、标题与 `apps/desktop/package.json#version` 一致。

历史版本（0.5.48 及更早）的记录留在 `apps/desktop/CHANGELOG.md`。
