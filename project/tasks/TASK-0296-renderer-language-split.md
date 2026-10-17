---
id: TASK-0296
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: ISSUE-0021
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: [TASK-0295]
related_issues: [ISSUE-0021]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: ea9d647b4
read_paths:
  - apps/desktop/src/shared/i18n/
  - apps/desktop/src/renderer/shared/i18n/
  - apps/desktop/src/renderer/onboarding/i18n.ts
  - apps/desktop/src/renderer/renderApp.tsx
write_paths:
  - apps/desktop/src/shared/i18n/zh-resources.ts
  - apps/desktop/src/shared/i18n/en-resources.ts
  - apps/desktop/src/renderer/shared/i18n/index.ts
  - apps/desktop/src/renderer/onboarding/i18n.ts
  - apps/desktop/src/renderer/renderApp.tsx
  - apps/desktop/src/renderer/shared/i18n/index.test.ts
exclusive_paths:
  - apps/desktop/src/shared/i18n/zh-resources.ts
  - apps/desktop/src/shared/i18n/en-resources.ts
  - apps/desktop/src/renderer/shared/i18n/index.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright by The Open Forge contributors. -->

# 主窗口 renderer 语言级拆分：en 按需单 chunk（ISSUE-0021 B 第二片）

## 目标

主窗口启动路径仍静态打包全部 505.4 kB locale（`resources.ts` 被 renderer i18n init 顶层 import，zh+en 全量入 brand-assets 共享 chunk）。本片做**语言级拆分**：zh（fallback/默认产品语言，254.3 kB）保持静态内联、同步 init、不闪不变；**en（263.2 kB）改为按需单 lazy chunk**——初值语言为 en 时挂载前 await 装载；切换到 en 时先装载再原子 changeLanguage。zh 用户（默认）永不加载 en chunk。

比按 ns 拆分（B 完整形态）风险面小一个量级：无逐 ns 装载状态、无 12 个 ns 的归属枚举、fallback 语义天然完整（zh 恒在）。

## 方案

- 新增 `shared/i18n/zh-resources.ts`（12 ns 静态）与 `shared/i18n/en-resources.ts`（12 ns 静态，**仅被动态 import**）。
- `renderer/shared/i18n/index.ts`：init 只带 zh；`initI18n()` 返回 `Promise<void> | undefined`——zh 同步（返回 undefined），en 返回装载 Promise（装完再同步 init）；语言切换广播先 `ensureEn` 再 changeLanguage。
- **测试同步性保护**：`DEFAULT_LANGUAGE="en"` 使测试环境（无 bridge）走 en 路径；`import.meta.env.TEST` 分支用静态 en 资源保持 init 完全同步（该分支在生产构建被 Rollup 摇树，en 仍懒加载）——14 个同步调用 `initI18n()` 的测试文件零改动。
- `renderApp.tsx`：en 初值时 `void ready.then(mount)`，zh 保持同步挂载。
- `onboarding/i18n.ts`：改直连 `{zh,en}/settings.json`（独立入口窗口，自己的图；使 resources.ts 彻底退出主窗口共享 chunk）。
- `resources.ts` 保留（desktop-brand.test 等消费，不再进主窗口图）。

## 范围

### 并发评估

- 结论：不支持并行；serial，main 串行。

### 做

- 上述五文件改造 + 新增 loader 单测（同步性、en 装载后可取值、zh fallback）。
- `build:renderer` 产物复核：brand-assets chunk 缩小 ≈263 kB、出现独立 en lazy chunk 且不被静态引用。

### 不做

- 不做按 ns 拆分（后续 B 完整形态，需 route 级 ns 归属枚举 + 渲染门禁分析）。
- 不动 main 进程（TASK-0295 已收窄）与 quickpanel/pet/remote 入口（不引 resources）。
- 不改 `i18next.d.ts` 类型链路与 `NAMESPACES` 注册表。

## Given / When / Then

- Given：初值语言 zh，When：initI18n，Then：同步完成（返回 undefined），en chunk 不加载，t() 全 ns 可用。
- Given：初值语言 en（生产），When：initI18n，Then：返回 Promise，resolve 后 i18n 已初始化且 en 全 ns 可用，随后挂载——首帧即正确语言。
- Given：运行中切换 zh→en，When：广播到达，Then：先装载 en bundle 再 changeLanguage（原子，无中间半中文半英文态）。
- Given：测试环境（TEST=true）任意语言，When：initI18n，Then：同步完成（静态 en 分支）。

## 必须保持

- 「绝不暴露原始 key」：任何渲染时刻激活语言的 bundle 全量在场（zh 静态 / en 已 await）。
- zh 用户的启动路径零变化（同步 init、不闪）。
- 语言 SoT/切换流（ADR-0031）与 onboarding 窗口行为不变。

## 测试与验证

- 定向：新增 loader 单测 + 既有 initI18n 消费套件（14 文件）+ i18n 渲染门禁 + 渲染端代表套件（apps/desktop cwd）。
- 产物：`build:renderer` 后 chunk 审计（brand-assets 体积差 + en chunk 存在性与引用方式）。
- 质量检查：完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（TEST 分支摇树验证、装载原子性）；集成：pending；人工验收：真实启动/切换冒烟待用户（随 ISSUE-0021）；发布：未授权。

## 功能验收包

- zh 用户：无任何可见变化。en 用户：首帧正确语言（挂载前多一次本地 chunk 装载，量级 tens of ms）；切换到 en 原子生效。

## 交付记录

- 实际修改：新增 `shared/i18n/zh-resources.ts`（12 zh ns 静态）与 `shared/i18n/en-resources.ts`（12 en ns，仅动态 import）；`renderer/shared/i18n/index.ts` 重写（zh 同步 init；en 返回装载 Promise 装完再 init；切换先装载后原子 changeLanguage；TEST 分支静态 en 保持完全同步）；`renderApp.tsx` en 初值 await 后挂载；`onboarding/i18n.ts` 直连 settings.json；`resources.ts` 保留为注册事实源（头注释更新）；新增 loader 单测 1 例；三处补 Modified 声明头。
- 实际运行：loader 单测 + i18n 套件（main/desktop-brand/onboarding）21 例全绿；**渲染端全域 464 文件 2397 例全绿**（14 个 initI18n 消费文件零改动，TEST 同步分支生效）；完整 `bun run check` exit 0。
- 产物审计（build:renderer）：启动路径（renderApp+brand-assets）4,382.5 → **4,119.7 kB（−262.8 ≈ en 载荷 263.2）**；en 数据全部位于动态 chunk——`en-resources-*.js` 149.9 kB（11 个 en ns，仅出现在 renderApp 的动态 mapDeps）+ `settings-*.js` 105.1 kB（en/settings，与 onboarding 入口共享提升），均不在 index.html 静态引用；zh 全量在静态 import 链内（i18next init 时 `ns: NAMESPACES` 资源已在内存，无露 key 窗口）。
- 未运行及原因：真实 Desktop zh/en 启动与切换冒烟待用户（en 首帧多一次本地 chunk 装载，量级 tens of ms）；主进程 bundle 差值复核随 TASK-0295 口径。
- Worktree：未拆出（serial 切片）。
- 剩余风险：`import.meta.env.TEST` 分支依赖 Vite 摇树（已用产物审计证实 en 不在启动路径）；en/settings 与 onboarding 共享的 chunk 会在打开设置路由时装载 en settings 数据（105 kB，离启动路径，后续 B 完整形态或 onboarding 瘦身时收敛）。
