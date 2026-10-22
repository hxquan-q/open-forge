# 质量门禁（Quality Gates）

本仓库**没有**照搬 OpenClaw 的 oxlint/pnpm/巨型 CI 矩阵。在现有 **Bun + Turborepo + Biome + tsgo + Vitest + husky** 之上，补了分层门禁、按包/按变更测试与轻量架构守卫；Desktop `verify:ui` 是用户明确要求时才运行的按需验收工具，不属于默认门禁。

## 统一开发入口与验证职责

[open-forge-task-intake](../../.agents/skills/open-forge-task-intake/SKILL.md) 根据任务选择下面的既有门禁，不增设平行测试框架。TDD/测试设计见 [open-forge-testing](../../.agents/skills/open-forge-testing/SKILL.md)，CI/CD 配置改动见 [流水线路线](../../.agents/skills/open-forge-task-intake/references/ci-cd.md)。

`node scripts/quality/workflow-skills.mjs` 已接入 `check:guards`：校验两个权威 Skill 的出向链接、已退役名称/Devin 副本残留，以及根 AGENTS、project/ 和 docs/dev/ 中指向这两个 Skill 的入向 Markdown 文件链接。支持内联链接 title，忽略围栏/缩进代码块与行内代码；不是完整 CommonMark、网络 URL 或标题锚点验证器，也不证明模型路由行为。

Claude 的 `.claude/skills` 是共享入口而非生成镜像：真实目录必须解析到 `.agents/skills`；Windows Git 正确的符号链接占位文件被识别为平台状态，门禁继续验证权威正文并提示 Claude 路径未就绪。开发者需开启 `core.symlinks`/Windows 开发者模式后安全重新检出，工具不会改 Git 配置、替换占位文件或在其中建目录。错误目标仍失败。用户已授权移除 Devin 镜像；脚本完全只读，旧 `--write` 参数报明确错误，不创建副本或修改配置。重新出现的这两个项目 Skill 的 Devin 副本会报错，但不会被检查脚本自动删除。仅支持 `.devin` 的旧环境需改为读取 `.agents`。

frontmatter 全量检查显式扫描 `.agents` 和 `.devin`，不依赖遍历 Claude 符号链接或 staged 文件。上述回归由既有 `test:quality`/quality CI 执行，不另建 workflow 或扩大发布权限。

`node scripts/quality/check-agent-guide.mjs` 同样进入 `check:guards`：根 AGENTS 的 UTF-8 体积不得超过 8 KiB，必须指向六份按需规则扩展；CLAUDE 不得超过 4 KiB，必须回指根规则与其专属补充。检查这些入口与扩展的 Markdown 文件链接。该预算是本仓维护合同，不是对某个宿主加载上限的假设；检查不证明规则语义未变，迁移需另核对保留映射。

`node scripts/quality/check-glossary.mjs` 校验根 CONTEXT 的 12 KiB 预算、根索引与 `docs/glossary/` 词条的一一对应、分册唯一性及文件链接。根保留旧 `###` 标题用于定位，正文在分册，不在索引复制定义。该检查不审定历史词条是否仍反映当前实现。

## 门禁分层

