---
id: BUG-0102
type: bug
status: verifying
priority: P2
owner: Desktop 开发体验
requirement:
plan:
source: 用户报告（2026-10-14）：`cd apps/desktop && bun run dev` 的 `dev:electron` 在 `import electronPath from "electron"` 阶段抛 `Electron failed to install correctly`，renderer/themes 被 concurrently 连带 SIGTERM
related_requirement: []
related_plan: []
related_tasks: [TASK-0248]
related_issues: []
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# dev 启动在 Electron 二进制安装不完整时硬失败：无自愈、无可操作指引

## 用户流程

- Given：本机 `node_modules` 里 electron 的 npm 包已解出，但包内 `dist/` 只落了 zip 中央目录里的极少数条目、没有 `path.txt`（`bun install` 已跑完，不会自动补跑 postinstall）。
- When：在 `apps/desktop` 执行 `bun run dev`（或 `dev:verify` 等任何经 `dev:electron` 的入口）。
- Then：期望 dev 自行补齐 Electron 二进制或给出可直接照做的修复指引；实际是 `dev:electron` 在模块顶层 import 处直接退出 1，`concurrently -k` 把 renderer/themes 一并 SIGTERM，整个 dev 起不来。

## 实际行为

`apps/desktop/scripts/run-dev-electron.mjs:7` 的 `import electronPath from "electron"` 触发 `node_modules/electron/index.js` 的 `getElectronPath()`；`path.txt` 缺失且无 `ELECTRON_OVERRIDE_DIST_PATH` 时抛：

```text
[electron] error: Electron failed to install correctly, please delete node_modules/electron and try installing again
[electron]       at getElectronPath (...\node_modules\.bun\electron@39.8.10+3844822a191571ee\node_modules\electron\index.js:17:15)
[electron] error: script "dev:electron" exited with code 1
--> Sending SIGTERM to other processes..
```

报错点在模块加载期，`run-dev-electron.mjs` 自身的错误处理（`waitForExit` 的 reject）和 `main()` 都还没执行，所以失败既不经过 dev 脚本的日志，也不区分「二进制缺失」与「真正的启动失败」。

## 期望行为

- 二进制完整时零开销通过，不改变现有启动路径与日志。
- 二进制缺失/残缺时，在 spawn Electron 之前用包内官方 `install.js` 修复（本机命中 `@electron/get` 缓存，不重复下载），并在修复失败时给出可执行的指引而不是上游那句「删掉 node_modules 重装」。

## 环境与失败证据

- 应用版本/提交：`apps/desktop/package.json#version` 0.1.3，`base_commit 186c47e7c`，分支 `main`。
- 平台/工具：Windows x64，Bun 1.4.2（`packageManager` 声明 1.3.14），electron 39.8.10。
- 失败证据（2026-10-14 本机实测）：

| 检查 | 命令/对象 | 结果 |
|---|---|---|
| 解析目标 | `apps/desktop/node_modules/electron` | 符号链接 → `node_modules/.bun/electron@39.8.10+3844822a191571ee/node_modules/electron` |
| 安装标记 | `Test-Path .../electron/path.txt` | `False` |
| 解压产物 | `.../electron/dist` | 仅 `locales/pl.pak`（zip 中央目录第 1 条） |
| 另一份残留 | `.bun/electron@39.8.10/.../dist` | 仅 `resources/default_app.asar`（zip 第 3 条） |
| 下载完整性 | `certutil -hashfile electron-v39.8.10-win32-x64.zip SHA256` | `4478410a…98d5`，与同目录 `SHASUMS256.txt` 一致 → 下载完整 |
| 磁盘 | `Get-PSDrive C` | 剩余 ≈53 GB，非空间不足 |
| 环境覆盖 | `Get-ChildItem Env:ELECTRON*` | 空（无 `ELECTRON_SKIP_BINARY_DOWNLOAD` / `ELECTRON_OVERRIDE_DIST_PATH`） |
| 修复可行 | `bun install.js`（cwd = 包目录） | exit 0；`path.txt` 出现，`dist/electron.exe` 210 MB 等产物齐全 |

- 基线对照：仓库内已有 10 处同型环境记录（TASK-0014/0148/0153/0181/0187/0197/0198/0218/0221/0222），此前一律以「从缓存恢复 dist 并补 path.txt」「用 Bun 执行 install.js」等手工方式绕过，从未进入产品面修复。

