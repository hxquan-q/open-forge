---
id: ISSUE-0021
type: issue
status: draft
priority: P2
owner: apps/desktop
related_requirement: []
related_plan: [PLAN-0010]
source: RESEARCH-0013 S3（VS Code NLS 外置对照本仓 locale 全量静态打包）
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# i18n locale 外置与离线单语言包策略裁决

## 背景

`RESEARCH-0013` S3：VS Code 构建期把 `localize()` 调用替换为索引，字符串进 `nls.messages.*`，语言包作为独立扩展不随安装包。Open Forge 现状：`src/shared/i18n/resources.ts` 把 `en/*` + `zh/*` 全部 locale JSON **静态 import** 进每个 renderer bundle——体积与启动内存双亏，但这是刻意的产品形态问题而非纯技术债。

## 已知事实

- i18next 支持 backend 懒加载（按 namespace + 语言按需取），技术上可直接启用；
- `fallbackLng=zh` 是硬约定——任何懒加载方案都不能破坏「缺译回退 zh、绝不暴露原始 key」；
- `i18next.d.ts` 的类型增强基于 zh 资源做 key 自动补全，外置后类型链路需保留；
- 主进程 `mainT` 走 `main` ns，与 renderer 的加载路径不同，需分别处理；
- lite 版无远端语言包下载渠道，「外置」意味着安装包内分文件 lazy chunk 而非网络下载。

## 未决问题

1. 是否允许安装包内只带一种「默认语言」+ 其余语言按需加载？还是两语言都随包但按 ns 懒加载？
2. 离线场景下懒加载失败的兜底（当前静态打包天然无此问题）？
3. 类型增强链路（zh key 自动补全）在资源外置后如何保持编译期检查？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 保持全量静态打包 | 零改动、离线最稳 | bundle 体积与启动解析成本照旧 | 语言/namespace 增多后劣化 |
| B. 按 namespace 懒加载（两语言仍随包） | 启动只载首屏 ns；体积在包内重分布 | i18next backend 接入 + 类型链路适配 | 懒加载时序洞（文案闪烁） |
| C. 按语言外置（次语言独立 chunk/扩展） | 主语言包体积最小 | 产品决策：离线次语言是否可接受 | 缺译回退链变复杂 |

## 推荐

先 B 后 C：B 是纯技术项（ns 懒加载不碰语言分发策略），C 涉及产品裁决（离线单语言包可接受性）。B 若落地，C 的增量变小。

## 决策触发条件

- renderer bundle 体积审计显示 locale JSON 占比显著（>5%）；
- 新增第三语言或 ns 数量翻倍；
- RESEARCH-0003 P0-1 基线显示启动解析成本中 i18n 占比显眼。

## 后续 Task

- 裁决 B/C 后立项：`apps/desktop/src/shared/i18n/` 懒加载改造 + 类型增强保留 + 主进程 `mainT` 分面处理。

## 事实补充与首轮测量（2026-09-25）

- 源码事实核对（与文档一致）：`apps/desktop/src/shared/i18n/` 下 12 个 namespace 全部静态打包，`fallbackLng = "zh"`（`config.ts:26`），`i18next.d.ts` 用 `import type` 因此**零运行时开销**，主进程 `mainT` 共用同一 resources 对象；仓库无 backend / 动态 import / 下载渠道。文档里的路径需带 `apps/desktop/` 前缀。
- **首轮体积测量（补上「触发条件不可测」的缺口）**：`apps/desktop/src/shared/i18n/locales/{zh,en}` 各 12 个 JSON，源码体积 zh ≈ 267 KB / en ≈ 276 KB，合计 ≈ 543 KB；单文件最大为 `settings.json`（zh 104 KB / en 108 KB）与 `chat.json`（≈ 48/52 KB）。
- 说明：以上是源码态 JSON 体积，不是打包后体积；bundle 占比需要 `bun run --cwd apps/desktop build:renderer` 后的产物审计（未运行：构建非本任务所需，且 renderer 构建耗时不菲）。因此「占比 >5%」这一触发条件**仍未被证伪或证实**，下一步若推进 B 方案，应以一次 renderer 构建产物审计为准。
- 结论：Issue 维持 draft；B 的技术前提（i18next backend + 类型链路）与风险（文案闪烁）已在文档中列明，缺的只是产物占比这一条量化输入。
