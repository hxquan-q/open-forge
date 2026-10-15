---
id: ISSUE-0024
type: issue
status: done
priority: P2
owner: apps/desktop
related_requirement: []
related_plan: []
related_tasks:
  - TASK-0121
source: agent-browser 现场测试（能力页持续显示「GitHub 来源同步失败：Open Forge Official」）
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 官方能力市场源 hxquan-q/open-forge-marketplace 未发布，能力页长期显示同步失败横幅

## 背景

能力页按设计内置「Open Forge Official」市场源
（`official-marketplace-source.ts`，`VETTA_OPEN_MARKETPLACE_REPOSITORY`
可覆盖），拉取 `gh-pages` 分支的 `.vetta/marketplace.json` 与整包 zip。

## 已知事实

- 实测 `https://github.com/hxquan-q/open-forge-marketplace` 返回 404
  （仓库不存在或未公开 / 无 `gh-pages` 分支）；
- 能力页因此常驻「以下 GitHub 来源同步失败：Open Forge Official」横幅；
- 本地 61 项已装能力不受影响，缓存兜底正常，属优雅降级；
- 内置来源按设计「用户不可删除、不可停用」，用户无法自行消除该横幅。

## 未决问题

- 官方市场的内容事实源在哪里（是否已有待发布仓库，还是尚未建立）；
- 在市场内容就绪前，内置源是否应继续对用户报错。

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 发布市场仓库（含 `.vetta/marketplace.json` 的 gh-pages） | 根除横幅，功能完整 | 需要准备市场内容 | 无 |
| B 市场源 sync 404 时降级为静默/低打扰提示 | 用户不再看到误导性报错 | 掩盖真实同步故障 | 真正同步失败时不易察觉 |
| C 构建期默认不注册官方源，待发布后再启用 | 干净 | 已装源的用户需迁移 | 行为分叉 |

## 推荐

优先 A（发布仓库）；若市场内容短期无法就绪，临时采用 B 中
「源不可达（404/网络）时不以失败态打扰用户」的弱化提示。

## 决策触发条件

- 官方市场仓库是否已有可发布的内容与 owner。

## 后续 Task

- `TASK-0121`：落地选定方案并验证能力页无误导横幅。

## 结论（2026-09-25）

按方案 A 执行：创建公开仓库 `hxquan-q/open-forge-marketplace`，
`main` 放说明文档，`gh-pages` 承载 `.vetta/marketplace.json`
（schemaVersion 3、`marketplaceVersion 0.1.0`、`minAppVersion 0.1.0`、
空 abilities 骨架）。manifest 先经仓库内 `parseMarketplaceManifest`
校验通过。实机验证：能力页手动刷新后失败横幅消失，来源页显示
「Open Forge Official · gh-pages · 已同步 0.1.0」。
后续市场内容按需向 gh-pages 递增 `marketplaceVersion` 发布即可。