| 层级 | 命令 | 何时跑 | 内容 |
|------|------|--------|------|
| 提交前（快） | `bun run check:precommit`（husky 自动） | 每次 commit | staged 私钥/冲突标记 + Biome `--staged --write`；格式化后重新暂存整文件 |
| 开发中（快） | `bun run check:quick` | 一轮编辑后 | 准确合并分支已提交差异、暂存、未暂存和未跟踪文件；对变更文件运行 Biome，并运行架构守卫；不做类型检查 |
| 完整本地/PR | `bun run check` | 一轮代码任务完成、交付或开 PR 前一次 | 对显式源码根运行 Biome，并行执行根 `tsgo`、CLI 显式 `tsgo`、增量 desktop `tsc`、docs check 与架构守卫；守卫还校验 Task/Plan 索引与活动并行写范围，并确认当前 Desktop 版本的 Release Notes 存在 |
| 构建声明消费 | `bun run check:types:build-surfaces` | workspace 前置声明生成后 | 按 `cli-host/tsconfig.build.json` 验证真实包声明消费；会拒绝陈旧 `dist/*.d.ts` |
| 质量脚本测试 | `bun run test:quality` | 修改 `scripts/quality` | 变更选择、依赖传播与包边界规则 |
| 单元测试 | `bun run test` / `bun run test:unit` | 逻辑变更 | 先由 Turbo 生成测试消费的 workspace 依赖产物，再顺序运行所有声明 `test` 的 TypeScript workspace |
| 按包 | `bun run test:pkg <name>` | 改单包 | 例：`test:pkg ai` |
| 按任务影响 | `bun run test:impact -- <file...>` | 日常实现与 Agent 任务 | 直接运行显式测试和 Vitest 依赖相关测试；高风险或不确定输入自动回退 `test:changed` |
| 按变更 | `bun run test:changed` | 提 PR 前可选 | 合并已提交/工作区/未跟踪改动，测试触达包及其下游依赖 |
| 按需 Desktop UI 验收 | `bun run verify:ui:*` | 仅用户明确要求使用 UI 验证或具体命令时 | 不由 UI、图标、样式或 Renderer/Main 改动自动触发；见 [README](./README.md) |
| Desktop 生产边界 | `bun run verify:desktop:contracts`；受影响时由 GitHub Actions 在 Windows/macOS/Linux 运行 packaged smoke 与 updater E2E | 修改 Desktop 主进程、preload、打包脚本、原生依赖或远程控制 | 见下文 |
| Task / Project 合同 | `bun run check` 与 `bun run worktree:check --all` | 日常静态门禁；并行批次派工/集成前显式门禁 | `check` 校验 README 索引状态、Task frontmatter 结构和未登记的活动并行 scope 冲突；Coordinator CLI 额外核对机器上的 Git Worktree、分支和实际漂移 |
| 死代码（可选） | `bun run deadcode:report` | 清理时 | Knip 报告，**默认不阻断** `check` |

## 新增脚本

```text
scripts/quality/
  lib.mjs                      共享工具
  precommit.mjs                快路径编排
  check-lint.mjs               显式源码根的全量 Biome 入口
  check-guards.mjs             并行全量守卫入口
  check-quick.mjs              按完整 Git 工作区差异做快速检查
  check-private-keys.mjs       私钥形态检测
  check-conflict-markers.mjs   未解决冲突标记
  check-package-boundaries.mjs 库/插件不得依赖 app 宿主
  check-context-boundaries.mjs 每模块 Context Boundary 声明与 internal_dependencies 白名单
  check-waivers.mjs            Policy 级豁免的字段完整性与到期检查
  check-protocol-suites.mjs    跨边界协议必须有 conformance 套件或受控豁免
  check-coding-agent-architecture.mjs
                               Coding Agent 当前架构依赖与公开面
  run-vitest.mjs               用 Node 启动 Vitest（Windows 上禁止 Bun 拉起 worker）
  check-vitest-runner.mjs      package.json 测试脚本必须走 run-vitest.mjs
  check-turbo-config.mjs       Turbo 输入、环境、入口与 Remote Cache 安全合同
  check-source-path-maps.mjs   根 tsconfig path map 必须显式覆盖 workspace 包的 types 子路径导出
  check-task-worktrees.mjs     Task ↔ Worktree 结构与活动并行范围合同
  check-project-indexes.mjs    Plan / Task 状态索引与 frontmatter 一致性
  test-pkg.mjs                 按包名跑 vitest
  test-impact.mjs              按任务文件选择直接测试与 Vitest 相关测试
  test-changed.mjs             按 git 变更和依赖图选包
  quality-gates.test.mjs       质量门禁与配置测试
  check-task-worktrees.test.mjs Task scope 门禁
  project-indexes.test.mjs     Project 状态索引门禁
scripts/worktree/              开发协作 Worktree 生命周期（不属产品运行时）
  cli.mjs                      create / status / check / remove / doctor
  contract.mjs                 Task ↔ Worktree 合同校验（守卫与 CLI 共用的事实源）
  config.mjs                   .worktreeconfig.json 与 .worktreeinclude（含凭据拒绝表）
  frontmatter.mjs              project/** frontmatter 的最小 YAML 子集读取
  git.mjs                      Git 适配与 worktree list --porcelain 解析
scripts/eval/                  开发期 Agent 评测旁路（不进默认门禁）
knip.config.ts                 Knip（可选）
```

