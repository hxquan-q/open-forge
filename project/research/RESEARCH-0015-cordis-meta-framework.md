---
id: RESEARCH-0015
type: research
status: done
priority: P2
owner: packages/plugins
source: 用户请求调研 https://github.com/cordiverse/cordis
created: 2026-09-26
updated: 2026-09-26
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Cordis 元框架调研（cordiverse/cordis）

## 问题与范围

调研 Cordis v4（npm `cordis@4.0.0-rc.10`）是什么、其架构模型如何实现、谁在使用、对 OpenVetta 插件与 runtime 架构有哪些可借鉴机制。范围为公开仓库源码、包元数据、论文与文档通读；未克隆构建、未运行其测试、不评估是否在本仓引入。

## 事实来源

- 仓库 [`cordiverse/cordis`](https://github.com/cordiverse/cordis)：8.8k stars / 548 forks / 571 commits / Issues 10 / PR 55；最近提交 2026-09-08，基本为单一作者 Shigma（签名提交）。
- `packages/core/src/` 共 9 个文件约 63KB：`context.ts`、`events.ts`、`fiber.ts`、`logger.ts`、`reflect.ts`、`registry.ts`、`service.ts`、`utils.ts`、`index.ts`；测试在 `packages/core/tests/`（associate / decorator / dispose / events / fiber / invoke / isolate / logger / plugin / reflect 等 spec，vitest）。
- npm：`cordis` dist-tags `latest=4.0.0-rc.10`、`next=4.0.0-beta.5`；v1 时代仓库是 `shigma/cordis`，description 为 "Infrastructure for Modern JavaScript Frameworks"（即 Koishi 底层框架独立化产物）。
- 论文 [arXiv:2608.25512]《A Programming Paradigm for Spatiotemporal Composability》，作者 Yifan Shi（北大 + DeepSeek-AI）、Wei Zhang、Tianyi Cui，92 页，2026-08-26 投稿。
- [DeepSeek Harness 文档站 cordis-primer](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer)：Cordis 被 DeepSeek Harness（一个 coding-agent harness）以 vendor 方式作为底层插件框架，并有配套 Cordis API 参考页；README 中官方文档仍在建设中，暂时链到这里。
- Koishi `@koishijs/core@4.18.11` 依赖 `cordis@^3.18.1`：Koishi 生态仍停留在 v3 线。

## 当前结论

### 定位

Cordis 是一个「元框架」：不提供业务能力，只提供**插件生命周期 + 服务容器 + 事件总线**三件套，宿主框架（Koishi、DeepSeek Harness）在其上定义自己的服务与事件。v4 是配合论文的重写，自称 "Meta-Framework of Spatiotemporal Composability"，README 明示 API 未稳定。纯 ESM、MIT、运行时依赖仅 `cosmokit` + `@standard-schema/spec`，体积极小。

### 理论模型（论文 → 实现的映射）

- **时间可组合性 = revertible effects**：每个 effect 注册时返回一个 disposer（逆操作），运行时持有它；组件移除/重载时逆序回放。对应 `ctx.effect()` / `ctx.on()` / `ctx.provide()` 全部返回 disposer。
- **空间可组合性 = reactive coeffects**：组件声明 `inject` 依赖，运行时按依赖满足情况驱动激活/失活。对应 `Fiber` 的 PENDING/ACTIVE 状态机。
- **Context paradigm**：effect 上下文与 coeffect 上下文合并为单一 `Context` 对象，一切副作用与依赖经它中介，组件间效应交错而互不干扰。

### 核心机制（源码层事实）

- **`Context` 是 Proxy**（`reflect.ts` 的 `ReflectService.handler`）。`ctx.extend()` 建原型链子上下文；`ctx.isolate(name)` 用 symbol key 遮蔽服务名，实现同名服务的命名空间隔离；`ctx.intercept(name, config)` 在原型链上叠配置层，供 `Service.resolveConfig` 合并。
- **`Fiber` = 插件的运行时实例**（v3 中称 scope）。`ctx.plugin(plugin, config)` 返回 `Fiber & PromiseLike<Fiber>`；状态机 `PENDING → LOADING → ACTIVE` / `FAILED` / `UNLOADING` / `DISPOSED`。effect 支持四种形态：disposer 函数、同步 iterable（generator 可 `yield` 多个 disposer）、`Promise<disposer>`、async iterable。
- **依赖驱动激活**：`inject` 未满足时 fiber 停在 PENDING；服务注册/注销经 `reflect.notify()` → 各 fiber `_checkImpl()` → epoch（由依赖 provider 的 fiber uid 拼成）变化 → `_unload()`/`_reload()`。即**服务上下线会让依赖方整体自动重启**，这是 reactive coeffect 的落地，也是配置热更新与 HMR 的基础。
- **访问控制内建于 Proxy**：读未声明 `inject` 的服务属性 → 走 `internal/get` waterfall 后抛 `cannot get property "x" without inject`；写未 `provide` 的属性 → 抛错。依赖声明是强制纪律而非约定。
- **`RegistryService`**：插件三形态——函数 / 构造器 / `{ apply(ctx, config) }` 对象；`plugin.Config` 是 [Standard Schema](https://standardschema.dev)（`~standard.validate`，仅同步），失败抛 `ValidationError`；`fiber.update(config)` 走 `internal/update` waterfall 再 restart，允许监听器否决。
- **`EventsService`**：五种分发模式 `emit`（观察）/ `waterfall`（环绕中间件，`next()` 委托，可短路）/ `parallel` / `serial` / `bail`，模式是事件合同的一部分；`ctx.on` 本身是 effect，随 fiber dispose 自动注销；`internal/*` 事件（listener/update/service/get/set/plugin/status/dispatch）是官方扩展钩子，loader、include 等都挂在这里。
- **`Service` 基类**：构造时 `reflect.provide(name, this)`；`Service.invoke` 支持可调用服务；`static provide`/`inject`/`Config` 静态声明；`@Inject` 装饰器可挂在类或方法上。

### monorepo 包清单（`packages/*`）

| 包 | npm 名 / 版本 | 职责 |
|---|---|---|
| `core` | `cordis@4.0.0-rc.10` | 上述内核 |
| `loader` | `@cordisjs/plugin-loader@1.0.0-rc.7` | Entry/EntryTree 声明式插件树、配置持久化桥（`commit` 钩子）、`loader/*` 事件、entry 级 disabled/inject 元数据 |
| `include` | `@cordisjs/plugin-include@1.1.0` | YAML 配置加载，`!!js` 表达式节点，按 inject 激活条件插值条目 config/disabled |
| `group` | `@cordisjs/plugin-group@1.0.0` | 插件分组配置 |
| `hmr` | `@cordisjs/plugin-hmr@1.1.0` | chokidar 监听 + 模块热替换（依赖 timer），最近加 `hmr.watch()` |
| `timer` | `@cordisjs/plugin-timer@1.1.3` | setTimeout/setInterval 包装为 effect，随 fiber 自动清理 |
| `logger-console` | `@cordisjs/plugin-logger-console@1.0.0` | console 输出，node/browser 双条件入口 |
| `create` | `create-cordis@0.3.0` | 脚手架 CLI（Node ≥22） |
| `utils` | `@cordisjs/utils`（private） | 内部工具 |

### 生态与采用

- 源自 Koishi（聊天机器人框架），v1–v3 以 `shigma/cordis` 发布；Koishi 目前仍依赖 v3，v4 生态尚未跟进。
- DeepSeek Harness 已 vendor Cordis 作 agent harness 插件框架——Cordis 实际进入了 coding-agent harness 场景，与本仓产品形态同构。
- 工程面：yarn4 + yakumo 工具链 monorepo；issue/PR 很少，实质单作者项目；API 自述不稳定，anchor 到 rc 版本有迁移成本。

### 对 OpenVetta 的可借鉴点（机制对照，非引入建议）

- `ctx.effect()` 统一「注册即附带 disposer」模型，可对照本仓插件/能力的资源清理与热切换语义；
- `inject` 声明驱动的反应式激活，把插件加载顺序从手动编排变为依赖求解，并提供「依赖下线 → 自动失活」语义；
- `internal/*` 事件作为框架自身扩展钩子，宿主行为（更新、取属性、插件增删）均可被监听/否决；
- `isolate`/`intercept` 提供服务命名空间遮蔽与配置分层，可用于多会话/多 Agent 场景的服务隔离；
- loader 的 Entry/EntryTree + include 表达式 ≈ 可持久化的声明式插件配置树，与本仓插件清单/启用状态的持久化设计可互相对照。

## 被否决的方案与原因

本次为纯外部调研，不涉及本仓改动，无被否决的实现方案。明确不展开的两条：(1) 不评估在本仓直接引入 cordis——v4 仍在 rc、API 明示不稳定、生态工具链（yakumo/schemastery）与本仓不同；(2) 不深入 v3↔v4 API 迁移细节——本仓无存量 cordis 依赖，无迁移对象。

## 代码/测试/指标锚点

- `packages/core/src/context.ts`：`extend`/`isolate`/`intercept`、Proxy 构造；
- `packages/core/src/fiber.ts`：`FiberState` 枚举、`effect()` 四种形态、`_setEpoch`/`_reload`/`_unload`、`update()` → `internal/update` waterfall；
- `packages/core/src/reflect.ts`：Proxy handler、`provide`/`notify`、`accessor`/`mixin`、`internal/get|set`；
- `packages/core/src/registry.ts`：`Plugin` 三形态、`Inject` 装饰器、`resolveConfig`（Standard Schema）；
- `packages/core/src/events.ts`：五种分发模式、`internal/*` 事件清单；
- `packages/loader/src/index.ts`：`Loader` 服务、entry 生命周期、`internal/update`/`internal/plugin` 钩子用法示例；
- 指标：core src ≈63KB/9 文件；tests ≈13 个 spec；571 commits；npm latest `4.0.0-rc.10`。

## 失效条件与置信度

- 机制描述置信度高（直接读 main 分支源码）；性能、内存、生产可靠性置信度低（未实测、未跑基准）。
- v4 处于 rc，论文术语与实现命名（fiber/epoch/inertia）可能随版本漂移；引用具体 API 前须按当时版本源码复核。
- npm `latest` 指向 rc 版；本调研锚定 commit `main@2026-09-08` 附近快照。

## 下一步触发信号

- cordis 发布 4.0.0 正式版、或 Koishi 升级 v4、或 DeepSeek Harness 的 cordis vendor 实践公开更多资料时，值得重评借鉴清单；
- 本仓若出现「插件热加载」「插件间依赖排序」「多会话服务隔离」的真实痛点，回到本文机制对照节做定向深挖；
- 若决定引入或深度对标，需先立新 Plan 评估 ESM-only、Standard Schema 配置模型与本仓 `packages/plugins` SDK 合同的兼容性。
