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
updated: 2026-10-17
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

## 第二轮测量：renderer 构建产物审计（2026-10-17，触发条件已裁决）

- 命令：`bun run --cwd apps/desktop build:renderer`（vite 7，22.5s，7258 modules）。
- **落点**：locale 值未进 `renderApp` 主 chunk，而是整体嵌入 `assets/brand-assets-*.js`（512.7 kB raw / 180.0 kB gzip，与品牌资产同 chunk——chunk 命名陷阱再现）；`renderApp`（3,869.9 kB）**静态引用**该 chunk，属启动必经路径（`t()` 调用点的 key 在 renderApp，资源值在 brand-assets）。
- **嵌入体积**：minified locale 合计 **505.4 kB**（zh 254.3 + en 263.2；以 `JSON.stringify(JSON.parse(file))` 逐文件计），即 brand-assets chunk 的 ≈98% 是 locale 数据。
- **占比**（两种口径）：启动路径（renderApp + brand-assets = 4,382.5 kB）中 **≈11.5%**；全部当前构建 JS 资产（≈12.2 MB，剔除 dist 残留旧哈希后估算）中 ≈4%。
- **裁决**：Issue 的触发条件「renderer bundle 体积审计显示 locale JSON 占比显著（>5%）」按启动路径口径 **成立**（11.5% ≫ 5%）。B 方案（按 ns 懒加载、两语言仍随包）的量化前提补齐；推荐维持「先 B 后 C」。
- 附带发现：`dist/renderer/assets` 残留上一构建的旧哈希文件（如两个 `brand-assets-*.js`、两个 `renderApp-*.js`），总量虚高 ~2×，与占比裁决无关但提示构建清理可另立卫生项。
- 下一步：B 立项（`apps/desktop/src/shared/i18n/` ns 懒加载 + `i18next.d.ts` 类型链路保留 + 主进程 `mainT` 分面 + 文案闪烁回归），属 renderer 重构切片，建议独立 Task 实施。

## 第三轮进展：B 第一/二片已落地（2026-10-17）

- **B-0 主进程收窄（TASK-0295）**：main 改用 `main-resources.ts` 子集（ns 面 {main, common, settings, skills, pet}，正则枚举 + 单测锁定），主进程 bundle 省 ≈206 kB；renderer 未动。
- **B-1 主窗口语言级拆分（TASK-0296）**：zh（fallback/默认）静态同步不变；en（263 kB）改按需 lazy chunk——启动路径实测 **−262.8 kB**（4,382.5 → 4,119.7 kB），en 初值挂载前 await 装载、切换原子生效；`import.meta.env.TEST` 静态分支保 14 个同步测试文件零改动（产物审计证实生产摇树生效）。
- 剩余（B 完整形态，收益递减待评估）：按 ns 进一步拆分（如 zh/settings 104 kB 随设置路由懒加载）、en/settings 与 onboarding 共享 chunk 的装载收敛、onboarding 窗口自身只带用到的 key。触发条件不变：新语言加入或启动基线显示 i18n 占比再显眼时推进。