## 根 package.json scripts

| Script | 说明 |
|--------|------|
| `build` / `build:all` | 由 Turborepo 按 workspace manifest 构建库或完整 Desktop 依赖图；Preset 仍走专用制品流程 |
| `build:desktop` / `build:cli` / `build:docs` / `build:preset` | 构建指定产品或制品，依赖包由任务图自动补齐 |
| `check:lint` / `check:lint:fix` | 对显式源码根执行 Biome 只读检查 / 写回，避免扫描无关目录 |
| `check:types` | 并行执行根 `tsgo`、CLI 显式 `tsgo`、通过当前 Bun（`bun x tsc`）执行带持久增量缓存的 desktop `tsc`、docs check 与 Expo Mobile `tsc` |
| `check:types:build-surfaces` | 使用 CLI build config 验证上游 workspace `dist/*.d.ts` 的真实消费面；要求先生成当前声明 |
| `check:guards` | 并行执行私钥、冲突标记、包边界、Task/Project 索引与并行范围合同、当前版本 Release Notes 存在性等全量守卫 |
| `check:staged` | 仅 staged Biome |
| `check:precommit` | husky 使用的快路径 |
| `check:quick` | 变更文件 Biome + 全量 guards；Biome 配置变化时自动回退全量 Biome |
| `check` | 并行 lint + types + guards + Expo Mobile lint（只读） |
| `fix` | Biome 全量格式化与安全修复 |
| `vitest` | 用 Node 启动仓库 Vitest；等价于 `bun scripts/quality/run-vitest.mjs` |
| `test:quality` | 质量脚本定向测试 |
| `test` / `test:unit` | 从 workspace manifest 自动发现并顺序运行所有声明 `test` 的包 |
| `test:pkg` | 见 `bun run test:pkg --list` |
| `test:impact` | 显式任务文件走精确测试；公共合同、删除和配置变化自动回退 `test:changed` |
| `test:changed` | 默认比较 `origin/dev`；`--base origin/main` 可改基线 |
| `task:worktree` / `worktree:*` | Task Worktree 生命周期：`create` / `status` / `check` / `remove` / `doctor`；合同见 [`project/collaboration/README.md`](../../project/collaboration/README.md) |
| `eval:agent` | 开发期 Agent 评测旁路；默认只跑无网络 harness，`OPENFORGE_EVAL=1` 才用 DeepSeek 跑 DeepEval + Promptfoo + MASEval |
| `deadcode` / `deadcode:report` | Knip 严格 / 仅报告 |

### 单测覆盖率（可选，不进门禁）

根依赖 `@vitest/coverage-v8`（与 `vitest` 4.x 对齐）。**默认 `test` / husky / `check` / CI 均不启用**覆盖率。

按需在包根执行：

```bash
bun run --cwd packages/coding-agent test:coverage
bun run --cwd apps/desktop test:coverage
```

- 报告目录：包内 `coverage/`（已 gitignore）；含 text / html / lcov
- 分母：`src/**/*.{ts,tsx}`（诚实全量；desktop 总百分比低是现状，不是配置错误）
- `reportOnFailure: true`：单测失败仍会出报告（coding-agent 在 Windows 上仍有已知基线失败）
- 不设全局 thresholds；不进 husky / `check` / CI；用户明确要求 UI 验收时使用 `verify:ui:*`
- `@vitest/coverage-v8` 主版本须与根 `vitest` 对齐（当前均为 4.1.x）

## Windows 上必须用 Node 跑 Vitest

Vitest 4 默认 `pool: "forks"`。用 Bun 在 Windows 上拉起 worker 时，`import.meta.url` 经常被编成非法 `file://`（例如 `file://C:/...` 而不是 `file:///C:/...`），于是每个分片在收集测试前就报 `File URL path must be an absolute path`。换成 `threads` / `vmThreads` 会改报 `port.addListener is not a function`。

统一入口：

```bash
bun scripts/quality/run-vitest.mjs --run <test-file>
bun run vitest --run <test-file>
bun run test:pkg <name>
```

