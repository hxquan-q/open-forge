---
id: TASK-0309
type: task
status: verifying
priority: P1
owner: packages/plugins
requirement: REQ-0005
plan: PLAN-0018
source: PLAN-0018 P0（安全热修）
related_requirement: [REQ-0005]
related_plan: [PLAN-0018]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0309-design-plugin-p0-security
worktree: unassigned（已集成，待推送后清理）
base_commit: 7d26d1df6360fbe63e2a34493c973d49ee57d5d6
read_paths:
  - project/plans/PLAN-0018-design-plugin-roadmap-v2.md
  - docs/adr/0068-vetd-design-level-npm-dependencies.md
  - packages/plugins/presets/vetta-ui-design/src/engine/engine-manager.ts
  - packages/plugins/presets/vetta-ui-design/src/export/import-design.ts
  - packages/plugins/presets/vetta-ui-design/history-runner/src/runner-entry.ts
  - packages/plugins/presets/vetta-ui-design/src/canvas/FrameView.tsx
  - apps/desktop/src/main/window-manager.ts
write_paths:
  - packages/plugins/presets/vetta-ui-design/src
  - packages/plugins/presets/vetta-ui-design/engine
  - packages/plugins/presets/vetta-ui-design/history-runner
  - packages/plugins/presets/vetta-ui-design/test
  - apps/desktop/src/main/window-manager.ts
  - docs/adr
exclusive_paths:
  - packages/plugins/presets/vetta-ui-design/src
  - packages/plugins/presets/vetta-ui-design/engine
  - packages/plugins/presets/vetta-ui-design/history-runner
  - packages/plugins/presets/vetta-ui-design/test
  - apps/desktop/src/main/window-manager.ts
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 设计插件 P0 安全热修（PLAN-0018 P0：导入穿越 / 安装脚本 / CORS / sandbox / 导航 / 原子写）

## 目标

按 [PLAN-0018](../plans/PLAN-0018-design-plugin-roadmap-v2.md) P0 关闭 vetta-ui-design 插件与宿主主窗口的七项现存攻击面：

1. **分享包/历史 zip 路径穿越**：`import-design.ts` 将 `design/<rel>` 条目与 `manifest.json` 直接写 `${vetdPath}/${rel}`；`history-runner` `unpackHistory` 将 history.zip 条目直接 `join(gitdir, rel)` 落盘。恶意条目（`../`、绝对路径、盘符）可写出设计目录之外。两处统一加安全条目过滤，命中即整包拒绝。
2. **设计级 npm install 执行任意 install 脚本**：`engine-manager.ts` 的 `installDesignDependencies`（vetd_install）与 `ensureDesignDependencies`（导入后首次打开自动补装）均不带 `--ignore-scripts`（ADR-0068 现行结论）。导入分享包的 package.json 属不可信输入，postinstall 即 RCE。两处一律加 `--ignore-scripts`；导入分享包声明依赖时先经用户确认再当场安装；引擎自身 `npm ci`（插件下发的受信 lockfile）不变。同步修订 ADR-0068 对应条款。
3. **引擎 vite CORS 全开**：`engine/vite.config.mjs` `server.cors: true`，本机任意网页可跨源读设计源码与模块。改为 `cors: false`；插件侧 `waitForHttpReady` 就绪探测改 `mode: "no-cors"`（不依赖读响应）。
4. **server.fs 显式 strict**：`engine/vite.config.mjs` 补 `fs.strict: true`（vite 7 默认即 true，显式化防回退；`allow` 名单维持引擎根+设计根）。engine 模板文件内容变更经 `engineFilesHash` 自动触发重物化，无需升 ENGINE_VERSION。
5. **frame iframe 无 sandbox**：`FrameView.tsx` 的 `<iframe>`（当前仅 ref/title/src/class/style）补 `sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"`——不给 `allow-top-navigation` / `allow-popups`，阻断设计内容劫持顶层窗口与弹窗。
6. **主窗口无 will-navigate 拦截**：`window-manager.ts` 已有 `setWindowOpenHandler` deny，但缺 `will-navigate` 拦截；对齐 `isolated-window.ts` 先例补 `preventDefault` + 日志。
7. **每设计写队列 + 原子写**：新增共享模块（按 designDir 的 promise 链串行 + `writeFile(temp) → rename` 原子替换、失败清理），接入导入、scaffold、manifest 写入与 agent 工具写路径，消除并发交错写与半写文件。

## 范围

### 并发评估

- 结论：条件支持并行（execution: parallel，独立 Worktree）；本 Task 由单一 Agent 串行完成全部切片，不派工。
- 执行方式：parallel（专用 Worktree）；branch `task/TASK-0309-design-plugin-p0-security`，Worktree `../open-forge-wt/task-0309-design-plugin-p0-security`，基线 `main@7d26d1df6`。
- 可并行 Task：无共同写域（verifying 中的 TASK-0306/0307/0308 路径不相交）。
- 冲突文件/独占路径：见 exclusive_paths。
- 集成：Worker 提交 → Coordinator 合入本地 main（`merge --no-ff`）→ `test:changed --base origin/dev` + `check` → `push origin main:dev`（已授权标准流程）→ 清理 Worktree。

### 做

- 上述七项修复 + 各自回归测试（恶意 zip 构造、命令行参数断言、确认流、写序/原子性、sandbox 渲染断言）。
- ADR-0068「安装不加限制」条款修订（--ignore-scripts 取舍：依赖 postinstall 二进制安装的包会坏，由确认 UI 与错误输出兜底）。
- Release Notes v0.1.3 补记。

### 不做

