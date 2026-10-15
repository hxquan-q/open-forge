---
id: TASK-0103
type: task
status: done
priority: P1
owner: apps/desktop
requirement: []
plan: PLAN-0010
source: RESEARCH-0013 S1（VS Code `.moduleignore` 两级清洗对照 `prepare-pack.js` 整目录 cpSync 现状）
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, scripts/release/]
write_paths: [apps/desktop/scripts/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0104]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# staged node_modules 依赖清洗清单（`.moduleignore` 等价物）

## 目标

`prepare-pack.js` 的 `stageDepTree`（约 L204-214）对外部化生产依赖做**整目录 `cpSync`**，依赖包内的 `test/`、`docs/`、`*.md`、`*.map`、`binding.gyp`、构建残留全部进安装包。参照 VS Code `build/.moduleignore` 机制，加一层 gitignore 风格的清洗清单：默认剥 test/docs/maps/构建脚本，保留 `build/Release/*.node`、`prebuilds`、运行必需资源；并补一个产物断言脚本，让「不该进包的东西进了包」能在 CI 暴露。

## 范围

### 并发评估

- 结论：条件支持——脚本目录独立，但与 TASK-0104 同处 `apps/desktop` 构建面，集成时需防打包配置互相踩踏。
- 执行方式：可独立 Worktree 并行；集成顺序在 TASK-0104 之前或之后均可。
- 可并行 Task：TASK-0109、TASK-0110 及 PLAN-0011/0012 大部分任务。
- 前置依赖：无。
- 冲突文件/独占路径：`apps/desktop/scripts/prepare-pack.js` 与 TASK-0104 若改同一文件的构建段则冲突，按文件级登记。
- Branch：独立 task 分支（并行时由 Coordinator 派 worktree）。
- Worktree：按 `project/collaboration/development-workflow.md` 派工。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0010 阶段 A 内任意。

### 做

- 在 `apps/desktop/scripts/` 新增清洗清单数据（如 `staged-deps-cleanlist.mjs`）：gitignore 风格规则集 + 平台变体规则（对应 `.moduleignore` / `.moduleignore.<platform>` 两级）。
- `stageDepTree` 复制时对每个 staged 依赖应用清单：剥 `test/`、`tests/`、`docs/`、`*.md`（保留 `LICENSE*`/`NOTICE*`）、`*.map`、`binding.gyp`、`src/`（仅对带 `build/Release/*.node` 或 `prebuilds/**` 的 native 包）、`.github/`、`*.ts`（保留 `*.d.ts`）等；规则必须显式可列、可测试。
- 新增产物断言：打包后对 `app.asar`/`resources` 做一遍清单校验（不允许 `*.gyp`、`test/**`、异平台 `*.node` 等黑名单命中），接入既有 `verify-*`/`desktop-packaging-layout` 脚本族或 CI。
- 记录清洗前后 staged 体积 diff 到交付记录，作为收益证据。

### 不做

- 不改 `asar`/`asarUnpack` 分层（`RESEARCH-0013` S5 已判定现状自洽）；
- 不改 external 依赖的选择逻辑（只清洗内容，不动闭包计算）；
- 不动 dev 工作区的 `node_modules`；
- 不做 symbol/dSYM 分离（VS Code 走 CI 上传，本仓无对应链路）。

## Given / When / Then

- Given：一次正常 desktop 打包（`build:desktop` 或 release 流水线）；
- When：`stageDepTree` 复制外部化依赖到 staging 目录；
- Then：被清单命中的文件不进入 staging，打包产物中黑名单模式（`test/**`、`*.gyp`、异平台二进制）零命中；native 模块 `*.node`/`prebuilds` 完整保留且插件/pty/OCR 等运行时功能不受影响。

## 必须保持

- `assertTerminalPtyBinaryStaged`、`assertPackagedMainHasNoWorkspaceImports` 等既有断言照常通过；
- 所有在包内真正被运行时读取的文件（含 native loader 的 JS 入口、proto/json 资源）不被误剥——清洗规则以白名单保底、黑名单裁剪；
- 安装包可正常安装、升级、运行；`bun install --frozen-lockfile` 与 lockfile 语义不受影响。

## 测试与验证