包装器会查找 Node 20+（可用 `VETTA_TEST_NODE` 指定 `node.exe`），再执行仓库里的 `node_modules/vitest/vitest.mjs`。在提供 `--no-experimental-webstorage` 的 Node 版本上，包装器会通过 `NODE_OPTIONS` 关闭 Node 原生 Web Storage，使 happy-dom / jsdom 能正常注入测试所需的 `localStorage`。不要使用 `bunx vitest`、`npx vitest` 或包脚本里的裸 `vitest`。`check-vitest-runner.mjs` 会扫描 workspace `package.json`，拒绝这些入口并阻止 Vitest 版本回退到安全下界以下。

## 包边界规则（`check-package-boundaries`）

依赖方向与 README 一致：**应用 → runtime-\* / coding-agent / agent / ai**；核心库不感知宿主。

守卫会扫描 lib/plugin 源码，禁止：

- 从 `packages/ai`、`agent`、`coding-agent`、`runtime-*`、`plugin-sdk` 等 **import 宿主应用**（`desktop` / `cli-host` / `admin` / `site` 及对应路径）
- 生产代码 import 其它包的 `test/` 树
- plugin presets/externals **deep-import** `desktop/src/**`

`coding-agent/examples/**` 已排除。

## 模块边界声明（`check-context-boundaries`）

每个模块在自己的 `README.md`（无 README 时为 `AGENTS.md`）内嵌 `## Context Boundary` yaml 块，声明 `purpose` / `provides` / `consumes` / `internal_dependencies`；声明与模块同处一地，新增包改的是自己的声明而不是中心守卫表（ADR-0131）。

- `internal_dependencies` 是本模块**允许 import 的 workspace 包名白名单**；扫描真实 import specifier，凡未声明的跨模块 import 即失败。
- 相对路径逃逸出模块根一律违规；`@pkg/src/**` 深链一律违规——白名单不豁免深链。
- 例外仅限测试文件：`*.test.*` / `*.spec.*` 与 `test/` 树允许相对逃逸进**已声明**依赖的模块（既有测试耦合模式，依赖方向仍受白名单约束）。
- 非 workspace 交付物（`apps/im-gateway`、`apps/kotlin`、`apps/ssh-helper`）同样带声明块。
- `docs/architecture/dependents.md` 是机器生成的反向依赖视图，禁止手写；由 `--write-dependents` 重新生成，守卫校验其新鲜度。
- 新包补齐声明可运行 `--apply` 脚手架生成首版 yaml 块。

`coding-agent/examples/extensions/*` 作为 workspace 模块同样受管。

## 规则豁免与协议套件（`check-waivers` / `check-protocol-suites`）

- `project/decisions/waivers/` 登记 Policy 级规则豁免（规则/理由/风险/补偿/owner/到期日）；`active` 且到期即红，到期不自动撤销也不自动续期。格式见 `waivers/README.md`。
- `tests/contracts/protocol-registry.json` 是跨边界协议清单（runtime-* Port、plugin SDK、action-rpc、MCP 桥接、remote-* 线协议等）。每个协议必须列出存在的 conformance 套件文件，或进入 `check-protocol-suites.mjs` 内的 `EXEMPT_PROTOCOLS`——该集合只缩不增（不得超出冻结基线），且每项必须在 `tests/contracts/OWNERS` 记录批准人。已有套件后仍留在豁免集合同样报错。
- 新增跨边界协议面时，先登记注册表并附套件；套件必须经消费者公共 API 驱动真实实现，纯自 mock 不算。

## Coding Agent 架构规则（`check-coding-agent-architecture`）

该守卫不生成全量 AST 模块图，也不启动 TypeScript TypeChecker。它只用 TypeScript AST 从
`import`、`export ... from` 和动态 `import()` 中提取模块边，再执行声明式规则，因此不会把注释、
字符串或同名变量误判为依赖。

长期规则包括：

- 合同不能反向依赖 Adapter、Composition 实现、Host 实现或公开门面；
- 产品能力域不能依赖 Adapter、Composition 实现或公开门面；
- Adapter 可以依赖 Composition 合同，但不能反向依赖 Composition 实现或公开门面；
- 历史会话格式模块不能依赖 Agent 执行；格式转换与文件生命周期可以在 `sessions/legacy` 边界内按职责拆分；
- 外部消费者只能使用 `package.json#exports` 声明的稳定子路径，支持精确和通配符导出；
- 包根保持 Extension facade；Composition 允许扩展根级能力与合同，但不能导出内部组装实现；
- 旧 `src/core`、`src/compat` 实现目录不得恢复。

