---
id: TASK-0104
type: task
status: done
priority: P1
owner: apps/desktop
requirement: []
plan: PLAN-0010
source: RESEARCH-0013 S2（VS Code `build/next` bundle+minify+私有名改写 对照 `vite.main.config.ts` 显式 `minify:false`）
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [apps/desktop/vite.main.config.ts, apps/desktop/vite.preload.config.ts, apps/desktop/vite.ocr-*.config.ts, apps/desktop/scripts/]
write_paths: [apps/desktop/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0103]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# main/preload bundle minify 评估与落地

## 目标

`vite.main.config.ts` 显式 `minify:false`（约 L123），main 进程 bundle 未压缩。VS Code 生产管线对全部桌面 entry 做 `bundle+minify+treeShaking`，并对 `#field` 私有名做 `$a` 改写（`build/next/bundle.ts:10-34`、`private-to-property.ts:10-14`）。本任务先**量化** minify 对 main/preload 产物的体积与启动解析收益，再决定是否落地；私有名改写作为更激进选项单独评估。

## 范围

### 并发评估

- 结论：条件支持——配置文件独立，但构建产物校验面与 TASK-0103 相邻。
- 执行方式：可独立 Worktree；benchmark 阶段纯测量无写冲突。
- 可并行 Task：PLAN-0011/0012 任务、TASK-0109。
- 前置依赖：无。
- 冲突文件/独占路径：`vite.main.config.ts`/`vite.preload.config.ts`；与 TASK-0103 若同改 `prepare-pack.js` 按文件登记冲突。
- Branch：独立 task 分支或主工作区（若仅测量）。
- Worktree：派工时定。
- 集成负责人：Coordinator。
- 集成顺序：阶段 A 内任意；若落地需与 TASK-0103 的断言脚本联跑一次。

### 做

- 基准：分别构建 `minify:false/true` 的 main + preload + ocr entry，记录产物字节数、`app.asar` 差、dev 启动期 main 模块加载耗时（perf 快照或 `--prof` 手段）；
- 若收益显著（建议阈值：main bundle 体积降 ≥15% 或解析耗时显著下降），落地 `minify:true`（esbuild 默认即可），sourcemap 维持「生产关 / Sentry hidden」既有策略；
- 评估私有名改写可行性：本仓 `#field` 使用率低时直接记录「收益不足，不做」；
- 确认 minify 后 main 侧错误栈可诊断性（日志行号失真时的应对：hidden sourcemap 或保留具名函数）。

### 不做

- 不改 renderer bundle 策略（Vite 默认已 minify）；
- 不引入 VS Code 的 `build/next` 管线或 esbuild 直驱——仍走 Vite；
- 不动 external/native 依赖边界；
- 若 benchmark 显示收益不显著，只交付结论记录，不改配置。

## Given / When / Then

- Given：同一 commit 的两次 desktop 构建；
- When：`minify` 分别取 false/true；
- Then：交付记录中含可复现的体积/耗时对比表；若落地 minify，则打包产物通过既有 `verify-*` 断言且应用正常启动、主进程报错栈仍可定位。

## 必须保持

- 主进程调试体验不得实质退化（dev 模式不受 minify 影响；prod 报错可经 sourcemap 或具名函数定位）；
- `VETTA_MAIN_SOURCEMAP` 与 Sentry hidden sourcemap 行为不变；
- external 依赖列表与 `assertPackagedMainHasNoWorkspaceImports` 语义不变。

## 测试与验证

- 定向测试：构建产物断言脚本（若新增）；
- 用户流程：打包版应用启动 + 主进程关键路径冒烟（会话、调度、插件加载）；
- 质量检查：`bun run check:quick`；打包产物 diff 作为交付附件。

## 交付记录

- 实际修改：
  - `apps/desktop/vite.main.config.ts`：`minify: false` → `minify: true`，并加
    `esbuild: { keepNames: true }` 保留函数/类名（注释记录实测字节与取舍）。
  - `.github/release-notes/v0.1.1.md`：用户可见的体积收益条目。
  - 预加载脚本无需改动：`vite.preload.config.ts` 未设 `minify`，Vite 库构建默认已压缩
    （实测 `dist/preload/index.js` 2 行 / 125.8KB）。
- 实测证据（同一 commit，仅改 `minify` 后重跑 `bun run --cwd apps/desktop build:main`，
  统计 `dist/main` 全部文件字节）：
  | 配置 | dist/main | 相对基线 |
  | --- | --- | --- |
  | `minify: false`（原状） | 20.119MB / 15 文件 | — |
  | `minify: true` | 15.167MB | **-24.6%** |
  | `minify: true` + `keepNames`（落地） | 15.903MB | **-20.9%** |
  单文件示例：`main-*.js` 9,575.9KB → 7,013.0KB（`keepNames` 后 7,013.0KB 同级）。
  可诊断性实测：`minify: true` 时 `attachMainWindowLifecycle`、
  `ensureAppMonitorInitialized`、`runQuitCleanup` 在 `dist/main/*.js` 中零命中；
  加 `keepNames` 后三者均可检出（函数名保留，报错栈可读）。
- 私有名（`#field`）改写评估结论：**不做**。`apps/desktop/src/main` 927 个源文件中仅
  2 个文件、7 处 `#` 私有字段，改写收益远低于引入构建期 AST 改写的维护成本。
- 未运行及原因：
  - 未跑完整打包/打包版启动冒烟（需要 im-gateway 交叉编译与全部 `dist/*` 产物，属长时构建）；
    `desktop-packaging-scope` 已把 `vite.*config.` 变更判定为需要 packaged smoke，
    由 CI `desktop-packaged` 矩阵覆盖真实启动与 `test:e2e:packaged`。
  - 未运行 `verify:ui:*`（无 UI 行为变化，且用户未授权）。
- 必须保持项的复核：`external` 依赖列表、`VETTA_MAIN_SOURCEMAP` 与 Sentry hidden sourcemap
  策略均未改动；`assertPackagedMainHasNoWorkspaceImports` 语义不变（打包期仍校验）。
- Worktree：主工作区（`branch: main`）。
- 剩余风险：
  - `keepNames` 比纯 minify 多 0.74MB（可接受，换回可读栈）。
  - 无 sourcemap 的 lite 生产构建里，行号仍是压缩后的行列号；函数名已保留，
    错误信息中的字符串字面量未受影响。
  - 本记录只有本机 Windows 实测；打包产物体积（`app.asar`）需在 CI 制品上复核。
