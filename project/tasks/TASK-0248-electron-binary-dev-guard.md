---
id: TASK-0248
type: task
status: verifying
priority: P2
owner: Desktop 开发体验
requirement:
plan:
source: 用户报告（2026-10-14）`dev:electron` 抛 `Electron failed to install correctly`；根因证据见 BUG-0102
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0102]
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 186c47e7c
read_paths: [apps/desktop/package.json, apps/desktop/vitest.config.ts, apps/desktop/scripts/run-dev-electron.mjs, apps/desktop/scripts/run-dev-electron.node-test.mjs, apps/desktop/scripts/ensure-workspace-install.mjs, apps/desktop/scripts/ensure-workspace-install.test.ts]
write_paths: [apps/desktop/package.json, apps/desktop/scripts/ensure-electron-binary.mjs, apps/desktop/scripts/ensure-electron-binary.d.mts, apps/desktop/scripts/ensure-electron-binary.test.ts, project/bugs/BUG-0102-electron-binary-install-incomplete.md, project/bugs/README.md, project/tasks/TASK-0248-electron-binary-dev-guard.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# dev:electron 启动前校验并自愈 Electron 二进制

## 目标

让 `dev:electron` 在 import electron 之前确认包内二进制完整（`path.txt` + `dist/<平台可执行文件>` + `dist/version` 与包版本一致）；缺失时复用 electron 包自带的 `install.js`（Bun 执行）补齐，仍不完整时以含可操作指引的错误退出，取代上游那句「删除 node_modules 重装」。

## 范围

### 并发评估

- 结论：不支持并发（单文件接线 + 一个新模块，无需拆分）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：无；`apps/desktop/package.json` 只在 `scripts.dev:electron` 一行做加法，TASK-0247 在途但该文件不在其 `write_paths`（它只读 desktop 版本号），写路径无交集
- Branch：main（沿用当前主检出）
- Worktree：未拆出；改动小且串行，main 直接实施
- 集成负责人：本 Task Owner
- 集成顺序：无并行批次，直接落 main

### 做

- 新增 `apps/desktop/scripts/ensure-electron-binary.mjs`：解析 electron 包目录、检查安装完整性、必要时运行包内 `install.js` 并复验；`ELECTRON_OVERRIDE_DIST_PATH` 视为用户接管（跳过）、`ELECTRON_SKIP_BINARY_DOWNLOAD` 直接给出原因。
- `apps/desktop/package.json` 的 `dev:electron` 在 `run-dev-electron.mjs` 之前插入该校验步骤。
- 新增 `apps/desktop/scripts/ensure-electron-binary.test.ts`，用临时目录夹具覆盖完整/缺 `path.txt`/缺可执行文件/版本不匹配/修复失败/环境变量接管六类路径。
- 回写 BUG-0102 与 `.github/release-notes/v0.1.3.md` 的「其他」。

### 不做

- 不改 `run-dev-electron.mjs` 的启动语义（端口等待、插件选择、环境变量注入、信号转发）。
- 不给 `start`、`test:e2e`、`verify:ui:*` 等其它入口接线（不在本次报告路径内）。
- 不新增依赖、不改 `bun install`/`ensure-workspace-install.mjs` 的指纹语义、不写死 electron 版本或镜像地址。
- 不启动真实 Desktop 实例做验收（长驻 dev 需单独授权）。

## Given / When / Then

- Given：electron 包内 `dist/` 残缺且无 `path.txt`，无 `ELECTRON_*` 环境变量覆盖。
- When：执行 `bun run dev:electron`（经新校验步骤）。
- Then：校验步骤先打印原因并运行包内 `install.js`（命中 `@electron/get` 缓存），复验通过后继续原启动流程；修复后仍不完整时以非零退出并打印「bun install.js 的手工命令 + ELECTRON_OVERRIDE_DIST_PATH/镜像变量」指引。
- Given：二进制完整。
- When：执行同一入口。
- Then：不做任何写入、不调用修复器，行为与改动前一致。

## 必须保持

- `dev:electron` 的启动顺序与语义：先 `build:dev-processes`，再等 renderer 端口，再 spawn Electron，信号（SIGINT/SIGTERM）继续转发给 Electron 子进程。
- 不改动、不删除任何用户或其它 Agent 在 `node_modules` 之外的文件；校验只写 electron 包内 `dist/` 与 `path.txt`（与官方 installer 相同）。
- 平台语义与 `install.js#getPlatformPath` 一致（win32 `electron.exe`、linux/freebsd/openbsd `electron`、darwin `Electron.app/Contents/MacOS/Electron`）。

## 测试与验证

- 定向测试：`bun ../../scripts/quality/run-vitest.mjs --run scripts/ensure-electron-binary.test.ts`（cwd `apps/desktop`）。
- 红路：临时移除包内 `path.txt` 后跑校验脚本，观察修复与放行；再验证「修复器不产出」时判负。
- 环境实测：修复后 `require("electron")` 返回 `dist/electron.exe` 路径（不改动启动长驻进程）。
- 质量检查：`bun run check:quick` 与完整 `bun run check`；`test:impact`（新增脚本文件与 package.json 接线）。

## 验收分层

- 工程验证：通过。定向 12/12；完整 check 的 types/guards/mobile-lint exit 0；环境实测三路（完整态静默、红路自愈、阻断路 exit 1 + 指引）均按预期，`require("electron")` 解析恢复。
- 技术评审：自审。
- 集成：main 串行，`integration_status: pending`。
- 人工功能验收：不适用（开发工具链；用户可在自己环境跑 `bun run dev` 复核）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：仓库根 `bun install` 完成后，`cd apps/desktop && bun run dev`。
- 操作步骤或 AI 任务输入：直接运行上述命令；二进制缺失场景可手工删除 electron 包内 `path.txt` 复现。
- 预期行为与最终产物：dev 正常起 Electron；缺失场景先自愈再启动，失败时打印可操作指引而非上游通用文案。
- 不通过表现与已知限制：自愈需要网络（缓存未命中时下载数百 MB）；`start`/e2e 入口未覆盖。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - 新增 `apps/desktop/scripts/ensure-electron-binary.mjs`：解析 electron 包目录 → 校验 `path.txt` + `dist/<平台可执行文件>` + `dist/version` → 缺失时以 Bun 运行包内官方 `install.js` → 复验；`ELECTRON_OVERRIDE_DIST_PATH` 视为用户接管跳过，`ELECTRON_SKIP_BINARY_DOWNLOAD` 直接给出原因，修复后仍不完整时抛出含手工命令与镜像/覆盖变量提示的错误。
  - 新增 `apps/desktop/scripts/ensure-electron-binary.d.mts`（desktop `tsc` 对 `.mjs` 的声明面，与既有 `ensure-workspace-install.d.mts` 同形）与 `apps/desktop/scripts/ensure-electron-binary.test.ts`（12 例）。
  - `apps/desktop/package.json#scripts.dev:electron` 插入 `bun scripts/ensure-electron-binary.mjs`（`build:dev-processes` 之后、`run-dev-electron.mjs` 之前）。
  - `project/bugs/BUG-0102-*.md`、`project/bugs/README.md`、`project/tasks/README.md`、`.github/release-notes/v0.1.3.md`（「其他」一行）。
  - 未改动 `run-dev-electron.mjs` 启动语义、未新增依赖、未改 `bun.lock`、未动他人 `scripts/quality/check-version-lines.mjs` 等在途改动。
- 实际运行：
  - 定向：`bun ../../scripts/quality/run-vitest.mjs --run scripts/ensure-electron-binary.test.ts`（cwd `apps/desktop`）→ 12/12 通过。
  - 环境实测（Windows x64、Bun 1.4.2、electron 39.8.10）：
    - 完整态：`bun scripts/ensure-electron-binary.mjs` 无输出、exit 0；`bun -e "require('electron')"` 返回 `...\electron\dist\electron.exe`（原崩溃点已通）。
    - 红路：删除包内 `path.txt` → 脚本打印「Electron 二进制不完整（包内 path.txt 缺失（postinstall 未完成））」并调用 `install.js`，exit 0；复验 `path.txt` 出现、`require("electron")` 恢复。
    - 阻断路：删除 `path.txt` 且 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` → exit 1 并提示「取消该变量后重试」；取消变量后同命令修复成功 exit 0。
  - 完整 `bun run check`：`types`/`guards`/`mobile-lint` exit 0（首次 `types` 红为本任务缺 `.d.mts`，补后 `bun run --cwd apps/desktop typecheck:incremental` EXIT=0）；`lint` 唯一红是 `scripts/quality/check-version-lines.mjs` 的 Biome 格式，属 TASK-0247 在途未提交改动，本任务文件不在 `biome.json#files.includes` 面内。
  - `bun run test:impact -- apps/desktop/scripts/ensure-electron-binary.mjs apps/desktop/scripts/ensure-electron-binary.test.ts apps/desktop/package.json`：desktop 包 932 文件 / 4972 例 → 923 文件通过、1 例失败、4 套件收集失败。两类红均为 main 既有：4 套件命中 `window-manager.ts:25` `process.resourcesPath` 在 Node 下 undefined（BUG-0086/0092/0093/0094/0098/0099 与 TASK-0225/0226/0228/0229 已反复记录的已提交问题）；1 例是 `plugin-official-models.test.ts` 仍断言 `Open Forge Go`，而默认品牌档案已按 REQ-0011/TASK-0224 切到 `Allstr ai Go`。本任务新增用例在该轮中通过，未新增 skip。
- 未运行及原因：未启动真实 Desktop / 长驻 `bun run dev`（需单独授权，验证止于 `require("electron")` 可解析）；未跑 `test:e2e`、打包与发布；未在 macOS/Linux 复验平台映射（以 `install.js#getPlatformPath` 同构映射加单测覆盖）。
- Worktree：未拆出；serial，写路径与在途 TASK-0247 无交集，main 直接实施。
- 剩余风险：
  - 解压为何提前结束的触发机制仍未定位（BUG-0102 记为待确认）；本改动只保证「不完整 → 自愈或明确报错」，不阻止再次发生。
  - 自愈需要网络：缓存未命中时会重新下载约 130 MB；离线且无缓存时仍失败，但错误文本已给出 `ELECTRON_MIRROR` / `ELECTRON_OVERRIDE_DIST_PATH` 两条出路。
  - `start`、`test:e2e`、`verify:ui:*` 等其它 electron 入口未接线，仍会以上游原始文案失败（见「不做」）。