公开子路径以 manifest 为唯一事实来源，不在守卫中维护第二份符号或子路径快照。旧迁移进度基线、
Greenfield/Legacy 名称墓碑、固定文件数量、行数阈值及实施日志格式不再进入构建门禁。
架构规则测试位于 `scripts/quality/coding-agent-architecture.test.mjs`。

## Task Worktree 合同（`check-task-worktrees`）

`project/tasks/*.md` 的 frontmatter 是并行开发的合同，写错的后果不可见：`id` 与文件名不一致会让所有指向它的 `depends_on` 失效，`depends_on` 成环意味着不存在合法集成顺序，`write_paths` 里的 `..` 让 scope 声明失去意义。该守卫把这类**结构矛盾**做成机械检查，不依赖 Git，在任何 checkout 上都能跑。

该守卫校验 Task frontmatter 的结构矛盾，并对生命周期内的 parallel Worktree Task 检查 `write_paths` / `exclusive_paths` 的未登记重叠；重叠关系必须写入至少一端的 `conflicts_with`，以便协调者安排独立 Worktree 实施与串行集成。活动 serial / coordination-only Task 不得声明独立 Worktree。该检查只读项目文件，不检查某台机器上的 Worktree 是否存在或干净；真实 Git 状态由 `bun run worktree:check` / `doctor` 检查。

`check-project-indexes.mjs` 将计划索引和 Task 当前焦点表的状态与对应 frontmatter 对照；README 是导航副本，frontmatter 是状态事实源。`check-guards` 还运行 `bun run scripts/release/release-notes.mjs --check`，保证当前 Desktop manifest 版本对应的 Release Notes 文件存在；发布工作流会再次执行同一校验。

## Workspace 构建编排（Turborepo）

根 `turbo.json` 将每个 workspace 的 `package.json#scripts.build` 组成任务图，`build.dependsOn = ["^build"]` 保证内部依赖先构建。包清单和依赖边只维护在 Bun workspace 与各包 manifest 中，不再维护根 shell 顺序、Desktop 分层或第二套通用哈希实现。

缓存边界如下：

- 普通包声明 `dist/**`、插件 `release/**` 和 Next `.next/**` 为输出；lockfile、内部依赖任务哈希、根 `tsconfig.base.json`、根 `.env*` 与显式构建变量共同决定本地缓存键。包根 `test/**`、`tests/**`、README 和 CHANGELOG 不影响 build；`src/**` 内或被生成/打包脚本读取的资源仍参与哈希。
- Desktop 完整 `build` 包含平台模型、生成、插件 staging 和多入口 bundle，初始阶段明确 `cache: false`。
- Remote Cache 默认关闭且预先要求 HMAC 制品签名；启用前必须按 [Remote Cache 启用清单](./turborepo-remote-cache-rollout.md) 验证跨平台制品、环境变量、日志脱敏和缓存完整性，配置 `TURBO_REMOTE_CACHE_SIGNATURE_KEY`，并更新 ADR-0079。
- Turbo 使用 strict environment mode。普通 build 只声明 `NODE_ENV`、`VETTA_PLUGIN_DEV_WATCH`、`VETTA_PLUGIN_DOCS_SRC` 和 `VETD_SRC`；Docs build 额外按自身合同声明 `DOCS_SITE_URL`，Desktop build 独立声明 `VETTA_*`/`VETD_*`，dev task 保留这些通配变量。新增影响构建的变量必须进入范围最小的 task `env`；只需运行时可见且不影响输出的秘密变量应审查后进入 `passThroughEnv`。

plugin-workbench 的 `prebuild` 会同步根 `docs/plugin/**`，该目录通过 `$TURBO_ROOT$` 作为其显式输入；其它包不会因插件文档变化而失效。

Desktop build task 显式依赖 `@vetta-org/plugin-vite`。开发前置构建读取本地 Turbo 缓存；正式打包入口带 `--force`，继续无条件执行 workspace 构建并写入新缓存。Preset 的租户选择、zip 校验与 staging 仍由 `build-presets.mjs` 负责，但正式 Desktop build 复用 Turbo 已构建的 plugin tooling；独立 `build:preset` 才自行准备 tooling。