## 最小复现

1. 删除 electron 包内的 `path.txt`（或让 `dist/` 只剩少量条目），保留 `.bun` 与 `@electron/get` 缓存。
2. `cd apps/desktop && bun run dev:electron`。
3. 观察 `dev:electron` 在 import 阶段以 `Electron failed to install correctly` 退出 1，`bun install` 重跑也不修复（bun 认为依赖已安装）。

## 影响

- 所有经 `dev:electron` 的入口（`dev`、`dev:isolated`、`dev:lean`、`dev:home`、`dev:verify`）全部起不来；renderer 与 themes 被连带 SIGTERM。
- 报错文本指向「删除 node_modules 重装」，与本机真实原因（解压不完整而非包缺失）不符，且会连带丢掉整个 monorepo 的安装结果。
- 同一缺陷在 CI 之外反复出现，每次都以「环境性失败」被测试记录旁置，实际是 dev 入口缺少启动前校验。

## 根因证据

- 直接原因（置信度高）：electron 的 `postinstall`（`node install.js`）没有产出完整结果——`path.txt` 缺失、`dist/` 只有 zip 中央目录中零散一两个条目；`index.js` 在无 `path.txt` 时按设计抛错。
- 下载侧排除（置信度高）：缓存 zip 的 SHA256 与 `SHASUMS256.txt` 完全一致，且磁盘充足、无跳过下载的环境变量。
- 触发机制（待确认，不阻塞修复）：解压阶段为何提前结束（`extract-zip` 在 Bun/Node 下的流式解压提前返回，或被中断后遗留半成品目录）尚未定位；本机历史记录显示 Node 与 Bun 执行同一脚本的表现不一致。
- 无法自愈的原因（置信度高）：`bun install` 对已存在的依赖目录不会重跑 postinstall，`ensure-workspace-install.mjs` 的指纹也只看清单变化，因此清单没变时永远修不回来。

## 回归测试

`apps/desktop/scripts/ensure-electron-binary.test.ts`（新增，vitest）：用临时目录构造「完整 / 缺 path.txt / 缺可执行文件 / dist/version 不匹配」四类包内状态，断言检查结论；断言缺失时调用修复器且修复成功后放行；断言修复器不生效时抛出含可操作指引的错误；断言 `ELECTRON_OVERRIDE_DIST_PATH` 下不触碰包内状态；断言 `ELECTRON_SKIP_BINARY_DOWNLOAD` 下不启动修复器而直接给出原因。

旧实现下该测试必红：`run-dev-electron.mjs` 在 import 阶段崩溃，没有任何可注入的检查/修复接缝，上述断言无对应实现。

## 修复与验证

- 修复：见 `project/tasks/TASK-0248-electron-binary-dev-guard.md`——`dev:electron` 在 spawn Electron 前新增 `apps/desktop/scripts/ensure-electron-binary.mjs` 校验（`path.txt` + `dist/<平台可执行文件>` + `dist/version` 与包版本一致），不完整时以 Bun 运行包内官方 `install.js` 后复验；`ELECTRON_OVERRIDE_DIST_PATH` 视为用户接管跳过，`ELECTRON_SKIP_BINARY_DOWNLOAD` 直接给出原因，修复后仍不完整时抛出手工命令与镜像/覆盖变量指引。
- 测试：`apps/desktop/scripts/ensure-electron-binary.test.ts` 12/12 通过（完整、缺 `path.txt`、缺可执行文件、版本不匹配、无操作、修复成功、修复失败报错、环境变量接管、跳过下载、未知平台）。
- 检查：完整 `bun run check` 的 types/guards/mobile-lint exit 0（首次 types 红为本任务缺 `.d.mts`，补后 desktop 增量 tsc EXIT=0）；环境实测三路：完整态静默 exit 0、删 `path.txt` 后自愈并恢复 `require("electron")`、`ELECTRON_SKIP_BINARY_DOWNLOAD=1` 时 exit 1 且打印可操作指引。
- 未运行及原因：未启动真实 Desktop / 长驻 dev（需单独授权）；未在 macOS/Linux 复验（以 `install.js#getPlatformPath` 同构映射 + 单测覆盖）；触发机制（解压提前结束的成因）未定位，保持待确认。
- 状态：工程验证通过，进入 `verifying`，等待用户在自己环境跑 `bun run dev` 复核。