- 不做 P1 去品牌、不改 `.vetd` 格式与 `models.get/set` 合同、不新增 IPC/工具名。
- 首次打开的自动补装不做二次确认弹窗（--ignore-scripts 已消解脚本执行面；确认门只挂在导入流），该边界写入交付记录。
- 不动引擎 `npm ci`（受信模板）、不动 runner 命令面（仅 unpack 校验）、不做 license 门禁脚本（P8）。

## Given / When / Then

- Given：恶意 `.vetdz` 含 `design/../../evil.txt` 或 history.zip 含 `../` 条目；When：用户从画廊导入；Then：导入整体失败并报「分享包包含不安全路径」，磁盘无越界写入。
- Given：导入的分享包声明了 dependencies；When：导入完成；Then：先弹确认，同意才当场 `npm install --ignore-scripts`；拒绝则跳过（首次打开仍以 `--ignore-scripts` 自动补装）。vetd_install 与自动补装的 npm 参数一律含 `--ignore-scripts`。
- Given：vite dev server 正在服务设计；When：非本机源跨源请求模块；Then：无 `Access-Control-Allow-Origin`（cors:false），插件就绪探测（no-cors）不受影响。
- Given：设计 frame 内容尝试顶层导航或 window.open；When：iframe 渲染；Then：sandbox 未授权该能力，行为被浏览器阻断。
- Given：主窗口 renderer 被诱导导航到任意外部 URL；When：触发 will-navigate；Then：preventDefault 并记日志，窗口保持应用内容。
- Given：同一设计目录并发写入（agent 工具 + 画布清单 + 备注）；When：并行调用落盘；Then：按设计目录串行执行，单文件经 temp+rename 原子替换；写失败不留半写目标文件。

## 必须保持

- 存量合法 `.vetdz` / `.vetd` zip / history.zip 导入导出行为与格式完全兼容。
- `vetd_install` 工具合同不变（仅安装参数新增 flag）；引擎 bootstrap（materialize → `npm ci` → prune）行为不变。
- frame 元素选择、HMR、截图、备注等画布交互不回归；主窗口正常加载（loadURL/loadFile 不触发 will-navigate）。
- 未获授权不启动真实 Desktop 实例；引擎真实起服的端到端验证列为待用户实机项。

## 测试与验证

- 定向（插件包内 `bun run test`，含 build:runner）：新增/扩展 `test/` 用例覆盖上述 G/W/T；恶意 zip 用 fflate 现场构造。
- 组件：FrameView iframe sandbox 属性断言（happy-dom + RTL）。
- 引擎配置：直接 import `engine/vite.config.mjs` 断言 `server.cors === false` 且 `fs.strict === true`。
- window-manager：对齐 isolated-window 先例不新增单测（Electron 强依赖），靠完整 `check` + 用户实机验收；如有低成本谓词接缝则补。
- 质量：`bun run test:impact -- <改动文件>` → `check:quick`；集成时 `bun run test:changed --base origin/dev` + 完整 `bun run check`。

## 验收分层

- 工程验证：定向 58 例、插件包全量 711/711 绿；impact 167 过、4 文件收集期崩（BUG-0107 存量，文件清单与根因完全吻合）；声明头 ratchet 本任务新增文件 0 缺失。技术评审：自审 + ADR-0068 修订。集成：integrated（merge --no-ff，五切片提交见下）。
- 人工验收：待用户实机——导入恶意样本报错、正常分享包导入弹确认并安装、画布交互（元素选择/HMR/截图）、主窗口正常加载与外链仍走系统浏览器、引擎 no-cors 探测不卡就绪。
- 发布：未授权；仅推 origin/dev。

## 交付记录

- 实际修改（Task branch `task/TASK-0309-design-plugin-p0-security` 五个原子提交）：
  - `197afdae4` 设计落盘目录级写队列 + 单文件原子写（design-fs + scaffold/design-session 接入 + 2 个 fake fs 补齐合同）；
  - `b619fb754` 分享包与历史 zip 越界条目整包拒绝（entry-path 共享过滤 + runner 先整体校验再写）；
  - `8b0a72221` 设计级安装 `--ignore-scripts` + 导入依赖确认 + 引擎 vite `cors:false`/`fs.strict` + 就绪探测 no-cors + ADR-0068 修订；
  - `a20f79750` frame iframe sandbox 白名单（不放行顶层导航/弹窗）；
  - `88f8b9680` 主窗口 will-navigate 拦截。
- 实际运行：包内 `bun run test` 711/711；定向新用例覆盖全部 G/W/T；根 `test:impact` 167 过 + BUG-0107 四文件存量收集崩（归因：文件清单与 BUG-0107 记载一致、均不在本 diff）；`check:quick` 在补齐 5 个新文件声明头后本任务部分通过（工作树残余 new=15 为并行会话在途修复的存量，见下）。
- 未运行及原因：真实 Electron 实机验证未做（须用户授权启动 dev，见人工验收清单）；desktop window-manager 无单测（BUG-0107 使该链路在 vitest 无覆盖，按 isolated-window 先例处理，靠完整 check + 实机）。
- 剩余风险：① `--ignore-scripts` 使依赖 postinstall 二进制安装的包装而不可用（ADR-0068 修订已记，构建报错提示，可手动 `npm rebuild`）；② 首开自动补装不二次弹确认（脚本执行面已由 flag 消解，确认门只在导入流，Task「不做」已声明）；③ no-cors 就绪探测在真实 Electron file:// 源下的行为需实机确认；④ 推送时点须待并行会话把主树 15 个存量声明头修复提交入库，否则 origin/dev 的 CI ratchet 会红（与本任务无关的耦合）。