根 build、Desktop 前置 build 和测试依赖 build 均使用 `--summarize`。本地 summary 位于 `.turbo/runs/`（已忽略），CI 的三平台单测 job 将其作为保留 7 天的诊断制品上传；summary 用于观察任务耗时、哈希和命中状态，不作为构建成功的第二事实源。

新增或修改 workspace 依赖后必须执行正常的 `bun install`；`bun install --lockfile-only` 只更新锁文件，不创建包级 workspace 链接。可用 `bunx turbo run build --dry=json --filter=<package>` 检查任务闭包和依赖原因。

`test:changed` 会从根 workspace 和各包 `package.json#scripts.test` 自动发现可测包，并按全部 workspace manifest 自动计算下游依赖闭包；没有测试脚本的上游包发生变化时，其可测消费者也会进入计划。测试启动前，`test-pkg.mjs` 会让 Turbo 构建所选测试消费的 workspace 依赖，确保干净 checkout 中指向 `dist` 的包导出可被解析，同时不会构建 Desktop、Docs 或 Remote Relay 这些叶子应用本身。`package.json`、`bun.lock`、根 TypeScript/Biome 配置和 `scripts/quality/**` 变化会触发全部 workspace 测试；无效基线会直接失败，不会静默跳过。

`test:impact` 面向本地短反馈循环：显式测试文件直接运行，普通源码交给 Vitest 的 `related` 依赖图选择；若没有关联测试则回退包测试。公共入口、包/测试配置、删除文件、无测试 workspace 和根配置会自动转交 `test:changed`，因此精确模式不会把无法证明安全的范围当作“无需测试”。不传文件时它仍使用完整 Git 差异。CI 继续使用 `test:changed`，保证跨包、跨平台门禁不因本地加速而收窄。

`check:quick` 复用同一套 Git 变更选择器，因此不带路径时不会漏掉未暂存或未跟踪文件；`check:quick -- <file...>` 可限制为本次任务实际修改的文件。删除文件会从 Biome 输入中排除；修改任意 `biome.json` / `biome.jsonc` 或根 `.editorconfig` 时，会自动回退为全仓 Biome，避免配置影响未被检查。它不做类型检查，不能替代任务结束时的完整 `check`。

根 `tsconfig.json` 已包含 `apps/cli-host/src/**/*` 和 `apps/cli-host/test/**/*`。完整 `check`
仍额外显式执行 `apps/cli-host` 的 `typecheck`，避免未来调整根 `include` 时静默漏掉 CLI，也让
日志直接显示 CLI 门禁。

根 `tsconfig.json` 的 path map 必须为每个 workspace `package.json#exports` 的 types 子路径
写明源文件（例如 `@vetta/runtime-mcp/auth` → `src/auth/index.ts`）。`check` 在干净树里
typecheck，不会先生成 `dist/*.d.ts`；`moduleResolution: Node16` 下通配 `src/*` 也不会把
目录解析成 `index.ts`。`check-source-path-maps.mjs` 机械检查这条合同。

`check:types:build-surfaces` 与源码 typecheck 是不同口径：它不使用根源码 path map，而是按真实
workspace 包声明解析。因此，上游源码修改但 `dist/*.d.ts` 尚未重新生成时，该命令会失败。这是
声明新鲜度问题，不应通过手改 `dist` 或把生成动作塞进只读 `check` 解决；应先按正式依赖顺序
生成前置包声明，再运行该门禁。

## CI

`.github/workflows/quality.yml` 负责通用 TypeScript 质量门禁：冻结依赖安装、`bun run check`、质量脚本测试、Runtime 合同检查，并在 Ubuntu、macOS 与 Windows 上顺序运行受影响 workspace 及其可测下游。各平台按操作系统、架构和锁文件复用 Bun 下载缓存，但每次都由冻结锁文件重新生成根 `node_modules`；不得跨 Runner 恢复 `node_modules`，以免 Windows 上 Bun 的依赖链接和类型解析失真。单元测试 Job 会确保真实 `ripgrep` 可用，仅在 Runner 未预装时才安装，用于验证 Runtime Node 的 `grep` / `glob` 进程合同。完整 Git 历史用于计算 PR base；根配置、锁文件或质量脚本变化会在三个平台运行全部 workspace 测试。同一 PR 或分支的新提交会取消旧运行，任一平台失败后也会停止仍在排队或执行的同矩阵任务；成功运行仍完整覆盖三个平台。