- 定向测试：为清洗函数写 `node:test` 用例（命中剥除/保留/`*.node` 保底/平台变体规则），接入既有 `*.node-test.mjs`/`*.test.mjs` 脚本测试约定；
- 用户流程：完整跑一次打包并 diff staged 清单（清洗前基线 vs 清洗后），断言脚本全绿；
- 质量检查：`bun run check:quick`；若改了 CI 调用面，跑对应 verify 脚本。

## 交付记录

- 实际修改：
  - 新增 `apps/desktop/scripts/staged-deps-cleanlist.mjs`：两级清洗清单（一律裁剪 + 平台变体）、
    gitignore 子集匹配器、裁剪计划、`cpSync` filter、依赖闭包遍历、安全不变量校验与
    staging 树黑名单扫描；`*.d.ts`/`LICENSE*`/`NOTICE*`/`COPYING*` 保留规则优先。
  - 新增 `apps/desktop/scripts/verify-staged-deps.mjs`：三平台清洗前后字节数报告 + 规则安全不变量
    + 仍引用被裁 native 源码目录的 JS 检查，并提供 `--staging`（真实 staging 树）与
    `--resources <dir>`（已打包 `resources/app.asar.unpacked`）两种产物断言入口。
  - 新增 `apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs`（`node:test`，16 例）。
  - `apps/desktop/scripts/prepare-pack.js`：原 `stageDepTree` 整目录 `cpSync` 改为
    共享闭包遍历 + 清洗计划 filter，并在复制前断言计划安全、复制后扫描 staging 树黑名单
    （任一命中即构建失败）；每个依赖打印清洗前后文件数与字节数。
  - `apps/desktop/scripts/verify-packaging-contract.mjs`：静态合同断言 prepare-pack 必须
    消费清洗清单、应用 filter 并挂上两道断言。
  - `apps/desktop/package.json`：新增 `verify:staged-deps`，清洗清单测试进入 `test:packaging`。
  - `scripts/quality/desktop-packaging-scope.mjs`：清洗清单与其脚本纳入 packaged smoke 触发面。
  - `.github/workflows/desktop-packaged.yml`：contract 作业补跑清洗清单测试，smoke 作业在构建后
    执行 `verify:staged-deps --staging`。
  - `apps/desktop/scripts/README.md`：新增「staged node_modules 清洗清单」一节。
- 实际运行：
  - `node --test apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs` → 16/16 通过。
  - `cd apps/desktop && node scripts/verify-staged-deps.mjs` → `ok`（0 违规）。
    体积证据（本机 Windows 主机可解析到的依赖闭包，`bytes` 为 staging 原始字节）：
    `darwin 5.97MB→3.80MB (-2.18MB)`、`win32 65.57MB→31.03MB (-34.54MB)`、
    `linux 5.97MB→3.86MB (-2.11MB)`。win32 明细：`koffi 127→21 files (-22.66MB)`、
    `@lydell/node-pty-win32-x64 6→3 files (-9.90MB, `.pdb`)`、`uiohook-napi 40→26 files (-0.37MB)`。
    darwin/linux 只统计本机装得到的依赖（异构原生包未安装），故低于真实值。
  - `bun run check:quick -- <本次改动文件>` → 见「剩余风险」。
- 未运行及原因：
  - 未执行完整 `prepare-pack`/electron-builder 打包（需要 im-gateway 交叉编译与全部 `dist/*` 产物，
    属长时构建）：staging 路径由 `verify:staged-deps --staging` 在 CI packaged smoke 中覆盖，
    构建期断言在每次 `prepare-pack` 运行中生效。
  - 未运行 `verify:ui:*`（无 UI 行为变化，且用户未授权）。
- Worktree：主工作区（`branch: main`；本批 Task 由单一 Agent 串行落地，不派独立 worktree）。
- 剩余风险：
  - 平台变体只按 OS 裁剪、不按架构裁剪：同一 OS 的另一个架构二进制仍随包分发（本地显式构建可能
    产出多架构产物，按架构裁剪会在未知目标时误删）。
  - `*.pdb` 属调试符号：包内原生模块崩溃栈无法本地符号化；本仓没有原生符号上报链路，故无功能影响。
  - darwin/linux 的实测数字需在对应平台 runner 上复跑才能得到完整收益。
  - 工作区存在其他工作流的未跟踪文件（`scripts/quality/context-boundary-lib.mjs`、
    `packages/coding-agent/src/execution/session-interrupt-health.ts`）导致 `bun run check` 的 lint
    步骤为红；与本次改动无关，未修改，亦未纳入本次提交。
