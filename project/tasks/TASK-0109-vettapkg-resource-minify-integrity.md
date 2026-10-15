---
id: TASK-0109
type: task
status: done
priority: P2
owner: packages/plugins
requirement: []
plan: PLAN-0010
source: RESEARCH-0013 S7（VS Code 内置扩展资源 minify + marketplace sha256 钉死对照 `.vettapkg` 现状）
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [packages/plugins/, apps/desktop/scripts/build-presets.mjs, packages/skill-presets/]
write_paths: [packages/plugins/, apps/desktop/scripts/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# `.vettapkg` 资源 minify 与内置扩展 sha256 钉死

## 目标

VS Code 对内置扩展做两类体积/完整性处理：JSON/`.code-snippets` 等资源构建期去空白注释（`build/lib/extensions.ts:33-48`）、marketplace 扩展在 `product.json` 里 `version`+`sha256` 钉死（`product.json:40+`）。Open Forge 的 `.vettapkg` 由 plugin-vite 打 zip、preset 集按租户/profile 选——结构已类似，缺的是**包内 JSON 资源 minify** 与**内置集完整性指纹**两条。

## 范围

### 并发评估

- 结论：支持并行——写面在 `packages/plugins`/`apps/desktop/scripts`，与其他任务零交集。
- 执行方式：可独立 Worktree 并行。
- 可并行 Task：本批全部。
- 前置依赖：无。
- 冲突文件/独占路径：无。
- Branch：独立 task 分支。
- Worktree：按 workflow 派工。
- 集成负责人：Coordinator。
- 集成顺序：任意。

### 做

- plugin-vite 打包阶段对 `.vettapkg` 内 JSON/类 JSON 资源（manifest、i18n catalog、`.code-snippets`、schema 等）做去空白 minify——只处理**包内产物**，不改源文件；
- 内置 preset/插件集在打包清单中记录 `sha256`（与版本号一起），安装/加载侧校验指纹，不匹配即拒绝并给出可诊断错误；
- 校验链路接入既有 `check-plugin-marketplace-publication.mjs` 或 stage 脚本。

### 不做

- 不改 `.vettapkg` 包格式版本与安装协议（minify 是内容层优化，指纹是元数据层增强，均向后兼容）；
- 不做 marketplace 服务端工作（lite 版无远端，指纹钉在打包产物内）；
- 不动 skill-presets 的内容语义，只动打包形态。

## Given / When / Then

- Given：一次正常插件打包 + 安装流程；
- When：构建产出 `.vettapkg`；
- Then：包内 JSON 体积下降（交付记录附 diff），清单含 sha256；篡改包内任一文件后安装被拒并报指纹不匹配。

## 必须保持

- 已安装插件不受影响（指纹只校验新装/更新路径）；
- minify 不破坏 JSON 语义（注释、空白可去，键值不变）；
- `PLUGIN_API_VERSION` 兼容面不变（见 `apps/desktop/AGENTS.md` 插件合同提示）。

## 测试与验证

- 定向测试：minify 函数单测、指纹生成/校验单测、篡改拒绝用例；
- 用户流程：构建一个 `.vettapkg` → 安装 → 篡改再装 → 验证拒绝；
- 质量检查：`bun run test:pkg plugins`、`bun run check:quick`。

## 交付记录

- 实际修改：
  - `packages/plugins/plugin-vite/src/pack-resource-minify.ts`（新增）：包内 JSON / `.code-snippets`
    资源的去空白纯函数；非严格 JSON、已更小的内容原样返回。
  - `packages/plugins/plugin-vite/src/pack.ts`：`createZip` 写条目时应用去空白（CRC 按最终字节），
    源文件不动。
  - `apps/desktop/scripts/plugins-integrity-manifest.mjs`（新增）：内置插件集完整性清单格式
    （`version` + 每项 `id`/`version`/`archive`/`sha256`/`manifestSha256`）、读写、
    归档指纹校验、staging 侧 plugin.json 指纹校验、清单子集选择。
  - `apps/desktop/scripts/build-presets.mjs`：产出归档后写入
    `packages/plugins/presets/release/system-plugins.manifest.json`（gitignored 构建产物），
    再交给 staging。
  - `apps/desktop/scripts/stage-system-plugins.mjs`：解包前按清单校验归档 sha256 与版本，
    清单缺失/版本漂移/指纹不符一律拒绝并给出修复指引；staging 结束后把清单副本写进
    `<system-plugins>/system-plugins.manifest.json`。
  - `apps/desktop/src/main/plugins/system-plugin-integrity.ts`（新增）：加载侧读清单副本，
    只比对 `plugin.json` 摘要（不散列整棵插件目录，启动开销恒定）。
  - `apps/desktop/src/main/plugins/plugin-system-catalog.ts`：发现插件时先过完整性校验，
    不通过则跳过并 warn，其他插件照常加载；未登记的插件（开发链接、旧 staging）行为不变。
  - 测试：`plugin-vite/test/pack-resource-minify.test.ts`（4 例）、`plugin-vite/test/pack.test.ts`
    新增归档级去空白与源文件不变断言、`plugin-system-catalog.test.ts` 新增两例
    （篡改拒绝、版本漂移拒绝 + 未登记插件照常加载）、
    `apps/desktop/scripts/plugins-integrity-manifest.node-test.mjs`（5 例）。
  - 接线：`test:packaging`、`desktop-packaged` 合同作业纳入新测试；
    `.github/release-notes/v0.1.1.md` 用户可见条目。
- 实际运行：
  - `bun run --cwd packages/plugins/plugin-vite test` → 13 文件 / 46 例通过。
  - `bun run --cwd apps/desktop test src/main/plugins/plugin-system-catalog.test.ts` → 6/6 通过。
  - `node --test apps/desktop/scripts/plugins-integrity-manifest.node-test.mjs` → 5/5 通过。
  - `bun run check:quick -- <本次改动文件>`。
- 未运行及原因：
  - 未跑 `bun run build:presets`（会触发 17 个预置插件的 vite 构建与 `bun install
    --frozen-lockfile`，属长时构建）；因此「包内 JSON 体积 diff」以单元/集成测试的字节断言
    为准，真实归档 diff 留给 CI 的 packed smoke 与 release 构建。
  - 未运行 `verify:ui:*`（无 UI 行为变化，且用户未授权）。
- 必须保持项的复核：`.vettapkg` 包格式与安装协议未改（仍是无压缩 zip，条目内容更小而已）；
  `PLUGIN_API_VERSION` 兼容面未动；已安装的用户插件不受影响（指纹只作用于内置集 staging 与
  加载路径，未登记插件行为不变）。
- Worktree：主工作区（`branch: main`）。
- 剩余风险：
  - 归档仍是无压缩 zip：本次只做内容层去空白，未引入 deflate（那会改动归档压缩方法，
    超出本 Task 的「不改包格式」边界）。
  - 指纹锚点与被校验对象同目录分发，能挡住内容漂移与误替换，但不是防篡改分发的
    完整方案（远端市场的 sha256 校验链路本就独立存在，未改动）。