非 Bun workspace 由独立的 path-filtered workflow 覆盖：`.github/workflows/im-gateway.yml` 对 Go Gateway 执行 tidy、vet、build、test、接口纪律和 golangci-lint；`.github/workflows/kotlin.yml` 对 Kotlin Mobile 执行 Android host tests 和 debug APK 构建。Expo Mobile 是 Bun workspace，另由 `.github/workflows/mobile.yml` 在相关路径变化时执行类型检查和 Web 导出。这些 path-filtered workflow 只在分支 push 或 PR 中对应目录或 workflow 自身变化时运行，不响应 tag push。

Desktop 生产边界由独立的 `.github/workflows/desktop-packaged.yml` 负责：它始终运行打包合同检查，涉及 Desktop 主进程、preload、打包脚本、原生依赖、远程控制或锁文件的变更才会启动 Windows、macOS、Linux runners，构建 unpacked packaged 应用并运行 Electron 启动与 updater E2E；无关变更不会构建 Desktop。上述 workflow 都使用只读检查，不会自动修复候选提交。

只想拿一个 macOS 测试安装包时，运行 `.github/workflows/desktop-macos-test.yml`（手动触发，`arch=arm64|x64|both`）。它只构建 macOS 未签名 DMG、不发布、不跑 Win/Linux leg 与 packaged E2E，产物在 run 的 Artifacts 里；测试包不可用于更新验证，也不能对外分发，正式发版仍然只有 `desktop-release` 一条路径。

Desktop 打包合同可在本地快速运行：

```text
bun run verify:desktop:contracts
bun run test:desktop:packaging
```

正式 Desktop 发布 workflow 还会在平台矩阵前运行 `bun run check`、`bun run test:quality` 与 `bun run test:desktop:packaging`；每个平台构建后运行 packaged smoke/updater E2E，发布 R2/GitHub 后通过 `apps/desktop/scripts/verify-update-feed.mjs` 检查公开更新 feed。手动 `workflow_dispatch` 默认只验证本地产物；`channel=test` 或 `channel=stable` 的发布型手动运行会进入与 tag 相同的发布门禁和公开 feed 检查。

需要验证真实生产布局时运行 packaged smoke 与 updater E2E（当前平台需先生成对应 `release/*-unpacked` 目录）：

```text
bun run --cwd apps/desktop dist:opensource -- --target dir
bun run --cwd apps/desktop test:e2e:packaged
```

该 E2E 会在 WDIO 启动 Electron 前创建本地 generic feed，通过真实 `window.vetta.updater.check()` 验证 `app-update.yml`、feed 请求、版本解析和 renderer/main IPC 链路；它不会安装伪造的更新包。发布后的真实安装包可读性、hash、blockmap 和平台安装准备仍由各平台 `verify:updates:*` 以及发布后 `verify-update-feed.mjs` 负责。

需要验证真实安装、重启和版本切换时，先使用 `desktop-release` 的 `workflow_dispatch` + `channel=test` 发布基线和候选，
再运行 `.github/workflows/desktop-upgrade-e2e.yml` 并填写 `baseline_version`、`candidate_version`。该 workflow 在
Windows、macOS、Linux runner 上真实安装基线包，驱动现有 updater 完成下载、安装、退出、重启和版本切换；失败时上传
应用日志和升级状态文件。它使用独立的 `desktop-test` Environment，不会触碰 stable。当前 GitHub macOS runner 只验收
其实际架构；macOS arm64 需要额外的自持 runner 矩阵。

单元测试按包顺序执行，不使用根 workspace 的无界并发扇出；这会牺牲少量总耗时，但能避免多个 Vitest 进程同时争用 CPU、临时目录和子进程而产生假超时。包内测试若消费自身生成物，由该包的 `test` 脚本先生成（例如 `vetta-ui-design` 的独立 history runner），不把叶子包完整制品构建混入通用依赖预构建。CLI 的 Windows CI 进程型测试按文件串行，避免多个 Node、Bun、MCP 与 shell 子进程争用 Runner 资源；本地开发使用有界文件并行缩短反馈时间。平台相关行为至少由 Ubuntu、macOS 与 Windows 三个平台门禁覆盖。

## 与 OpenClaw 的对应关系（有意不做的）

| OpenClaw | 本仓库选择 |
|----------|------------|
| oxlint / oxfmt | 继续 **Biome**（已覆盖 lint+format） |
| 170+ test shards | 本地用 `test:impact` 缩短反馈；CI 用 `test:changed` 保持下游覆盖 |
| pre-commit 全家桶 | husky + 快路径；类型检查放 `check` |
| knip 阻断 CI | 仅扫描四个核心包，`deadcode:report` 先观察，再收紧 |
| OpenGrep / CodeQL | 未引入；有安全面再加 |
| Docker E2E 矩阵 | 继续使用包内测试和定向 Electron E2E；`verify:ui` 仅按用户明确要求运行 |

## 推荐工作流

```bash
# 日常开发
# （commit 时 husky 自动 check:precommit）

# 中间编辑轮次：先跑直接相关测试；形成一个完整修改批次后跑快速检查
bun scripts/quality/run-vitest.mjs --run packages/ai/test/provider-retry-policy.test.ts
bun run check:quick -- packages/ai/src/providers/retry-policy.ts packages/ai/test/provider-retry-policy.test.ts

# 任务完成：显式列出本次修改文件；完整 check 已覆盖 quick 的静态检查，无需紧邻重复执行
bun run test:impact -- packages/ai/src/providers/retry-policy.ts packages/ai/test/provider-retry-policy.test.ts
bun run check

# 改多个包 / 不确定范围
bun run test:changed
bun run check:quick
bun run check

# 并行 Task：先检查协调合同，再创建独立 worktree；集成前复查并完成清理
bun run worktree:check --all
bun run task:worktree -- create --task TASK-0096
bun run worktree:check --task TASK-0096
bun run worktree:remove --task TASK-0096

# 改 Desktop UI（默认不启动 verify:ui）
bun run check

# 仅当用户明确要求 UI 验收时
bun run verify:ui:start:fresh
# ... verify:ui:pw ...

# 可选清理
bun run deadcode:report
```

## 后续可增强（未做，待有痛点再上）

1. desktop i18n CJK **ratchet**（基线文件数，只许下降）——当前硬编码存量大，全量 fail 不现实  
2. CI path filter：只改 `packages/ai` 时跳过 desktop `tsc`  
3. Knip 收紧后纳入 `check`
4. 插件 SDK **契约测试**（public API 形状快照）

## 核查清单

- [ ] `bun run check:guards` 通过  
- [ ] `turbo.json` 的 `build` 保持 `dependsOn: ["^build"]`，目标包 dry-run 包含所需依赖闭包
- [ ] `bun run check:quick` 覆盖已提交、暂存、未暂存和未跟踪文件  
- [ ] `bun run test:quality` 通过  
- [ ] `bun run check:precommit` 在有 staged 文件时行为正确  
- [ ] `bun run test:pkg --list` 列出当前所有可测包
- [ ] `bun run check` 仍包含类型检查（比 pre-commit 更严）  
- [ ] `bun run check` 输出中包含 `apps/cli-host` 的显式 `typecheck`
- [ ] 生成当前 workspace 声明后，`bun run check:types:build-surfaces` 通过
- [ ] husky `.husky/pre-commit` 调用的是 `check:precommit` 而非整仓慢 `check`  
- [ ] 未新增 oxlint/oxfmt/pnpm 强制依赖  

### Windows 测试资源与共享 UI 入口

共享 Node runner 在 Windows 默认最多使用 2 个 worker（本地与 CI 一致），其他平台沿用 Vitest 默认值；显式 CLI `--maxWorkers` 保持调用方选择。这里只限制并发资源，不调整 test/hook 超时、断言或测试集合。`@vetta-org/theme-ui` 提供独立的 Node runner `test` 入口；`test:impact` 可以直接选择其相关测试，公共合同与无测试包仍走保守影响面。
